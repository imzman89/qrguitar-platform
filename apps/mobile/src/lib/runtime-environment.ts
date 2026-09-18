export type NativeRuntimeEnvironment = Readonly<{
  supabaseUrl: string;
  supabaseKey: string;
  apiOrigin: string;
  offlineAcceptance: string;
  offlineAcceptanceEvidence: string;
}>;

const OFFLINE_ACCEPTANCE_MARKER = "android-installed-acceptance-v1";

export function getNativeRuntimeEnvironment(): NativeRuntimeEnvironment {
  return {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
    supabaseKey:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
      "",
    apiOrigin: process.env.EXPO_PUBLIC_API_ORIGIN || "",
    offlineAcceptance:
      process.env.EXPO_PUBLIC_QRGUITAR_OFFLINE_ACCEPTANCE || "",
    offlineAcceptanceEvidence:
      process.env.EXPO_PUBLIC_QRGUITAR_OFFLINE_ACCEPTANCE_EVIDENCE || "",
  };
}

export function isOfflineAcceptanceEnvironment(
  environment: NativeRuntimeEnvironment,
  platform: string,
): boolean {
  return (
    platform === "android" &&
    environment.offlineAcceptance === OFFLINE_ACCEPTANCE_MARKER &&
    environment.offlineAcceptanceEvidence.length > 0
  );
}

export function runtimeFetch(
  environment: NativeRuntimeEnvironment,
  onlineFetch: typeof globalThis.fetch,
  platform: string,
): typeof globalThis.fetch {
  if (!isOfflineAcceptanceEnvironment(environment, platform)) return onlineFetch;
  return () =>
    Promise.reject(
      new TypeError("Network is disabled in this offline acceptance build."),
    );
}
