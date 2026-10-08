export interface BuildIdentity {
  environment: string;
  gitCommitSha: string;
  buildTimestamp: string | null;
  dirtyWorkingTree: boolean;
  deploymentIdentifier: string | null;
}

export interface BuildIdentityDefaults {
  environment?: string;
  gitCommitSha?: string;
  buildTimestamp?: string | null;
  dirtyWorkingTree?: boolean;
  deploymentIdentifier?: string | null;
}

export function resolveBuildIdentity(
  environment?: NodeJS.ProcessEnv,
  defaults?: BuildIdentityDefaults
): BuildIdentity;
