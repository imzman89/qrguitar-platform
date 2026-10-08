import { createServerSupabaseClient } from "./supabase-server";
import { createActionRequiredEmailPipeline } from "./action-required-email-delivery";
import { deliverApplicationEmail } from "./transactional-email";
import { publishedSiteSettingsKey } from "./site-settings";
import { actionEmailAdmission, actionEmailOperationsVersion, createActionEmailSweepHandler } from "./action-email-sweep-http";

export const actionEmailSweep = createActionEmailSweepHandler({
  environment: () => process.env,
  async run(admission) {
    // Recheck before client construction; no localhost, preview, implicit fallback or unpinned release.
    const current = actionEmailAdmission(process.env);
    if (!current || current.projectUrl !== admission.projectUrl || current.release !== admission.release) throw new Error("Worker admission changed");
    const database = createServerSupabaseClient();
    if (!database) throw new Error("Worker database unavailable");
    const readiness = await database.rpc("action_email_readiness", { p_project_url: admission.projectUrl, p_release_sha: admission.release }).abortSignal(AbortSignal.timeout(5000));
    if (readiness.error || readiness.data?.ready !== true || readiness.data?.version !== actionEmailOperationsVersion) throw new Error("Action email readiness failed");
    try {
      const pipeline = createActionRequiredEmailPipeline({
        enabled: true,
        database: { rpc: async (name, args, signal) => database.rpc(name, args).abortSignal(signal) },
        async loadContent(signal) {
          // Read only published content; a failed read never falls back to draft/request cookies or defaults.
          const published = await database.from("site_content").select("content_value").eq("content_key", publishedSiteSettingsKey).abortSignal(signal).maybeSingle();
          const content = published.data?.content_value?.content;
          if (published.error || !content || typeof content !== "object" || Array.isArray(content)
            || Object.values(content).some(value => typeof value !== "string")) throw new Error("Published wording unavailable");
          return content as Record<string, string>;
        },
        async deliver(to, document, options) {
          const live = actionEmailAdmission(process.env);
          if (!live || live.projectUrl !== admission.projectUrl || live.release !== admission.release || options.signal.aborted) {
            return { ok: false, status: "failed", outcome: "rejected", retryable: true, message: "Transport admission changed; nothing sent." };
          }
          return deliverApplicationEmail(to, document, options);
        }
      });
      const result = await pipeline.run();
      if (result.disabled !== false) throw new Error("Worker unexpectedly disabled");
      const recorded = await database.rpc("action_email_worker_heartbeat", { p_success: true }).abortSignal(AbortSignal.timeout(2000));
      if (recorded.error || recorded.data !== true) throw new Error("Worker receipt unavailable");
      return { claimed: result.claimed, accepted: result.accepted, retry: result.retry, failed: result.failed,
        unknown: result.unknown, suppressed: result.suppressed };
    } catch {
      try { await database.rpc("action_email_worker_heartbeat", { p_success: false }).abortSignal(AbortSignal.timeout(2000)); } catch { /* Preserve the unconfirmed result without replay. */ }
      throw new Error("Action email processing unconfirmed");
    }
  }
});
