import { createReleaseSnapshot, cleanupReleaseSnapshot } from "./release-snapshot.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runReleaseChecks, runLocalReleaseChecks, verifyProduction, verifyDeploymentIdentity, assertSameCommit, parseDeploymentJson, parseCurlProbe, stageAndPromote, releaseMode, stageReleaseForLater, promoteStagedRelease } from "./release-policy.mjs";
import { PRODUCTION_PROJECT_ID, STAGE_RECORD_NAME, createStageRecord, validateStageRecord } from "./release-stage-record.mjs";
import { resolveVercelCli } from "./vercel-cli.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function git(...args) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }
function run(executable, args, env, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd || root, env, encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.error || result.status !== 0) throw new Error("Release stopped: " + (options.label || args.slice(0, 4).join(" ")));
  return result.stdout?.trim() || "";
}
function requireCleanTree() {
  if (git("status", "--porcelain")) throw new Error("Refusing to deploy: commit the reviewed working tree first.");
}
let snapshot;
try {
  const mode = releaseMode(process.argv.slice(2));
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("QRguitar releases require Node.js 24.");
  requireCleanTree();
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Run this release through npm run push:live.");
  const projectLink = fs.readFileSync(path.join(root, ".vercel/project.json"), "utf8");
  const projectId = JSON.parse(projectLink).projectId;
  if (projectId !== PRODUCTION_PROJECT_ID) throw new Error("Vercel link does not match the QRguitar production project.");
  const gitSha = git("rev-parse", "HEAD");
  const stageRecordPath = path.join(root, ".vercel", STAGE_RECORD_NAME);
  let reviewedStageRecordText;
  const loadRecord = () => {
    let record, recordText;
    try { recordText = fs.readFileSync(stageRecordPath, "utf8"); record = JSON.parse(recordText); }
    catch { throw new Error("No valid staged release record. Run npm run push:live -- --stage-only first."); }
    if (reviewedStageRecordText !== undefined && reviewedStageRecordText !== recordText) throw new Error("Staged release record changed during promotion.");
    reviewedStageRecordText = recordText;
    return validateStageRecord(record, { projectId, gitSha });
  };
  const releaseEnvironment = mode === "promote-staged" ? loadRecord().releaseEnvironment : {
    QRGUITAR_BUILD_ENV: "production", QRGUITAR_GIT_SHA: gitSha,
    QRGUITAR_BUILD_TIMESTAMP: new Date().toISOString(), QRGUITAR_BUILD_DIRTY: "false",
    NEXT_PUBLIC_SITE_URL: "https://qrguitar.com"
  };
  const env = { ...process.env, ...releaseEnvironment };
  const unchanged = () => {
    requireCleanTree(); assertSameCommit(git("rev-parse", "HEAD"), gitSha);
    if (fs.readFileSync(path.join(root, ".vercel/project.json"), "utf8") !== projectLink) throw new Error("Vercel project link changed during release.");
    if (mode === "promote-staged") loadRecord();
  };
  const runCheck = args => run(process.execPath, [npmCli, ...args], env);
  const checkBackend = () => run(process.execPath, ["scripts/check-release-readiness.mjs"], env);
  const npxCli = path.join(path.dirname(npmCli), "npx-cli.js");
  const vercelEntrypoint = resolveVercelCli(npxCli, args => run(process.execPath, args, env, { capture: true, label: "Resolve pinned Vercel CLI" }));
  const vercelArgs = Object.entries(releaseEnvironment).flatMap(([key, value]) => ["--build-env", key + "=" + value, "--env", key + "=" + value]);
  const cli = (args, capture = false) => run(process.execPath, [vercelEntrypoint, ...args], env, {
    cwd: snapshot || root, capture, label: "Vercel " + args[0]
  });
  const stage = () => {
    // Upload exactly the reviewed commit, without local secrets or concurrent checkout edits.
    snapshot = createReleaseSnapshot(root, gitSha, projectLink, { includeGitMetadata: true });
    const deployment = parseDeploymentJson(cli(["deploy", "--project", projectId, "--prod", "--skip-domain", "--json", "--yes", ...vercelArgs], true));
    console.log("Staged production deployment " + deployment.id + " at " + deployment.url + ".");
    return deployment.url;
  };
  const verify = async (url, identityOnly = false) => {
    console.log("Checking staged production deployment " + url + ".");
    const probe = async input => {
      const target = new URL(String(input));
      if (target.origin !== new URL(url).origin) throw new Error("Staged probe attempted a different deployment.");
      const output = cli(["curl", target.pathname + target.search, "--deployment", url, "--",
        "--silent", "--show-error", "--fail", "--max-time", "20",
        "--header", "Cache-Control: no-cache",
        "--write-out", "\n__QRG_STATUS__:%{http_code}\n__QRG_TYPE__:%{content_type}\n"
      ], true);
      return parseCurlProbe(output);
    };
    const verifier = identityOnly ? verifyDeploymentIdentity : verifyProduction;
    await verifier({ sha: gitSha, platformGitCommitSha: gitSha, buildTimestamp: releaseEnvironment.QRGUITAR_BUILD_TIMESTAMP, origin: url, staged: true, fetchImpl: probe });
  };
  const promote = url => cli(["promote", url, "--yes"]);
  const verifyLive = () => verifyProduction({ sha: gitSha, platformGitCommitSha: gitSha, buildTimestamp: releaseEnvironment.QRGUITAR_BUILD_TIMESTAMP });
  console.log("Checking committed QRguitar release " + gitSha + " (" + mode + ").");
  if (mode !== "promote-staged") {
    // A new release attempt must not leave an older deployment eligible for promotion.
    if (fs.existsSync(stageRecordPath)) fs.renameSync(stageRecordPath, stageRecordPath + ".previous-" + Date.now());
  }
  if (mode === "stage-only") {
    let startedAt, completedAt;
    await stageReleaseForLater({
      unchanged,
      runChecks: async () => { startedAt = new Date().toISOString(); await runLocalReleaseChecks(runCheck); completedAt = new Date().toISOString(); },
      stage, verifyIdentity: url => verify(url, true),
      saveRecord: url => {
        const record = createStageRecord({ projectId, gitSha, url, releaseEnvironment, startedAt, completedAt, stagedAt: new Date().toISOString() });
        const temporary = stageRecordPath + ".tmp-" + process.pid;
        fs.writeFileSync(temporary, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
        fs.renameSync(temporary, stageRecordPath);
      }
    });
    console.log("Production candidate staged with custom-domain promotion skipped. Generated Vercel aliases may move; inspect and restore baseline aliases until cutover.");
    console.log("Database readiness and full staged probes are deferred until --promote-staged.");
    console.log("Review the staged release record: " + stageRecordPath);
  } else if (mode === "promote-staged") {
    await promoteStagedRelease({ unchanged, loadRecord, checkBackend, verify, promote, verifyLive });
    fs.renameSync(stageRecordPath, stageRecordPath + ".promoted-" + Date.now());
    console.log("Production confirms release " + gitSha + ". Complete authenticated customer acceptance before declaring launch.");
  } else {
    await runReleaseChecks(runCheck, checkBackend);
    await stageAndPromote({ unchanged, stage, verify, promote });
    await verifyLive();
    console.log("Production confirms release " + gitSha + ". Complete authenticated customer acceptance before declaring launch.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Release stopped.");
  process.exitCode = 1;
} finally {
  if (snapshot) cleanupReleaseSnapshot(snapshot);
}
