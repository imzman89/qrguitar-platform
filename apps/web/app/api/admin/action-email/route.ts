import { getAdminContext } from "../../../../lib/admin-auth";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { createActionEmailOperator } from "../../../../lib/action-email-operator";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const unavailable = () => json({ ok: false, code: "unavailable", message: "Delivery review is unavailable. Refresh and try again." }, 503);

class BodyError extends Error { constructor(readonly status: number) { super("Invalid review request."); } }
async function body(request: Request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || "")) throw new BodyError(415);
  const size = request.headers.get("content-length");
  if (size && (!/^\d+$/.test(size) || Number(size) > 8192)) throw new BodyError(413);
  const reader = request.body?.getReader();
  if (!reader) throw new BodyError(400);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([(async () => {
      let total = 0, text = "";
      const decoder = new TextDecoder();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > 8192) throw new BodyError(413);
        text += decoder.decode(chunk.value, { stream: true });
      }
      try { return JSON.parse(text + decoder.decode()) as unknown; } catch { throw new BodyError(400); }
    })(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new BodyError(408)), 5000); })]);
  } finally {
    if (timer) clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
  }
}

async function handle(request: Request, write: boolean) {
  try {
    const auth = await getAdminContext(request);
    if (!auth.ok || !auth.user || auth.accountStatus !== "active" || !["role", "env"].includes(auth.accessSource)) {
      return json({ ok: false, code: "forbidden", message: "An active administrator account is required." }, auth.status === 401 ? 401 : auth.status >= 500 ? 503 : 403);
    }
    const database = createServerSupabaseClient();
    if (!database) return unavailable();
    // Env administrators also require a positively verified existing active profile.
    // getAdminContext's legacy environment override alone does not establish profile-read success.
    const profile = await database.from("profiles").select("id,role,account_status").eq("id", auth.user.id)
      .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
    if (profile.error) return unavailable();
    if (!profile.data || profile.data.id !== auth.user.id || profile.data.account_status !== "active"
      || (auth.accessSource === "role" && profile.data.role !== "admin")) {
      return json({ ok: false, code: "forbidden", message: "An active administrator account is required." }, 403);
    }
    // This flag does not enable capture, dispatch or a worker; default is off.
    if (process.env.QRGUITAR_ACTION_EMAIL_OPERATOR_ENABLED !== "true") {
      return json({ ok: false, code: "disabled", message: "Action-email operator controls are not enabled." });
    }
    // Privacy tables prohibit direct reads, including by service_role. Use the
    // existing actor-scoped reader without exposing its private DTO to callers.
    const deleting = await database.rpc("read_account_deletion_requests", {
      p_actor_id: auth.user.id, p_request_id: null
    }).abortSignal(AbortSignal.timeout(5000));
    const deletion = deleting.data;
    if (deleting.error || !deletion || typeof deletion !== "object" || Array.isArray(deletion)
      || deletion.ok !== true || !Object.prototype.hasOwnProperty.call(deletion, "activeRequest")) return unavailable();
    if (deletion.activeRequest !== null) {
      if (!deletion.activeRequest || typeof deletion.activeRequest !== "object" || Array.isArray(deletion.activeRequest)
        || deletion.activeRequest.status !== "requested") return unavailable();
      return json({ ok: false, code: "forbidden", message: "Account deletion is pending. Delivery review is unavailable." }, 403);
    }
    const operator = createActionEmailOperator({ enabled: true,
      authorize: async () => ({ actorId: auth.user!.id, envAdmin: auth.accessSource === "env" }),
      database: { rpc: async (name, args, signal) => database.rpc(name, args).abortSignal(signal) }
    });
    const result = write ? await operator.reconcile(await body(request))
      : await operator.list(Number(new URL(request.url).searchParams.get("offset") || 0));
    return json(result, result.ok ? 200 : result.code === "invalid" ? 400 : result.code === "forbidden" ? 403 : 503);
  } catch (error) {
    return error instanceof BodyError ? json({ ok: false, code: "invalid", message: "Send a valid, bounded JSON delivery review." }, error.status) : unavailable();
  }
}

export const GET = (request: Request) => handle(request, false);
export const PATCH = (request: Request) => handle(request, true);
