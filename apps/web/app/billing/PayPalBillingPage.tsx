"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { createElement, Suspense, useEffect, useRef, useState } from "react";
import { Nav } from "../../components/Nav";
import { Footer } from "../../components/Footer";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { directOrderId } from "../../lib/direct-payments-client";
import { createPayPalPaymentsClient, initialPayPalPaymentsState } from "../../lib/paypal-payments-client";
import { loadPayPalSdk, paypalButtonOptions, type PayPalButtonInstance } from "../../lib/paypal-browser-sdk";
import { createApplePayCheckout, eligibleApplePay, loadApplePaySdk, PAYPAL_APPLE_PAY_MINIMUM_CENTS } from "../../lib/paypal-apple-pay";
import type { DirectOffer } from "../../lib/direct-payments";
import styles from "./billing.module.css";

type Mode = "overview" | "return" | "cancel";
type PromoState = { actorId: string; offerKey: string; input: string; offer: DirectOffer | null; busy: boolean; message: string };
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);
export default function PayPalBillingPage({ mode = "overview" }: { mode?: Mode }) {
  return <Suspense fallback={<><Nav /><main className={styles.page}><div className={styles.shell}><h1>Profile credits</h1><p role="status">Loading your account…</p></div></main><Footer /></>}><PayPalBillingContent mode={mode} /></Suspense>;
}
function PayPalBillingContent({ mode }: { mode: Mode }) {
  const search = useSearchParams(), orderId = directOrderId(search.get("orderId"));
  const [state, setState] = useState(initialPayPalPaymentsState), [choice, setChoice] = useState({ actorId: "", offerKey: "", afterOrderId: "" });
  const [promo, setPromo] = useState<PromoState>({ actorId: "", offerKey: "", input: "", offer: null, busy: false, message: "" });
  const controller = useRef<ReturnType<typeof createPayPalPaymentsClient> | null>(null), checkoutHeading = useRef<HTMLHeadingElement>(null);
  const returnChecked = useRef("");
  useEffect(() => {
    const current = createPayPalPaymentsClient({ auth: () => createBrowserSupabaseClient().auth, orderId, returnFlow: mode === "return" });
    controller.current = current; const unsubscribe = current.subscribe(setState); setState(current.getState()); void current.start();
    return () => { unsubscribe(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, [orderId, mode]);
  const snapshot = state.snapshot && (!orderId || state.snapshot.order?.orderId === orderId) ? state.snapshot : null;
  const order = snapshot?.order || snapshot?.pendingOrder, available = snapshot ? snapshot.freeRemaining + snapshot.paidAvailable : 0;
  const selectedKey = state.intent?.offerKey || (choice.actorId === state.actorId ? choice.offerKey : "");
  const catalogOffer = snapshot?.offers.find(offer => offer.key === selectedKey) || null;
  const appliedOffer = promo.actorId === state.actorId && promo.offerKey === selectedKey ? promo.offer : null;
  const intentOrder = state.intent?.orderId && order?.orderId === state.intent.orderId ? order : null;
  const intentPromoOffer = state.intent?.promoCode && appliedOffer?.promotion?.code === state.intent.promoCode
    && appliedOffer.promotion.id === state.intent.promoId && appliedOffer.promotion.revision === state.intent.promoRevision
    && appliedOffer.amount === state.intent.expectedAmount ? appliedOffer : null;
  // A restored promoted intent has no trustworthy display/wallet total until its
  // original quote is still in memory or the ledger returns the frozen order.
  const selected = state.intent
    ? intentOrder?.offer || (state.intent.promoCode ? intentPromoOffer : catalogOffer || (order?.offerKey === selectedKey ? order.offer : null))
    : appliedOffer || catalogOffer || (order?.offerKey === selectedKey ? order.offer : null);
  const receiptComplete = order?.status === "fulfilled", nextPurchase = Boolean(!orderId && receiptComplete && choice.actorId === state.actorId && choice.afterOrderId === order?.orderId);
  const completed = receiptComplete && !nextPurchase, review = order?.status === "needs_review", processing = order?.status === "processing" || state.intent?.approvalObserved;
  const disabled = Boolean(state.busy || state.refreshing || state.checkoutOpen || promo.busy || !snapshot?.enabled || snapshot.hold || snapshot.commercialExempt || snapshot.legacyOrderId || state.intent);
  const canShowButtons = Boolean(selected && snapshot?.clientId && (snapshot.enabled || state.intent) && !snapshot.hold && !snapshot.commercialExempt && !snapshot.legacyOrderId && !completed && !review);
  useEffect(() => { if (selected && !state.intent) checkoutHeading.current?.focus(); }, [selected, state.intent]);
  useEffect(() => { if (promo.actorId && (promo.actorId !== state.actorId || promo.offerKey !== selectedKey)) setPromo({ actorId: state.actorId, offerKey: selectedKey, input: "", offer: null, busy: false, message: "" }); }, [state.actorId, selectedKey, promo.actorId, promo.offerKey]);
  useEffect(() => {
    const key = `${state.actorId}:${orderId}`;
    if (mode === "return" && snapshot && orderId && order && !["fulfilled", "cancelled", "needs_review"].includes(order.status) && returnChecked.current !== key && !state.busy && !state.refreshing) { returnChecked.current = key; void controller.current?.completeReturn().catch(() => undefined); }
  }, [mode, orderId, snapshot, order, state.actorId, state.busy, state.refreshing]);
  const returnPath = `/billing${mode === "overview" ? "" : `/paypal/${mode}`}${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ""}`;
  return <><Nav /><main className={styles.page}><div className={`${styles.shell} ${styles.automaticShell}`}>
    <Link href="/account" className={styles.back}>Account / Profile credits</Link>
    <header className={styles.automaticHeader}><p className={styles.eyebrow}>Your instruments. Their stories.</p><h1>Room for your next instrument.</h1><p>5 free Profiles. More when you need them.</p><span>No subscription · Credits never expire · Free transfers</span></header>
    {(state.phase === "loading" || (state.phase === "ready" && !snapshot)) && <section className={styles.notice} role="status">Loading your Profile balance…</section>}
    {state.phase === "signed-out" && <section className={styles.notice}><h2>Your first 5 Profiles are free.</h2><p>Sign in to see your balance and add more when you need them.</p><Link href={`/login?next=${encodeURIComponent(returnPath)}`} className={styles.primary}>Sign in <ArrowRight size={16} aria-hidden="true" /></Link></section>}
    {state.phase === "error" && <section className={`${styles.notice} ${styles.error}`} role="alert"><h2>We couldn’t check your account.</h2><p>{state.message}</p><button className={styles.secondary} disabled={state.refreshing} onClick={() => void controller.current?.reload()}>Try again</button><p className={styles.muted}><Link href="/contact">Contact QRguitar</Link></p></section>}
    {state.phase === "ready" && snapshot && <>
      {snapshot.environment === "test" && <p className={styles.testLabel} role="status">Sandbox checkout · Test payments only</p>}
      <section className={styles.compactBalance} aria-label="Your Profile balance"><div><strong>{snapshot.freeRemaining}</strong><span>free remaining</span></div><div><strong>{snapshot.paidAvailable}</strong><span>paid credits</span></div>{(available > 0 || snapshot.commercialExempt) ? <Link className={styles.primary} href="/create">Create a Profile <ArrowRight size={15} aria-hidden="true" /></Link> : <button className={styles.secondary} disabled={Boolean(state.busy || state.refreshing)} onClick={() => void controller.current?.reload()} aria-label="Refresh Profile balance"><RefreshCw size={16} aria-hidden="true" />Refresh</button>}</section>
      {(available > 0 || snapshot.commercialExempt) && <p className={styles.muted}>{snapshot.commercialExempt ? "Your account already has expanded access." : "You have room to keep creating. No purchase needed."}</p>}
      {snapshot.hold && <section className={`${styles.notice} ${styles.warning}`}><h2>Your paid credits are under review.</h2><p>Existing Profiles and your remaining free allowance are still available.</p><Link href="/contact">Contact QRguitar</Link></section>}
      {snapshot.legacyOrderId && snapshot.legacyOrderProvider && <section className={styles.notice}><h2>You have an earlier payment in progress.</h2><p>{snapshot.legacyOrderProvider === "direct" ? "QRguitar support can check this legacy payment. Please don’t send it again." : "Check that payment before starting another."}</p><Link className={styles.primary} href={snapshot.legacyOrderProvider === "direct" ? "/contact" : `/billing/return?orderId=${encodeURIComponent(snapshot.legacyOrderId)}`}>{snapshot.legacyOrderProvider === "direct" ? "Contact QRguitar" : "View earlier payment"}</Link></section>}
      {completed && <section className={`${styles.notice} ${snapshot.hold ? styles.warning : styles.success}`} role="status"><h2>{snapshot.hold ? "Payment received. Credits are under review." : "You’re ready to create."}</h2><p>{order.offer.credits} Profile {order.offer.credits === 1 ? "credit has" : "credits have"} been added to your account.{snapshot.hold ? " Paid credits remain unavailable during the review." : " No extra steps."}</p>{!snapshot.hold && <Link href="/create" className={styles.primary}>Create a Profile <ArrowRight size={16} aria-hidden="true" /></Link>}</section>}
      {review && <section className={`${styles.notice} ${styles.warning}`} role="status"><h2>This payment needs a review.</h2><p>We couldn’t finish adding credits automatically. Please contact QRguitar before trying another payment.</p><Link href="/contact">Contact QRguitar</Link></section>}
      {order?.status === "cancelled" && <section className={styles.notice} role="status"><h2>This checkout is closed.</h2><p>You can choose a pack when you’re ready.</p></section>}
      {(processing || state.busy === "capturing" || state.busy === "reconciling") && <section className={styles.notice} role="status"><h2>Confirming your payment…</h2><p>Your credits appear as soon as payment is verified. You can leave this page and return later.</p></section>}
      {mode === "cancel" && !completed && !review && <p className={styles.feedback}>You’re back from checkout. Your saved payment is still available to resume; returning here does not confirm or cancel a charge.</p>}
      {state.message && <p className={state.uncertain ? styles.errorText : styles.feedback} role="status">{state.message}</p>}
      {(state.uncertain || processing || (state.intent && !canShowButtons && !completed && !review)) && <div className={styles.actions}><button className={styles.secondary} disabled={Boolean(state.busy || state.refreshing)} onClick={() => void controller.current?.reconcile()}>{state.busy === "reconciling" ? "Checking…" : "Check saved payment"}</button>{state.polling && <span className={styles.muted}>Checking automatically…</span>}</div>}
      {completed && orderId && <p><Link className={styles.secondary} href="/billing">Add another Profile pack</Link></p>}
      {!snapshot.commercialExempt && !snapshot.hold && !snapshot.legacyOrderId && !review && !(completed && orderId) && <details className={styles.packDisclosure} open={available === 0 || Boolean(selected) || Boolean(state.intent)}>
        <summary>{available > 0 ? "Add credits for later" : "Choose a Profile pack"}<span>One-time total · USD</span></summary>
        {!snapshot.enabled && !state.intent && <section className={styles.notice}><h2>Checkout is being connected.</h2><p>Your free Profiles and existing credits are ready to use.</p></section>}
        <div className={styles.simplePackGrid}>{snapshot.offers.map(offer => <button type="button" key={offer.key} className={`${styles.simplePack} ${selected?.key === offer.key ? styles.selectedPack : ""}`} aria-pressed={selected?.key === offer.key} disabled={disabled} onClick={() => { setPromo({ actorId: state.actorId, offerKey: offer.key, input: "", offer: null, busy: false, message: "" }); setChoice({ actorId: state.actorId, offerKey: offer.key, afterOrderId: receiptComplete && !orderId ? order!.orderId : "" }); }} aria-label={`${offer.credits} Profile ${offer.credits === 1 ? "credit" : "credits"} for ${money(offer.amount)} total`}><strong>{offer.credits} <span>{offer.credits === 1 ? "Profile" : "Profiles"}</span></strong><b>{money(offer.amount)}</b><span>{money(offer.amount / offer.credits)} per Profile</span><small>{offer.credits === 1 ? "Just one more" : offer.credits === 10 ? "For a growing collection" : "Lowest price per Profile"}</small>{selected?.key === offer.key && <Check size={18} aria-hidden="true" />}</button>)}</div>
        {selected && !completed && !review && <section className={styles.automaticCheckout} aria-labelledby="automatic-checkout-title"><div className={styles.checkoutTotal}><h2 id="automatic-checkout-title" ref={checkoutHeading} tabIndex={-1}>{selected.credits} Profile {selected.credits === 1 ? "credit" : "credits"}</h2><strong>{selected.promotion && <s>{money(selected.listAmount || selected.promotion.originalAmount)}</s>}{money(selected.amount)}<span>one time</span></strong></div>
          {!state.intent && <details className={styles.promoDisclosure} open={Boolean(selected.promotion || promo.message)}><summary>Have a promo code?</summary><form onSubmit={event => { event.preventDefault(); if (!controller.current || promo.busy) return; const input = promo.actorId === state.actorId && promo.offerKey === selected.key ? promo.input : ""; setPromo(value => ({ ...value, actorId: state.actorId, offerKey: selected.key, busy: true, message: "" })); void controller.current.quotePromotion(selected.key, input, state.actorId).then(offer => setPromo({ actorId: state.actorId, offerKey: selected.key, input: offer.promotion?.code || input.trim().toUpperCase(), offer, busy: false, message: `${offer.promotion?.code} applied. Your total is ${money(offer.amount)}.` })).catch(error => setPromo(value => ({ ...value, offer: null, busy: false, message: error instanceof Error ? error.message : "That promo code could not be applied." }))); }}><label>Promo code<input value={promo.actorId === state.actorId && promo.offerKey === selected.key ? promo.input : ""} onChange={event => setPromo({ actorId: state.actorId, offerKey: selected.key, input: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32), offer: null, busy: false, message: "" })} autoCapitalize="characters" autoComplete="off" spellCheck={false} disabled={promo.busy} /></label><button type="submit" className={styles.secondary} disabled={promo.busy || !(promo.actorId === state.actorId && promo.offerKey === selected.key && /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(promo.input))}>{promo.busy ? "Applying…" : "Apply"}</button>{selected.promotion && <button type="button" className={styles.textButton} disabled={promo.busy} onClick={() => setPromo({ actorId: state.actorId, offerKey: selected.key, input: "", offer: null, busy: false, message: "" })}>Remove</button>}</form>{promo.actorId === state.actorId && promo.offerKey === selected.key && promo.message && <p className={selected.promotion ? styles.promoSuccess : styles.errorText} role="status">{promo.message}</p>}{selected.promotion && <p className={styles.promoSavings}><Check size={15} aria-hidden="true" /> {selected.promotion.code} saves {money(selected.promotion.discountAmount)}.</p>}</details>}
          {state.intent && selected.promotion && <p className={styles.promoSavings}><Check size={15} aria-hidden="true" /> {selected.promotion.code} applied · {money(selected.promotion.discountAmount)} saved</p>}
          {canShowButtons && controller.current && <div hidden={Boolean(processing || state.busy === "capturing" || state.busy === "reconciling")} inert={Boolean(state.busy || state.refreshing || processing || promo.busy)}><PayPalButtons key={`${state.actorId}:${selected.key}:${selected.amount}:${selected.promotion?.id || "standard"}:${selected.promotion?.revision || 0}:${snapshot.clientId}`} clientId={snapshot.clientId!} offer={selected} actorId={state.actorId} controller={controller.current} applePayEnabled={snapshot.applePayEnabled} merchantName={snapshot.merchantName} environment={snapshot.environment} /></div>}
          <p className={styles.checkoutAssurance}>Pay securely. Your credits are added automatically after confirmation.</p>
          <p className={styles.paymentPrivacy}>Payment information is processed by PayPal under its <a href="https://www.paypal.com/us/legalhub/paypal/privacy-full" target="_blank" rel="noreferrer">Privacy Statement</a>.</p>
        </section>}
      </details>}
      <p className={styles.billingFootnote}>Each credit creates one additional Profile after your 5 free Profiles. Unused paid credits never expire.</p>
    </>}
  </div></main><Footer /></>;
}
type ApplePayOption = NonNullable<Awaited<ReturnType<typeof eligibleApplePay>>>;
function PayPalButtons({ clientId, offer, actorId, controller, applePayEnabled, merchantName, environment }: { clientId: string; offer: DirectOffer; actorId: string; controller: ReturnType<typeof createPayPalPaymentsClient>; applePayEnabled: boolean; merchantName: string; environment: "test" | "live" }) {
  const container = useRef<HTMLDivElement>(null), [status, setStatus] = useState("loading"), [message, setMessage] = useState(""), [attempt, setAttempt] = useState(0);
  const [applePay, setApplePay] = useState<ApplePayOption | null>(null), [appleBusy, setAppleBusy] = useState(false);
  const applePayAmountEligible = offer.amount >= PAYPAL_APPLE_PAY_MINIMUM_CENTS;
  useEffect(() => {
    let alive = true, buttons: PayPalButtonInstance | undefined;
    setStatus("loading"); setMessage(""); setApplePay(null); setAppleBusy(false);
    // The PayPal script is singleton-scoped to the document. Load the configured
    // component superset once; the amount check below gates only Apple Pay UI.
    void loadPayPalSdk(clientId, { applePayEnabled }).then(async sdk => {
      if (!alive || !container.current) return;
      if (applePayEnabled && applePayAmountEligible) void loadApplePaySdk().then(() => alive ? eligibleApplePay(sdk, true, { environment }) : null).then(option => { if (alive) setApplePay(option); }).catch(() => { /* Other eligible payment methods remain available. */ });
      buttons = sdk.Buttons(paypalButtonOptions(controller, offer, actorId));
      if (!buttons.isEligible()) throw new Error("Checkout isn’t available in this browser. Try another browser or device.");
      let renderTimer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([buttons.render(container.current), new Promise<never>((_, reject) => { renderTimer = setTimeout(() => reject(new Error("Payment options took too long to load. Please try again.")), 20_000); })]); }
      finally { if (renderTimer) clearTimeout(renderTimer); }
      if (alive) setStatus("ready"); else await buttons.close();
    }).catch(error => { if (alive) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Checkout could not load. Please try again."); } });
    return () => { alive = false; void buttons?.close().catch(() => undefined); };
  }, [clientId, offer, actorId, controller, applePayEnabled, applePayAmountEligible, environment, attempt]);
  return <div className={styles.sdkArea}>{applePayEnabled && applePayAmountEligible && applePay && <ApplePayButton option={applePay} offer={offer} actorId={actorId} controller={controller} merchantName={merchantName} onBusy={setAppleBusy} />}{status === "loading" && <p role="status">Loading secure payment options…</p>}<div ref={container} inert={appleBusy} />{status === "error" && <div role="alert"><p>{message}</p><button className={styles.secondary} disabled={appleBusy} onClick={() => setAttempt(value => value + 1)}>Reload payment options</button></div>}</div>;
}
function ApplePayButton({ option, offer, actorId, controller, merchantName, onBusy }: { option: ApplePayOption; offer: DirectOffer; actorId: string; controller: ReturnType<typeof createPayPalPaymentsClient>; merchantName: string; onBusy: (busy: boolean) => void }) {
  const checkout = useRef<ReturnType<typeof createApplePayCheckout> | null>(null);
  useEffect(() => { const current = createApplePayCheckout({ ...option, offer, actorId, controller, merchantName, onBusy }); checkout.current = current; return () => { current.dispose(); if (checkout.current === current) checkout.current = null; }; }, [option, offer, actorId, controller, merchantName, onBusy]);
  return createElement("apple-pay-button", { className: styles.applePayButton, buttonstyle: "black", type: "buy", locale: "en-US", "aria-label": "Buy with Apple Pay", onClick: () => checkout.current?.start() });
}
