// Execute each runner's actual race function with an offline observer/connection schedule.
// No pg dependency, process launch or network connection is used by this test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = process.env.QRGUITAR_LOCK_OBSERVER_SOURCE_ROOT
  ? path.join(path.resolve(process.env.QRGUITAR_LOCK_OBSERVER_SOURCE_ROOT), 'apps/web/scripts') : here;
const coherent = { blockers: [101], wait_event_type: 'Lock', wait_event: 'transactionid' };
const transition = { blockers: [101], wait_event_type: null, wait_event: null };
const idle = { blockers: [], wait_event_type: null, wait_event: null };
const basicQuery = 'select pg_blocking_pids(pid) blockers, wait_event_type, wait_event from pg_stat_activity where pid=$1';
const evidenceQuery = "select pg_blocking_pids(pid) blockers, wait_event_type, wait_event, exists(select 1 from pg_locks blocked join pg_locks held on held.locktype='advisory' and blocked.locktype=held.locktype and blocked.database is not distinct from held.database and blocked.classid=held.classid and blocked.objid=held.objid and blocked.objsubid=held.objsubid where blocked.pid=$1 and not blocked.granted and held.pid=$2 and held.granted) advisory_pair from pg_stat_activity where pid=$1";
const advisory = { blockers: [101], wait_event_type: 'Lock', wait_event: 'advisory', advisory_pair: true };

function harness(script, samples, options = {}) {
  const source = fs.readFileSync(path.join(sourceRoot, script), 'utf8');
  const start = source.indexOf('  async function race('), end = source.indexOf('  async function test(', start);
  assert(start >= 0 && end > start, 'Actual runner race function must be found');
  const events = [], report = { observerPid: 303, barriers: [] };
  let clock = 0, count = 0, pollCount = 0, resolveB, rejectB;
  const pendingB = new Promise((resolve, reject) => { resolveB = resolve; rejectB = reject; });
  function releaseB() {
    if (options.bReject) rejectB(Object.assign(Error('Synthetic SQL rejection'), { code: 'PT409' }));
    else resolveB({ evidenceId: 'synthetic-existing-row' });
  }
  const observer = { async query(sql, args) {
    const evidence = script === 'test-evidence-postgres-concurrency.mjs';
    assert.equal(sql, evidence ? evidenceQuery : basicQuery);
    assert.deepEqual(Array.from(args), evidence ? [202, 101] : [202]);
    const index = pollCount++;
    events.push('observe:' + index);
    if (options.queryFailure) throw Error('Synthetic observer failure');
    if (options.settleDuringRead) releaseB();
    // Give the runner's settlement handlers time to record an already finished B.
    await Promise.resolve(); await Promise.resolve();
    const value = samples[Math.min(index, samples.length - 1)];
    return { rows: value === undefined ? [] : [structuredClone(value)] };
  } };
  async function connect() {
    const label = ++count === 1 ? 'A' : 'B', pid = label === 'A' ? 101 : 202;
    return { label, async query(sql) {
      if (sql === 'select pg_backend_pid() pid') return { rows: [{ pid }] };
      events.push(label + ':' + sql);
      if (label === 'A' && (sql === 'commit' || sql === 'rollback')) releaseB();
      return { rows: [] };
    } };
  }
  const pause = async milliseconds => { assert.equal(milliseconds, 10); events.push('poll-pause'); clock += options.clockStep || milliseconds; };
  const race = vm.runInNewContext('(' + source.slice(start, end).trim() + ')', {
    assert, report, observer, connect, begin: async client => { events.push(client.label + ':begin'); },
    close: async client => { events.push(client.label + ':close'); },
    pause, sleep: pause, Date: { now: () => clock }, log: () => {}, message: error => error.message
  }, { filename: script });
  async function run(commit = true) {
    const aWork = async () => { events.push('A:work'); return { first: true }; };
    const bWork = async () => { events.push('B:work'); if (options.earlySettled) releaseB(); return pendingB; };
    return script === 'test-evidence-postgres-concurrency.mjs'
      ? race('synthetic-lock-observation', aWork, bWork, commit, options.expectedLock ?? null)
      : race('synthetic-lock-observation', aWork, bWork, commit);
  }
  return { run, events, report, get polls() { return pollCount; } };
}

