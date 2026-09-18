import { NextResponse } from "next/server";

export const memberMessageHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization"
};

export function memberMessageJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: memberMessageHeaders });
}

export function memberMessageOriginAllowed(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  return (!site || site === "same-origin" || site === "none") && (!origin || origin === new URL(request.url).origin);
}

export async function readMemberMessageJson(request: Request, maxBytes = 64 * 1024) {
  const type = request.headers.get("content-type") || "";
  const length = Number(request.headers.get("content-length") || 0);
  if (!type.toLowerCase().startsWith("application/json") || !Number.isFinite(length) || length > maxBytes) return null;
  return request.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}
