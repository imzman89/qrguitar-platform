const crypto = require("node:crypto");
const { getDefaultConfig } = require("expo/metro-config");
const {
  OFFLINE_ACCEPTANCE_RUNTIME_ENVIRONMENT,
  OFFLINE_ACCEPTANCE_BUILD_GUARD_NAME,
  OFFLINE_ACCEPTANCE_BUNDLE_EVIDENCE_NAME,
  inspectOfflineAcceptanceEnvironment,
} = require("./scripts/offline-acceptance-environment.cjs");

const inspected = inspectOfflineAcceptanceEnvironment(process.env);
if (inspected.fixtureFieldPresent) {
  if (
    !inspected.exactPublicFixture ||
    !inspected.exactBuildGuard ||
    (inspected.bundleEvidence &&
      inspected.bundleEvidence !==
        OFFLINE_ACCEPTANCE_RUNTIME_ENVIRONMENT.bundleEvidence)
  ) {
    throw new Error(
      "Offline acceptance configuration requires the exact guarded Android fixture.",
    );
  }
  process.env[OFFLINE_ACCEPTANCE_BUNDLE_EVIDENCE_NAME] =
    OFFLINE_ACCEPTANCE_RUNTIME_ENVIRONMENT.bundleEvidence;
} else {
  delete process.env[OFFLINE_ACCEPTANCE_BUNDLE_EVIDENCE_NAME];
}

const config = getDefaultConfig(__dirname);
const environmentCacheKey = crypto
  .createHash("sha256")
  .update(
    JSON.stringify({
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
      supabaseKey:
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
        "",
      apiOrigin: process.env.EXPO_PUBLIC_API_ORIGIN || "",
      offlineAcceptance:
        process.env.EXPO_PUBLIC_QRGUITAR_OFFLINE_ACCEPTANCE || "",
      acceptanceBuild:
        process.env[OFFLINE_ACCEPTANCE_BUILD_GUARD_NAME] || "",
      bundleEvidence:
        process.env[OFFLINE_ACCEPTANCE_BUNDLE_EVIDENCE_NAME] || "",
    }),
  )
  .digest("hex");
config.cacheVersion = `${config.cacheVersion}-qrguitar-env-${environmentCacheKey}`;

module.exports = config;
