import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  NETLIFY_PRODUCTION_DEPLOY_CREDITS,
  NETLIFY_SNAPSHOT_INSTALL_ARGUMENTS,
  createNetlifyPublishedRecord,
  createNetlifyStageRecord,
  netlifyDraftDeployArguments,
  netlifyReleaseMode,
  parseNetlifyDeployJson,
  parseNetlifySiteJson,
  parseRestoredDeployJson,
  publishNetlifyRelease,
  rollbackNetlifyRelease,
  stageNetlifyRelease,
  validateNetlifyPublishedRecord,
  validateNetlifyStageRecord
} from "../../../scripts/netlify-release-policy.mjs";
import {
  NETLIFY_CLI_VERSION,
  findNetlifyEntrypoint,
  resolveNetlifyCli,
  validateNetlifyEntrypoint
} from "../../../scripts/netlify-cli.mjs";

const siteId = "12345678-1234-4123-8123-123456789abc";
const gitSha = "a".repeat(40);
const deployId = "b".repeat(24);
const baselineId = "c".repeat(24);
const deployUrl = `https://${deployId}--qrguitar.netlify.app`;
const baselineUrl = `https://${baselineId}--qrguitar.netlify.app`;
const productionOrigin = "https://qrguitar.netlify.app";
const buildTimestamp = "2026-09-18T10:00:00.000Z";

const releaseEnvironment = {
  QRGUITAR_BUILD_ENV: "production",
  QRGUITAR_GIT_SHA: gitSha,
  QRGUITAR_BUILD_TIMESTAMP: buildTimestamp,
  QRGUITAR_BUILD_DIRTY: "false",
  NEXT_PUBLIC_SITE_URL: "https://qrguitar.com"
};

test("root Netlify config builds the web workspace with managed output on Node 24", () => {
  const config = fs.readFileSync(new URL("../../../netlify.toml", import.meta.url), "utf8");
  assert.match(config, /command\s*=\s*"npm run build --workspace @qrguitar\/web"/);
  assert.match(config, /publish\s*=\s*"apps\/web\/\.next"/);
  assert.match(config, /NODE_VERSION\s*=\s*"24"/);
  assert.doesNotMatch(config, /(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY)\s*=/i);
});

function stageRecord() {
  return createNetlifyStageRecord({
    siteId,
    gitSha,
    productionOrigin,
    deployment: { id: deployId, url: deployUrl },
    baseline: { deployId: baselineId, deployUrl: baselineUrl, gitSha: "d".repeat(40) },
    releaseEnvironment,
    startedAt: "2026-09-18T10:01:00.000Z",
    completedAt: "2026-09-18T10:02:00.000Z",
    stagedAt: "2026-09-18T10:03:00.000Z"
  });
}

function sitePayload(publishedId = baselineId) {
  return {
    id: siteId,
    name: "qrguitar",
    url: productionOrigin,
    ssl_url: productionOrigin,
    custom_domain: "qrguitar.com",
    domain_aliases: ["www.qrguitar.com"],
    published_deploy: publishedId
      ? {
          id: publishedId,
          site_id: siteId,
          state: "ready",
          deploy_ssl_url: `https://${publishedId}--qrguitar.netlify.app`,
          commit_ref: "d".repeat(40),
          locked: true
        }
      : null
  };
}

test("draft JSON is bound to one site, deploy ID, and immutable permalink", () => {
  const payload = {
    site_id: siteId,
    site_name: "qrguitar",
    deploy_id: deployId,
    deploy_url: deployUrl,
    logs: "https://app.netlify.com/sites/qrguitar/deploys/" + deployId,
    function_logs: "https://app.netlify.com/sites/qrguitar/logs/functions",
    edge_function_logs: "https://app.netlify.com/sites/qrguitar/logs/edge-functions"
  };
  assert.deepEqual(parseNetlifyDeployJson(JSON.stringify(payload), siteId), {
    id: deployId,
    url: deployUrl,
    siteName: "qrguitar"
  });
  for (const changed of [
    { ...payload, site_id: "87654321-4321-4321-8321-cba987654321" },
    { ...payload, deploy_url: "https://qrguitar.netlify.app" },
    { ...payload, url: productionOrigin },
    { ...payload, deploy_id: "not-an-id" }
  ]) assert.throws(() => parseNetlifyDeployJson(JSON.stringify(changed), siteId));
});

test("site and restore API results remain bound to exact IDs", () => {
  const site = parseNetlifySiteJson(JSON.stringify(sitePayload()), siteId, productionOrigin);
  assert.equal(site.production.deployId, baselineId);
  assert.equal(site.production.locked, true);
  assert.throws(() => parseNetlifySiteJson(JSON.stringify(sitePayload()), siteId, "https://evil.invalid"));
  const restored = JSON.stringify({
    id: deployId,
    site_id: siteId,
    state: "ready",
    deploy_ssl_url: deployUrl,
    commit_ref: gitSha,
    locked: true
  });
  assert.equal(parseRestoredDeployJson(restored, siteId, deployId).deployId, deployId);
  assert.throws(() => parseRestoredDeployJson(restored, siteId, baselineId));
});

