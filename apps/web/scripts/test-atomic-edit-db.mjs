import assert from "node:assert/strict";
import {createTestDb,readRepo} from "./atomic-test-support.mjs";
const db=await createTestDb(["20260910220000_atomic_instrument_profile_save.sql"]);
const conflictMigration=readRepo("supabase/migrations/20260917174500_business_conflict_responses.sql");
const correctedProfile=conflictMigration.match(/create or replace function public\.save_instrument_profile\([\s\S]*?\$\$;/i)?.[0];
assert(correctedProfile,"Reviewed profile conflict function missing");
await db.exec(correctedProfile);
const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const guitar = "20000000-0000-4000-8000-000000000001";
const media = "30000000-0000-4000-8000-000000000001";
const doc = "40000000-0000-4000-8000-000000000001";
const event = "50000000-0000-4000-8000-000000000001";
const mediaPath = `${owner}/${guitar}/original.jpg`;
const docPath = `${owner}/${guitar}/receipt.pdf`;
await db.exec(`
insert into auth.users values ('${owner}'), ('${other}');
insert into public.profiles (id,display_name,created_at) values ('${owner}','Original owner','2026-01-01'), ('${other}','Other','2026-01-01');
insert into public.guitars (id,owner_id,qr_code,permanent_path,name,brand,model,serial_number,hero_image_path,created_at,updated_at)
values ('${guitar}','${owner}','QRG-ORIGINAL123','/i/QRG-ORIGINAL123','Original','Fender','Strat','ORIGINAL123','${mediaPath}','2026-01-01','2026-01-02');
insert into public.guitar_media (id,guitar_id,storage_path,alt,created_at) values ('${media}','${guitar}','${mediaPath}','Original photo','2026-01-01');
insert into public.guitar_documents (id,guitar_id,uploaded_by_user_id,name,storage_path,file_name,mime_type,file_size_bytes,private_notes,created_at,updated_at)
values ('${doc}','${guitar}','${owner}','Receipt','${docPath}','receipt-original.pdf','application/pdf',1234,'Private owner notes','2026-01-01','2026-01-02');
insert into public.guitar_timeline_events (id,guitar_id,title,event_type,related_document_id)
values ('${event}','${guitar}','Purchased with receipt','ownership','${doc}');
update public.guitar_documents set related_timeline_event_id='${event}' where id='${doc}';
insert into public.guitar_specs (guitar_id,label,value) values ('${guitar}','Condition','used');
insert into public.site_content (content_key,content_value,updated_by)
values ('record_trust:QRG-ORIGINAL123','{"authenticityStatus":"confirmed","internalVerificationNote":"Admin-only note","showSerialPublic":false}','${other}');
`);

const tables = ["guitars", "profiles", "guitar_media", "guitar_documents", "guitar_specs", "guitar_timeline_events", "site_content", "qr_redirects", "guitar_serial_aliases", "admin_audit_events"];
async function snapshot() {
  const state = {};
  for (const table of tables) state[table] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb) as records from public.${table} t`)).rows[0].records;
  return state;
}
async function payload() {
  const s = await snapshot();
  const g = s.guitars[0];
  const d = s.guitar_documents[0];
  const m = s.guitar_media[0];
  return {
    guitar: { qr_code: g.qr_code, name: "Updated name", brand: "Fender", model: "Strat", year: "1965",
      serial_number: g.serial_number, builder: "", location: "New York", visibility: "public", summary: "Saved together", hero_image_path: m.storage_path },
    media: [{ id: m.id, storage_path: m.storage_path, alt: "New photo description", sort_order: 0 }],
    documents: [{ ...d, name: "Renamed receipt", public_description: "Original invoice", is_public: true }],
    specs: [{ label: "Condition", value: "used", sort_order: 0 }, { label: "Finish", value: "Sunburst", sort_order: 1 }],
    expected_media: [{ id: m.id, storage_path: m.storage_path, sort_order: m.sort_order }],
    expected_documents: [{ id: d.id, updated_at: d.updated_at }],
    owner_name: "Updated owner", actor_email: "owner@example.test", serial_correction_approved: false, show_serial_public: true
  };
}
async function save(body, expected, actor = owner) {
  return (await db.query("select public.save_instrument_profile($1::uuid,$2::uuid,$3::timestamptz,$4::jsonb) as result",
    [guitar, actor, expected, JSON.stringify(body)])).rows[0].result;
}
let passed = 0;
async function test(name, run) { await run(); console.log("PASS " + name); passed++; }
await test("RPC is unavailable to anon/authenticated and executable by service_role", async () => {
  const rows = (await db.query(`select r, has_function_privilege(r, 'public.save_instrument_profile(uuid,uuid,timestamptz,jsonb)', 'EXECUTE') as allowed from unnest(array['anon','authenticated','service_role']) r`)).rows;
  assert.deepEqual(rows.map(({r,allowed}) => [r,allowed]), [["anon",false],["authenticated",false],["service_role",true]]);
});
await test("wrong owner cannot save, with no mutation", async () => {
  const before = await snapshot();
  await assert.rejects(save(await payload(), before.guitars[0].updated_at, other), (e) => e.code === "42501");
  assert.deepEqual(await snapshot(), before);
});
await test("serial removal cannot bypass admin approval", async () => {
  const before = await snapshot(); const p = await payload(); p.guitar.serial_number = "";
  await assert.rejects(save(p, before.guitars[0].updated_at), (e) => e.code === "42501");
  assert.deepEqual(await snapshot(), before);
});
await test("a failing photo update rolls back guitar and related rows", async () => {
  await db.exec("create function public.qa_fail_media() returns trigger language plpgsql as $$ begin raise exception 'injected media failure'; end $$; create trigger qa_fail_media before update on public.guitar_media for each row execute function public.qa_fail_media();");
  const before = await snapshot();
  await assert.rejects(save(await payload(), before.guitars[0].updated_at), /injected media failure/);
  assert.deepEqual(await snapshot(), before);
  await db.exec("drop trigger qa_fail_media on public.guitar_media; drop function public.qa_fail_media();");
});
await test("a failing document update rolls back guitar and already-updated photos", async () => {
  await db.exec("create function public.qa_fail_doc() returns trigger language plpgsql as $$ begin raise exception 'injected document failure'; end $$; create trigger qa_fail_doc before update on public.guitar_documents for each row execute function public.qa_fail_doc();");
  const before = await snapshot();
  await assert.rejects(save(await payload(), before.guitars[0].updated_at), /injected document failure/);
  assert.deepEqual(await snapshot(), before);
  await db.exec("drop trigger qa_fail_doc on public.guitar_documents; drop function public.qa_fail_doc();");
});
await test("a failing specs insert restores deleted specs and all earlier writes", async () => {
  await db.exec("create function public.qa_fail_spec() returns trigger language plpgsql as $$ begin raise exception 'injected specs failure'; end $$; create trigger qa_fail_spec before insert on public.guitar_specs for each row execute function public.qa_fail_spec();");
  const before = await snapshot();
  await assert.rejects(save(await payload(), before.guitars[0].updated_at), /injected specs failure/);
  assert.deepEqual(await snapshot(), before);
  await db.exec("drop trigger qa_fail_spec on public.guitar_specs; drop function public.qa_fail_spec();");
});
await test("a late trust failure rolls back documents, metadata and identity redirects", async () => {
  await db.exec("create function public.qa_fail_trust() returns trigger language plpgsql as $$ begin raise exception 'injected trust failure'; end $$; create trigger qa_fail_trust before update on public.site_content for each row execute function public.qa_fail_trust();");
  const before = await snapshot(); const p = await payload();
  p.guitar.qr_code = "QRG-CORRECTED123"; p.guitar.serial_number = "CORRECTED123"; p.serial_correction_approved = true;
  await assert.rejects(save(p, before.guitars[0].updated_at), /injected trust failure/);
  assert.deepEqual(await snapshot(), before);
  await db.exec("drop trigger qa_fail_trust on public.site_content; drop function public.qa_fail_trust();");
});
await test("unknown timeline association fails atomically", async () => {
  const before = await snapshot(); const p = await payload();
  p.documents[0].related_timeline_event_id = "50000000-0000-4000-8000-000000009999";
  await assert.rejects(save(p, before.guitars[0].updated_at), (e) => e.code === "22023");
  assert.deepEqual(await snapshot(), before);
});
await test("success preserves document identity, creation, uploader, private metadata, and timeline reference", async () => {
  const before = await snapshot(); const p = await payload();
  const result = await save(p, before.guitars[0].updated_at);
  assert.equal(result.ok, true);
  const after = await snapshot();
  const d = after.guitar_documents[0];
  for (const field of ["id","created_at","uploaded_by_user_id","file_name","mime_type","file_size_bytes","private_notes","related_timeline_event_id"]) {
    assert.equal(d[field], before.guitar_documents[0][field], field);
  }
  assert.equal(d.name, "Renamed receipt");
  assert.equal(after.guitar_timeline_events.find((e) => e.id === event).related_document_id, doc);
  assert.equal(after.guitar_media[0].id, before.guitar_media[0].id);
  assert.equal(after.guitar_media[0].created_at, before.guitar_media[0].created_at);
  assert.equal(after.profiles.find((p) => p.id === owner).created_at, before.profiles.find((p) => p.id === owner).created_at);
  assert.equal(after.site_content[0].content_value.internalVerificationNote, "Admin-only note");
  assert.equal(after.site_content[0].content_value.authenticityStatus, "confirmed");
  assert.equal(after.site_content[0].content_value.showSerialPublic, true);
});
await test("second save with the same guitar snapshot rejects instead of overwriting", async () => {
  const before = await snapshot(); const p = await payload();
  await save(p, before.guitars[0].updated_at);
  const committed = await snapshot();
  p.guitar.name = "Would overwrite the first writer";
  await assert.rejects(save(p, before.guitars[0].updated_at), (e) => e.code === "PT409");
  assert.deepEqual(await snapshot(), committed);
});
await test("a concurrently edited document rejects a stale file snapshot", async () => {
  const before = await snapshot(); const p = await payload();
  await db.exec(`update public.guitar_documents set updated_at=clock_timestamp(), private_notes='Concurrent private note' where id='${doc}'`);
  const concurrent = await snapshot();
  await assert.rejects(save(p, before.guitars[0].updated_at), (e) => e.code === "PT409");
  assert.deepEqual(await snapshot(), concurrent);
});
await test("approved serial correction commits redirect, aliases, trust migration and audit together", async () => {
  const before = await snapshot(); const p = await payload();
  p.guitar.qr_code = "QRG-CORRECTED123"; p.guitar.serial_number = "CORRECTED123"; p.serial_correction_approved = true;
  await db.exec("set role service_role");
  const result = await save(p, before.guitars[0].updated_at);
  await db.exec("reset role");
  const after = await snapshot();
  assert.equal(result.qrCode, "QRG-CORRECTED123");
  assert.equal(after.qr_redirects[0].old_path, "/i/QRG-ORIGINAL123");
  assert.equal(after.site_content[0].content_key, "record_trust:QRG-CORRECTED123");
  assert.equal(after.guitar_serial_aliases.find((a) => a.serial_normalized === "ORIGINAL123").is_current, false);
  assert.equal(after.guitar_serial_aliases.find((a) => a.serial_normalized === "CORRECTED123").is_current, true);
  assert.equal(after.admin_audit_events[0].action, "serial_correction_qrguitar_id_changed");
  assert.equal(after.guitar_documents[0].id, doc);
  assert.equal(after.guitar_timeline_events.find((e) => e.id === event).related_document_id, doc);
});
console.log(`Completed ${passed} PostgreSQL transactional tests against actual repository schema and the proposed RPC.`);
await db.close();
