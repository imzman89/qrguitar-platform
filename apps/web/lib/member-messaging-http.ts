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
  const type = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  const encoding = request.headers.get("content-encoding")?.trim().toLowerCase();
  const length = request.headers.get("content-length");
  if (type !== "application/json" || (encoding && encoding !== "identity")
    || (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes))) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("message_body_timeout")), 8000);
  });
  try {
    for (;;) {
      const part = await Promise.race([reader.read(), timeout]);
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) { cancel = true; return null; }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    cancel = true;
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    if (cancel) void reader.cancel().catch(() => undefined);
    try { reader.releaseLock(); } catch { /* Cancellation can retain the lock until its pending read settles. */ }
  }
}
