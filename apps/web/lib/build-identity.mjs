const NETLIFY_CONTEXTS = new Set(["production", "deploy-preview", "branch-deploy", "dev"]);

function value(candidate) {
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

function netlifyContext(environment) {
  const context = value(environment.CONTEXT);
  return environment.NETLIFY === "true" && context && NETLIFY_CONTEXTS.has(context) ? context : undefined;
}

export function resolveBuildIdentity(environment = process.env, defaults = {}) {
  const onNetlify = environment.NETLIFY === "true";
  const providerEnvironment = onNetlify
    ? netlifyContext(environment)
    : environment.VERCEL
      ? "production"
      : undefined;
  const providerGitSha = onNetlify
    ? value(environment.COMMIT_REF)
    : value(environment.VERCEL_GIT_COMMIT_SHA);
  const providerDeploymentIdentifier = onNetlify
    ? value(environment.DEPLOY_ID) || value(environment.DEPLOY_URL)
    : value(environment.VERCEL_DEPLOYMENT_ID) || value(environment.VERCEL_URL);
  const deploymentIdentifier =
    value(environment.QRGUITAR_DEPLOYMENT_ID) ||
    providerDeploymentIdentifier ||
    defaults.deploymentIdentifier ||
    null;

  return {
    environment:
      value(environment.QRGUITAR_BUILD_ENV) ||
      providerEnvironment ||
      defaults.environment ||
      "local",
    gitCommitSha:
      value(environment.QRGUITAR_GIT_SHA) ||
      providerGitSha ||
      defaults.gitCommitSha ||
      "unknown",
    buildTimestamp: value(environment.QRGUITAR_BUILD_TIMESTAMP) || defaults.buildTimestamp || null,
    dirtyWorkingTree:
      value(environment.QRGUITAR_BUILD_DIRTY) === "true" ||
      (environment.QRGUITAR_BUILD_DIRTY === undefined && defaults.dirtyWorkingTree === true),
    deploymentIdentifier
  };
}
