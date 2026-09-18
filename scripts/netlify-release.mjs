import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNetlifyCli } from "./netlify-cli.mjs";
import { assertNetlifyRuntimeConstraints } from "./check-netlify-runtime-constraints.mjs";
import { createReleaseSnapshot, cleanupReleaseSnapshot } from "./release-snapshot.mjs";
import {
  assertSameCommit,
  runLocalReleaseChecks,
  verifyDeploymentIdentity,
  verifyProduction
} from "./release-policy.mjs";
import {
  NETLIFY_PUBLISHED_RECORD_NAME,
  NETLIFY_SNAPSHOT_INSTALL_ARGUMENTS,
  NETLIFY_STAGE_RECORD_NAME,
  createNetlifyPublishedRecord,
  createNetlifyStageRecord,
  isNetlifySiteId,
  netlifyProductionOrigin,
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
} from "./netlify-release-policy.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const stateDirectory = path.join(root, ".netlify");
const stageRecordPath = path.join(stateDirectory, NETLIFY_STAGE_RECORD_NAME);
const publishedRecordPath = path.join(stateDirectory, NETLIFY_PUBLISHED_RECORD_NAME);
const MAX_COMMAND_TIME_MS = 30 * 60 * 1000;
const MAX_API_TIME_MS = 2 * 60 * 1000;

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function run(executable, args, environment, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd || root,
    env: environment,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    maxBuffer: 8 * 1024 * 1024,
    timeout: options.timeoutMs || MAX_COMMAND_TIME_MS
  });
  if (result.error || result.status !== 0) {
    throw new Error("Netlify release stopped: " + (options.label || args.slice(0, 4).join(" ")));
  }
  return result.stdout?.trim() || "";
}

function requireCleanTree() {
  if (git("status", "--porcelain")) {
    throw new Error("Refusing to release: commit the reviewed working tree first.");
  }
}

function readJsonRecord(recordPath, missingMessage) {
  let text;
  let record;
  try {
    text = fs.readFileSync(recordPath, "utf8");
    record = JSON.parse(text);
  } catch {
    throw new Error(missingMessage);
  }
  return { text, record };
}

function writeJsonAtomically(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = target + ".tmp-" + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  fs.renameSync(temporary, target);
}

function archiveIfPresent(target, label) {
  if (fs.existsSync(target)) fs.renameSync(target, target + "." + label + "-" + Date.now());
}

function releaseEnvironment(gitSha, canonicalOrigin) {
  return {
    QRGUITAR_BUILD_ENV: "production",
    QRGUITAR_GIT_SHA: gitSha,
    QRGUITAR_BUILD_TIMESTAMP: new Date().toISOString(),
    QRGUITAR_BUILD_DIRTY: "false",
    NEXT_PUBLIC_SITE_URL: canonicalOrigin
  };
}

