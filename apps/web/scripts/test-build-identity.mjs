import assert from "node:assert/strict";
import { test } from "node:test";
import { GET as buildInfo } from "../app/api/build-info/route.ts";
import { resolveBuildIdentity } from "../lib/build-identity.mjs";
import { verifyDeploymentIdentity } from "../../../scripts/release-policy.mjs";

const identityKeys = [
  "QRGUITAR_BUILD_ENV",
  "QRGUITAR_GIT_SHA",
  "QRGUITAR_BUILD_TIMESTAMP",
  "QRGUITAR_BUILD_DIRTY",
  "QRGUITAR_DEPLOYMENT_ID",
  "VERCEL",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_DEPLOYMENT_ID",
  "VERCEL_URL",
  "NETLIFY",
  "CONTEXT",
  "COMMIT_REF",
  "DEPLOY_ID",
  "DEPLOY_URL"
];

async function withEnvironment(values, run) {
  const before = new Map(identityKeys.map(key => [key, process.env[key]]));
  try {
    for (const key of identityKeys) delete process.env[key];
    for (const [key, value] of Object.entries(values)) process.env[key] = value;
    return await run();
  } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("explicit QRguitar identity wins over provider metadata", () => {
  const identity = resolveBuildIdentity({
    QRGUITAR_BUILD_ENV: "reviewed-production",
    QRGUITAR_GIT_SHA: "a".repeat(40),
    QRGUITAR_BUILD_TIMESTAMP: "2026-09-18T10:00:00.000Z",
    QRGUITAR_BUILD_DIRTY: "true",
    QRGUITAR_DEPLOYMENT_ID: "reviewed-deploy",
    VERCEL: "1",
    VERCEL_GIT_COMMIT_SHA: "b".repeat(40),
    NETLIFY: "true",
    CONTEXT: "production",
    COMMIT_REF: "c".repeat(40),
    DEPLOY_ID: "d".repeat(24)
  });
  assert.deepEqual(identity, {
    environment: "reviewed-production",
    gitCommitSha: "a".repeat(40),
    buildTimestamp: "2026-09-18T10:00:00.000Z",
    dirtyWorkingTree: true,
    deploymentIdentifier: "reviewed-deploy"
  });
});

test("Vercel identity fallback remains unchanged", () => {
  const identity = resolveBuildIdentity({
    VERCEL: "1",
    VERCEL_GIT_COMMIT_SHA: "b".repeat(40),
    VERCEL_DEPLOYMENT_ID: "dpl_existing"
  });
  assert.equal(identity.environment, "production");
  assert.equal(identity.gitCommitSha, "b".repeat(40));
  assert.equal(identity.deploymentIdentifier, "dpl_existing");
});

test("active Netlify identity ignores stale Vercel metadata", () => {
  const identity = resolveBuildIdentity({
    NETLIFY: "true",
    CONTEXT: "deploy-preview",
    COMMIT_REF: "c".repeat(40),
    DEPLOY_ID: "d".repeat(24),
    VERCEL: "1",
    VERCEL_GIT_COMMIT_SHA: "b".repeat(40),
    VERCEL_DEPLOYMENT_ID: "dpl_stale"
  });
  assert.equal(identity.environment, "deploy-preview");
  assert.equal(identity.gitCommitSha, "c".repeat(40));
  assert.equal(identity.deploymentIdentifier, "d".repeat(24));
});

for (const context of ["production", "deploy-preview", "branch-deploy", "dev"]) {
  test("Netlify " + context + " context maps into QRguitar identity", () => {
    const identity = resolveBuildIdentity({
      NETLIFY: "true",
      CONTEXT: context,
      COMMIT_REF: "c".repeat(40),
      DEPLOY_ID: "d".repeat(24)
    });
    assert.equal(identity.environment, context);
    assert.equal(identity.gitCommitSha, "c".repeat(40));
    assert.equal(identity.deploymentIdentifier, "d".repeat(24));
  });
}

test("Netlify values are ignored outside the Netlify build environment", () => {
  const identity = resolveBuildIdentity({
    CONTEXT: "production",
    COMMIT_REF: "c".repeat(40),
    DEPLOY_ID: "d".repeat(24)
  });
  assert.equal(identity.environment, "local");
  assert.equal(identity.gitCommitSha, "unknown");
  assert.equal(identity.deploymentIdentifier, null);
});

test("build-info reports Netlify commit, context, and exact deploy ID", async () => {
  await withEnvironment(
    {
      NETLIFY: "true",
      CONTEXT: "production",
      COMMIT_REF: "e".repeat(40),
      DEPLOY_ID: "f".repeat(24),
      QRGUITAR_BUILD_TIMESTAMP: "2026-09-18T11:00:00.000Z",
      QRGUITAR_BUILD_DIRTY: "false"
    },
    async () => {
      const response = await buildInfo(
        new Request("https://internal.invalid/api/build-info", {
          headers: { "x-forwarded-host": "candidate.netlify.app", "x-forwarded-proto": "https" }
        })
      );
      assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate, max-age=0");
      assert.deepEqual(await response.json(), {
        environment: "production",
        gitCommitSha: "e".repeat(40),
        buildTimestamp: "2026-09-18T11:00:00.000Z",
        dirtyWorkingTree: false,
        deploymentIdentifier: "f".repeat(24),
        origin: "https://candidate.netlify.app",
        originClassification: "production"
      });
    }
  );
});

test("release identity can bind verification to the Netlify deploy ID", async () => {
  const origin = "https://" + "f".repeat(24) + "--qrguitar.netlify.app";
  const response = () =>
    Response.json({
      environment: "production",
      gitCommitSha: "e".repeat(40),
      buildTimestamp: "2026-09-18T11:00:00.000Z",
      dirtyWorkingTree: false,
      deploymentIdentifier: "f".repeat(24),
      origin
    });
  await verifyDeploymentIdentity({
    sha: "e".repeat(40),
    buildTimestamp: "2026-09-18T11:00:00.000Z",
    deploymentIdentifier: "f".repeat(24),
    origin,
    staged: true,
    fetchImpl: response
  });
  await assert.rejects(
    verifyDeploymentIdentity({
      sha: "e".repeat(40),
      buildTimestamp: "2026-09-18T11:00:00.000Z",
      deploymentIdentifier: "0".repeat(24),
      origin,
      staged: true,
      fetchImpl: response
    })
  );
});
