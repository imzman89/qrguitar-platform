"use client";
import { useUiText } from "../../../components/UiTextProvider";


import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";
import { createPayPalAdminReviewsClient, initialPayPalAdminReviewsState } from "../../../lib/paypal-admin-reviews-client";
import type { PayPalAdminReview, PayPalReviewAction, PayPalWebhookDelivery } from "../../../lib/paypal-admin-reviews";
import styles from "./payments.module.css";

const money = (amount: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
const reasonLabels: Record<string, string> = {
  refund: "Refund", refund_pending: "Pending refund", dispute: "Dispute", reversal: "Reversal",
  payment_approval_reversed: "Payment approval reversed", late_payment_after_expiry: "Late capture after order expiry",
  payment_failed_after_capture: "Failure reported after capture"
};

export default function PayPalReviewQueue() {
  const ui = useUiText("app.admin.payments.PayPalReviewQueue");
  const [state, setState] = useState(initialPayPalAdminReviewsState), [selection, setSelection] = useState({ actorId: "", eventId: "" });
  const [deliverySelection, setDeliverySelection] = useState({ actorId: "", deliveryId: "" });
  const [orderReference, setOrderReference] = useState("");
  const controller = useRef<ReturnType<typeof createPayPalAdminReviewsClient> | null>(null);
  useEffect(() => {
    const current = createPayPalAdminReviewsClient({ auth: () => createBrowserSupabaseClient().auth });
    controller.current = current; const unsubscribe = current.subscribe(setState); setState(current.getState()); void current.start();
    return () => { unsubscribe(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, []);
  const selected = selection.actorId === state.actorId ? state.reviews.find(review => review.eventId === selection.eventId) : undefined;
  const selectedDelivery = deliverySelection.actorId === state.actorId ? state.deliveries.find(delivery => delivery.deliveryId === deliverySelection.deliveryId) : undefined;
  useEffect(() => { setOrderReference(""); setSelection({ actorId: "", eventId: "" }); }, [state.actorId]);
  if (state.phase === "signed-out") return null;
  return <section aria-labelledby="paypal-review-heading">
    <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{ui("ui.app.admin.payments.PayPalReviewQueue.3de6b4aace7b", "Automatic PayPal exceptions")}</p><h2 id="paypal-review-heading">{ui("ui.app.admin.payments.PayPalReviewQueue.dd82d114dfb6", "Resolve verified payment holds")}</h2></div>
      {(state.phase === "ready" || state.phase === "error") && <button className={styles.secondary} disabled={state.busy || state.refreshing} onClick={() => void controller.current?.reload()}><RefreshCw size={16} aria-hidden="true" />{state.refreshing ? ui("ui.app.admin.payments.PayPalReviewQueue.ec963ffc911b", "Checking…") : ui("ui.app.admin.payments.PayPalReviewQueue.9b6ac0bb92b0", "Refresh holds")}</button>}
    </div>
    <p className={styles.intro}>{ui("ui.app.admin.payments.PayPalReviewQueue.7b7a25b992ba", "PayPal’s verified refund, dispute, reversal, and late-capture evidence appears here. Decisions only keep or release an existing credit hold. They cannot create a payment, grant credits, or send a refund.")}</p>
    {(state.phase === "ready" || state.phase === "error") ? <form className={styles.notice} onSubmit={event => { event.preventDefault(); void controller.current?.findOrder(orderReference); }}>
      <label>{ui("ui.app.admin.payments.PayPalReviewQueue.findOrderLabel", "Find a held order by full reference")}<input value={orderReference} onChange={event => setOrderReference(event.target.value)} placeholder="QRG-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" disabled={state.busy || state.refreshing} /></label>
      <button className={styles.secondary} type="submit" disabled={state.busy || state.refreshing || !orderReference.trim()}>{ui("ui.app.admin.payments.PayPalReviewQueue.findOrder", "Find order (read only)")}</button>
      {state.orderId ? <><p>{ui("ui.app.admin.payments.PayPalReviewQueue.filteredOrder", "Showing holds for")}: QRG-{state.orderId}</p><button className={styles.secondary} type="button" disabled={state.busy || state.refreshing} onClick={() => void controller.current?.showAll()}>{ui("ui.app.admin.payments.PayPalReviewQueue.backToQueue", "Back to all holds")}</button></> : null}
      <p>{ui("ui.app.admin.payments.PayPalReviewQueue.lookupHelp", "Lookup does not release or change a hold. Use it to find older retained cases outside the first 100 results.")}</p>
    </form> : null}
    {state.phase === "loading" && <p role="status">{ui("ui.app.admin.payments.PayPalReviewQueue.2f17062702dd", "Loading verified PayPal holds…")}</p>}
    {state.phase === "error" && <section className={`${styles.notice} ${styles.error}`} role="alert"><h2>{ui("ui.app.admin.payments.PayPalReviewQueue.3c11457acff5", "Automatic payment review is unavailable.")}</h2><p>{state.message}</p></section>}
    {state.phase === "ready" && <>
      {state.environment === "test" && <section className={`${styles.notice} ${styles.warning}`}><strong>{ui("ui.app.admin.payments.PayPalReviewQueue.54fae98910f3", "Test ledger")}</strong><p>{ui("ui.app.admin.payments.PayPalReviewQueue.86ca17c81267", "These decisions affect only the isolated test billing ledger.")}</p></section>}
      {state.message && <p role="status" className={styles.errorText}>{state.message}</p>}
      {state.pendingDecision && <section className={`${styles.notice} ${styles.warning}`}><h2>{ui("ui.app.admin.payments.PayPalReviewQueue.d0fe264a967c", "A payment operation needs confirmation.")}</h2><p>{ui("ui.app.admin.payments.PayPalReviewQueue.7d3f5a212283", "The response was interrupted. Retry the exact saved operation before choosing another.")}</p><button className={styles.secondary} disabled={state.busy || state.refreshing} onClick={() => void controller.current?.retryDecision()}>{state.busy ? ui("ui.app.admin.payments.PayPalReviewQueue.ec963ffc911b", "Checking…") : ui("ui.app.admin.payments.PayPalReviewQueue.2a7368352ee1", "Retry saved operation")}</button></section>}
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{ui("ui.app.admin.payments.PayPalReviewQueue.e144af1d6903", "Webhook delivery health")}</p><h2>{ui("ui.app.admin.payments.PayPalReviewQueue.a47306c43346", "Recover interrupted PayPal events")}</h2></div></div>
      <p className={styles.intro}>{ui("ui.app.admin.payments.PayPalReviewQueue.059cb822132b", "This queue contains nonterminal or quarantined PayPal deliveries. A continuation is audited and advances one bounded delivery step with at most one financial effect; it does not bypass PayPal verification or grant credits by itself.")}</p>
      <div className={styles.adminGrid}><section aria-label={ui("ui.app.admin.payments.PayPalReviewQueue.5c3878c771b9", "PayPal webhook deliveries")} className={styles.queue}>
        {!state.deliveries.length && <div className={styles.notice}><h2>{ui("ui.app.admin.payments.PayPalReviewQueue.4eb90626332b", "No interrupted deliveries.")}</h2><p>{ui("ui.app.admin.payments.PayPalReviewQueue.bf9123b4fb85", "PayPal’s durable delivery queue has no pending or quarantined items.")}</p></div>}
        {state.deliveries.map(delivery => <button type="button" className={styles.queueItem} key={delivery.deliveryId} aria-pressed={selectedDelivery?.deliveryId === delivery.deliveryId} disabled={state.busy} onClick={() => setDeliverySelection({ actorId: state.actorId, deliveryId: delivery.deliveryId })}>
          <strong>{delivery.state === "quarantined" ? ui("ui.app.admin.payments.PayPalReviewQueue.bb132e07e0f3", "Quarantined") : delivery.state === "retry" ? ui("ui.app.admin.payments.PayPalReviewQueue.5b6d7aa6820c", "Retry scheduled") : ui("ui.app.admin.payments.PayPalReviewQueue.8b856f7ac093", "Processing pending")} · {delivery.eventType || ui("ui.app.admin.payments.PayPalReviewQueue.e7b85f94ce9c", "Unverified event")}</strong>
          <span>{delivery.eventId || delivery.deliveryId}</span>
          <span>{ui("ui.app.admin.payments.PayPalReviewQueue.4664827f8e89", "Progress")}{" "}{delivery.cursor}/{delivery.totalItems ?? "?"}{" "}{ui("ui.app.admin.payments.PayPalReviewQueue.b5b927b44b84", "· attempt")}{" "}{delivery.attemptCount}</span>
          <span>{delivery.lastErrorCode ? ui("ui.app.admin.payments.PayPalReviewQueue.7869b54640f8", "Error {{value1}}", { value1: delivery.lastErrorCode }) : ui("ui.app.admin.payments.PayPalReviewQueue.0041fafff42a", "Updated {{value1}}", { value1: new Date(delivery.updatedAt).toLocaleString() })}</span>
        </button>)}
      </section><section aria-label={ui("ui.app.admin.payments.PayPalReviewQueue.a53ce07fa503", "Selected PayPal delivery")}><div className={styles.notice}>{selectedDelivery
        ? <ReviewDelivery key={`${state.actorId}:${selectedDelivery.deliveryId}:${selectedDelivery.state}`} delivery={selectedDelivery} busy={state.busy || state.refreshing || Boolean(state.pendingDecision)} retry={body => controller.current?.retryDelivery(body) || Promise.resolve(false)} acknowledge={body => controller.current?.acknowledgeDelivery(body) || Promise.resolve(false)} />
        : <><h2>{ui("ui.app.admin.payments.PayPalReviewQueue.2198e94dc4e6", "Choose a delivery to inspect.")}</h2><p>{ui("ui.app.admin.payments.PayPalReviewQueue.fdbe640cefad", "Continue a queued delivery, retry a failed delivery, or acknowledge an irrecoverable alert after investigation.")}</p></>}</div></section></div>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{ui("ui.app.admin.payments.PayPalReviewQueue.0dbe17366cfa", "Credit safety")}</p><h2>{ui("ui.app.admin.payments.PayPalReviewQueue.007f184f2249", "Active PayPal holds")}</h2></div></div>
      <div className={styles.adminGrid}><section aria-label={ui("ui.app.admin.payments.PayPalReviewQueue.aec6e81fe48a", "Automatic PayPal holds")} className={styles.queue}>
        {!state.reviews.length && <div className={styles.notice}><h2>{ui("ui.app.admin.payments.PayPalReviewQueue.297828dd1779", "No active PayPal holds.")}</h2><p>{ui("ui.app.admin.payments.PayPalReviewQueue.4e5b0ed8e55c", "Verified payment exceptions will appear here until an administrator releases the corresponding hold.")}</p></div>}
        {state.reviews.map(review => <button type="button" className={styles.queueItem} key={review.eventId} aria-pressed={selected?.eventId === review.eventId} disabled={state.busy} onClick={() => setSelection({ actorId: state.actorId, eventId: review.eventId })}>
          <strong>{reasonLabels[review.holdReason] || review.holdReason} · {review.reference}</strong>
          <span>{money(review.expectedAmount)} · {review.credits}{" "}{ui("ui.app.admin.payments.PayPalReviewQueue.d696a35bdd18", "Profile")}{" "}{review.credits === 1 ? ui("ui.app.admin.payments.PayPalReviewQueue.ecc4873a1694", "credit") : ui("ui.app.admin.payments.PayPalReviewQueue.be379a30f1aa", "credits")}</span>
          <span>{review.eventType || review.receiptKind} · {new Date(review.createdAt).toLocaleString()}</span>
          <span>{ui("ui.app.admin.payments.PayPalReviewQueue.7e1b0d5641f2", "Account")}{" "}{review.ownerId}</span>
        </button>)}
        {state.hasMore && <p className={styles.muted}>{ui("ui.app.admin.payments.PayPalReviewQueue.moreHoldsLookup", "More active holds exist. Find an older case by its full order reference above; no hold needs to be released to navigate.")}</p>}
      </section><section aria-label={ui("ui.app.admin.payments.PayPalReviewQueue.e968a1d1b3bf", "Selected automatic PayPal hold")}><div className={styles.notice}>{selected
        ? <ReviewHold key={`${state.actorId}:${selected.eventId}`} review={selected} busy={state.busy || state.refreshing || Boolean(state.pendingDecision)} decide={body => controller.current?.decide(body) || Promise.resolve(false)} />
        : <><h2>{ui("ui.app.admin.payments.PayPalReviewQueue.2017b02ce236", "Choose a verified hold.")}</h2><p>{ui("ui.app.admin.payments.PayPalReviewQueue.f6d008c4de41", "Compare the allowlisted provider event, resource, status, and amount with the case in PayPal before deciding.")}</p></>}</div></section></div>
    </>}
  </section>;
}

export function ReviewDelivery({ delivery, busy, retry, acknowledge }: { delivery: PayPalWebhookDelivery; busy: boolean; retry(body: { deliveryId: string; reason: string }): Promise<boolean>; acknowledge(body: { deliveryId: string; reason: string }): Promise<boolean> }) {
  const ui = useUiText("app.admin.payments.PayPalReviewQueue");
  const [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  const expiredLease = delivery.state === "processing" && Boolean(delivery.lockedUntil) && Date.parse(delivery.lockedUntil!) <= Date.now();
  const retryable = delivery.continuationAvailable === true && (["queued", "verified", "planned", "retry", "quarantined"].includes(delivery.state) || expiredLease);
  const acknowledgeable = delivery.state === "quarantined" && delivery.continuationAvailable === false, canSubmit = (retryable || acknowledgeable) && !busy && confirmed && reason.trim().length >= 10;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    const body = { deliveryId: delivery.deliveryId, reason: reason.replace(/[\r\n\t]+/g, " ").trim() };
    if (await (retryable ? retry(body) : acknowledge(body))) {
      setReason("");
      setConfirmed(false);
    }
  }
  return <><p className={styles.eyebrow}>{delivery.state}</p><h2>{delivery.eventType || ui("ui.app.admin.payments.PayPalReviewQueue.c7320091c81a", "Unverified PayPal event")}</h2><dl className={styles.orderMeta}>
    <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.52bfe584a5fc", "Delivery")}</dt><dd>{delivery.deliveryId}</dd><dt>{ui("ui.app.admin.payments.PayPalReviewQueue.1d10bcb2277d", "Provider event")}</dt><dd>{delivery.eventId || ui("ui.app.admin.payments.PayPalReviewQueue.0f32872bb6d9", "Not verified yet")}</dd>
    <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.4664827f8e89", "Progress")}</dt><dd>{delivery.cursor}{" "}{ui("ui.app.admin.payments.PayPalReviewQueue.28391d3bc64e", "of")}{" "}{delivery.totalItems ?? ui("ui.app.admin.payments.PayPalReviewQueue.b23a6a8439c0", "unknown")}{" "}{ui("ui.app.admin.payments.PayPalReviewQueue.8726418e59e7", "items ·")}{" "}{delivery.attemptCount}{" "}{ui("ui.app.admin.payments.PayPalReviewQueue.1ac7d61d1d29", "attempts")}</dd>
    <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.5488d837f5f6", "Last error")}</dt><dd>{delivery.lastErrorCode || ui("ui.app.admin.payments.PayPalReviewQueue.aab6c5e60535", "None recorded")}</dd><dt>{ui("ui.app.admin.payments.PayPalReviewQueue.94158821ee38", "Next attempt")}</dt><dd>{new Date(delivery.nextAttemptAt).toLocaleString()}</dd>
    <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.a789e9e05ec6", "Lease")}</dt><dd>{delivery.lockedUntil ? ui("ui.app.admin.payments.PayPalReviewQueue.35947ea186fd", "Processing lease until {{value1}}", { value1: new Date(delivery.lockedUntil).toLocaleString() }) : ui("ui.app.admin.payments.PayPalReviewQueue.8b3c74d85f65", "No active processor lease")}</dd>
    <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.49f19beeecf4", "Received")}</dt><dd>{new Date(delivery.receivedAt).toLocaleString()}</dd><dt>{ui("ui.app.admin.payments.PayPalReviewQueue.3a5ecca188c0", "Updated")}</dt><dd>{new Date(delivery.updatedAt).toLocaleString()}</dd>
    <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.e95aab8d1b57", "Recovery material")}</dt><dd>{delivery.rawAvailable ? ui("ui.app.admin.payments.PayPalReviewQueue.37accfb28ef1", "Signed payload available to the server") : delivery.continuationAvailable ? ui("ui.app.admin.payments.PayPalReviewQueue.a488fdcd1450", "Verified frozen plan available") : ui("ui.app.admin.payments.PayPalReviewQueue.40b2d645e8ce", "Expired or unavailable")}</dd>
  </dl>{retryable || acknowledgeable ? <form onSubmit={event => void submit(event)}>
    <p className={styles.muted}>{retryable ? ui("ui.app.admin.payments.PayPalReviewQueue.76249636420d", "This audited action makes the delivery eligible now and runs one bounded processing step with at most one financial effect. Provider verification and ledger idempotency still apply.") : ui("ui.app.admin.payments.PayPalReviewQueue.ec7daef3f929", "The short-term verification payload has expired. Acknowledging removes this delivery alert after investigation. It does not resolve or release any financial hold, grant credits, create a payment, or invent a replacement event.")}</p>
    <label className={styles.checkField}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} required /><span>{retryable ? ui("ui.app.admin.payments.PayPalReviewQueue.2e2d4fb6c11d", "I reviewed this delivery’s status and want to run one audited continuation step.") : ui("ui.app.admin.payments.PayPalReviewQueue.1de73c5f6723", "I investigated this irrecoverable delivery alert and understand that its financial holds remain separate.")}</span></label>
    <label className={styles.field}>{retryable ? ui("ui.app.admin.payments.PayPalReviewQueue.60bf1a60ab92", "Reason for continuation") : ui("ui.app.admin.payments.PayPalReviewQueue.f234502545f0", "Investigation outcome")}<textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} maxLength={1000} minLength={10} disabled={busy} required /><span>{ui("ui.app.admin.payments.PayPalReviewQueue.9a3c970787ac", "At least 10 characters.")}{" "}{retryable ? ui("ui.app.admin.payments.PayPalReviewQueue.5dfea02a5bae", "Record why another processing step is appropriate.") : ui("ui.app.admin.payments.PayPalReviewQueue.14fb10590703", "Record the provider and ledger checks completed before acknowledging.")}</span></label>
    <button type="submit" className={styles.primary} disabled={!canSubmit}>{busy ? ui("ui.app.admin.payments.PayPalReviewQueue.23e39291d613", "Saving…") : retryable ? ui("ui.app.admin.payments.PayPalReviewQueue.9b315e36be4b", "Continue one delivery step") : ui("ui.app.admin.payments.PayPalReviewQueue.fe4f47a7644c", "Acknowledge delivery alert")}</button>
  </form> : <p>{ui("ui.app.admin.payments.PayPalReviewQueue.60c977ad6754", "This delivery has an active processor lease. Refresh after the lease ends; no operator reset is available while another process owns it.")}</p>}</>;
}

export function ReviewHold({ review, busy, decide }: { review: PayPalAdminReview; busy: boolean; decide(body: { action: PayPalReviewAction; eventId: string; orderId: string; ownerId: string; reason: string }): Promise<boolean> }) {
  const ui = useUiText("app.admin.payments.PayPalReviewQueue");
  const [action, setAction] = useState<PayPalReviewAction>("retain_hold"), [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  const canSubmit = !busy && confirmed && reason.trim().length >= 10;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!canSubmit) return;
    if (await decide({ action, eventId: review.eventId, orderId: review.orderId, ownerId: review.ownerId, reason: reason.replace(/[\r\n\t]+/g, " ").trim() })) {
      setReason("");
      setConfirmed(false);
    }
  }
  const resource = review.resourceKind && review.resourceId ? `${review.resourceKind} · ${review.resourceId}` : review.refundId ? `refund · ${review.refundId}` : review.disputeId ? `dispute · ${review.disputeId}` : review.caseId ? `case · ${review.caseId}` : "Not supplied";
  return <><p className={styles.eyebrow}>{reasonLabels[review.holdReason] || review.holdReason}</p><h2>{review.reference}</h2>
    <dl className={styles.orderMeta}>
      <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.a59577ea660d", "Expected purchase")}</dt><dd>{money(review.expectedAmount)}{" "}{ui("ui.app.admin.payments.PayPalReviewQueue.179cfdb33651", "USD ·")}{" "}{review.credits}{" "}{ui("ui.app.admin.payments.PayPalReviewQueue.d696a35bdd18", "Profile")}{" "}{review.credits === 1 ? ui("ui.app.admin.payments.PayPalReviewQueue.ecc4873a1694", "credit") : ui("ui.app.admin.payments.PayPalReviewQueue.be379a30f1aa", "credits")}</dd>
      <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.1d10bcb2277d", "Provider event")}</dt><dd>{review.eventType || ui("ui.app.admin.payments.PayPalReviewQueue.8b427d8a72e0", "Not supplied")}{review.providerEventId ? ui("ui.app.admin.payments.PayPalReviewQueue.25b1fe3f0719", " · {{value1}}", { value1: review.providerEventId }) : ""}{review.eventCursor !== null ? ui("ui.app.admin.payments.PayPalReviewQueue.45bcaf31e667", " · item {{value1}}", { value1: review.eventCursor + 1 }) : ""}</dd>
      <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.9dcadbf3f343", "Provider resource")}</dt><dd>{resource}</dd>
      <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.9223e5c6b800", "Provider case")}</dt><dd>{review.caseId || review.disputeId || review.refundId || ui("ui.app.admin.payments.PayPalReviewQueue.8b427d8a72e0", "Not supplied")}</dd>
      <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.48dfa22dab2a", "PayPal order")}</dt><dd>{review.paypalOrderId || ui("ui.app.admin.payments.PayPalReviewQueue.8b427d8a72e0", "Not supplied")}</dd>
      <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.1900b478a586", "Capture")}</dt><dd>{review.captureId || ui("ui.app.admin.payments.PayPalReviewQueue.8b427d8a72e0", "Not supplied")}</dd>
      <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.231b7f031691", "Provider status")}</dt><dd>{review.providerStatus || ui("ui.app.admin.payments.PayPalReviewQueue.8b427d8a72e0", "Not supplied")}</dd>
      <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.b7fbf33bb9f5", "Verified event amount")}</dt><dd>{review.amount === null ? ui("ui.app.admin.payments.PayPalReviewQueue.8b427d8a72e0", "Not supplied") : money(review.amount, review.currency || "USD")}</dd>
      <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.6b8d54126b89", "Customer account")}</dt><dd>{review.ownerId}</dd>
      <dt>{ui("ui.app.admin.payments.PayPalReviewQueue.b5cb70e4f149", "Hold created")}</dt><dd>{new Date(review.createdAt).toLocaleString()}</dd>
    </dl>
    {review.lastDecision && <section className={`${styles.notice} ${styles.warning}`}><strong>{ui("ui.app.admin.payments.PayPalReviewQueue.1bd11616c883", "Hold retained after review")}</strong><p>{review.lastDecision.reason} · {new Date(review.lastDecision.createdAt).toLocaleString()}</p></section>}
    <form onSubmit={event => void submit(event)}>
      <label className={styles.field}>{ui("ui.app.admin.payments.PayPalReviewQueue.640ae4baf960", "Decision")}<select value={action} disabled={busy} onChange={event => { setAction(event.target.value as PayPalReviewAction); setConfirmed(false); }}><option value="retain_hold">{ui("ui.app.admin.payments.PayPalReviewQueue.80c2c5c410ea", "Keep paid credits on hold")}</option><option value="release">{ui("ui.app.admin.payments.PayPalReviewQueue.db9941468bfe", "Release this hold")}</option></select></label>
      <p className={styles.muted}>{action === "release" ? ui("ui.app.admin.payments.PayPalReviewQueue.577d423818b2", "Release only after PayPal shows the case is resolved and the remaining paid credits are safe to use. Other active holds can still keep the account paused.") : ui("ui.app.admin.payments.PayPalReviewQueue.0d0e6da87b42", "Retaining records an audited review and leaves the account’s paid credits unavailable.")}</p>
      <label className={styles.checkField}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} required /><span>{action === "release" ? ui("ui.app.admin.payments.PayPalReviewQueue.209d335b7cae", "I verified the provider case is resolved and this specific hold can be released.") : ui("ui.app.admin.payments.PayPalReviewQueue.b2f4ec565c90", "I reviewed the provider evidence and this hold must remain active.")}</span></label>
      <label className={styles.field}>{ui("ui.app.admin.payments.PayPalReviewQueue.8b7149d3bc93", "Reason for the audit trail")}<textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} maxLength={1000} minLength={10} disabled={busy} required /><span>{ui("ui.app.admin.payments.PayPalReviewQueue.354a2610954a", "At least 10 characters. Include the PayPal case outcome or the facts that require continued review.")}</span></label>
      <button type="submit" className={styles.primary} disabled={!canSubmit}>{busy ? ui("ui.app.admin.payments.PayPalReviewQueue.23e39291d613", "Saving…") : action === "release" ? ui("ui.app.admin.payments.PayPalReviewQueue.db9941468bfe", "Release this hold") : ui("ui.app.admin.payments.PayPalReviewQueue.c0ffc0c91415", "Record review and keep hold")}</button>
    </form>
  </>;
}
