import { request as httpsRequest } from "node:https";
import { request as loopbackHttpRequest } from "node:http";
import { getSupabaseEnvStatus } from "./supabase-server";

type SupabaseHttpOptions = {
  body?: unknown;
  method?: "GET" | "POST";
  serviceRole?: boolean;
  timeoutMs?: number;
};

function baseUrl() {
  const status = getSupabaseEnvStatus();
  if (!status.supabaseUrl) {
    throw new Error("Supabase URL is not configured.");
  }

  return status.supabaseUrl.replace(/\/$/, "");
}

function authHeaders(serviceRole = false, hasBody = false) {
  const key = serviceRole ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("Supabase key is not configured.");
  }

  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(hasBody ? { "Content-Type": "application/json" } : {})
  };
}

export function supabaseHttpsJson<T>(path: string, options: SupabaseHttpOptions = {}) {
  const bodyText = options.body === undefined ? "" : JSON.stringify(options.body);
  const requestUrl = new URL(path.startsWith("/") ? path : `/${path}`, baseUrl());
  // The disposable review stack binds only to loopback. Production always requires HTTPS.
  const localReviewHttp = requestUrl.protocol === "http:" && requestUrl.hostname === "127.0.0.1" && process.env.NODE_ENV === "development" && process.env.QRGUITAR_LOCAL_REVIEW === "1";
  if (requestUrl.protocol !== "https:" && !localReviewHttp) throw new Error("Supabase requests require HTTPS outside the local review stack.");
  const transport = localReviewHttp ? loopbackHttpRequest : httpsRequest;
  const headers = {
    ...authHeaders(options.serviceRole, Boolean(bodyText)),
    ...(bodyText ? { "Content-Length": Buffer.byteLength(bodyText).toString() } : {})
  };

  return new Promise<T>((resolve, reject) => {
    const request = transport(
      requestUrl,
      {
        family: 4,
        headers,
        method: options.method || (bodyText ? "POST" : "GET"),
        timeout: options.timeoutMs || 8000
      },
      (response) => {
        let responseText = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseText += chunk;
        });
        response.on("end", () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(responseText || response.statusMessage || "Supabase request failed."));
            return;
          }

          try {
            resolve(responseText ? JSON.parse(responseText) as T : ({} as T));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error("Supabase request timed out.")));
    if (bodyText) {
      request.write(bodyText);
    }
    request.end();
  });
}

export function supabaseStoragePublicUrl(bucket: string, storagePath: string) {
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl()}/storage/v1/object/public/${bucket}/${encodedPath}`;
}

export async function supabaseSignedStorageUrl(bucket: string, storagePath: string, expiresIn: number) {
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const result = await supabaseHttpsJson<{ signedURL?: string; signedUrl?: string }>(
    `/storage/v1/object/sign/${bucket}/${encodedPath}`,
    { body: { expiresIn }, method: "POST", serviceRole: true, timeoutMs: 8000 }
  );
  const signedPath = result.signedURL || result.signedUrl || "";
  if (!signedPath) {
    return "";
  }

  if (/^https?:/i.test(signedPath)) {
    return signedPath;
  }

  return `${baseUrl()}/storage/v1${signedPath.startsWith("/") ? signedPath : `/${signedPath}`}`;
}
