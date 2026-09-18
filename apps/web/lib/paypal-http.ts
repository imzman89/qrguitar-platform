import { BillingError, publicBillingError } from "./billing-service";
import { readBillingBody } from "./billing-http";

type Service = {
  status(request: Request, orderId?: string): Promise<unknown>;
  quote(request: Request, input: unknown): Promise<unknown>;
  create(request: Request, input: unknown): Promise<unknown>;
  capture(request: Request, input: unknown): Promise<unknown>;
  reconcile(request: Request, input: unknown): Promise<unknown>;
};
const headers = { "Cache-Control": "no-store, no-cache, must-revalidate", "X-Content-Type-Options": "nosniff", Vary: "Authorization" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
function failure(error: unknown) {
  if (error instanceof Error && "status" in error && "code" in error && [400, 408, 413].includes(Number(error.status))) return json({ ok: false, code: error.code, message: "The request could not be read. Retry the same request." }, Number(error.status));
  const result = publicBillingError(error); return json(result.body, result.status);
}
export function createPayPalHandlers(deps: { service(): Service | null; bodyTimeoutMs?: number }) {
  function service() { const value = deps.service(); if (!value) throw new BillingError(503, "billing_disabled", "Payments are not available right now."); return value; }
  async function input(request: Request): Promise<unknown> {
    if (request.headers.get("sec-fetch-site") === "cross-site" || (request.headers.has("origin") && request.headers.get("origin") !== new URL(request.url).origin)) throw new BillingError(403, "origin_not_allowed", "Open payments from QRguitar to continue.");
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json"
      || (request.headers.has("content-encoding") && request.headers.get("content-encoding") !== "identity")) throw new BillingError(415, "invalid_content_type", "Send a JSON request.");
    const bytes = await readBillingBody(request, 4096, deps.bodyTimeoutMs);
    try { const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes); return JSON.parse(raw); }
    catch { throw new BillingError(400, "invalid_body", "Invalid payment request."); }
  }
  const mutation = (method: "quote" | "create" | "capture" | "reconcile") => async (request: Request) => {
    try { return json({ ok: true, ...await service()[method](request, await input(request)) as object }); } catch (error) { return failure(error); }
  };
  return {
    async status(request: Request) {
      try {
        const query = new URL(request.url).searchParams;
        if (query.getAll("orderId").length > 1 || [...query.keys()].some(key => key !== "orderId")) throw new BillingError(400, "invalid_payment", "Invalid payment order.");
        return json({ ok: true, ...await service().status(request, query.has("orderId") ? query.get("orderId")! : undefined) as object });
      } catch (error) { return failure(error); }
    },
    quote: mutation("quote"), create: mutation("create"), capture: mutation("capture"), reconcile: mutation("reconcile")
  };
}