test("stage record contains checks and public identity but no credentials", () => {
  const record = stageRecord();
  assert.equal(record.publishPolicy.productionDeployCredits, NETLIFY_PRODUCTION_DEPLOY_CREDITS);
  assert.equal(record.publishPolicy.requiresExplicitAcknowledgement, true);
  assert(!JSON.stringify(record).match(/TOKEN|SERVICE_ROLE|SECRET/i));
  assert.equal(validateNetlifyStageRecord(record, { siteId, gitSha, productionOrigin }), record);
  const receipt = createNetlifyPublishedRecord(record, "2026-09-18T10:04:00.000Z");
  assert.equal(validateNetlifyPublishedRecord(receipt, { siteId, gitSha, productionOrigin }), receipt);
  for (const mutate of [
    value => ({ ...value, gitSha: gitSha.slice(0, 7) }),
    value => ({ ...value, deployment: { ...value.deployment, url: "https://evil.invalid" } }),
    value => ({ ...value, releaseEnvironment: { ...value.releaseEnvironment, NETLIFY_AUTH_TOKEN: "secret" } }),
    value => ({ ...value, publishPolicy: { ...value.publishPolicy, productionDeployCredits: 0 } })
  ]) assert.throws(() => validateNetlifyStageRecord(mutate(record), { siteId, gitSha, productionOrigin }));
});

test("stage verifies a draft and unchanged locked production before saving", async () => {
  const events = [];
  const baseline = parseNetlifySiteJson(JSON.stringify(sitePayload()), siteId, productionOrigin);
  const deployment = await stageNetlifyRelease({
    unchanged: () => events.push("unchanged"),
    runChecks: () => events.push("checks"),
    readProduction: () => {
      events.push("production");
      return baseline;
    },
    stage: () => {
      events.push("stage");
      return { id: deployId, url: deployUrl };
    },
    verifyIdentity: () => events.push("identity"),
    saveRecord: () => events.push("save")
  });
  assert.deepEqual(deployment, { id: deployId, url: deployUrl });
  assert.deepEqual(events, [
    "unchanged",
    "production",
    "checks",
    "unchanged",
    "stage",
    "unchanged",
    "identity",
    "unchanged",
    "production",
    "save"
  ]);
});

for (const failure of ["checks", "stage", "identity", "changedAfterStage", "productionChanged"]) {
  test("stage failure " + failure + " never saves a promotable record", async () => {
    let guard = 0;
    let saved = false;
    let productionReads = 0;
    await assert.rejects(
      stageNetlifyRelease({
        unchanged: () => {
          guard++;
          if (failure === "changedAfterStage" && guard === 3) throw new Error("changed");
        },
        runChecks: () => {
          if (failure === "checks") throw new Error("checks");
        },
        readProduction: () => {
          productionReads++;
          const payload = sitePayload(
            failure === "productionChanged" && productionReads === 2 ? "e".repeat(24) : baselineId
          );
          return parseNetlifySiteJson(JSON.stringify(payload), siteId, productionOrigin);
        },
        stage: () => {
          if (failure === "stage") throw new Error("stage");
          return { id: deployId, url: deployUrl };
        },
        verifyIdentity: () => {
          if (failure === "identity") throw new Error("identity");
        },
        saveRecord: () => {
          saved = true;
        }
      })
    );
    assert.equal(saved, false);
  });
}

test("publication rechecks baseline before one exact restore and verifies live", async () => {
  const events = [];
  let reads = 0;
  const record = stageRecord();
  await publishNetlifyRelease({
    unchanged: () => events.push("unchanged"),
    loadRecord: () => record,
    checkBackend: () => events.push("database"),
    readProduction: () => {
      reads++;
      events.push("production:" + reads);
      return parseNetlifySiteJson(
        JSON.stringify(sitePayload(reads === 3 ? deployId : baselineId)),
        siteId,
        productionOrigin
      );
    },
    verify: () => events.push("verify"),
    publish: deployment => events.push("publish:" + deployment.id),
    verifyLive: () => events.push("live"),
    saveReceipt: () => events.push("receipt")
  });
  assert.deepEqual(events, [
    "unchanged",
    "database",
    "unchanged",
    "production:1",
    "verify",
    "unchanged",
    "production:2",
    "publish:" + deployId,
    "production:3",
    "live",
    "receipt"
  ]);
});

for (const failure of ["database", "baseline", "verify", "changedAfterVerify"]) {
  test("publication failure " + failure + " never publishes", async () => {
    let guards = 0;
    let published = false;
    const record = stageRecord();
    await assert.rejects(
      publishNetlifyRelease({
        unchanged: () => {
          guards++;
          if (failure === "changedAfterVerify" && guards === 3) throw new Error("changed");
        },
        loadRecord: () => record,
        checkBackend: () => {
          if (failure === "database") throw new Error("database");
        },
        readProduction: () =>
          parseNetlifySiteJson(
            JSON.stringify(sitePayload(failure === "baseline" ? "e".repeat(24) : baselineId)),
            siteId,
            productionOrigin
          ),
        verify: () => {
          if (failure === "verify") throw new Error("verify");
        },
        publish: () => {
          published = true;
        },
        verifyLive: () => {},
        saveReceipt: () => {}
      })
    );
    assert.equal(published, false);
  });
}

