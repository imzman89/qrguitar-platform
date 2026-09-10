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

export function readSitePreviewPayload(token?: string | null): PreviewPayload | null {
  if (!token || token.length > 2048 || !previewSecret()) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = sign(payload);
  if (!expected || expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PreviewPayload;
    return typeof decoded.sub === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.sub) &&
      Number.isSafeInteger(decoded.exp) && decoded.exp > Math.floor(Date.now() / 1000) ? decoded : null;
  } catch { return null; }
}
export function verifySitePreviewToken(token?: string | null) { return Boolean(readSitePreviewPayload(token)); }
export function sitePreviewTokenFromCookie(header: string) {
  const raw = header.split(";").map(item => item.trim()).find(item => item.startsWith(sitePreviewCookie + "="))?.slice(sitePreviewCookie.length + 1);
  try { return raw ? decodeURIComponent(raw) : ""; } catch { return ""; }
}

export function safePreviewPath(value?: string | null) {
  const path = String(value || "/").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("\u0000")) return "/";
  return path.split("?")[0].split("#")[0] || "/";
}

export const sitePreviewMaxAge = PREVIEW_TTL_SECONDS;
