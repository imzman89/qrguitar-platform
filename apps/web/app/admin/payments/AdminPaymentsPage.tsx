"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Nav } from "../../../components/Nav";
import { Footer } from "../../../components/Footer";
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";
import { createAdminPaymentsClient, initialAdminPaymentsState } from "../../../lib/direct-payments-client";
import type { DirectOrder } from "../../../lib/direct-payments";
import PayPalReviewQueue from "./PayPalReviewQueue";
import styles from "../../billing/billing.module.css";

const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount / 100);
const label = (method: string) => method === "cashapp" ? "Cash App" : method === "venmo" ? "Venmo" : method === "paypal" ? "PayPal checkout" : "Zelle";
const statuses = { awaiting_payment: "Awaiting payment", pending_review: "Reported · needs review", fulfilled: "Credits granted", closed: "Closed" };
export default function AdminPaymentsPage() {
  const [state, setState] = useState(initialAdminPaymentsState), [selection, setSelection] = useState({ actorId: "", orderId: "" });
  const [search, setSearch] = useState({ actorId: "", value: "" });
  const controller = useRef<ReturnType<typeof createAdminPaymentsClient> | null>(null);
  useEffect(() => {
    const current = createAdminPaymentsClient({ auth: () => createBrowserSupabaseClient().auth }); controller.current = current;
    const unsubscribe = current.subscribe(setState); setState(current.getState()); void current.start();
    return () => { unsubscribe(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, []);
  const selected = selection.actorId === state.actorId ? state.orders.find(order => order.orderId === selection.orderId) : undefined;
  return <><Nav /><main className={styles.page}><div className={styles.shell}>
    <Link href="/admin" className={styles.back}>Admin / Commerce / Payment review</Link>
    <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Payment operations</p><h1>Review payments and holds.</h1></div></div>
    <p className={styles.intro}>Automatic PayPal exceptions use provider-verified evidence. Manage checkout offers in <Link href="/admin/promotions">Promo codes</Link>. Older manual-payment tools remain available in the collapsed archive below.</p>
    <PayPalReviewQueue />
    <details className={styles.notice} open={state.phase !== "ready" || state.orders.length > 0 || Boolean(state.filterOrderId) || Boolean(state.pendingDecision)}>
    <summary><strong>Legacy manual-payment archive</strong>{state.phase === "ready" ? ` · ${state.orders.length} visible order${state.orders.length === 1 ? "" : "s"}` : ""}</summary>
    <p className={styles.muted}>Use this queue only for a manual order that already exists. New QRguitar checkout uses automatic PayPal verification.</p>
    <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Legacy manual payments</p><h2>Verify received funds</h2></div>{state.phase === "ready" && <button className={styles.secondary} disabled={state.busy || state.refreshing} onClick={() => void controller.current?.reload()}><RefreshCw size={16} aria-hidden="true" />{state.refreshing ? "Checking…" : "Refresh archive"}</button>}</div>
    {state.phase === "loading" && <p role="status">Checking admin access and loading payments…</p>}
    {state.phase === "signed-out" && <section className={styles.notice}><h2>Sign in with an admin account.</h2><Link className={styles.primary} href={`/login?next=${encodeURIComponent("/admin/payments")}`}>Sign in</Link></section>}
    {state.phase === "error" && <section className={`${styles.notice} ${styles.error}`} role="alert"><h2>Payment review is unavailable.</h2><p>{state.message}</p><button className={styles.secondary} disabled={state.refreshing} onClick={() => void controller.current?.reload()}>Try again</button></section>}
    {state.phase === "ready" && <>
      {state.environment === "test" && <section className={`${styles.notice} ${styles.warning}`}><strong>Test ledger</strong><p>Do not request real transfers for test orders. Grants here belong to the test environment.</p></section>}
      {state.message && <p role="status" className={styles.errorText}>{state.message}</p>}
      <form className={styles.notice} onSubmit={event => { event.preventDefault(); setSelection({ actorId: "", orderId: "" }); void controller.current?.search(search.actorId === state.actorId ? search.value : ""); }}><label className={styles.field}>Find an order by its full reference<input value={search.actorId === state.actorId ? search.value : ""} onChange={event => setSearch({ actorId: state.actorId, value: event.target.value })} placeholder="QRG-… or order UUID" autoComplete="off" disabled={state.busy || state.refreshing} /></label><div className={styles.actions}><button className={styles.primary} type="submit" disabled={state.busy || state.refreshing}>Find order</button>{state.filterOrderId && <button className={styles.secondary} type="button" disabled={state.busy || state.refreshing} onClick={() => { setSearch({ actorId: state.actorId, value: "" }); setSelection({ actorId: "", orderId: "" }); void controller.current?.search(""); }}>Back to queue</button>}</div></form>
      {state.pendingDecision && <section className={`${styles.notice} ${styles.warning}`}><h2>A review decision needs confirmation.</h2><p>The previous response was interrupted. Refresh the queue or retry the saved decision with its original reference before making another decision.</p><button className={styles.secondary} disabled={state.busy || state.refreshing} onClick={() => void controller.current?.retryDecision()}>{state.busy ? "Checking…" : "Retry saved decision"}</button></section>}
      <div className={styles.adminGrid}><section aria-label="Payment orders" className={styles.queue}>
        {!state.orders.length && <div className={styles.notice}><h2>{state.filterOrderId ? "No matching order." : "No payments in the queue."}</h2><p>{state.filterOrderId ? "Check the full order reference and the current environment." : "Orders appear here when a customer prepares a payment."}</p></div>}
        {state.orders.map(order => <button type="button" className={styles.queueItem} key={order.orderId} aria-pressed={selected?.orderId === order.orderId} disabled={state.busy} onClick={() => setSelection({ actorId: state.actorId, orderId: order.orderId })}><strong>{order.reference} · {money(order.offer.amount)}</strong><span>{order.offer.credits} Profile {order.offer.credits === 1 ? "credit" : "credits"} · {label(order.method)}</span><span>{statuses[order.status]} · {new Date(order.createdAt).toLocaleString()}</span><span>Account {order.ownerId}</span></button>)}
        {state.hasMore && <p className={styles.muted}>This queue shows a limited set of orders. Use the full order reference above to find an older payment.</p>}
      </section><section aria-label="Selected payment"><div className={styles.notice}>{selected ? <ReviewOrder key={`${state.actorId}:${selected.orderId}:${selected.status}`} order={selected} busy={state.busy || state.refreshing || Boolean(state.pendingDecision)} decide={body => controller.current?.decide(body) || Promise.resolve(false)} /> : <><h2>Choose an order to review.</h2><p>Confirm the recipient, amount, currency and order reference in the payment provider’s own transaction record.</p></>}</div></section></div>
    </>}
    </details>
  </div></main><Footer /></>;
}
export function ReviewOrder({ order, busy, decide }: { order: DirectOrder; busy: boolean; decide(body: Record<string, unknown>): Promise<boolean> }) {
  const [amount, setAmount] = useState(""), [paymentReference, setPaymentReference] = useState(""), [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [action, setAction] = useState<"verify" | "close" | "review">(order.status === "fulfilled" ? "review" : "verify"), [kind, setKind] = useState<"refund" | "dispute">("refund");
  const validAmount = /^\d{1,8}(?:\.\d{1,2})?$/.test(amount.trim()), cents = validAmount ? Math.round(Number(amount) * 100) : -1;
  const canSubmit = !busy && reason.trim().length >= 10 && confirmed && (action === "close" ? ["awaiting_payment", "pending_review"].includes(order.status) : Boolean(paymentReference.trim().length >= 3 && (action !== "verify" || cents === order.offer.amount)));
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!canSubmit) return;
    if (await decide({ action, orderId: order.orderId, reason: reason.replace(/[\r\n\t]+/g, " ").trim(), ...(action === "verify" ? { paymentReference: paymentReference.trim(), amount: cents, currency: "usd" } : action === "review" ? { kind, paymentReference: paymentReference.trim() } : {}) })) {
      setReason(""); setConfirmed(false); setPaymentReference(""); setAmount("");
    }
  }
  return <><p className={styles.eyebrow}>{statuses[order.status]}</p><h2>{order.reference}</h2><dl className={styles.orderMeta}><dt>Expected</dt><dd>{money(order.offer.amount)} USD · {order.offer.credits} Profile {order.offer.credits === 1 ? "credit" : "credits"}</dd><dt>Payment method</dt><dd>{label(order.method)}</dd><dt>Receiving account</dt><dd>{order.recipient.displayName} · {order.recipient.accountKey}</dd><dt>Customer account</dt><dd>{order.ownerId}</dd><dt>Customer’s reference</dt><dd>{order.payerReference || "Not supplied"}</dd><dt>Created</dt><dd>{new Date(order.createdAt).toLocaleString()}</dd></dl>
    {order.status === "closed" && <p>This request is closed. A late payment can still be recorded after checking the actual transaction; its credits are held for review.</p>}
    <form onSubmit={event => void submit(event)}>
      <label className={styles.field}>Action<select value={action} disabled={busy} onChange={event => { setAction(event.target.value as typeof action); setConfirmed(false); }}>{order.status !== "fulfilled" && <option value="verify">{order.status === "closed" ? "Verify late payment and record held credits" : "Verify received payment and add credits"}</option>}{["awaiting_payment", "pending_review"].includes(order.status) && <option value="close">Close an unpaid request</option>}{order.status === "fulfilled" && <option value="review">Record a refund or dispute and hold credits</option>}</select></label>
      {action === "close" ? <><p className={styles.muted}>Close only after confirming that no payment was received or is in progress. Closing adds no credits and does not refund money.</p><label className={styles.checkField}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} required /><span>I checked the receiving account and confirmed there is no received or in-progress payment for this order.</span></label></> : <>
        {action === "review" && <label className={styles.field}>Review reason<select value={kind} disabled={busy} onChange={event => setKind(event.target.value as typeof kind)}><option value="refund">Refund</option><option value="dispute">Dispute</option></select></label>}
        {action === "verify" && <label className={styles.field}>Completed payment amount before provider fees (USD)<input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="0.00" disabled={busy} required /><span>Use the gross transaction amount, not the net payout after fees. It must match {money(order.offer.amount)}.</span></label>}
        <label className={styles.field}>{action === "review" ? "Original incoming payment transaction ID" : "Provider transaction ID"}<input value={paymentReference} onChange={event => setPaymentReference(event.target.value)} maxLength={200} minLength={3} autoComplete="off" disabled={busy} required /><span>{action === "review" ? "Enter the original payment ID recorded when this order was verified. Put the refund or dispute reference in the audit reason below." : "Use the provider’s unique transaction reference, not the customer’s screenshot or QRguitar order number."}</span></label>
        <label className={styles.checkField}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} required /><span>{action === "verify" ? "I checked QRguitar’s receiving account and confirmed this completed payment belongs to this order, in the exact amount and currency above." : "I checked the provider’s record and confirmed this refund or dispute. I understand this places paid credits on hold; it does not issue a refund."}</span></label>
      </>}
      <label className={styles.field}>Reason for the audit trail<textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} maxLength={1000} disabled={busy} required minLength={10} /><span>At least 10 characters. Include the matching facts or provider review reference.</span></label><button type="submit" className={styles.primary} disabled={!canSubmit}>{busy ? "Saving…" : action === "verify" ? order.status === "closed" ? `Record late payment and hold ${order.offer.credits} credits` : `Verify receipt and add ${order.offer.credits} credits` : action === "close" ? "Close unpaid request" : "Record review and hold paid credits"}</button>
    </form>
  </>;
}
