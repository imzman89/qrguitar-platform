import { BillingError, publicBillingError } from "./billing-service";
import { readBillingBody } from "./billing-http";

type Service = { list(request: Request, orderId?: string): Promise<unknown>; decide(request: Request, input: unknown): Promise<unknown> };
const headers = { "Cache-Control": "no-store, no-cache, must-revalidate", "X-Content-Type-Options": "nosniff", Vary: "Authorization" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
function failure(error: unknown) {
  if (error instanceof Error && "status" in error && "code" in error && [400, 408, 413].includes(Number(error.status))) {
    return json({ ok: false, code: error.code, message: "The review request could not be read. Check it and retry the same decision." }, Number(error.status));
  }
  const result = publicBillingError(error); return json(result.body, result.status);
}
export function createPayPalAdminReviewHandlers(deps: { service(): Service | null; bodyTimeoutMs?: number }) {
  function service() { const value = deps.service(); if (!value) throw new BillingError(503, "review_unavailable", "Automatic payment reviews are unavailable. No hold was changed."); return value; }
  async function input(request: Request) {
    if (request.headers.get("sec-fetch-site") === "cross-site" || (request.headers.has("origin") && request.headers.get("origin") !== new URL(request.url).origin)) {
      throw new BillingError(403, "origin_not_allowed", "Open payment review from QRguitar to continue.");
    }
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json"
      || (request.headers.has("content-encoding") && request.headers.get("content-encoding") !== "identity")) throw new BillingError(415, "invalid_content_type", "Send a JSON request.");
    const bytes = await readBillingBody(request, 4096, deps.bodyTimeoutMs);
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new BillingError(400, "invalid_body", "Check the review request and retry."); }
  }
  return {
    async list(request: Request) {
      try {
        const query = new URL(request.url).searchParams;
        if (query.getAll("orderId").length > 1 || [...query.keys()].some(key => key !== "orderId")) throw new BillingError(400, "invalid_query", "Invalid payment review query.");
        return json({ ok: true, ...await service().list(request, query.has("orderId") ? query.get("orderId")! : undefined) as object });
      } catch (error) { return failure(error); }
    },
    async decide(request: Request) {
      try { return json({ ok: true, ...await service().decide(request, await input(request)) as object }); }
      catch (error) { return failure(error); }
    }
  };
}

