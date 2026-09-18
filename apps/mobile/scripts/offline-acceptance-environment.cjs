const runtimeEnvironment = Object.freeze({
  ...require("../offline-acceptance-environment.json"),
});

const publicEnvironment = Object.freeze({
  EXPO_PUBLIC_SUPABASE_URL: runtimeEnvironment.supabaseUrl,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: runtimeEnvironment.supabaseKey,
  EXPO_PUBLIC_API_ORIGIN: runtimeEnvironment.apiOrigin,
  EXPO_PUBLIC_QRGUITAR_OFFLINE_ACCEPTANCE:
    runtimeEnvironment.offlineAcceptance,
});

const buildGuardName = "QRGUITAR_OFFLINE_ACCEPTANCE_BUILD";
const bundleEvidenceName =
  "EXPO_PUBLIC_QRGUITAR_OFFLINE_ACCEPTANCE_EVIDENCE";

function inspectOfflineAcceptanceEnvironment(env) {
  const offlineMarker = env.EXPO_PUBLIC_QRGUITAR_OFFLINE_ACCEPTANCE || "";
  const buildGuard = env[buildGuardName] || "";
  const bundleEvidence = env[bundleEvidenceName] || "";
  const fixtureFieldPresent = Boolean(
    offlineMarker ||
      buildGuard ||
      bundleEvidence ||
      env.EXPO_PUBLIC_SUPABASE_URL ===
        publicEnvironment.EXPO_PUBLIC_SUPABASE_URL ||
      env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ===
        publicEnvironment.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const exactPublicFixture = Object.entries(publicEnvironment).every(
    ([name, value]) => env[name] === value,
  );
  return {
    fixtureFieldPresent,
    exactPublicFixture,
    exactBuildGuard: buildGuard === runtimeEnvironment.buildGuard,
    bundleEvidence,
  };
}

module.exports = {
  OFFLINE_ACCEPTANCE_RUNTIME_ENVIRONMENT: runtimeEnvironment,
  OFFLINE_ACCEPTANCE_ENVIRONMENT: publicEnvironment,
  OFFLINE_ACCEPTANCE_BUILD_GUARD_NAME: buildGuardName,
  OFFLINE_ACCEPTANCE_BUNDLE_EVIDENCE_NAME: bundleEvidenceName,
  inspectOfflineAcceptanceEnvironment,
};
