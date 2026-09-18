import { RELEASE_CHECKS } from "./release-policy.mjs";

export const NETLIFY_STAGE_RECORD_NAME = "qrguitar-netlify-staged-release.json";
export const NETLIFY_PUBLISHED_RECORD_NAME = "qrguitar-netlify-published-release.json";
export const NETLIFY_PRODUCTION_DEPLOY_CREDITS = 15;
export const NETLIFY_SNAPSHOT_INSTALL_ARGUMENTS = Object.freeze(["ci", "--no-audit", "--no-fund"]);

const timestamp = candidate =>
  typeof candidate === "string" &&
  Number.isFinite(Date.parse(candidate)) &&
  new Date(candidate).toISOString() === candidate;

const sameKeys = (candidate, keys) =>
  candidate &&
  typeof candidate === "object" &&
  !Array.isArray(candidate) &&
  Object.keys(candidate).sort().join(",") === [...keys].sort().join(",");

export function isNetlifySiteId(candidate) {
  return typeof candidate === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(candidate);
}

export function isNetlifyDeployId(candidate) {
  return typeof candidate === "string" &&
    (/^[a-f0-9]{24}$/i.test(candidate) ||
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(candidate));
}

function httpsOrigin(candidate, label) {
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(label + " must be a single HTTPS origin.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(label + " must be a single HTTPS origin.");
  }
  return url.origin;
}

export function netlifyDeployUrl(candidate, deployId) {
  const origin = httpsOrigin(candidate, "Netlify deploy URL");
  const hostname = new URL(origin).hostname;
  if (!isNetlifyDeployId(deployId) || !hostname.endsWith(".netlify.app") || !hostname.startsWith(deployId.toLowerCase() + "--")) {
    throw new Error("Netlify did not return the immutable URL for the expected deploy ID.");
  }
  return origin;
}

export function netlifyProductionOrigin(candidate) {
  return httpsOrigin(candidate, "Netlify production origin");
}

