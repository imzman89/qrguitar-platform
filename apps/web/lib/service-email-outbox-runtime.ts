import { createServerSupabaseClient } from "./supabase-server";
import { sendServiceReviewEmail } from "./transactional-email";
import { createServiceEmailOutboxStore, createServiceEmailOutboxWorker } from "./service-email-outbox";
import { createServiceEmailSweepHandler } from "./service-email-sweep-http";

export const serviceEmailSweep = createServiceEmailSweepHandler({
  enabled: () => process.env.QRGUITAR_SERVICE_EMAIL_WORKER_ENABLED === "true",
  secret: () => process.env.QRGUITAR_SERVICE_EMAIL_CRON_SECRET,
  async run() {
    const database = createServerSupabaseClient();
    if (!database) throw new Error("Database unavailable");
    try {
      const readiness = await database.rpc("service_email_outbox_readiness").abortSignal(AbortSignal.timeout(5000));
      if (readiness.error || readiness.data?.ready !== true || readiness.data?.version !== "2026-09-26.service-email.2") throw new Error("Outbox is not ready");
      const worker = createServiceEmailOutboxWorker({
        store: createServiceEmailOutboxStore({ rpc: async (name, args) => database.rpc(name, args).abortSignal(AbortSignal.timeout(5000)) }),
        origin: "https://www.qrguitar.com",
        send: async (input, signal) => sendServiceReviewEmail({ ...input, signal })
      });
      const result = await worker.run();
      const heartbeat = await database.rpc("service_email_worker_heartbeat", { p_success: true }).abortSignal(AbortSignal.timeout(5000));
      if (heartbeat.error || heartbeat.data !== true) throw new Error("Heartbeat unavailable");
      return result;
    } catch {
      await database.rpc("service_email_worker_heartbeat", { p_success: false }).abortSignal(AbortSignal.timeout(5000));
      throw new Error("Service email processing unavailable");
    }
  }
});
