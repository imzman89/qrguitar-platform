import SMTPConnection, { type SMTPConnectionSendInfo } from "nodemailer/lib/smtp-connection";
import MailComposer from "nodemailer/lib/mail-composer";
import type { EmailResult } from "./transactional-email";
import type { TransactionalEmailDocument } from "./transactional-email-renderer";

export type ZohoRelayAcceptance = {
  schema: "qrguitar-zoho-smtp-acceptance/v1";
  provider: "zoho-smtp";
  responseCode: 250;
};
export type ZohoEmailResult = EmailResult & { relayAcceptance?: ZohoRelayAcceptance };
type DeliveryOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  // A caller's durable intent identity is not an SMTP deduplication instruction.
  idempotencyKey?: string;
  successMessage: string;
  failureMessage: string;
};
const DEFAULT_TIMEOUT_MS = 10_000;
const ACCOUNT = "gary@qrguitar.com";
const REPLY_TO = "support@qrguitar.com";
const SENDERS = new Set([ACCOUNT, REPLY_TO]);
const abortedGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")!.get!;

function email(value: string) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) return "";
  const address = value.replace(/^.*<([^<>]+)>$/, "$1").trim();
  return /^[^\s@<>:;,]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(address) ? address : "";
}
function config() {
  const host = String(process.env.ZOHO_SMTP_HOST || "").trim().toLowerCase();
  const port = String(process.env.ZOHO_SMTP_PORT || "").trim();
  const user = email(process.env.ZOHO_SMTP_USER || "").toLowerCase();
  const password = String(process.env.ZOHO_SMTP_PASSWORD || "");
  const from = email(process.env.SMTP_FROM || "").toLowerCase();
  const replyTo = email(process.env.SMTP_REPLY_TO || "").toLowerCase();
  // Explicit US paid-organization endpoint only; no generic host or fallback.
  if (host !== "smtppro.zoho.com" || !["465", "587"].includes(port) ||
      user !== ACCOUNT || !password.trim() || password.length > 2048 ||
      /[\u0000\r\n]/.test(password) || !SENDERS.has(from) || replyTo !== REPLY_TO) return null;
  return { host, port: Number(port) as 465 | 587, user, password, from, replyTo };
}
export function isZohoSmtpConfigured() {
  return config() !== null; // Presence of valid settings; not a provider login/delivery check.
}
function smtpRejection(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const raw = (error as { responseCode?: unknown }).responseCode;
  const code = typeof raw === "number" ? raw :
    typeof raw === "string" && /^[45]\d{2}$/.test(raw) ? Number(raw) : NaN;
  return Number.isInteger(code) && code >= 400 && code <= 599 ? code : undefined;
}
export async function deliverZohoSmtpEmail(
  to: string, document: TransactionalEmailDocument, options: DeliveryOptions
): Promise<ZohoEmailResult> {
  const settings = config();
  if (!settings) return { ok: false, status: "failed", outcome: "rejected",
    retryable: false, message: "Zoho SMTP delivery is not configured for application messages." };
  const recipient = email(to);
  const timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
  if (!recipient || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000 ||
      !document || typeof document.subject !== "string" || document.subject.length > 300 ||
      /[\r\n\u0000]/.test(document.subject) || typeof document.htmlContent !== "string" ||
      typeof document.textContent !== "string" ||
      Buffer.byteLength(document.htmlContent) + Buffer.byteLength(document.textContent) > 200_000)
    return { ok: false, status: "failed", outcome: "rejected", retryable: false,
      message: "Email delivery configuration is invalid." };
  const signal = options.signal;
  try {
    if (signal !== undefined && abortedGetter.call(signal)) return {
      ok: false, status: "failed", outcome: "rejected", retryable: false,
      message: "Email delivery was cancelled before sending."
    };
  } catch {
    return { ok: false, status: "failed", outcome: "rejected", retryable: false,
      message: "Email delivery configuration is invalid." };
  }

  let connection: SMTPConnection | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  let interrupted = false;
  let timedOut = false;
  let closed = false;
  const close = () => {
    if (connection && !closed) {
      closed = true;
      const socket = connection._socket;
      try { connection.close(); } catch { /* Preserve the conservative result. */ }
      finally {
        // Nodemailer close() ends an established socket; own its final teardown.
        if (socket && !socket.destroyed) {
          try { socket.destroy(); } catch { /* Never retry an unconfirmed send. */ }
        }
      }
    }
  };
  const active = () => !interrupted && !(signal && abortedGetter.call(signal));
  const unknown = (): ZohoEmailResult => ({
    ok: false, status: "failed", outcome: "unknown", retryable: false,
    message: options.failureMessage + (timedOut ? " (delivery timed out)." : " (relay outcome unconfirmed).")
  });
  try {
    const interruption = new Promise<never>((_, reject) => {
      const interrupt = (timeout: boolean) => {
        interrupted = true; timedOut = timeout; close(); reject(new Error("SMTP_INTERRUPTED"));
      };
      timer = setTimeout(() => interrupt(true), timeoutMs);
      abortListener = () => interrupt(false);
      if (signal) EventTarget.prototype.addEventListener.call(signal, "abort", abortListener, { once: true });
      if (signal && abortedGetter.call(signal)) interrupt(false);
    });
    const work = (async () => {
      const mime = await new MailComposer({
        from: { name: "QRguitar", address: settings.from }, to: recipient,
        replyTo: settings.replyTo, subject: document.subject,
        html: document.htmlContent, text: document.textContent,
        disableFileAccess: true, disableUrlAccess: true
      }).compile().build();
      if (!active()) throw new Error("SMTP_INTERRUPTED");
      connection = new SMTPConnection({
        host: settings.host, port: settings.port, secure: settings.port === 465,
        requireTLS: settings.port === 587, opportunisticTLS: false, ignoreTLS: false,
        servername: settings.host, tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
        connectionTimeout: timeoutMs, greetingTimeout: timeoutMs,
        socketTimeout: timeoutMs, dnsTimeout: timeoutMs, logger: false, debug: false
      });
      return await new Promise<SMTPConnectionSendInfo>((resolve, reject) => {
        let settled = false;
        const fail = (error: unknown) => { if (!settled) { settled = true; reject(error); } };
        const check = () => { if (!active()) { fail(new Error("SMTP_INTERRUPTED")); return false; } return !settled; };
        connection!.on("error", fail);
        connection!.on("end", () => fail(new Error("SMTP_ENDED_BEFORE_ACKNOWLEDGEMENT")));
        connection!.connect(error => {
          if (!check()) return;
          if (error) return fail(error);
          connection!.login({ user: settings.user, pass: settings.password }, error => {
            if (!check()) return;
            if (error) return fail(error);
            connection!.send({ from: settings.from, to: [recipient] }, mime, (error, info) => {
              if (!check()) return;
              if (error) return fail(error);
              settled = true; resolve(info);
            });
          });
        });
      });
    })();
    const info = await Promise.race([work, interruption]);
    if (!active()) return unknown();
    if (!info || !Array.isArray(info.accepted) || info.accepted.length !== 1 ||
        typeof info.accepted[0] !== "string" || info.accepted[0].toLowerCase() !== recipient.toLowerCase() ||
        !Array.isArray(info.rejected) || info.rejected.length !== 0 ||
        typeof info.response !== "string") return unknown();
    const terminalReply = info.response.split(/\r?\n/).pop() || "";
    if (!/^250(?:[ \t]|$)/.test(terminalReply)) return unknown();
    // This is the relay's final DATA acknowledgement, not inbox delivery or a provider message ID.
    return { ok: true, status: "sent", outcome: "accepted", message: options.successMessage,
      relayAcceptance: { schema: "qrguitar-zoho-smtp-acceptance/v1", provider: "zoho-smtp", responseCode: 250 } };
  } catch (error) {
    if (interrupted || (signal && abortedGetter.call(signal))) return unknown();
    const code = smtpRejection(error);
    if (code) return { ok: false, status: "failed", outcome: "rejected",
      retryable: code < 500, message: options.failureMessage + " (" + code + ")." };
    return unknown();
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && abortListener) EventTarget.prototype.removeEventListener.call(signal, "abort", abortListener);
    close();
  }
}