function parseJsonObject(output, label) {
  let value;
  try {
    value = JSON.parse(output);
  } catch {
    throw new Error(label + " did not return valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " did not return a JSON object.");
  }
  return value;
}

export function parseNetlifyDeployJson(output, expectedSiteId) {
  const fail = () => {
    throw new Error("Netlify CLI did not return one ready draft deploy in the expected JSON format.");
  };
  const payload = parseJsonObject(output, "Netlify CLI");
  if (
    !sameKeys(payload, [
      "site_id",
      "site_name",
      "deploy_id",
      "deploy_url",
      "logs",
      "function_logs",
      "edge_function_logs"
    ]) ||
    !isNetlifySiteId(expectedSiteId) ||
    payload.site_id !== expectedSiteId ||
    !isNetlifyDeployId(payload.deploy_id) ||
    typeof payload.site_name !== "string" ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(payload.site_name)
  ) fail();
  let url;
  try {
    url = netlifyDeployUrl(payload.deploy_url, payload.deploy_id);
  } catch {
    fail();
  }
  return { id: payload.deploy_id, url, siteName: payload.site_name };
}

function deployFromApi(candidate, expectedSiteId, label) {
  if (
    !candidate ||
    typeof candidate !== "object" ||
    Array.isArray(candidate) ||
    candidate.site_id !== expectedSiteId ||
    !isNetlifyDeployId(candidate.id) ||
    candidate.state !== "ready"
  ) {
    throw new Error(label + " does not identify a ready deploy for the expected Netlify site.");
  }
  const deployUrl = netlifyDeployUrl(candidate.deploy_ssl_url || candidate.deploy_url, candidate.id);
  const gitSha = /^[a-f0-9]{40}$/i.test(candidate.commit_ref || "") ? candidate.commit_ref.toLowerCase() : null;
  return {
    deployId: candidate.id,
    deployUrl,
    gitSha,
    locked: candidate.locked === true
  };
}

export function parseNetlifySiteJson(output, expectedSiteId, expectedProductionOrigin) {
  const payload = parseJsonObject(output, "Netlify site lookup");
  if (!isNetlifySiteId(expectedSiteId) || payload.id !== expectedSiteId || typeof payload.name !== "string") {
    throw new Error("Netlify site lookup did not return the expected site.");
  }
  const allowedOrigins = new Set();
  for (const candidate of [payload.url, payload.ssl_url]) {
    if (typeof candidate !== "string") continue;
    try {
      allowedOrigins.add(netlifyProductionOrigin(candidate));
    } catch {
      // Ignore malformed optional aliases; the selected production origin still has to validate below.
    }
  }
  for (const hostname of [payload.custom_domain, ...(Array.isArray(payload.domain_aliases) ? payload.domain_aliases : [])]) {
    if (typeof hostname !== "string" || !hostname) continue;
    try {
      allowedOrigins.add(netlifyProductionOrigin("https://" + hostname));
    } catch {
      // Ignore malformed optional aliases.
    }
  }
  const productionOrigin = netlifyProductionOrigin(expectedProductionOrigin);
  if (!allowedOrigins.has(productionOrigin)) {
    throw new Error("Configured Netlify production origin is not assigned to the expected site.");
  }
  const production = payload.published_deploy
    ? deployFromApi(payload.published_deploy, expectedSiteId, "Netlify published deploy")
    : null;
  return { siteId: expectedSiteId, siteName: payload.name, productionOrigin, production };
}

export function parseRestoredDeployJson(output, expectedSiteId, expectedDeployId) {
  const payload = parseJsonObject(output, "Netlify restore API");
  const deploy = deployFromApi(payload, expectedSiteId, "Netlify restore API response");
  if (deploy.deployId !== expectedDeployId) {
    throw new Error("Netlify restore API published a different deploy than requested.");
  }
  return deploy;
}

function validBaseline(candidate) {
  if (!sameKeys(candidate, ["deployId", "deployUrl", "gitSha"])) return false;
  if (candidate.deployId === null || candidate.deployUrl === null) {
    return candidate.deployId === null && candidate.deployUrl === null && candidate.gitSha === null;
  }
  try {
    if (netlifyDeployUrl(candidate.deployUrl, candidate.deployId) !== candidate.deployUrl) return false;
  } catch {
    return false;
  }
  return candidate.gitSha === null || /^[a-f0-9]{40}$/.test(candidate.gitSha);
}

export function validateNetlifyStageRecord(record, { siteId, gitSha, productionOrigin }) {
  const fail = () => {
    throw new Error(
      "Netlify staged release record does not match the reviewed commit, site, baseline, or completed checks. Run the stage command again."
    );
  };
  if (
    !isNetlifySiteId(siteId) ||
    !/^[a-f0-9]{40}$/.test(gitSha || "") ||
    !sameKeys(record, [
      "schemaVersion",
      "provider",
      "siteId",
      "gitSha",
      "productionOrigin",
      "deployment",
      "baseline",
      "releaseEnvironment",
      "checks",
      "stagedAt",
      "publishPolicy"
    ]) ||
    record.schemaVersion !== 1 ||
    record.provider !== "netlify" ||
    record.siteId !== siteId ||
    record.gitSha !== gitSha ||
    record.productionOrigin !== netlifyProductionOrigin(productionOrigin) ||
    !sameKeys(record.deployment, ["id", "url"]) ||
    !isNetlifyDeployId(record.deployment.id)
  ) fail();
  try {
    if (netlifyDeployUrl(record.deployment.url, record.deployment.id) !== record.deployment.url) fail();
  } catch {
    fail();
  }
  if (!validBaseline(record.baseline)) fail();
  const environment = record.releaseEnvironment;
  if (
    !sameKeys(environment, [
      "QRGUITAR_BUILD_ENV",
      "QRGUITAR_GIT_SHA",
      "QRGUITAR_BUILD_TIMESTAMP",
      "QRGUITAR_BUILD_DIRTY",
      "NEXT_PUBLIC_SITE_URL"
    ]) ||
    environment.QRGUITAR_BUILD_ENV !== "production" ||
    environment.QRGUITAR_GIT_SHA !== gitSha ||
    environment.QRGUITAR_BUILD_DIRTY !== "false" ||
    !timestamp(environment.QRGUITAR_BUILD_TIMESTAMP) ||
    netlifyProductionOrigin(environment.NEXT_PUBLIC_SITE_URL) !== environment.NEXT_PUBLIC_SITE_URL
  ) fail();
  const checks = record.checks;
  if (
    !sameKeys(checks, ["status", "commands", "startedAt", "completedAt"]) ||
    checks.status !== "passed" ||
    JSON.stringify(checks.commands) !== JSON.stringify(RELEASE_CHECKS) ||
    !timestamp(checks.startedAt) ||
    !timestamp(checks.completedAt) ||
    !timestamp(record.stagedAt) ||
    Date.parse(environment.QRGUITAR_BUILD_TIMESTAMP) > Date.parse(checks.startedAt) ||
    Date.parse(checks.startedAt) > Date.parse(checks.completedAt) ||
    Date.parse(checks.completedAt) > Date.parse(record.stagedAt)
  ) fail();
  if (
    !sameKeys(record.publishPolicy, ["productionDeployCredits", "requiresExplicitAcknowledgement"]) ||
    record.publishPolicy.productionDeployCredits !== NETLIFY_PRODUCTION_DEPLOY_CREDITS ||
    record.publishPolicy.requiresExplicitAcknowledgement !== true
  ) fail();
  return record;
}

export function createNetlifyStageRecord({
  siteId,
  gitSha,
  productionOrigin,
  deployment,
  baseline,
  releaseEnvironment,
  startedAt,
  completedAt,
  stagedAt
}) {
  return validateNetlifyStageRecord(
    {
      schemaVersion: 1,
      provider: "netlify",
      siteId,
      gitSha,
      productionOrigin,
      deployment,
      baseline,
      releaseEnvironment,
      checks: { status: "passed", commands: RELEASE_CHECKS, startedAt, completedAt },
      stagedAt,
      publishPolicy: {
        productionDeployCredits: NETLIFY_PRODUCTION_DEPLOY_CREDITS,
        requiresExplicitAcknowledgement: true
      }
    },
    { siteId, gitSha, productionOrigin }
  );
}

export function createNetlifyPublishedRecord(stageRecord, publishedAt) {
  if (!timestamp(publishedAt) || Date.parse(publishedAt) < Date.parse(stageRecord.stagedAt)) {
    throw new Error("Netlify publish receipt requires a valid publication timestamp.");
  }
  return { ...stageRecord, publishedAt };
}

export function validateNetlifyPublishedRecord(record, expected) {
  if (!record || typeof record !== "object" || Array.isArray(record) || !timestamp(record.publishedAt)) {
    throw new Error("Netlify publish receipt is invalid.");
  }
  const { publishedAt, ...stageRecord } = record;
  validateNetlifyStageRecord(stageRecord, expected);
  if (Date.parse(publishedAt) < Date.parse(stageRecord.stagedAt)) {
    throw new Error("Netlify publish receipt is invalid.");
  }
  return record;
}

function sameProduction(actual, deployId) {
  const actualId = actual?.production?.deployId || null;
  if (actualId !== deployId || (actual?.production && actual.production.locked !== true)) {
    throw new Error("Netlify production changed or auto publishing is not locked. No release mutation was attempted.");
  }
}

export async function stageNetlifyRelease({
  unchanged,
  runChecks,
  readProduction,
  stage,
  verifyIdentity,
  saveRecord
}) {
  await unchanged();
  const baselineSite = await readProduction();
  if (baselineSite.production && baselineSite.production.locked !== true) {
    throw new Error("Lock Netlify auto publishing before staging a QRguitar release.");
  }
  await runChecks();
  await unchanged();
  const deployment = await stage();
  await unchanged();
  await verifyIdentity(deployment);
  await unchanged();
  const currentSite = await readProduction();
  sameProduction(currentSite, baselineSite.production?.deployId || null);
  await saveRecord(deployment, baselineSite.production);
  return deployment;
}

export async function publishNetlifyRelease({
  unchanged,
  loadRecord,
  checkBackend,
  readProduction,
  verify,
  publish,
  verifyLive,
  saveReceipt
}) {
  await unchanged();
  const record = await loadRecord();
  await checkBackend();
  await unchanged();
  sameProduction(await readProduction(), record.baseline.deployId);
  await verify(record.deployment, record);
  await unchanged();
  sameProduction(await readProduction(), record.baseline.deployId);
  await publish(record.deployment, record);
  const published = await readProduction();
  sameProduction(published, record.deployment.id);
  await verifyLive(record);
  await saveReceipt(record);
  return record.deployment;
}

export async function rollbackNetlifyRelease({
  unchanged,
  loadReceipt,
  readProduction,
  verifyCurrent,
  rollback,
  verifyRollback,
  archiveReceipt
}) {
  await unchanged();
  const receipt = await loadReceipt();
  if (!receipt.baseline.deployId) throw new Error("The published release has no recorded rollback target.");
  sameProduction(await readProduction(), receipt.deployment.id);
  await verifyCurrent(receipt);
  await unchanged();
  sameProduction(await readProduction(), receipt.deployment.id);
  await rollback(receipt.baseline, receipt);
  sameProduction(await readProduction(), receipt.baseline.deployId);
  await verifyRollback(receipt);
  await archiveReceipt(receipt);
  return receipt.baseline;
}

export function netlifyReleaseMode(argumentsList) {
  if (argumentsList.length === 1 && argumentsList[0] === "stage") return "stage";
  if (
    argumentsList.length === 2 &&
    argumentsList[0] === "publish" &&
    argumentsList[1] === "--acknowledge-production-credits=15"
  ) return "publish";
  if (
    argumentsList.length === 2 &&
    argumentsList[0] === "rollback" &&
    argumentsList[1] === "--acknowledge-database-compatibility"
  ) return "rollback";
  throw new Error(
    "Use release:netlify with: stage; publish --acknowledge-production-credits=15; or rollback --acknowledge-database-compatibility."
  );
}

export function netlifyDraftDeployArguments(siteId, gitSha) {
  if (!isNetlifySiteId(siteId) || !/^[a-f0-9]{40}$/.test(gitSha || "")) {
    throw new Error("Netlify draft deployment requires an exact site UUID and full commit SHA.");
  }
  return [
    "deploy",
    "--site",
    siteId,
    "--filter",
    "@qrguitar/web",
    "--context",
    "production",
    "--json",
    "--timeout",
    "600",
    "--message",
    "QRguitar " + gitSha
  ];
}
