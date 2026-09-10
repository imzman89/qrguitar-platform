import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { checkBackendReadiness } from "./release-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(path.join(root, "apps/web"), false, { info() {}, error() {} });

try {
  const result = await checkBackendReadiness({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  });
  console.log("Database ready for QRguitar " + result.releaseVersion + ": " + result.checks.length + " checks passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database readiness check failed.");
  process.exitCode = 1;
}
