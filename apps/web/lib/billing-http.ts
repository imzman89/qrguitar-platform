import { publicBillingError } from "./billing-service";

type BillingService = {
  offers(): Promise<unknown[]>;
  status(request: Request, orderId?: string): Promise<unknown>;
  checkout(request: Request, input: unknown): Promise<unknown>;
  webhook(raw: Uint8Array, signature: string): Promise<unknown>;
};
type Dependencies = { service(): BillingService | null; bodyTimeoutMs?: number };
class BoundaryError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const headers = { "Cache-Control": "no-store, no-cache, must-revalidate", "X-Content-Type-Options": "nosniff", Vary: "Authorization" };
function json(value: unknown, status = 200) { return Response.json(value, { status, headers }); }
function failure(error: unknown) {
  if (error instanceof BoundaryError) return json({ ok: false, code: error.code, message: error.message }, error.status);
  const result = publicBillingError(error);
  return json(result.body, result.status);
}
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin)) {
    throw new BoundaryError(403, "origin_not_allowed", "Open billing from QRguitar to continue.");
  }
}
function requireJson(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new BoundaryError(415, "invalid_content_type", "Send a JSON request.");
  }
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding !== "identity") throw new BoundaryError(415, "invalid_encoding", "Unsupported request encoding.");
}

/** Read exact bytes with an enforced limit; Content-Length is only an early rejection hint. */
export async function readBillingBody(request: Request, maximum: number, timeoutMs = 8_000): Promise<Uint8Array> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new BoundaryError(413, "body_too_large", "The request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BoundaryError(408, "body_timeout", "The request body did not arrive in time.")), timeoutMs);
  });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await Promise.race([reader.read(), timeout]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) throw new BoundaryError(413, "body_too_large", "The request is too large.");
      chunks.push(part.value);
    }
    const result = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  } catch (error) {
    cancel = true;
    if (error instanceof BoundaryError) throw error;
    throw new BoundaryError(400, "invalid_body", "The request body could not be read.");
  } finally {
    if (timer) clearTimeout(timer);
    if (cancel) void reader.cancel().catch(() => undefined);
    try { reader.releaseLock(); } catch { /* A cancelled pending read releases its lock when it settles. */ }
  }
}

export function createBillingHandlers(deps: Dependencies) {
  function service() {
    const value = deps.service();
    if (!value) throw new BoundaryError(503, "billing_disabled", "Paid Profile packs are not available right now.");
    return value;
  }
  return {
    async offers() {
      try { return json({ ok: true, offers: await deps.service()?.offers() || [] }); }
      catch (error) { return failure(error); }
    },
    async status(request: Request) {
      try {
        const query = new URL(request.url).searchParams;
        if (query.getAll("orderId").length > 1 || [...query.keys()].some(key => key !== "orderId")) {
          throw new BoundaryError(400, "invalid_purchase", "Purchase not found.");
        }
        const result = await service().status(request, query.has("orderId") ? query.get("orderId")! : undefined);
        return json({ ok: true, ...result as object });
      } catch (error) { return failure(error); }
    },
    async checkout(request: Request) {
      try {
        sameOrigin(request); requireJson(request);
        const bytes = await readBillingBody(request, 2_048, deps.bodyTimeoutMs);
        let input: unknown;
        try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
        catch { throw new BoundaryError(400, "invalid_body", "Check the purchase request and try again."); }
        const result = await service().checkout(request, input);
        return json({ ok: true, ...result as object });
      } catch (error) { return failure(error); }
    },
    async webhook(request: Request) {
      try {
        requireJson(request);
        const signature = request.headers.get("stripe-signature");
        if (!signature || signature.length > 2_048) throw new BoundaryError(400, "invalid_signature", "Invalid webhook signature.");
        const bytes = await readBillingBody(request, 512 * 1_024, deps.bodyTimeoutMs);
        if (!bytes.length) throw new BoundaryError(400, "invalid_body", "Empty webhook body.");
        // Stripe verifies untouched bytes. Never parse or normalize its JSON here.
        return json(await service().webhook(bytes, signature));
      } catch (error) { return failure(error); }
    }
  };
}
