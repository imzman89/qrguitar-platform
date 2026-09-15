import { RELEASE_CHECKS, deploymentUrl } from "./release-policy.mjs";

export const PRODUCTION_PROJECT_ID = "prj_oB8lMZZWaMMl8bljF4JH6FFfJ73f";
export const STAGE_RECORD_NAME = "qrguitar-staged-release.json";

const timestamp = value => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const sameKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === [...keys].sort().join(",");

export function validateStageRecord(record, { projectId, gitSha }) {
  const fail = () => { throw new Error("Staged release record does not match the reviewed commit, project, or completed checks. Run --stage-only again."); };
  if (projectId !== PRODUCTION_PROJECT_ID || !/^[a-f0-9]{40}$/.test(gitSha || "") ||
      !sameKeys(record, ["schemaVersion", "projectId", "gitSha", "deploymentUrl", "releaseEnvironment", "checks", "stagedAt", "domainAssignment", "databaseReadiness"]) ||
      record.schemaVersion !== 1 || record.projectId !== projectId || record.gitSha !== gitSha ||
      record.domainAssignment !== "custom-domains-skipped" || record.databaseReadiness !== "required-before-promotion") fail();
  try { if (deploymentUrl(record.deploymentUrl) !== record.deploymentUrl) fail(); } catch { fail(); }
  const env = record.releaseEnvironment;
  if (!sameKeys(env, ["QRGUITAR_BUILD_ENV", "QRGUITAR_GIT_SHA", "QRGUITAR_BUILD_TIMESTAMP", "QRGUITAR_BUILD_DIRTY", "NEXT_PUBLIC_SITE_URL"]) ||
      env.QRGUITAR_BUILD_ENV !== "production" || env.QRGUITAR_GIT_SHA !== gitSha || env.QRGUITAR_BUILD_DIRTY !== "false" ||
      env.NEXT_PUBLIC_SITE_URL !== "https://qrguitar.com" || !timestamp(env.QRGUITAR_BUILD_TIMESTAMP)) fail();
  const checks = record.checks;
  if (!sameKeys(checks, ["status", "commands", "startedAt", "completedAt"]) || checks.status !== "passed" ||
      JSON.stringify(checks.commands) !== JSON.stringify(RELEASE_CHECKS) ||
      !timestamp(checks.startedAt) || !timestamp(checks.completedAt) || !timestamp(record.stagedAt) ||
      Date.parse(env.QRGUITAR_BUILD_TIMESTAMP) > Date.parse(checks.startedAt) ||
      Date.parse(checks.startedAt) > Date.parse(checks.completedAt) || Date.parse(checks.completedAt) > Date.parse(record.stagedAt)) fail();
  return record;
}

export function createStageRecord({ projectId, gitSha, url, releaseEnvironment, startedAt, completedAt, stagedAt }) {
  return validateStageRecord({
    schemaVersion: 1, projectId, gitSha, deploymentUrl: url, releaseEnvironment,
    checks: { status: "passed", commands: RELEASE_CHECKS, startedAt, completedAt },
    stagedAt, domainAssignment: "custom-domains-skipped", databaseReadiness: "required-before-promotion"
  }, { projectId, gitSha });
}
