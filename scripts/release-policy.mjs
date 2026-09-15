import { RELEASE_VERSION, REQUIRED_DATABASE_CHECKS, isReleaseReady } from "../apps/web/lib/release-readiness.ts";
export { RELEASE_VERSION, REQUIRED_DATABASE_CHECKS };
export const RELEASE_CHECKS = [
  ["run", "build", "--workspace", "@qrguitar/web"],
  ["run", "typecheck", "--workspace", "@qrguitar/web"],
  ["run", "test:launch", "--workspace", "@qrguitar/web"],
  ["run", "test:behavior", "--workspace", "@qrguitar/web"],
  ["audit", "--workspace", "@qrguitar/web", "--audit-level=low", "--include=dev", "--include=optional", "--include=peer"]
];

export async function runLocalReleaseChecks(run) {
  for (const args of RELEASE_CHECKS) await run(args);
}

export async function runReleaseChecks(run, checkBackend) {
  await runLocalReleaseChecks(run);
  return await checkBackend();
}

export function validateReadiness(value) {
  if (!isReleaseReady(value)) {
    const failed = Array.isArray(value?.checks) ? value.checks.filter(check => check?.ok !== true)
      .map(check => /^[a-z0-9_.:-]{1,100}$/i.test(check?.name || "") ? check.name : "invalid_check").join(", ") : "";
    throw new Error("Database is not ready for QRguitar release " + RELEASE_VERSION + (failed ? ": " + failed : ". Apply and verify all release migrations."));
  }
  return value;
}

export async function checkBackendReadiness({ url, serviceKey, fetchImpl = fetch }) {
  let origin;
  try { origin = new URL(url); } catch { throw new Error("Release check requires NEXT_PUBLIC_SUPABASE_URL."); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || !serviceKey) {
    throw new Error("Release check requires the HTTPS Supabase project URL and server-only service key.");
  }
  let response;
  try {
    response = await fetchImpl(new URL("/rest/v1/rpc/qrguitar_release_readiness", origin), {
      method: "POST", headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
      body: "{}", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000)
    });
  } catch { throw new Error("Could not reach the database readiness check. Deployment was not started."); }
  if (!response.ok) throw new Error("Database readiness check is unavailable (HTTP " + response.status + "). Verify management access and apply the release migrations.");
  let value;
  try { value = await response.json(); } catch { throw new Error("Database readiness returned an invalid response."); }
  return validateReadiness(value);
}

export async function verifyDeploymentIdentity({ sha, buildTimestamp, origin = "https://qrguitar.com", staged = false, fetchImpl = fetch }) {
  const response = await fetchImpl(new URL("/api/build-info?release=" + encodeURIComponent(sha), origin), {
    cache: "no-store", signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error("Production identity endpoint returned HTTP " + response.status + ".");
  const identity = await response.json();
  if (identity.gitCommitSha !== sha || (buildTimestamp !== undefined && identity.buildTimestamp !== buildTimestamp) || identity.environment !== "production" || identity.dirtyWorkingTree === true ||
      !(staged ? [new URL(origin).origin] : ["https://qrguitar.com", "https://www.qrguitar.com"]).includes(identity.origin)) {
    throw new Error("Production has not confirmed the expected committed release. Inspect the Vercel deployment before announcing completion.");
  }
  return identity;
}

export async function verifyProduction({ sha, buildTimestamp, origin = "https://qrguitar.com", staged = false, fetchImpl = fetch }) {
  const identity = await verifyDeploymentIdentity({ sha, buildTimestamp, origin, staged, fetchImpl });
  const health = await fetchImpl(new URL("/api/health", identity.origin), { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const healthState = health.ok ? await health.json() : null;
  if (healthState?.status !== "ready" || healthState?.releaseVersion !== RELEASE_VERSION) throw new Error("Production database readiness failed. Inspect the deployed environment and migrations.");
  for (const [pathname, contentType] of [["/", "text/html"], ["/manifest.webmanifest", "application/manifest+json"], ["/sw.js", "javascript"], ["/offline.html", "text/html"]]) {
    const result = await fetchImpl(new URL(pathname, identity.origin), { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!result.ok || !result.headers.get("content-type")?.includes(contentType)) {
      throw new Error("Production smoke check failed for " + pathname + ".");
    }
  }
  return identity;
}

export function assertSameCommit(actual, expected) {
  if (actual !== expected) throw new Error("The reviewed commit changed during release checks. Run the release again from the intended commit.");
}
export function deploymentUrl(stdout) {
  let url;
  try { url = new URL(stdout.trim()); } catch { throw new Error("Vercel did not return a single staged deployment URL."); }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Vercel returned an unexpected deployment URL.");
  }
  return url.origin;
}
export function parseDeploymentJson(stdout) {
  const fail = () => { throw new Error("Vercel did not return a ready production deployment in the expected JSON format."); };
  let payload;
  try { payload = JSON.parse(stdout); } catch { fail(); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail();
  // CLI 59.15.1 emits the deployment directly for --json, or this envelope
  // in agent/noninteractive mode. Neither format contains a project ID;
  // the deploy command separately pins --project to the verified local link.
  const deployment = Object.hasOwn(payload, "deployment")
    ? payload.status === "ok" && !payload.error ? payload.deployment : null
    : payload;
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment) ||
      !/^dpl_[A-Za-z0-9]+$/.test(deployment.id || "") || deployment.readyState !== "READY" ||
      deployment.target !== "production" || deployment.error ||
      deployment.deploymentApiUrl !== "https://api.vercel.com/v13/deployments/" + deployment.id) fail();
  const url = deploymentUrl(deployment.url);
  return { id: deployment.id, url };
}
export function parseCurlProbe(output) {
  const matched = output.match(/\n__QRG_STATUS__:(\d{3})\r?\n__QRG_TYPE__:([^\r\n]*)\r?\n?$/);
  if (!matched) throw new Error("Staged deployment probe returned an invalid response.");
  const status = Number(matched[1]);
  if (status < 200 || status > 599) throw new Error("Staged deployment probe returned an invalid status.");
  return new Response(output.slice(0, matched.index), { status, headers: { "Content-Type": matched[2] } });
}
export async function stageAndPromote({ unchanged, stage, verify, promote }) {
  await unchanged();
  const url = await stage();
  await unchanged();
  await verify(url);
  await unchanged();
  await promote(url);
  return url;
}

export function releaseMode(args) {
  if (args.length === 0) return "normal";
  if (args.length === 1 && args[0] === "--stage-only") return "stage-only";
  if (args.length === 1 && args[0] === "--promote-staged") return "promote-staged";
  throw new Error("Use npm run push:live, or append -- --stage-only or -- --promote-staged.");
}

// This mode deliberately has no database or promotion callback. --skip-domain
// defers custom-domain promotion; Vercel can still move its generated aliases.
export async function stageReleaseForLater({ unchanged, runChecks, stage, verifyIdentity, saveRecord }) {
  await unchanged();
  await runChecks();
  await unchanged();
  const url = deploymentUrl(await stage());
  await unchanged();
  await verifyIdentity(url);
  await unchanged();
  await saveRecord(url);
  return url;
}

export async function promoteStagedRelease({ unchanged, loadRecord, checkBackend, verify, promote, verifyLive }) {
  await unchanged();
  // loadRecord must validate the saved project, full SHA, and completed checks.
  const record = await loadRecord();
  await checkBackend();
  await unchanged();
  await verify(record.deploymentUrl);
  await unchanged();
  await promote(record.deploymentUrl);
  await verifyLive();
  return record.deploymentUrl;
}
