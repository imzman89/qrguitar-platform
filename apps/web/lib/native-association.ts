/**
 * Public website/app association payloads. These pure builders never discover
 * credentials, read environment variables, or substitute signing identities.
 * Syntax validation is not proof that a certificate or Team ID belongs to us.
 */
export const NATIVE_APP_IDENTIFIER = "com.qrguitar.app";

export type AppleAppSiteAssociation = {
  applinks: {
    details: Array<{
      appIDs: string[];
      components: Array<{ "/": string }>;
    }>;
  };
};

export type AndroidAssetLinks = Array<{
  relation: ["delegate_permission/common.handle_all_urls"];
  target: {
    namespace: "android_app";
    package_name: typeof NATIVE_APP_IDENTIFIER;
    sha256_cert_fingerprints: string[];
  };
  relation_extensions: {
    "delegate_permission/common.handle_all_urls": {
      dynamic_app_link_components: Array<{ "/": string; exclude?: true }>;
    };
  };
}>;

/** The new app's signed application-identifier must match this Team ID + bundle. */
export function buildAppleAppSiteAssociation(
  teamId: unknown,
): AppleAppSiteAssociation | null {
  if (typeof teamId !== "string" || !/^[A-Z0-9]{10}$/.test(teamId))
    return null;
  return {
    applinks: {
      details: [
        {
          appIDs: [teamId + "." + NATIVE_APP_IDENTIFIER],
          components: [{ "/": "/i/*" }],
        },
      ],
    },
  };
}

/**
 * Accept explicit colon-delimited SHA-256 fingerprints, either a comma-separated
 * environment value or an array. One malformed entry disables the entire payload.
 * Multiple real release certificates support signing-key rotation.
 */
export function buildAndroidAssetLinks(
  fingerprints: unknown,
): AndroidAssetLinks | null {
  let candidates: unknown[];
  if (typeof fingerprints === "string") {
    if (fingerprints.length > 4096) return null;
    candidates = fingerprints.split(",");
  } else if (Array.isArray(fingerprints)) {
    candidates = fingerprints;
  } else {
    return null;
  }
  if (!candidates.length || candidates.length > 16) return null;
  const normalized: string[] = [];
  for (const value of candidates) {
    if (typeof value !== "string") return null;
    const fingerprint = value.trim().toUpperCase();
    if (!/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fingerprint))
      return null;
    normalized.push(fingerprint);
  }
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: NATIVE_APP_IDENTIFIER,
        sha256_cert_fingerprints: [...new Set(normalized)].sort(),
      },
      relation_extensions: {
        "delegate_permission/common.handle_all_urls": {
          dynamic_app_link_components: [
            { "/": "/i/*" },
            { "/": "*", exclude: true },
          ],
        },
      },
    },
  ];
}
