import { IntakeError, publicIntakeError, type IntakeService } from "./intake-service";

const responseHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate", "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin", Vary: "Authorization"
};
function json(value: unknown, status = 200, extra?: Record<string, string>) { return Response.json(value, { status, headers: { ...responseHeaders, ...extra } }); }
function error(status: number, code: string, message: string): never { throw new IntakeError(status, code, message); }
function origin(request: Request) {
  const site = request.headers.get("sec-fetch-site"), source = request.headers.get("origin");
  if ((site && site !== "same-origin" && site !== "none") || (source && source !== new URL(request.url).origin)) {
    error(403, "origin_not_allowed", "Open account requests from QRguitar to continue.");
  }
  // Native bearer clients omit Origin/Fetch Metadata. Cookies never authenticate this service.
}
function query(request: Request, allowed: string[]) {
  const values = new URL(request.url).searchParams;
  if ([...values.keys()].some(key => !allowed.includes(key) || values.getAll(key).length !== 1)) error(400, "invalid_query", "Check the request query fields.");
  return values;
}
async function body(request: Request, timeoutMs: number) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") error(415, "invalid_content_type", "Send an application/json request.");
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity") error(415, "invalid_encoding", "Unsupported request encoding.");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1024)) error(413, "body_too_large", "The request is too large.");
  const reader = request.body?.getReader();
  if (!reader) error(400, "invalid_body", "A request body is required.");
  let timer: ReturnType<typeof setTimeout> | undefined, onAbort: (() => void) | undefined, cancel = false;
  const stopped = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new IntakeError(408, "body_timeout", "The request body did not arrive in time.")), timeoutMs);
    onAbort = () => reject(new IntakeError(400, "invalid_body", "The request body was interrupted."));
    request.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    if (request.signal.aborted) error(400, "invalid_body", "The request body was interrupted.");
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const part = await Promise.race([reader.read(), stopped]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024) error(413, "body_too_large", "The request is too large.");
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes), value: unknown = JSON.parse(text);
      // Allowed bodies are flat objects with scalar values. Reject repeated keys
      // before JSON.parse's last-key-wins semantics could change the confirmation.
      const keys = [...text.matchAll(/("(?:[^"\\]|\\.)*")\s*:/g)].map(match => JSON.parse(match[1]) as string);
      if (new Set(keys).size !== keys.length) throw new Error("Duplicate JSON field");
      return value;
    } catch { error(400, "invalid_body", "The request must contain valid, unambiguous JSON."); }
  } catch (failure) {
    cancel = true;
    if (failure instanceof IntakeError) throw failure;
    error(400, "invalid_body", "The request body could not be read.");
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) request.signal.removeEventListener("abort", onAbort);
    if (cancel) void reader.cancel().catch(() => undefined);
    try { reader.releaseLock(); } catch { /* Pending cancellation owns the lock until its read settles. */ }
  }
}

export function createIntakeHandlers(deps: { service(): IntakeService | null; bodyTimeoutMs?: number }) {
  const timeout = Math.max(1, Math.min(deps.bodyTimeoutMs ?? 8000, 15_000));
  function service() {
    const value = deps.service();
    if (!value) error(503, "intake_unavailable", "Account requests are temporarily unavailable. Try again.");
    return value;
  }
  async function run(work: () => Promise<unknown>) {
    try { return json(await work()); }
    catch (failure) { const safe = publicIntakeError(failure); return json(safe.body, safe.status); }
  }
  function method(allow: string) { return json({ ok: false, code: "method_not_allowed", message: "This action is not available.", uncertain: false, retryable: false }, 405, { Allow: allow }); }
  return {
    collection(request: Request) {
      if (request.method !== "GET" && request.method !== "POST") return Promise.resolve(method("GET, POST"));
      return run(async () => {
        origin(request);
        if (request.method === "GET") {
          const values = query(request, ["requestId"]);
          return service().read(request, values.has("requestId") ? values.get("requestId")! : undefined);
        }
        query(request, []);
        const input = await body(request, timeout);
        return service().submit(request, input);
      });
    },
    item(request: Request, requestId: string) {
      if (request.method !== "PATCH") return Promise.resolve(method("PATCH"));
      return run(async () => { origin(request); query(request, []); const input = await body(request, timeout); return service().cancel(request, requestId, input); });
    },
    adminQueue(request: Request) {
      if (request.method !== "GET") return Promise.resolve(method("GET"));
      return run(async () => {
        origin(request);
        const values = query(request, ["beforeRequestedAt", "beforeId", "limit"]);
        if (values.has("limit") && !/^(?:[1-9]|[1-9][0-9]|100)$/.test(values.get("limit")!)) error(400, "invalid_query", "Queue limit must be between 1 and 100.");
        return service().queue(request, {
          ...(values.has("beforeRequestedAt") ? { beforeRequestedAt: values.get("beforeRequestedAt")! } : {}),
          ...(values.has("beforeId") ? { beforeId: values.get("beforeId")! } : {}),
          ...(values.has("limit") ? { limit: Number(values.get("limit")) } : {})
        });
      });
    }
  };
}
