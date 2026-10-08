import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VERCEL_VERSION = "59.15.1";
const resolverPath = fileURLToPath(import.meta.url);

export function validateVercelEntrypoint(entrypoint) {
  if (typeof entrypoint !== "string" || !path.isAbsolute(entrypoint)) throw new Error("Vercel CLI entrypoint must be an absolute path.");
  const resolved = fs.realpathSync(entrypoint);
  const packageRoot = path.dirname(path.dirname(resolved));
  const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  if (metadata.name !== "vercel" || metadata.version !== VERCEL_VERSION || metadata.bin?.vercel !== "./dist/vc.js" ||
      resolved !== path.join(packageRoot, "dist", "vc.js") || !fs.statSync(resolved).isFile()) {
    throw new Error("Vercel CLI package does not match the pinned release version and entrypoint.");
  }
  return resolved;
}

export function findVercelEntrypoint(searchPath = process.env.PATH || "") {
  for (const directory of searchPath.split(path.delimiter)) {
    if (!directory || path.basename(directory).toLowerCase() !== ".bin") continue;
    try { return validateVercelEntrypoint(path.resolve(directory, "..", "vercel", "dist", "vc.js")); }
    catch { /* npm may put unrelated workspace bins before its package cache. */ }
  }
  throw new Error("The pinned Vercel CLI was not found in npm's package search path.");
}

export function resolveVercelCli(npxCli, run) {
  // npm resolves the pinned package, but never transports deployment/curl arguments
  // through its platform shell (which corrupts multiline and percent arguments).
  const output = run([npxCli, "--yes", "--package", "vercel@" + VERCEL_VERSION, "--", "node", resolverPath]);
  let result;
  try { result = JSON.parse(output); } catch { throw new Error("Vercel CLI resolution did not return valid JSON."); }
  if (!result || result.version !== VERCEL_VERSION || Object.keys(result).sort().join(",") !== "entrypoint,version") {
    throw new Error("Vercel CLI resolution did not identify the pinned release version.");
  }
  return validateVercelEntrypoint(result.entrypoint);
}

if (process.argv[1] && path.resolve(process.argv[1]) === resolverPath) {
  try { process.stdout.write(JSON.stringify({ version: VERCEL_VERSION, entrypoint: findVercelEntrypoint() }) + "\n"); }
  catch (error) { console.error(error instanceof Error ? error.message : "Vercel CLI resolution failed."); process.exitCode = 1; }
}