test("rollback verifies current and target before restoring the exact baseline", async () => {
  const events = [];
  let reads = 0;
  const receipt = createNetlifyPublishedRecord(stageRecord(), "2026-09-18T10:04:00.000Z");
  await rollbackNetlifyRelease({
    unchanged: () => events.push("unchanged"),
    loadReceipt: () => receipt,
    readProduction: () => {
      reads++;
      events.push("production:" + reads);
      return parseNetlifySiteJson(
        JSON.stringify(sitePayload(reads === 3 ? baselineId : deployId)),
        siteId,
        productionOrigin
      );
    },
    verifyCurrent: () => events.push("verify-current-and-target"),
    rollback: baseline => events.push("rollback:" + baseline.deployId),
    verifyRollback: () => events.push("verify-rollback"),
    archiveReceipt: () => events.push("archive")
  });
  assert.deepEqual(events, [
    "unchanged",
    "production:1",
    "verify-current-and-target",
    "unchanged",
    "production:2",
    "rollback:" + baselineId,
    "production:3",
    "verify-rollback",
    "archive"
  ]);
});

for (const failure of ["currentDeploy", "verification", "changedAfterVerify"]) {
  test("rollback failure " + failure + " never restores production", async () => {
    let guards = 0;
    let restored = false;
    const receipt = createNetlifyPublishedRecord(stageRecord(), "2026-09-18T10:04:00.000Z");
    await assert.rejects(
      rollbackNetlifyRelease({
        unchanged: () => {
          guards++;
          if (failure === "changedAfterVerify" && guards === 2) throw new Error("changed");
        },
        loadReceipt: () => receipt,
        readProduction: () =>
          parseNetlifySiteJson(
            JSON.stringify(sitePayload(failure === "currentDeploy" ? "e".repeat(24) : deployId)),
            siteId,
            productionOrigin
          ),
        verifyCurrent: () => {
          if (failure === "verification") throw new Error("verification");
        },
        rollback: () => {
          restored = true;
        },
        verifyRollback: () => {},
        archiveReceipt: () => {}
      })
    );
    assert.equal(restored, false);
  });
}

test("CLI modes require explicit production-credit and database acknowledgements", () => {
  assert.equal(netlifyReleaseMode(["stage"]), "stage");
  assert.equal(netlifyReleaseMode(["publish", "--acknowledge-production-credits=15"]), "publish");
  assert.equal(netlifyReleaseMode(["rollback", "--acknowledge-database-compatibility"]), "rollback");
  for (const args of [[], ["publish"], ["publish", "--prod"], ["rollback"], ["stage", "--prod"]]) {
    assert.throws(() => netlifyReleaseMode(args));
  }
});

test("stage CLI arguments are draft-only and production-context", () => {
  assert.deepEqual(NETLIFY_SNAPSHOT_INSTALL_ARGUMENTS, ["ci", "--no-audit", "--no-fund"]);
  const args = netlifyDraftDeployArguments(siteId, gitSha);
  assert.deepEqual(args.slice(0, 8), [
    "deploy",
    "--site",
    siteId,
    "--filter",
    "@qrguitar/web",
    "--context",
    "production",
    "--json"
  ]);
  assert(!args.includes("--prod"));
  assert(!args.includes("--prod-if-unlocked"));
  assert.equal(args.at(-1), "QRguitar " + gitSha);
});

test("only the pinned Netlify CLI entrypoint can be resolved", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "qrguitar-netlify-cli-"));
  try {
    const packageRoot = path.join(fixture, "netlify-cli");
    const entrypoint = path.join(packageRoot, "bin", "run.js");
    fs.mkdirSync(path.dirname(entrypoint), { recursive: true });
    fs.writeFileSync(entrypoint, "// fixture\n");
    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ name: "netlify-cli", version: NETLIFY_CLI_VERSION, bin: { netlify: "./bin/run.js" } })
    );
    assert.equal(validateNetlifyEntrypoint(entrypoint), fs.realpathSync(entrypoint));
    const bin = path.join(fixture, ".bin");
    fs.mkdirSync(bin);
    fs.renameSync(packageRoot, path.join(fixture, "netlify-cli-moved"));
    const movedRoot = path.join(fixture, "netlify-cli-moved");
    assert.throws(() => findNetlifyEntrypoint(bin));
    fs.renameSync(movedRoot, packageRoot);
    assert.equal(findNetlifyEntrypoint(bin), fs.realpathSync(entrypoint));
    let invoked;
    const resolved = resolveNetlifyCli("fixture-npx", args => {
      invoked = args;
      return JSON.stringify({ version: NETLIFY_CLI_VERSION, entrypoint });
    });
    assert.equal(resolved, fs.realpathSync(entrypoint));
    assert.deepEqual(invoked.slice(0, 5), [
      "fixture-npx",
      "--yes",
      "--package",
      "netlify-cli@" + NETLIFY_CLI_VERSION,
      "--"
    ]);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
