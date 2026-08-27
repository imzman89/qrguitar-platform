import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function run(executable, args, env) {
  const result = spawnSync(executable, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

const gitSha = git("rev-parse", "HEAD");
const dirtyFiles = git("status", "--porcelain");

if (dirtyFiles) {
  console.error("Refusing to deploy: commit the reviewed working tree first.");
  process.exit(1);
}

const buildTimestamp = new Date().toISOString();
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  console.error("Run this release through npm run push:live.");
  process.exit(1);
}

const npxCli = path.join(path.dirname(npmCli), "npx-cli.js");
const releaseEnvironment = {
  QRGUITAR_BUILD_ENV: "production",
  QRGUITAR_GIT_SHA: gitSha,
  QRGUITAR_BUILD_TIMESTAMP: buildTimestamp,
  QRGUITAR_BUILD_DIRTY: "false"
};
const env = { ...process.env, ...releaseEnvironment };
const vercelEnvironmentArgs = Object.entries(releaseEnvironment).flatMap(([key, value]) => [
  "--build-env",
  `${key}=${value}`,
  "--env",
  `${key}=${value}`
]);

console.log(`Deploying committed QRguitar release ${gitSha}.`);
run(process.execPath, [npmCli, "run", "build", "--workspace", "@qrguitar/web"], env);
run(process.execPath, [npxCli, "--yes", "vercel@latest", "deploy", "--prod", "--yes", ...vercelEnvironmentArgs], env);
