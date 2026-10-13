type PublicReadFailureCategory =
  | "BACKEND_URL_MISSING"
  | "BACKEND_KEY_MISSING"
  | "INVALID_URL"
  | "HTTPS_REQUIRED"
  | "LOCAL_SNAPSHOT_REJECTED"
  | "BACKEND_SCHEMA_MISSING"
  | "BACKEND_ACCESS_DENIED"
  | "TRANSPORT_TIMEOUT"
  | "TRANSPORT_CONNECTION_FAILED"
  | "TLS_FAILED"
  | "UNKNOWN";

function ownString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  try {
    const property = Object.getOwnPropertyDescriptor(value, key);
    return property && "value" in property && typeof property.value === "string"
      ? property.value
      : undefined;
  } catch {
    return undefined;
  }
}

// Emit fixed categories only: never error messages, response bodies, URLs, keys or record data.
export function publicReadFailureCategory(error: unknown): PublicReadFailureCategory {
  const message = ownString(error, "message");
  switch (message) {
    case "Supabase URL is not configured.": return "BACKEND_URL_MISSING";
    case "Supabase key is not configured.": return "BACKEND_KEY_MISSING";
    case "Supabase requests require HTTPS outside the local review stack.": return "HTTPS_REQUIRED";
    case "Public review snapshot requires the isolated local review runtime.": return "LOCAL_SNAPSHOT_REJECTED";
    case "Supabase request timed out.": return "TRANSPORT_TIMEOUT";
  }

  const code = ownString(error, "code");
  if (code === "ERR_INVALID_URL") return "INVALID_URL";
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return "TRANSPORT_TIMEOUT";
  if (["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"].includes(code || "")) {
    return "TRANSPORT_CONNECTION_FAILED";
  }
  if (["CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(code || "")) {
    return "TLS_FAILED";
  }

  if (message && message.length <= 65536) {
    try {
      const backendCode = ownString(JSON.parse(message), "code");
      if (["42703", "42P01", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(backendCode || "")) {
        return "BACKEND_SCHEMA_MISSING";
      }
      if (["42501", "28000", "28P01", "PGRST301", "PGRST302", "PGRST303"].includes(backendCode || "")) {
        return "BACKEND_ACCESS_DENIED";
      }
    } catch {
      // Unknown or non-JSON errors remain opaque.
    }
  }
  return "UNKNOWN";
}

export function reportPublicReadFailure(error: unknown): void {
  try {
    console.error("[qrguitar:instrument-read-failed]", publicReadFailureCategory(error));
  } catch {
    // Observability must not replace the existing customer response.
  }
}
