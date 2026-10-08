import { createHash, timingSafeEqual } from "node:crypto";

export type ActionEmailEnvironment = Record<string, string | undefined>;
export const actionEmailOperationsVersion = "2026-09-27.action-email.4";
const endpoint = "https://www.qrguitar.com/api/internal/action-email-sweep";
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export function actionEmailAdmission(env: ActionEmailEnvironment) {
  if (env.QRGUITAR_ACTION_EMAIL_WORKER_ENABLED !== "true" || env.QRGUITAR_ACTION_EMAIL_TRANSPORT_ENABLED !== "true"
    || env.VERCEL !== "1" || env.VERCEL_ENV !== "production" || env.NODE_ENV !== "production") return null;
  const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!projectUrl || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(projectUrl)
    || env.QRGUITAR_ACTION_EMAIL_EXPECTED_SUPABASE_URL !== projectUrl) return null;
  const release = env.VERCEL_GIT_COMMIT_SHA;
  if (!release || !/^[0-9a-f]{40}$/.test(release) || env.QRGUITAR_ACTION_EMAIL_APPROVED_COMMIT !== release) return null;
  return { projectUrl, release };
}

/** Production-only admission; disabled/malformed requests never construct a database or sender. */
export function createActionEmailSweepHandler(deps: {
  environment(): ActionEmailEnvironment;
  run(admission: { projectUrl: string; release: string }): Promise<unknown>;
}) {
  return async (request: Request) => {
    const env = deps.environment(), admission = actionEmailAdmission(env);
    if (!admission) return json({ ok: false, message: "Action email worker is disabled or unavailable." }, 503);
    if (request.method !== "POST") return json({ ok: false, message: "POST required." }, 405);
    if (request.url !== endpoint) return json({ ok: false, message: "Worker destination is unavailable." }, 403);
    const expected = env.QRGUITAR_ACTION_EMAIL_CRON_SECRET;
    if (!expected || expected.length < 32 || expected.length > 256 || /[\s\x00-\x1f\x7f]/.test(expected)) return json({ ok: false, message: "Worker authentication is unavailable." }, 503);
    const authorization = request.headers.get("authorization") || "", candidate = authorization.slice(7);
    if (candidate.length > 256 || !authorization.startsWith("Bearer ")
      || !timingSafeEqual(createHash("sha256").update(candidate).digest(), createHash("sha256").update(expected).digest())
      || candidate.length !== expected.length) return json({ ok: false, message: "Authentication required." }, 401);
    try {
      const result = await deps.run(admission);
      if (!result || typeof result !== "object") throw new Error("Invalid worker receipt");
      const counts = result as Record<string, unknown>;
      const fields = ["claimed", "accepted", "retry", "failed", "unknown", "suppressed"];
      if (Object.keys(counts).length !== fields.length || fields.some(key => !Number.isInteger(counts[key]) || Number(counts[key]) < 0 || Number(counts[key]) > 3)
        || fields.slice(1).reduce((sum, key) => sum + Number(counts[key]), 0) !== counts.claimed) throw new Error("Invalid worker receipt");
      return json({ ok: true, ...counts }, 200);
    } catch { return json({ ok: false, message: "Processing could not be confirmed. Inspect delivery status before retrying." }, 503); }
  };
}
