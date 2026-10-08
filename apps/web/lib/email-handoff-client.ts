import type { SupabaseClient, Session } from "@supabase/supabase-js";
import type { DemoTransfer } from "./local-demo";

export type EmailHandoffState = {
  phase: "checking" | "email" | "ready" | "accepted" | "completed" | "unavailable";
  busy: boolean;
  signedIn: boolean;
  canAccept: boolean;
  uncertain: boolean;
  message: string;
  transfer: DemoTransfer | null;
  permanentPath: string;
};
type Payload = { ok?: boolean; transfer?: DemoTransfer; requiresSignIn?: boolean; message?: string; permanentPath?: string; ownsProfile?: boolean };
const normalized = (email: string) => email.trim().toLowerCase();

// Auth proves the email; the existing transactional endpoint alone changes ownership.
// No URL flag, page load, or auth callback is an acceptance instruction.
export function createEmailHandoffClient(id: string, client: SupabaseClient, publish: (state: EmailHandoffState) => void, fetcher: typeof fetch = fetch) {
  let state: EmailHandoffState = { phase: "checking", busy: false, signedIn: false, canAccept: false, uncertain: false, message: "", transfer: null, permanentPath: "" };
  let active = true, epoch = 0, identityRevision = 0, actor = "", actorEmail = "", readRevision = 0;
  let mutation: symbol | null = null, readController: AbortController | null = null, writeController: AbortController | null = null;
  const update = (patch: Partial<EmailHandoffState>) => { if (active) { state = { ...state, ...patch }; publish(state); } };
  const isChecking = () => state.phase === "checking";
  const observe = (session: Session | null) => {
    const next = session?.user.id || "", email = normalized(session?.user.email || "");
    if (actor !== next || actorEmail !== email) {
      actor = next; actorEmail = email; identityRevision++; readRevision++;
      readController?.abort(); writeController?.abort();
      update({ phase: "checking", signedIn: Boolean(next), canAccept: false, uncertain: false, transfer: null, permanentPath: "", message: "" });
    }
  };
  const snapshot = () => ({ epoch, revision: identityRevision, actor });
  const current = (lease: ReturnType<typeof snapshot>) => active && lease.epoch === epoch && lease.revision === identityRevision && lease.actor === actor;
  async function sessionRead() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([client.auth.getSession(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Session check timed out.")), 10000); })]);
      if (result.error) throw result.error;
      return result.data.session;
    } finally { if (timer) clearTimeout(timer); }
  }
  async function reload() {
    if (!active || mutation) return;
    const request = ++readRevision, startedEpoch = epoch;
    update({ phase: "checking", canAccept: false, message: "" });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController(); readController?.abort(); readController = null;
    try {
      const session = await sessionRead();
      if (!active || epoch !== startedEpoch || request !== readRevision) return;
      // Initial identity may be established by this read before the auth listener.
      observe(session);
      const revision = ++readRevision, lease = snapshot();
      readController = controller;
      timer = setTimeout(() => controller.abort(), 15000);
      const response = await fetcher("/api/transfers?id=" + encodeURIComponent(id), { cache: "no-store", signal: controller.signal, headers: session?.access_token ? { authorization: "Bearer " + session.access_token } : undefined });
      const payload = await response.json().catch(() => null) as Payload | null;
      if (!current(lease) || revision !== readRevision || controller.signal.aborted) return;
      if (response.ok && payload?.requiresSignIn) {
        update({ phase: "email", signedIn: Boolean(session), canAccept: false, transfer: null, permanentPath: "", message: session ? "Use the email that received this invitation to accept the Profile." : "" });
      } else if (response.ok && payload?.ok && payload.transfer?.id === id && ["sent", "accepted", "cancelled"].includes(payload.transfer.status)) {
        const transfer = payload.transfer;
        const recipient = normalized(transfer.toEmail || "") === normalized(session?.user.email || "") && Boolean(session?.user.email);
        update({ phase: transfer.status === "accepted" ? payload.ownsProfile === true ? "accepted" : "completed" : transfer.status !== "sent" ? "unavailable" : "ready", transfer, signedIn: Boolean(session), canAccept: recipient && transfer.status === "sent", uncertain: false,
          permanentPath: "/i/" + transfer.guitarQrCode, message: transfer.status === "cancelled" ? "This invitation is no longer available. Ask the seller for a new one." : transfer.status === "accepted" && payload.ownsProfile !== true ? "This handoff was completed. The Profile is now managed by another owner." : recipient ? "" : "This account can view the handoff but cannot accept it for the buyer." });
      } else update({ phase: "unavailable", transfer: null, canAccept: false, message: payload?.message || "This invitation could not be checked. Please try again." });
    } catch {
      if (active && startedEpoch === epoch && (readController === controller || request === readRevision)) update({ phase: "unavailable", transfer: null, canAccept: false, message: "We could not check this invitation. Check your connection and try again." });
    } finally { if (timer) clearTimeout(timer); if (readController === controller) readController = null; }
  }
  const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
    observe(session);
    if (!mutation) void Promise.resolve().then(reload);
  });

  async function run(kind: "send" | "verify" | "accept", email = "", code = "") {
    if (!active || mutation || state.uncertain || state.phase === "checking") return;
    const requestedEmail = normalized(email);
    if (kind !== "accept" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) { update({ message: "Enter the email that received the invitation." }); return; }
    if (kind === "verify" && !/^\d{6,10}$/.test(code.trim())) { update({ message: "Enter the complete one-time code from your email." }); return; }
    if (kind === "accept" && !state.canAccept) return;
    if (kind !== "accept" && actor) { update({ message: "Use another account first to verify a different email." }); return; }
    const operation = Symbol(kind), lease = snapshot(); mutation = operation;
    update({ busy: true, message: kind === "verify" ? "Verifying your email…" : kind === "send" ? "Requesting your code…" : "Accepting your Profile…" });
    let acceptedActor = "", sentAcceptance = false, outcomeUncertain = false;
    const timer = setTimeout(() => { if (active && epoch === lease.epoch && mutation === operation) update({ message: "This request is still pending. Please wait while its result is checked." }); }, 20000);
    try {
      const before = await sessionRead();
      if (!current(lease)) return;
      if ((before?.user.id || "") !== actor) { observe(before); return; }
      if (kind === "send") {
        const { error } = await client.auth.signInWithOtp({ email: requestedEmail, options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + "/receive/" + encodeURIComponent(id) } });
        if (current(lease)) update({ message: error ? "The email could not be sent. Wait a moment and try again." : "Check your email for your code or secure sign-in link." });
        return;
      }
      let session = before;
      if (kind === "verify") {
        const result = await client.auth.verifyOtp({ email: requestedEmail, token: code.trim(), type: "email" });
        if (!active || epoch !== lease.epoch || mutation !== operation) return;
        const verified = result.data.session;
        if (result.error || !verified?.user.id || normalized(verified.user.email || "") !== requestedEmail) {
          if (current(lease)) update({ message: "That code could not be verified. Check it or request a new code." }); return;
        }
        acceptedActor = verified.user.id;
        // Only this operation's empty -> verified identity transition is permitted.
        if (!(current(lease) || (!lease.actor && identityRevision === lease.revision + 1 && actor === acceptedActor && actorEmail === requestedEmail))) return;
        session = await sessionRead();
        if (!active || epoch !== lease.epoch || mutation !== operation || session?.user.id !== acceptedActor || normalized(session?.user.email || "") !== requestedEmail) return;
        if (!(current(lease) || (!lease.actor && identityRevision === lease.revision + 1 && actor === acceptedActor && actorEmail === requestedEmail))) return;
        observe(session);
      }
      if (!session?.access_token || !session.user.id) throw new Error("Verified session missing.");
      const acceptLease = snapshot();
      if (session.user.id !== actor || (kind === "accept" && !current(lease))) return;
      const controller = new AbortController(); writeController = controller;
      const deadline = setTimeout(() => controller.abort(), 20000);
      let payload: Payload | null;
      try {
        sentAcceptance = true;
        const response = await fetcher("/api/transfers", { method: "PATCH", signal: controller.signal, headers: { "Content-Type": "application/json", authorization: "Bearer " + session.access_token }, body: JSON.stringify({ id, action: "accept" }) });
        payload = await response.json().catch(() => null) as Payload | null;
        if (!current(acceptLease) || controller.signal.aborted) return;
        if (response.status >= 500 || response.status === 408 || (response.ok && (!payload?.ok || payload.transfer?.id !== id || payload.transfer.status !== "accepted"))) throw new Error("Unconfirmed acceptance.");
        if (!response.ok || !payload?.ok || !payload.transfer) { update({ phase: state.transfer ? "ready" : "email", signedIn: true, canAccept: false, message: payload?.message || "This email cannot accept the invitation. Check the purchase email with the seller." }); return; }
      } finally { clearTimeout(deadline); if (writeController === controller) writeController = null; }
      if (!current(acceptLease)) return;
      update({ phase: payload.ownsProfile === true ? "accepted" : "completed", signedIn: true, canAccept: false, transfer: payload.transfer!, permanentPath: payload.permanentPath || "/i/" + payload.transfer!.guitarQrCode, message: payload.ownsProfile === true ? "Your Profile is now in your collection. Its permanent QR link and recorded history stay with the instrument." : "This handoff was already completed. The Profile is now managed by another owner." });
    } catch {
      if (active && epoch === lease.epoch && mutation === operation && (current(lease) || (!lease.actor && acceptedActor === actor && identityRevision === lease.revision + 1))) {
        outcomeUncertain = sentAcceptance;
        update({ uncertain: outcomeUncertain, canAccept: outcomeUncertain ? false : state.canAccept, message: outcomeUncertain ? "Acceptance could not be confirmed. Check the saved status before trying again." : "The request could not be confirmed. Check your connection and try again." });
      }
    } finally {
      clearTimeout(timer);
      if (mutation === operation) {
        mutation = null;
        if (active && epoch === lease.epoch) {
          update({ busy: false });
          if (isChecking() && !outcomeUncertain) void reload();
        }
      }
    }
  }
  return { reload, requestCode: (email: string) => run("send", email), verifyAndAccept: (email: string, code: string) => run("verify", email, code), accept: () => run("accept"),
    dispose() { active = false; epoch++; readRevision++; readController?.abort(); writeController?.abort(); listener.subscription.unsubscribe(); } };
}