const evidenceRunner = 'test-evidence-postgres-concurrency.mjs';
test('evidence advisory barrier waits for true matching pair with live coherent lock facts', async () => {
  const h = harness(evidenceRunner, [coherent, { ...advisory, advisory_pair: false }, { ...advisory, advisory_pair: 'true' }, advisory], { expectedLock: 'advisory' });
  const result = await h.run();
  assert.equal(result.second.ok, true); assert.equal(h.polls, 4); assert.equal(h.report.barriers.length, 1);
  assert.equal(h.report.barriers[0].advisory_pair, true); assert.equal(h.report.barriers[0].expectedLock, 'advisory');
  assert(h.events.indexOf('A:commit') > h.events.indexOf('observe:3'));
  assert.equal(h.events.slice(0, h.events.indexOf('observe:3')).some(e => e === 'A:commit' || e === 'A:rollback'), false);
});
test('evidence matching advisory pair cannot replace A blocker or current Lock wait', async () => {
  for (const row of [
    { ...advisory, blockers: [] }, { ...advisory, blockers: [999] },
    { ...advisory, wait_event_type: null, wait_event: null },
    { ...advisory, wait_event_type: 'Client', wait_event: 'ClientRead' }
  ]) {
    const h = harness(evidenceRunner, [row], { expectedLock: 'advisory', clockStep: 6000 });
    await assert.rejects(h.run(), /Missing actual PostgreSQL lock barrier/);
    assert.equal(h.report.barriers.length, 0); assert.equal(h.events.includes('A:commit'), false);
    assert(h.events.includes('A:rollback')); assert(h.events.includes('A:close')); assert(h.events.includes('B:close'));
  }
});
test('evidence advisory pair and blocker facts from separate samples cannot be combined', async () => {
  const h = harness(evidenceRunner, [{ ...advisory, blockers: [] }, { ...coherent, advisory_pair: false }], { expectedLock: 'advisory', clockStep: 2000 });
  await assert.rejects(h.run(), /Missing actual PostgreSQL lock barrier/);
  assert.equal(h.polls, 3); assert.equal(h.report.barriers.length, 0); assert.equal(h.events.includes('A:commit'), false);
});
test('evidence missing advisory match exhausts deadline despite ordinary coherent blocker', async () => {
  const h = harness(evidenceRunner, [{ ...coherent, advisory_pair: false }], { expectedLock: 'advisory', clockStep: 2000 });
  await assert.rejects(h.run(), /Missing actual PostgreSQL lock barrier/);
  assert.equal(h.polls, 3); assert.equal(h.report.barriers.length, 0); assert.equal(h.events.includes('A:commit'), false);
  assert(h.events.includes('A:rollback')); assert(h.events.includes('A:close')); assert(h.events.includes('B:close'));
});
test('evidence stale advisory pair cannot accept B which settled during observation', async () => {
  const h = harness(evidenceRunner, [advisory], { expectedLock: 'advisory', settleDuringRead: true });
  await assert.rejects(h.run(), /did not wait/);
  assert.equal(h.report.barriers.length, 0); assert.equal(h.events.includes('A:commit'), false);
});
test('evidence valid advisory barrier preserves intentional A rollback and waiting B result', async () => {
  const h = harness(evidenceRunner, [advisory], { expectedLock: 'advisory' });
  const result = await h.run(false);
  assert.equal(result.second.ok, true); assert.equal(h.report.barriers.length, 1); assert.equal(h.polls, 1);
  assert.equal(h.events.includes('A:commit'), false); assert(h.events.indexOf('A:rollback') > h.events.indexOf('observe:0'));
});
test('evidence valid advisory barrier preserves SQL rejection and connection cleanup', async () => {
  const h = harness(evidenceRunner, [advisory], { expectedLock: 'advisory', bReject: true });
  const result = await h.run();
  assert.equal(result.second.ok, false); assert.equal(result.second.code, 'PT409'); assert.equal(h.report.barriers.length, 1);
  assert(h.events.includes('B:rollback')); assert(h.events.includes('A:close')); assert(h.events.includes('B:close'));
});
test('evidence advisory observer failure never releases A as a successful barrier', async () => {
  const h = harness(evidenceRunner, [advisory], { expectedLock: 'advisory', queryFailure: true });
  await assert.rejects(h.run(), /Synthetic observer failure/);
  assert.equal(h.report.barriers.length, 0); assert.equal(h.events.includes('A:commit'), false);
  assert(h.events.includes('A:rollback')); assert(h.events.includes('A:close')); assert(h.events.includes('B:close'));
});

