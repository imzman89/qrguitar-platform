import { createHash, timingSafeEqual } from "node:crypto";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export function createServiceEmailSweepHandler(deps: {
  enabled(): boolean;
  secret(): string | undefined;
  run(): Promise<Record<string, number>>;
}) {
  return async (request: Request) => {
    if (!deps.enabled()) return json({ ok: false, message: "Service email worker is disabled." }, 503);
    const expected = deps.secret();
    if (!expected || expected.length < 32 || expected.length > 256 || /[\s\x00-\x1f\x7f]/.test(expected)) return json({ ok: false, message: "Service email worker is unavailable." }, 503);
    const authorization = request.headers.get("authorization") || "", candidate = authorization.slice(7);
    if (!authorization.startsWith("Bearer ") || !timingSafeEqual(createHash("sha256").update(candidate).digest(), createHash("sha256").update(expected).digest()) || candidate.length !== expected.length) return json({ ok: false, message: "Authentication required." }, 401);
    try {
      const counts = await deps.run();
      const fields = ["claimed", "accepted", "retry", "failed", "unknown", "suppressed"];
      if (Object.keys(counts).length !== fields.length || fields.some(key => !Number.isInteger(counts[key]) || counts[key] < 0 || counts[key] > 3)) throw new Error("Invalid receipt");
      return json({ ok: true, ...counts });
    } catch { return json({ ok: false, message: "Service email processing could not be confirmed. Inspect delivery status before retrying." }, 503); }
  };
}
