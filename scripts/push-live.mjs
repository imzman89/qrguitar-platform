import { createReleaseSnapshot, removeReleaseSnapshot } from "./release-snapshot.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runReleaseChecks, verifyProduction, assertSameCommit, deploymentUrl, parseCurlProbe, stageAndPromote } from "./release-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERCEL_CLI = "vercel@59.15.1";
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
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("QRguitar releases require Node.js 24.");
  requireCleanTree();
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Run this release through npm run push:live.");
  const projectLink = fs.readFileSync(path.join(root, ".vercel/project.json"), "utf8");
  if (JSON.parse(projectLink).projectId !== "prj_oB8lMZZWaMMl8bljF4JH6FFfJ73f") throw new Error("Vercel link does not match the QRguitar production project.");
  const gitSha = git("rev-parse", "HEAD");
  const releaseEnvironment = {
    QRGUITAR_BUILD_ENV: "production", QRGUITAR_GIT_SHA: gitSha,
    QRGUITAR_BUILD_TIMESTAMP: new Date().toISOString(), QRGUITAR_BUILD_DIRTY: "false",
    NEXT_PUBLIC_SITE_URL: "https://qrguitar.com"
  };
  const env = { ...process.env, ...releaseEnvironment };
  const unchanged = () => { requireCleanTree(); assertSameCommit(git("rev-parse", "HEAD"), gitSha); };
  console.log("Checking committed QRguitar release " + gitSha + ".");
  await runReleaseChecks(
    args => run(process.execPath, [npmCli, ...args], env),
    () => run(process.execPath, ["scripts/check-release-readiness.mjs"], env)
  );
  unchanged();
  // Upload exactly the reviewed commit, without untracked files, local .env files, or concurrent checkout edits.
  snapshot = createReleaseSnapshot(root, gitSha, projectLink);
  const npxCli = path.join(path.dirname(npmCli), "npx-cli.js");
  const vercelArgs = Object.entries(releaseEnvironment).flatMap(([key, value]) => ["--build-env", key + "=" + value, "--env", key + "=" + value]);
  const cli = (args, capture = false) => run(process.execPath, [npxCli, "--yes", VERCEL_CLI, ...args], env, {
    cwd: snapshot, capture, label: "Vercel " + args[0]
  });
  await stageAndPromote({
    unchanged,
    stage: () => deploymentUrl(cli(["deploy", "--prod", "--skip-domain", "--yes", ...vercelArgs], true)),
    verify: async url => {
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
      await verifyProduction({ sha: gitSha, origin: url, staged: true, fetchImpl: probe });
    },
    promote: url => cli(["promote", url, "--yes"])
  });
  await verifyProduction({ sha: gitSha });
  console.log("Production confirms release " + gitSha + ". Complete authenticated customer acceptance before declaring launch.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Release stopped.");
  process.exitCode = 1;
} finally {
  if (snapshot) removeReleaseSnapshot(snapshot);
}