for (const script of ['test-intake-postgres-concurrency.mjs', 'test-billing-concurrency.mjs', 'test-evidence-postgres-concurrency.mjs']) {
  test(script + ': transitional blocker/null wait sample does not release A before coherent proof', async () => {
    const h = harness(script, [transition, coherent]); const result = await h.run();
    assert.equal(result.second.ok, true); assert.equal(h.polls, 2); assert.equal(h.report.barriers.length, 1);
    assert.equal(h.report.barriers[0].wait_event_type, 'Lock'); assert.deepEqual(Array.from(h.report.barriers[0].blockers), [101]);
    assert(h.events.indexOf('A:commit') > h.events.indexOf('observe:1'));
    assert.equal(h.events.slice(0, h.events.indexOf('observe:1')).some(e => e === 'A:commit' || e === 'A:rollback'), false);
  });
  test(script + ': blocker and Lock facts from separate samples cannot be combined', async () => {
    const h = harness(script, [transition, { blockers: [], wait_event_type: 'Lock', wait_event: 'relation' }], { clockStep: 2000 });
    await assert.rejects(h.run(), /Missing actual PostgreSQL lock barrier/);
    assert.equal(h.report.barriers.length, 0); assert.equal(h.events.includes('A:commit'), false);
  });
  test(script + ': blocker/null forever exhausts original deadline without false acceptance', async () => {
    const h = harness(script, [transition], { clockStep: 2000 }); await assert.rejects(h.run(), /Missing actual PostgreSQL lock barrier/);
    assert.equal(h.polls, 3); assert.equal(h.report.barriers.length, 0); assert.equal(h.events.includes('A:commit'), false);
    assert(h.events.includes('A:rollback')); assert(h.events.includes('A:close')); assert(h.events.includes('B:close'));
  });
  test(script + ': early settled B is refused even if observation returns stale coherent fields', async () => {
    const h = harness(script, [coherent], { settleDuringRead: true }); await assert.rejects(h.run(), /did not wait/);
    assert.equal(h.report.barriers.length, 0); assert.equal(h.events.includes('A:commit'), false);
  });
  test(script + ': unrelated blockers and non-Lock waits never prove A blocks B', async () => {
    for (const row of [{ blockers: [999], wait_event_type: 'Lock', wait_event: 'relation' }, { blockers: [101], wait_event_type: 'Client', wait_event: 'ClientRead' }, idle, undefined]) {
      const h = harness(script, [row], { clockStep: 6000 }); await assert.rejects(h.run(), /Missing actual PostgreSQL lock barrier/);
      assert.equal(h.report.barriers.length, 0); assert.equal(h.events.includes('A:commit'), false);
    }
  });
  test(script + ': coherent immediate lock retains rollback scenario and B result', async () => {
    const h = harness(script, [coherent]), result = await h.run(false);
    assert.equal(result.second.ok, true); assert.equal(h.polls, 1); assert.equal(h.report.barriers.length, 1);
    assert.equal(h.events.includes('A:commit'), false); assert(h.events.indexOf('A:rollback') > h.events.indexOf('observe:0'));
  });
  test(script + ': coherent lock does not suppress SQL rejection or skip connection cleanup', async () => {
    const h = harness(script, [coherent], { bReject: true }), result = await h.run();
    assert.equal(result.second.ok, false); assert.equal(result.second.code, 'PT409'); assert.equal(h.report.barriers.length, 1);
    assert(h.events.includes('B:rollback')); assert(h.events.includes('A:close')); assert(h.events.includes('B:close'));
  });
  test(script + ': observer error fails and releases held transaction only through cleanup', async () => {
    const h = harness(script, [coherent], { queryFailure: true }); await assert.rejects(h.run(), /Synthetic observer failure/);
    assert.equal(h.report.barriers.length, 0); assert.equal(h.events.includes('A:commit'), false);
    assert(h.events.includes('A:rollback')); assert(h.events.includes('A:close')); assert(h.events.includes('B:close'));
  });
}
