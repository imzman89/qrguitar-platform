import { createHmac, timingSafeEqual } from "node:crypto";

export const sitePreviewCookie = "qrguitar_site_preview";
export const sitePreviewDraftKey = "site-editor:draft";
const PREVIEW_TTL_SECONDS = 5 * 60;

type PreviewPayload = {
  sub: string;
  exp: number;
};

function previewSecret() {
  return process.env.QRGUITAR_PREVIEW_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function sign(value: string) {
  const secret = previewSecret();
  return secret ? createHmac("sha256", secret).update(value).digest("base64url") : "";
}

export function createSitePreviewToken(userId: string) {
  if (!previewSecret()) return "";
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + PREVIEW_TTL_SECONDS } satisfies PreviewPayload)
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySitePreviewToken(token?: string | null) {
  if (!token || !previewSecret()) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  if (!expected || expected.length !== signature.length) return false;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PreviewPayload;
    return Boolean(decoded.sub && decoded.exp > Math.floor(Date.now() / 1000));
  } catch {
    return false;
  }
}

export function safePreviewPath(value?: string | null) {
  const path = String(value || "/").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("\u0000")) return "/";
  return path.split("?")[0].split("#")[0] || "/";
}

export const sitePreviewMaxAge = PREVIEW_TTL_SECONDS;
