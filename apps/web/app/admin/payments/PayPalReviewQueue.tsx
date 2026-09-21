"use client";

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
  const [state, setState] = useState(initialPayPalAdminReviewsState), [selection, setSelection] = useState({ actorId: "", eventId: "" });
  const [deliverySelection, setDeliverySelection] = useState({ actorId: "", deliveryId: "" });
  const controller = useRef<ReturnType<typeof createPayPalAdminReviewsClient> | null>(null);
  useEffect(() => {
    const current = createPayPalAdminReviewsClient({ auth: () => createBrowserSupabaseClient().auth });
    controller.current = current; const unsubscribe = current.subscribe(setState); setState(current.getState()); void current.start();
    return () => { unsubscribe(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, []);
  const selected = selection.actorId === state.actorId ? state.reviews.find(review => review.eventId === selection.eventId) : undefined;
  const selectedDelivery = deliverySelection.actorId === state.actorId ? state.deliveries.find(delivery => delivery.deliveryId === deliverySelection.deliveryId) : undefined;
  if (state.phase === "signed-out") return null;
  return <section aria-labelledby="paypal-review-heading">
    <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Automatic PayPal exceptions</p><h2 id="paypal-review-heading">Resolve verified payment holds</h2></div>
      {(state.phase === "ready" || state.phase === "error") && <button className={styles.secondary} disabled={state.busy || state.refreshing} onClick={() => void controller.current?.reload()}><RefreshCw size={16} aria-hidden="true" />{state.refreshing ? "Checking…" : "Refresh holds"}</button>}
    </div>
    <p className={styles.intro}>PayPal’s verified refund, dispute, reversal, and late-capture evidence appears here. Decisions only keep or release an existing credit hold. They cannot create a payment, grant credits, or send a refund.</p>
    {state.phase === "loading" && <p role="status">Loading verified PayPal holds…</p>}
    {state.phase === "error" && <section className={`${styles.notice} ${styles.error}`} role="alert"><h2>Automatic payment review is unavailable.</h2><p>{state.message}</p></section>}
    {state.phase === "ready" && <>
      {state.environment === "test" && <section className={`${styles.notice} ${styles.warning}`}><strong>Test ledger</strong><p>These decisions affect only the isolated test billing ledger.</p></section>}
      {state.message && <p role="status" className={styles.errorText}>{state.message}</p>}
      {state.pendingDecision && <section className={`${styles.notice} ${styles.warning}`}><h2>A payment operation needs confirmation.</h2><p>The response was interrupted. Retry the exact saved operation before choosing another.</p><button className={styles.secondary} disabled={state.busy || state.refreshing} onClick={() => void controller.current?.retryDecision()}>{state.busy ? "Checking…" : "Retry saved operation"}</button></section>}
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Webhook delivery health</p><h2>Recover interrupted PayPal events</h2></div></div>
      <p className={styles.intro}>This queue contains nonterminal or quarantined PayPal deliveries. A continuation is audited and advances one bounded delivery step with at most one financial effect; it does not bypass PayPal verification or grant credits by itself.</p>
      <div className={styles.adminGrid}><section aria-label="PayPal webhook deliveries" className={styles.queue}>
        {!state.deliveries.length && <div className={styles.notice}><h2>No interrupted deliveries.</h2><p>PayPal’s durable delivery queue has no pending or quarantined items.</p></div>}
        {state.deliveries.map(delivery => <button type="button" className={styles.queueItem} key={delivery.deliveryId} aria-pressed={selectedDelivery?.deliveryId === delivery.deliveryId} disabled={state.busy} onClick={() => setDeliverySelection({ actorId: state.actorId, deliveryId: delivery.deliveryId })}>
          <strong>{delivery.state === "quarantined" ? "Quarantined" : delivery.state === "retry" ? "Retry scheduled" : "Processing pending"} · {delivery.eventType || "Unverified event"}</strong>
          <span>{delivery.eventId || delivery.deliveryId}</span>
          <span>Progress {delivery.cursor}/{delivery.totalItems ?? "?"} · attempt {delivery.attemptCount}</span>
          <span>{delivery.lastErrorCode ? `Error ${delivery.lastErrorCode}` : `Updated ${new Date(delivery.updatedAt).toLocaleString()}`}</span>
        </button>)}
      </section><section aria-label="Selected PayPal delivery"><div className={styles.notice}>{selectedDelivery
        ? <ReviewDelivery key={`${state.actorId}:${selectedDelivery.deliveryId}:${selectedDelivery.state}`} delivery={selectedDelivery} busy={state.busy || state.refreshing || Boolean(state.pendingDecision)} retry={body => controller.current?.retryDelivery(body) || Promise.resolve(false)} acknowledge={body => controller.current?.acknowledgeDelivery(body) || Promise.resolve(false)} />
        : <><h2>Choose a delivery to inspect.</h2><p>Continue a queued delivery, retry a failed delivery, or acknowledge an irrecoverable alert after investigation.</p></>}</div></section></div>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Credit safety</p><h2>Active PayPal holds</h2></div></div>
      <div className={styles.adminGrid}><section aria-label="Automatic PayPal holds" className={styles.queue}>
        {!state.reviews.length && <div className={styles.notice}><h2>No active PayPal holds.</h2><p>Verified payment exceptions will appear here until an administrator releases the corresponding hold.</p></div>}
        {state.reviews.map(review => <button type="button" className={styles.queueItem} key={review.eventId} aria-pressed={selected?.eventId === review.eventId} disabled={state.busy} onClick={() => setSelection({ actorId: state.actorId, eventId: review.eventId })}>
          <strong>{reasonLabels[review.holdReason] || review.holdReason} · {review.reference}</strong>
          <span>{money(review.expectedAmount)} · {review.credits} Profile {review.credits === 1 ? "credit" : "credits"}</span>
          <span>{review.eventType || review.receiptKind} · {new Date(review.createdAt).toLocaleString()}</span>
          <span>Account {review.ownerId}</span>
        </button>)}
        {state.hasMore && <p className={styles.muted}>More active holds exist. Resolve the visible cases, then refresh the queue.</p>}
      </section><section aria-label="Selected automatic PayPal hold"><div className={styles.notice}>{selected
        ? <ReviewHold key={`${state.actorId}:${selected.eventId}`} review={selected} busy={state.busy || state.refreshing || Boolean(state.pendingDecision)} decide={body => controller.current?.decide(body) || Promise.resolve(false)} />
        : <><h2>Choose a verified hold.</h2><p>Compare the allowlisted provider event, resource, status, and amount with the case in PayPal before deciding.</p></>}</div></section></div>
    </>}
  </section>;
}

export function ReviewDelivery({ delivery, busy, retry, acknowledge }: { delivery: PayPalWebhookDelivery; busy: boolean; retry(body: { deliveryId: string; reason: string }): Promise<boolean>; acknowledge(body: { deliveryId: string; reason: string }): Promise<boolean> }) {
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
  return <><p className={styles.eyebrow}>{delivery.state}</p><h2>{delivery.eventType || "Unverified PayPal event"}</h2><dl className={styles.orderMeta}>
    <dt>Delivery</dt><dd>{delivery.deliveryId}</dd><dt>Provider event</dt><dd>{delivery.eventId || "Not verified yet"}</dd>
    <dt>Progress</dt><dd>{delivery.cursor} of {delivery.totalItems ?? "unknown"} items · {delivery.attemptCount} attempts</dd>
    <dt>Last error</dt><dd>{delivery.lastErrorCode || "None recorded"}</dd><dt>Next attempt</dt><dd>{new Date(delivery.nextAttemptAt).toLocaleString()}</dd>
    <dt>Lease</dt><dd>{delivery.lockedUntil ? `Processing lease until ${new Date(delivery.lockedUntil).toLocaleString()}` : "No active processor lease"}</dd>
    <dt>Received</dt><dd>{new Date(delivery.receivedAt).toLocaleString()}</dd><dt>Updated</dt><dd>{new Date(delivery.updatedAt).toLocaleString()}</dd>
    <dt>Recovery material</dt><dd>{delivery.rawAvailable ? "Signed payload available to the server" : delivery.continuationAvailable ? "Verified frozen plan available" : "Expired or unavailable"}</dd>
  </dl>{retryable || acknowledgeable ? <form onSubmit={event => void submit(event)}>
    <p className={styles.muted}>{retryable ? "This audited action makes the delivery eligible now and runs one bounded processing step with at most one financial effect. Provider verification and ledger idempotency still apply." : "The short-term verification payload has expired. Acknowledging removes this delivery alert after investigation. It does not resolve or release any financial hold, grant credits, create a payment, or invent a replacement event."}</p>
    <label className={styles.checkField}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} required /><span>{retryable ? "I reviewed this delivery’s status and want to run one audited continuation step." : "I investigated this irrecoverable delivery alert and understand that its financial holds remain separate."}</span></label>
    <label className={styles.field}>{retryable ? "Reason for continuation" : "Investigation outcome"}<textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} maxLength={1000} minLength={10} disabled={busy} required /><span>At least 10 characters. {retryable ? "Record why another processing step is appropriate." : "Record the provider and ledger checks completed before acknowledging."}</span></label>
    <button type="submit" className={styles.primary} disabled={!canSubmit}>{busy ? "Saving…" : retryable ? "Continue one delivery step" : "Acknowledge delivery alert"}</button>
  </form> : <p>This delivery has an active processor lease. Refresh after the lease ends; no operator reset is available while another process owns it.</p>}</>;
}