let snapshot;
try {
  const mode = netlifyReleaseMode(process.argv.slice(2));
  if (Number(process.versions.node.split(".")[0]) !== 24) {
    throw new Error("QRguitar Netlify releases require Node.js 24.");
  }
  if (process.env.QRGUITAR_NETLIFY_FREE_PLAN_CONFIRMED !== "true") {
    throw new Error(
      "Set QRGUITAR_NETLIFY_FREE_PLAN_CONFIRMED=true only after confirming the target account is on Netlify Free with its hard monthly limit."
    );
  }
  if (mode === "publish" && process.env.QRGUITAR_NETLIFY_RESTORE_DRAFT_PROVEN !== "true") {
    throw new Error(
      "Publication is disabled until QRGUITAR_NETLIFY_RESTORE_DRAFT_PROVEN=true confirms the exact draft-to-production restore flow was rehearsed on a disposable site."
    );
  }
  requireCleanTree();
  assertNetlifyRuntimeConstraints(root);
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Run this adapter through npm run release:netlify.");
  const siteId = (process.env.QRGUITAR_NETLIFY_SITE_ID || "").toLowerCase();
  if (!isNetlifySiteId(siteId)) throw new Error("QRGUITAR_NETLIFY_SITE_ID must be the exact Netlify site UUID.");
  const productionOrigin = netlifyProductionOrigin(process.env.QRGUITAR_NETLIFY_PRODUCTION_ORIGIN || "");
  const canonicalOrigin = netlifyProductionOrigin(
    process.env.QRGUITAR_NETLIFY_CANONICAL_ORIGIN || "https://qrguitar.com"
  );
  const gitSha = git("rev-parse", "HEAD").toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(gitSha)) throw new Error("Git did not return a full release commit SHA.");

  const baseEnvironment = {
    ...process.env,
    NETLIFY_TELEMETRY_DISABLED: "1"
  };
  const npxCli = path.join(path.dirname(npmCli), "npx-cli.js");
  const netlifyEntrypoint = resolveNetlifyCli(npxCli, args =>
    run(process.execPath, args, baseEnvironment, {
      capture: true,
      label: "Resolve pinned Netlify CLI",
      timeoutMs: 5 * 60 * 1000
    })
  );
  const cli = (args, { capture = true, cwd = root, environment = baseEnvironment, timeoutMs = MAX_API_TIME_MS } = {}) =>
    run(process.execPath, [netlifyEntrypoint, ...args], environment, {
      capture,
      cwd,
      label: "Netlify " + args.slice(0, 2).join(" "),
      timeoutMs
    });
  const api = (method, data) =>
    cli(["api", method, "--data", JSON.stringify(data)], { capture: true, timeoutMs: MAX_API_TIME_MS });

  async function readSite() {
    const site = parseNetlifySiteJson(api("getSite", { site_id: siteId }), siteId, productionOrigin);
    if (site.production && !site.production.gitSha) {
      try {
        const response = await fetch(new URL("/api/build-info", productionOrigin), {
          cache: "no-store",
          signal: AbortSignal.timeout(15000)
        });
        const identity = response.ok ? await response.json() : null;
        if (
          identity?.environment === "production" &&
          identity?.deploymentIdentifier === site.production.deployId &&
          /^[a-f0-9]{40}$/.test(identity?.gitCommitSha || "")
        ) site.production.gitSha = identity.gitCommitSha;
      } catch {
        // An unidentifiable baseline can still be staged, but cannot be published by this guarded adapter.
      }
    }
    return site;
  }

  let reviewedStageText;
  const loadStageRecord = () => {
    const loaded = readJsonRecord(
      stageRecordPath,
      "No valid Netlify staged release record. Run npm run release:netlify -- stage first."
    );
    if (reviewedStageText !== undefined && reviewedStageText !== loaded.text) {
      throw new Error("Netlify staged release record changed during publication.");
    }
    reviewedStageText = loaded.text;
    return validateNetlifyStageRecord(loaded.record, { siteId, gitSha, productionOrigin });
  };

  let reviewedPublishedText;
  const loadPublishedRecord = () => {
    const loaded = readJsonRecord(
      publishedRecordPath,
      "No valid Netlify publication receipt is available for rollback."
    );
    if (reviewedPublishedText !== undefined && reviewedPublishedText !== loaded.text) {
      throw new Error("Netlify publication receipt changed during rollback.");
    }
    reviewedPublishedText = loaded.text;
    return validateNetlifyPublishedRecord(loaded.record, { siteId, gitSha, productionOrigin });
  };

  const unchanged = () => {
    requireCleanTree();
    assertSameCommit(git("rev-parse", "HEAD").toLowerCase(), gitSha);
    if (mode === "publish") loadStageRecord();
    if (mode === "rollback") loadPublishedRecord();
  };
  const runCheck = (args, environment) => run(process.execPath, [npmCli, ...args], environment);
  const checkBackend = environment => run(process.execPath, ["scripts/check-release-readiness.mjs"], environment);
  const restore = (deployId) =>
    parseRestoredDeployJson(
      api("restoreSiteDeploy", { site_id: siteId, deploy_id: deployId }),
      siteId,
      deployId
    );

  if (mode === "stage") {
    const environmentValues = releaseEnvironment(gitSha, canonicalOrigin);
    const environment = { ...baseEnvironment, ...environmentValues };
    let startedAt;
    let completedAt;
    archiveIfPresent(stageRecordPath, "superseded");
    console.log("Checking committed QRguitar Netlify candidate " + gitSha + ".");
    const deployment = await stageNetlifyRelease({
      unchanged,
      readProduction: readSite,
      runChecks: async () => {
        startedAt = new Date().toISOString();
        await runLocalReleaseChecks(args => runCheck(args, environment));
        completedAt = new Date().toISOString();
      },
      stage: () => {
        snapshot = createReleaseSnapshot(root, gitSha);
        run(process.execPath, [npmCli, ...NETLIFY_SNAPSHOT_INSTALL_ARGUMENTS], environment, {
          cwd: snapshot,
          label: "Install locked snapshot dependencies",
          timeoutMs: 20 * 60 * 1000
        });
        const output = cli(
          netlifyDraftDeployArguments(siteId, gitSha),
          {
            capture: true,
            cwd: snapshot,
            environment,
            timeoutMs: 20 * 60 * 1000
          }
        );
        const parsed = parseNetlifyDeployJson(output, siteId);
        console.log("Staged Netlify draft " + parsed.id + " at " + parsed.url + ".");
        return parsed;
      },
      verifyIdentity: deployment =>
        verifyDeploymentIdentity({
          sha: gitSha,
          buildTimestamp: environmentValues.QRGUITAR_BUILD_TIMESTAMP,
          deploymentIdentifier: deployment.id,
          origin: deployment.url,
          staged: true
        }),
      saveRecord: (deployment, baselineProduction) => {
        const baseline = baselineProduction
          ? {
              deployId: baselineProduction.deployId,
              deployUrl: baselineProduction.deployUrl,
              gitSha: baselineProduction.gitSha
            }
          : { deployId: null, deployUrl: null, gitSha: null };
        writeJsonAtomically(
          stageRecordPath,
          createNetlifyStageRecord({
            siteId,
            gitSha,
            productionOrigin,
            deployment: { id: deployment.id, url: deployment.url },
            baseline,
            releaseEnvironment: environmentValues,
            startedAt,
            completedAt,
            stagedAt: new Date().toISOString()
          })
        );
      }
    });
    console.log("Draft identity verified without publishing production or spending production-deploy credits.");
    console.log("Review the staged release record before publication: " + stageRecordPath);
    console.log("Immutable draft URL: " + deployment.url);
  } else if (mode === "publish") {
    const stageRecord = loadStageRecord();
    if (!stageRecord.baseline.deployId || !stageRecord.baseline.gitSha) {
      throw new Error("Publication is blocked because the staged record has no SHA-identified rollback baseline.");
    }
    const environment = { ...baseEnvironment, ...stageRecord.releaseEnvironment };
    console.log("Rechecking Netlify draft " + stageRecord.deployment.id + " before publication.");
    await publishNetlifyRelease({
      unchanged,
      loadRecord: loadStageRecord,
      checkBackend: () => checkBackend(environment),
      readProduction: readSite,
      verify: async (deployment, record) => {
        await verifyProduction({
          sha: gitSha,
          buildTimestamp: record.releaseEnvironment.QRGUITAR_BUILD_TIMESTAMP,
          deploymentIdentifier: deployment.id,
          origin: deployment.url,
          staged: true
        });
        await verifyProduction({
          sha: record.baseline.gitSha,
          deploymentIdentifier: record.baseline.deployId,
          origin: record.baseline.deployUrl,
          staged: true
        });
      },
      publish: deployment => restore(deployment.id),
      verifyLive: record =>
        verifyProduction({
          sha: gitSha,
          buildTimestamp: record.releaseEnvironment.QRGUITAR_BUILD_TIMESTAMP,
          deploymentIdentifier: record.deployment.id,
          origin: productionOrigin,
          productionOrigins: [productionOrigin]
        }),
      saveReceipt: record => {
        archiveIfPresent(publishedRecordPath, "superseded");
        writeJsonAtomically(publishedRecordPath, createNetlifyPublishedRecord(record, new Date().toISOString()));
      }
    });
    console.log("Netlify production confirms release " + gitSha + " at " + productionOrigin + ".");
    console.log("Publication used one production deploy allocation (currently 15 Netlify credits).");
  } else {
    const receipt = loadPublishedRecord();
    const environment = { ...baseEnvironment, ...receipt.releaseEnvironment };
    console.log("Checking recorded Netlify rollback for release " + gitSha + ".");
    await rollbackNetlifyRelease({
      unchanged,
      loadReceipt: loadPublishedRecord,
      readProduction: readSite,
      verifyCurrent: async record => {
        await checkBackend(environment);
        await verifyProduction({
          sha: record.gitSha,
          buildTimestamp: record.releaseEnvironment.QRGUITAR_BUILD_TIMESTAMP,
          deploymentIdentifier: record.deployment.id,
          origin: record.productionOrigin,
          productionOrigins: [record.productionOrigin]
        });
        await verifyProduction({
          sha: record.baseline.gitSha,
          deploymentIdentifier: record.baseline.deployId,
          origin: record.baseline.deployUrl,
          staged: true
        });
      },
      rollback: baseline => restore(baseline.deployId),
      verifyRollback: record =>
        verifyProduction({
          sha: record.baseline.gitSha,
          deploymentIdentifier: record.baseline.deployId,
          origin: record.productionOrigin,
          productionOrigins: [record.productionOrigin]
        }),
      archiveReceipt: () => archiveIfPresent(publishedRecordPath, "rolled-back")
    });
    console.log("Netlify production confirms rollback to " + receipt.baseline.deployId + ".");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Netlify release stopped.");
  process.exitCode = 1;
} finally {
  if (snapshot) cleanupReleaseSnapshot(snapshot);
}
