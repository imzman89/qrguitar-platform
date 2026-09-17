"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { Nav } from "../../components/Nav";
import { Footer } from "../../components/Footer";
import { billingOrderId, createBillingClient, initialBillingState } from "../../lib/billing-client";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import styles from "./billing.module.css";

type Mode = "overview" | "return" | "cancel";
const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount / 100);
export default function BillingPage({ mode = "overview" }: { mode?: Mode }) {
  return <Suspense fallback={<BillingLoading />}><BillingContent mode={mode} /></Suspense>;
}
function BillingLoading() {
  return <><Nav /><main className={styles.page}><div className={styles.shell}><p className={styles.eyebrow}>Profile credits</p><h1>Room for what comes next.</h1><p role="status">Loading your credit balance…</p></div></main><Footer /></>;
}
function BillingContent({ mode }: { mode: Mode }) {
  const search = useSearchParams(), orderId = billingOrderId(search.get("orderId"));
  const controller = useRef<ReturnType<typeof createBillingClient> | null>(null);
  const [state, setState] = useState(initialBillingState);
  useEffect(() => {
    const current = createBillingClient({ auth: () => createBrowserSupabaseClient().auth, orderId, returnFlow: mode === "return" });
    controller.current = current;
    const unsubscribe = current.subscribe(setState); setState(current.getState()); void current.start();
    return () => { unsubscribe(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, [mode, orderId]);
  // A changed return URL renders before its effect starts a new controller.
  const snapshot = state.snapshot && (!orderId || state.snapshot.order?.orderId === orderId) ? state.snapshot : null, order = snapshot?.order;
  const returnPath = `/billing${mode === "overview" ? "" : `/${mode}`}${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ""}`;
  const blocked = state.busy || state.refreshing || state.phase !== "ready" || !snapshot || Boolean(snapshot.hold || snapshot.commercialExempt || state.intent);
  return <><Nav /><main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}>
      <div><Link href="/account" className={styles.back}>Account / Profile credits</Link><p className={styles.eyebrow}>Yours to keep</p><h1>Room for what<br className={styles.desktopBreak} /> comes next.</h1><p className={styles.intro}>Your first 25 Profiles are free. Add permanent Profile credits when your collection grows. Ownership transfers stay free.</p></div>
      <div className={styles.promise}><ShieldCheck size={27} aria-hidden="true" /><strong>One purchase. Permanent credits.</strong><span>No subscription. No expiry.</span><span>Each credit creates one additional Profile when your free allowance is full.</span></div>
    </header>

    {(state.phase === "loading" || (state.phase === "ready" && !snapshot)) && <section className={styles.notice} role="status">Loading your credit balance…</section>}
    {state.phase === "signed-out" && <section className={styles.notice}><h2>Your collection starts with 25 free Profiles.</h2><p>Sign in to see your balance and available credit packs.</p><Link className={styles.primary} href={`/login?next=${encodeURIComponent(returnPath)}`}>Sign in <ArrowRight size={16} aria-hidden="true" /></Link></section>}
    {state.phase === "error" && <section className={`${styles.notice} ${styles.error}`} role="alert"><h2>Billing could not be loaded.</h2><p>{state.message}</p><button className={styles.secondary} type="button" onClick={() => void controller.current?.reload()} disabled={state.refreshing}>{state.refreshing ? "Checking…" : "Try again"}</button></section>}

    {snapshot && state.phase === "ready" && <>
      {snapshot.environment === "test" && <div className={styles.notice} role="status"><strong>Test environment</strong><p>These balances and checkout sessions belong to the test environment.</p></div>}
      {mode !== "overview" && <section className={`${styles.notice} ${order?.status === "fulfilled" && !snapshot.hold ? styles.success : ""}`} aria-live="polite">
        <h2>{order?.status === "fulfilled" ? (snapshot.hold ? "Credits received. Billing review is pending." : "Your Profile credits have been added.") : order?.status === "expired" ? "This checkout has expired." : mode === "cancel" ? "You’re back from checkout." : "Checking your purchase."}</h2>
        <p>{order?.status === "fulfilled" ? `${order.offer.credits} permanent Profile ${order.offer.credits === 1 ? "credit was" : "credits were"} recorded for this order. ${snapshot.hold ? "Paid credits are unavailable while the billing review is open." : "Your current available balance is shown below."}` : order?.status === "expired" ? "The server confirmed that this checkout expired. You can choose a pack below when you’re ready." : mode === "cancel" ? "Returning here does not cancel or confirm a payment. We have checked the server for the latest order status. You can resume a pending checkout below." : "Credits appear after the server verifies payment and records the grant. If confirmation is still pending, refresh the status or return later."}</p>
        {state.polling && <span className={styles.muted}>Checking automatically for a short time…</span>}
      </section>}
      <section className={styles.balance} aria-labelledby="balance-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Your account</p><h2 id="balance-title">Profile balance</h2></div><button type="button" className={styles.secondary} disabled={state.busy || state.refreshing} onClick={() => void controller.current?.reload()}><RefreshCw size={15} aria-hidden="true" />{state.refreshing ? "Refreshing…" : "Refresh status"}</button></div>
        <dl className={styles.stats}><div><dt>Free Profiles remaining</dt><dd>{snapshot.freeRemaining}<span> / {snapshot.freeLimit}</span></dd></div><div><dt>Paid credits available</dt><dd>{snapshot.paidAvailable}</dd></div><div><dt>Profiles you own</dt><dd>{snapshot.ownedProfiles}</dd></div></dl>
        <div className={styles.balanceFoot}><span>{snapshot.paidGranted} paid credits received · {snapshot.paidConsumed} used{snapshot.hold ? ` · ${snapshot.paidRemaining} held` : ""}</span><Link href="/create">Create a Profile <ArrowRight size={15} aria-hidden="true" /></Link></div>
      </section>
      {snapshot.commercialExempt && <section className={styles.notice}><h2>Your account already has expanded Profile access.</h2><p>You do not need to purchase credits under your current approved plan.</p></section>}
      {snapshot.hold && <section className={`${styles.notice} ${styles.warning}`} role="status"><h2>Your billing account is under review.</h2><p>Paid credits and new purchases are unavailable during this review. Your remaining free allowance and existing Profiles are preserved.</p><Link href="/contact">Contact support</Link></section>}
      {state.intent && <section className={styles.notice} aria-labelledby="pending-title"><h2 id="pending-title">Continue your existing checkout</h2><p>{state.uncertain ? "The previous checkout request could not be confirmed. We have kept its reference so you can safely retry the same request." : "A checkout is already in progress for your account. Resume it or refresh the status before choosing another pack."}</p><div className={styles.actions}><button className={styles.primary} type="button" disabled={state.busy || state.refreshing || snapshot.hold || snapshot.commercialExempt} onClick={() => void controller.current?.checkout()}>{state.busy ? "Checking checkout…" : state.uncertain ? "Retry same checkout" : "Resume checkout"}<ArrowRight size={16} aria-hidden="true" /></button><button className={styles.secondary} type="button" disabled={state.busy || state.refreshing} onClick={() => void controller.current?.reload()}>Refresh status</button></div></section>}
      {state.message && <p className={state.uncertain ? styles.errorText : styles.feedback} role="status">{state.message}</p>}
      <section className={styles.packs} aria-labelledby="packs-title"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Grow at your pace</p><h2 id="packs-title">Permanent Profile packs</h2></div><span className={styles.muted}>One-time purchases · USD</span></div>
        {!state.offers.length ? <div className={styles.notice}><h3>Credit packs are currently unavailable.</h3><p>{state.offersMessage || "Purchases will appear here when checkout is available. Your current balance is shown above."}</p></div> : <div className={styles.packGrid}>{state.offers.map(offer => <article className={`${styles.pack} ${offer.credits === 10 ? styles.featured : ""}`} key={offer.key}>
          <div className={styles.packTop}><span>{offer.credits === 1 ? "One more keeper" : offer.credits === 10 ? "The growing collection" : "Room to build"}</span>{offer.credits === 25 && <span className={styles.badge}>Lowest per Profile</span>}</div>
          <h3>{offer.credits} <span>Profile {offer.credits === 1 ? "credit" : "credits"}</span></h3><div className={styles.price}>{money(offer.amount)}<span>one time</span></div>
          <p>{offer.credits === 1 ? "For the next instrument with a story to tell." : offer.credits === 10 ? "Keep your next chapter of instruments together." : "A reserve for a collection that keeps growing."}</p>
          <ul><li><Check size={16} aria-hidden="true" />Permanent credits, no expiry</li><li><Check size={16} aria-hidden="true" />Used after your free allowance</li><li><Check size={16} aria-hidden="true" />Free ownership transfers</li></ul>
          <button type="button" className={offer.credits === 10 ? styles.primary : styles.secondary} disabled={blocked} onClick={() => void controller.current?.checkout(offer.key)} aria-label={`Buy ${offer.credits} Profile ${offer.credits === 1 ? "credit" : "credits"} for ${money(offer.amount)}`}>{state.busy && state.intent?.offerKey === offer.key ? "Preparing checkout…" : `Choose ${offer.credits} ${offer.credits === 1 ? "credit" : "credits"}`}<ArrowRight size={16} aria-hidden="true" /></button>
        </article>)}</div>}
        <p className={styles.secure}><CreditCard size={17} aria-hidden="true" />Payment opens in Stripe’s secure checkout. Credits are confirmed by your account’s payment record.</p>
      </section>
    </>}
    <section className={styles.details} aria-label="How Profile credits work"><div><h2>Built around your instruments.</h2><p>Profiles hold the identity and history of instruments you own. Buy capacity when you need it, and keep using the tools you already have.</p></div><div><h3>What happens when I transfer an instrument?</h3><p>Ownership transfers are free. A transfer does not refund a previously used paid credit.</p><h3>Do unused credits expire?</h3><p>No. Purchased credits stay on your account until used. Each additional Profile consumes one credit after your free allowance is full.</p></div></section>
  </div></main><Footer /></>;
}