export function ReviewHold({ review, busy, decide }: { review: PayPalAdminReview; busy: boolean; decide(body: { action: PayPalReviewAction; eventId: string; orderId: string; ownerId: string; reason: string }): Promise<boolean> }) {
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
      <dt>Expected purchase</dt><dd>{money(review.expectedAmount)} USD · {review.credits} Profile {review.credits === 1 ? "credit" : "credits"}</dd>
      <dt>Provider event</dt><dd>{review.eventType || "Not supplied"}{review.providerEventId ? ` · ${review.providerEventId}` : ""}{review.eventCursor !== null ? ` · item ${review.eventCursor + 1}` : ""}</dd>
      <dt>Provider resource</dt><dd>{resource}</dd>
      <dt>Provider case</dt><dd>{review.caseId || review.disputeId || review.refundId || "Not supplied"}</dd>
      <dt>PayPal order</dt><dd>{review.paypalOrderId || "Not supplied"}</dd>
      <dt>Capture</dt><dd>{review.captureId || "Not supplied"}</dd>
      <dt>Provider status</dt><dd>{review.providerStatus || "Not supplied"}</dd>
      <dt>Verified event amount</dt><dd>{review.amount === null ? "Not supplied" : money(review.amount, review.currency || "USD")}</dd>
      <dt>Customer account</dt><dd>{review.ownerId}</dd>
      <dt>Hold created</dt><dd>{new Date(review.createdAt).toLocaleString()}</dd>
    </dl>
    {review.lastDecision && <section className={`${styles.notice} ${styles.warning}`}><strong>Hold retained after review</strong><p>{review.lastDecision.reason} · {new Date(review.lastDecision.createdAt).toLocaleString()}</p></section>}
    <form onSubmit={event => void submit(event)}>
      <label className={styles.field}>Decision<select value={action} disabled={busy} onChange={event => { setAction(event.target.value as PayPalReviewAction); setConfirmed(false); }}><option value="retain_hold">Keep paid credits on hold</option><option value="release">Release this hold</option></select></label>
      <p className={styles.muted}>{action === "release" ? "Release only after PayPal shows the case is resolved and the remaining paid credits are safe to use. Other active holds can still keep the account paused." : "Retaining records an audited review and leaves the account’s paid credits unavailable."}</p>
      <label className={styles.checkField}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} required /><span>{action === "release" ? "I verified the provider case is resolved and this specific hold can be released." : "I reviewed the provider evidence and this hold must remain active."}</span></label>
      <label className={styles.field}>Reason for the audit trail<textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} maxLength={1000} minLength={10} disabled={busy} required /><span>At least 10 characters. Include the PayPal case outcome or the facts that require continued review.</span></label>
      <button type="submit" className={styles.primary} disabled={!canSubmit}>{busy ? "Saving…" : action === "release" ? "Release this hold" : "Record review and keep hold"}</button>
    </form>
  </>;
}
