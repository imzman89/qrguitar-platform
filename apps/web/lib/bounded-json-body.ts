export type BoundedJsonBody =
  | { ok: true; body: Record<string, unknown>; bytes: number }
  | { ok: false; reason: "invalid" | "too_large"; bytes: number };

/** Read one JSON object without allowing a streamed body to bypass the limit. */
export async function readBoundedJsonBody(request: Request, limit: number): Promise<BoundedJsonBody> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    return { ok: false, reason: "too_large", bytes: 0 };
  }
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, reason: "invalid", bytes: 0 };
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > limit) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large", bytes };
      }
      text += decoder.decode(next.value, { stream: true });
    }
    text += decoder.decode();
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, reason: "invalid", bytes };
    }
    return { ok: true, body: body as Record<string, unknown>, bytes };
  } catch {
    return { ok: false, reason: "invalid", bytes };
  } finally {
    reader.releaseLock();
  }
}
