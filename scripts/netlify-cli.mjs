import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const NETLIFY_CLI_VERSION = "27.8.0";
const resolverPath = fileURLToPath(import.meta.url);

export function validateNetlifyEntrypoint(entrypoint) {
  if (typeof entrypoint !== "string" || !path.isAbsolute(entrypoint)) {
    throw new Error("Netlify CLI entrypoint must be an absolute path.");
  }
  const resolved = fs.realpathSync(entrypoint);
  const packageRoot = path.dirname(path.dirname(resolved));
  const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  if (
    metadata.name !== "netlify-cli" ||
    metadata.version !== NETLIFY_CLI_VERSION ||
    metadata.bin?.netlify !== "./bin/run.js" ||
    resolved !== path.join(packageRoot, "bin", "run.js") ||
    !fs.statSync(resolved).isFile()
  ) {
    throw new Error("Netlify CLI package does not match the pinned release version and entrypoint.");
  }
  return resolved;
}

export function findNetlifyEntrypoint(searchPath = process.env.PATH || "") {
  for (const directory of searchPath.split(path.delimiter)) {
    if (!directory || path.basename(directory).toLowerCase() !== ".bin") continue;
    try {
      return validateNetlifyEntrypoint(path.resolve(directory, "..", "netlify-cli", "bin", "run.js"));
    } catch {
      // npm can place unrelated workspace bins ahead of the requested package cache.
    }
  }
  throw new Error("The pinned Netlify CLI was not found in npm's package search path.");
}

export function resolveNetlifyCli(npxCli, run) {
  const output = run([
    npxCli,
    "--yes",
    "--package",
    "netlify-cli@" + NETLIFY_CLI_VERSION,
    "--",
    "node",
    resolverPath
  ]);
  let result;
  try {
    result = JSON.parse(output);
  } catch {
    throw new Error("Netlify CLI resolution did not return valid JSON.");
  }
  if (
    !result ||
    result.version !== NETLIFY_CLI_VERSION ||
    Object.keys(result).sort().join(",") !== "entrypoint,version"
  ) {
    throw new Error("Netlify CLI resolution did not identify the pinned release version.");
  }
  return validateNetlifyEntrypoint(result.entrypoint);
}

if (process.argv[1] && path.resolve(process.argv[1]) === resolverPath) {
  try {
    process.stdout.write(
      JSON.stringify({ version: NETLIFY_CLI_VERSION, entrypoint: findNetlifyEntrypoint() }) + "\n"
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Netlify CLI resolution failed.");
    process.exitCode = 1;
  }
}
