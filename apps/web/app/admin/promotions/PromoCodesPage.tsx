"use client";
import { useUiText } from "../../../components/UiTextProvider";


import { Check, ChevronDown, Pause, Pencil, Play, Plus, RefreshCw, Tag, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { isOwnerTestPromotion, promoAdminAuthTransition, type AdminPromotion, type PromotionAuditEvent, type PromotionForm, type PromotionRedemption } from "../../../lib/promo-codes";
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";
import styles from "./promotions.module.css";

const packs = [{ key: "profile_1", label: "1 Profile", amount: 1200 }, { key: "profile_10", label: "10 Profiles", amount: 5000 }, { key: "profile_25", label: "25 Profiles", amount: 9900 }] as const;
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const blank = (): PromotionForm => ({ code: "", name: "", description: "", status: "paused", audience: "everyone", discountType: "percent_off",
  discountValue: 1000, minimumAmount: 0, eligibleOfferKeys: ["profile_1", "profile_10", "profile_25"], startsAt: null, endsAt: null,
  maxRedemptions: null, maxRedemptionsPerOwner: null });
const localDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value), local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const isoDate = (value: string) => value ? new Date(value).toISOString() : null;
const discount = (promotion: AdminPromotion) => promotion.discountType === "fixed_total" ? `${money(promotion.discountValue)} total`
  : promotion.discountType === "amount_off" ? `${money(promotion.discountValue)} off` : `${promotion.discountValue / 100}% off`;
const lifecycle = (promotion: AdminPromotion) => {
  const now = Date.now();
  if (promotion.status === "archived") return "Deleted";
  if (promotion.status === "paused") return "Paused";
  if (promotion.startsAt && Date.parse(promotion.startsAt) > now) return "Scheduled";
  if (promotion.endsAt && Date.parse(promotion.endsAt) <= now) return "Expired";
  return "Active";
};

async function api(path = "", init?: RequestInit, expectedActorId?: string | null) {
  const { data } = await createBrowserSupabaseClient().auth.getSession();
  const token = data.session?.access_token || "";
  const currentActorId = data.session?.user.id || null;
  if (!token || !currentActorId) throw new Error("Sign in with an admin account.");
  if (expectedActorId && currentActorId !== expectedActorId) throw new Error("The signed-in account changed. Refresh promo codes before trying again.");
  const response = await fetch(`/api/admin/promotions${path}`, { ...init, cache: "no-store", headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok !== true) throw new Error(typeof body.message === "string" ? body.message : "Promo codes could not be loaded.");
  return body;
}

export default function PromoCodesPage() {
  const ui = useUiText("app.admin.promotions.PromoCodesPage");
  const [phase, setPhase] = useState<"loading" | "ready" | "signed-out" | "error">("loading"), [promotions, setPromotions] = useState<AdminPromotion[]>([]);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [showDeleted, setShowDeleted] = useState(false);
  const [modalError, setModalError] = useState("");
  const [editing, setEditing] = useState<{ id: string | null; revision: number | null; value: PromotionForm } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminPromotion | null>(null), [activity, setActivity] = useState<{ id: string; rows: PromotionRedemption[]; changes: PromotionAuditEvent[]; loading: boolean } | null>(null);
  const generation = useRef(0), sessionGeneration = useRef(0), mutationGeneration = useRef(0);
  const actorId = useRef<string | null | undefined>(undefined), authLoaded = useRef(false), requests = useRef(new Set<AbortController>()), mutationActive = useRef(false);
  const abortRequests = useCallback(() => {
    for (const controller of requests.current) controller.abort();
    requests.current.clear();
  }, []);
  const invalidateRequests = useCallback(() => {
    generation.current++;
    sessionGeneration.current++;
    mutationGeneration.current++;
    mutationActive.current = false;
    abortRequests();
  }, [abortRequests]);
  const request = useCallback(async (path = "", init?: RequestInit, expectedActorId?: string | null) => {
    const controller = new AbortController();
    requests.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      return await api(path, { ...init, signal: controller.signal }, expectedActorId);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("The promo request timed out. Try again.");
      throw error;
    } finally {
      window.clearTimeout(timeout);
      requests.current.delete(controller);
    }
  }, []);
  const load = useCallback(async (quiet = false) => {
    const attempt = ++generation.current, sessionLease = sessionGeneration.current, expectedActorId = actorId.current;
    if (!quiet) setPhase("loading");
    setMessage("");
    try {
      const result = await request("", undefined, expectedActorId);
      if (attempt !== generation.current || sessionLease !== sessionGeneration.current || actorId.current !== expectedActorId) return false;
      setPromotions(Array.isArray(result.promotions) ? result.promotions : []);
      setPhase("ready");
      return true;
    } catch (error) {
      if (attempt !== generation.current || sessionLease !== sessionGeneration.current || actorId.current !== expectedActorId) return false;
      const text = error instanceof Error ? error.message : "Promo codes could not be loaded.";
      setMessage(text);
      setPhase(/sign in/i.test(text) ? "signed-out" : "error");
      return false;
    }
  }, [request]);
  useEffect(() => {
    let alive = true;
    const auth = createBrowserSupabaseClient().auth;
    const observe = (nextActorId: string | null) => {
      if (!alive) return;
      const transition = promoAdminAuthTransition(actorId.current, nextActorId, authLoaded.current);
      actorId.current = transition.actorId;
      if (transition.resetWorkspace) {
        invalidateRequests(); setEditing(null); setConfirmDelete(null); setActivity(null); setPromotions([]); setMessage(""); setModalError(""); setBusy(false);
      }
      if (transition.reload) { authLoaded.current = true; void load(); }
    };
    void auth.getSession().then(({ data }) => observe(data.session?.user?.id || null));
    const { data } = auth.onAuthStateChange((_event, session) => observe(session?.user?.id || null));
    return () => { alive = false; invalidateRequests(); data.subscription.unsubscribe(); };
  }, [invalidateRequests, load]);
  async function mutate(payload: Record<string, unknown>, surface: "page" | "modal" = "page") {
    if (mutationActive.current) return;
    const expectedActorId = actorId.current, sessionLease = sessionGeneration.current, operation = ++mutationGeneration.current;
    mutationActive.current = true;
    setBusy(true);
    setMessage("");
    setModalError("");
    try {
      await request("", { method: "POST", body: JSON.stringify(payload) }, expectedActorId);
      if (operation !== mutationGeneration.current || sessionLease !== sessionGeneration.current || actorId.current !== expectedActorId) return;
      setEditing(null);
      setConfirmDelete(null);
      const refreshed = await load(true);
      if (refreshed && operation === mutationGeneration.current && sessionLease === sessionGeneration.current && actorId.current === expectedActorId) setMessage(ui("ui.app.admin.promotions.PromoCodesPage.0da533822a1b", "Promo settings saved."));
    } catch (error) {
      if (operation !== mutationGeneration.current || sessionLease !== sessionGeneration.current || actorId.current !== expectedActorId) return;
      const text = error instanceof Error ? error.message : "Promo settings could not be saved.";
      if (surface === "modal") setModalError(text);
      else setMessage(text);
    } finally {
      if (operation === mutationGeneration.current && sessionLease === sessionGeneration.current && actorId.current === expectedActorId) {
        mutationActive.current = false;
        setBusy(false);
      }
    }
  }
  function edit(promotion?: AdminPromotion) {
    setModalError("");
    if (!promotion) { setEditing({ id: null, revision: null, value: blank() }); return; }
    setEditing({ id: promotion.id, revision: promotion.revision, value: { code: promotion.code, name: promotion.name, description: promotion.description,
      status: promotion.status === "active" ? "active" : "paused", audience: promotion.audience, discountType: promotion.discountType,
      discountValue: promotion.discountValue, minimumAmount: promotion.minimumAmount, eligibleOfferKeys: [...promotion.eligibleOfferKeys],
      startsAt: promotion.startsAt, endsAt: promotion.endsAt, maxRedemptions: promotion.maxRedemptions,
      maxRedemptionsPerOwner: promotion.maxRedemptionsPerOwner } });
  }
  async function showActivity(promotion: AdminPromotion) {
    if (activity?.id === promotion.id) { setActivity(null); return; }
    const expectedActorId = actorId.current, sessionLease = sessionGeneration.current;
    setActivity({ id: promotion.id, rows: [], changes: [], loading: true });
    try {
      const result = await request(`?promotionId=${encodeURIComponent(promotion.id)}`, undefined, expectedActorId);
      if (sessionLease !== sessionGeneration.current || actorId.current !== expectedActorId) return;
      setActivity(current => current?.id === promotion.id ? { id: promotion.id, rows: Array.isArray(result.redemptions) ? result.redemptions : [], changes: Array.isArray(result.changes) ? result.changes : [], loading: false } : current);
    } catch (error) {
      if (sessionLease !== sessionGeneration.current || actorId.current !== expectedActorId) return;
      setMessage(error instanceof Error ? error.message : ui("ui.app.admin.promotions.PromoCodesPage.4265decbed26", "Redemptions could not be loaded.")); setActivity(null);
    }
  }
  const visible = promotions.filter(promotion => showDeleted || promotion.status !== "archived");
  const activeOwnerTests = promotions.filter(promotion => isOwnerTestPromotion(promotion.code) && lifecycle(promotion) === "Active");
  return <><Nav /><main className={styles.page}><div className={styles.shell}>
    <Link href="/admin" className={styles.back}>{ui("ui.app.admin.promotions.PromoCodesPage.16e881b44db3", "Admin / Commerce / Promo codes")}</Link>
    <header className={styles.header}><div><p>{ui("ui.app.admin.promotions.PromoCodesPage.8a40e6aeedf2", "Commerce")}</p><h1>{ui("ui.app.admin.promotions.PromoCodesPage.9ab150d3af8e", "Promo codes")}</h1><span>{ui("ui.app.admin.promotions.PromoCodesPage.e0da29dd7196", "Create and control checkout discounts without changing your Profile pack prices.")}</span></div><div className={styles.headerActions}><button type="button" onClick={() => void load(true)} disabled={busy || phase === "loading"}><RefreshCw size={16} />{" "}{ui("ui.app.admin.promotions.PromoCodesPage.0e9161011702", "Refresh")}</button><button type="button" className={styles.primary} onClick={() => edit()} disabled={busy || phase !== "ready"}><Plus size={16} />{" "}{ui("ui.app.admin.promotions.PromoCodesPage.16c698d4c765", "New promo code")}</button></div></header>
    {message && <p className={phase === "error" ? styles.error : styles.message} role={phase === "error" ? "alert" : "status"}>{message}</p>}
    {phase === "loading" && <section className={styles.notice} role="status">{ui("ui.app.admin.promotions.PromoCodesPage.6b31d25095ab", "Loading promo codes…")}</section>}
    {phase === "signed-out" && <section className={styles.notice}><h2>{ui("ui.app.admin.promotions.PromoCodesPage.34ce755e229e", "Admin sign-in required")}</h2><Link className={styles.primaryLink} href={`/login?next=${encodeURIComponent("/admin/promotions")}`}>{ui("ui.app.admin.promotions.PromoCodesPage.bfd402b2f6f3", "Sign in")}</Link></section>}
    {phase === "error" && <section className={styles.notice}><h2>{ui("ui.app.admin.promotions.PromoCodesPage.cf81b9789278", "Promo codes are unavailable.")}</h2><button type="button" onClick={() => void load()}>{ui("ui.app.admin.promotions.PromoCodesPage.d8b8392e2c54", "Try again")}</button></section>}
    {phase === "ready" && <>
      <section className={styles.stats} aria-label={ui("ui.app.admin.promotions.PromoCodesPage.dc3652f3b0e9", "Promotion summary")}><div><strong>{promotions.filter(p => lifecycle(p) === "Active").length}</strong><span>{ui("ui.app.admin.promotions.PromoCodesPage.96879611650f", "active")}</span></div><div><strong>{promotions.reduce((sum, p) => sum + p.completedRedemptions, 0)}</strong><span>{ui("ui.app.admin.promotions.PromoCodesPage.e5a4a69c8e5f", "paid orders")}</span></div><div><strong>{money(promotions.reduce((sum, p) => sum + p.grossCapturedAmount, 0))}</strong><span>{ui("ui.app.admin.promotions.PromoCodesPage.a9bb42e53a0e", "gross captured")}</span></div></section>
      <p className={styles.financialNote}>{ui("ui.app.admin.promotions.PromoCodesPage.1df19ab2c46a", "Gross captured is the checkout amount before PayPal fees and does not subtract refunds or disputes. Orders with a refund or dispute are flagged separately.")}</p>
      {activeOwnerTests.length > 0 && <div className={styles.testBanners}>{activeOwnerTests.map(item => <section className={styles.testBanner} key={item.id}><div><Tag size={20} /><div><strong>{item.code}{" "}{ui("ui.app.admin.promotions.PromoCodesPage.9e06032de5e4", "test pricing is active")}</strong><span>{item.code === "GARYWON" ? ui("ui.app.admin.promotions.PromoCodesPage.bb428c470878", "Admin-only $0.30 checkout for PayPal, card, and Venmo acceptance tests.") : ui("ui.app.admin.promotions.PromoCodesPage.b2d76fe0c72d", "Admin-only $1.00 checkout for Apple Pay acceptance tests.")}</span></div></div><button type="button" disabled={busy} onClick={() => void mutate({ action: "status", promotionId: item.id, expectedRevision: item.revision, status: "paused" })}><Pause size={15} />{" "}{ui("ui.app.admin.promotions.PromoCodesPage.858e4ba7a29f", "Pause")}{" "}{item.code}</button></section>)}</div>}
      <div className={styles.toolbar}><h2>{ui("ui.app.admin.promotions.PromoCodesPage.e0d1d308a679", "Codes")}</h2><label><input type="checkbox" checked={showDeleted} onChange={event => setShowDeleted(event.target.checked)} />{" "}{ui("ui.app.admin.promotions.PromoCodesPage.b7564a98dd3f", "Show deleted codes")}</label></div>
      {!visible.length && <section className={styles.notice}><h2>{ui("ui.app.admin.promotions.PromoCodesPage.706db2ffdc22", "No promo codes yet.")}</h2><p>{ui("ui.app.admin.promotions.PromoCodesPage.fa86ce302e53", "Create one when you need a launch offer, private test total, or customer recovery credit.")}</p></section>}
      <div className={styles.list}>{visible.map(promotion => { const state = lifecycle(promotion), open = activity?.id === promotion.id; return <article key={promotion.id} className={`${styles.card} ${isOwnerTestPromotion(promotion.code) ? styles.testCard : ""}`}>
        <div className={styles.cardTop}><div><div className={styles.codeLine}><code>{promotion.code}</code><span data-state={state.toLowerCase()}>{state}</span>{promotion.audience === "admin" && <em>{ui("ui.app.admin.promotions.PromoCodesPage.eb9b3c6514e2", "Internal only")}</em>}</div><h3>{promotion.name}</h3><p>{promotion.description || ui("ui.app.admin.promotions.PromoCodesPage.07fc74f1706c", "No internal description.")}</p></div><strong>{discount(promotion)}</strong></div>
        <dl><div><dt>{ui("ui.app.admin.promotions.PromoCodesPage.27c545b1467d", "Profile packs")}</dt><dd>{promotion.eligibleOfferKeys.map(key => packs.find(pack => pack.key === key)?.label).join(", ")}</dd></div><div><dt>{ui("ui.app.admin.promotions.PromoCodesPage.9e6151acb057", "Uses")}</dt><dd>{promotion.completedRedemptions}{" "}{ui("ui.app.admin.promotions.PromoCodesPage.4ad4a6d71382", "paid ·")}{" "}{promotion.reservedRedemptions}{" "}{ui("ui.app.admin.promotions.PromoCodesPage.2b6b853c9e59", "in progress")}{promotion.adjustedRedemptions ? ui("ui.app.admin.promotions.PromoCodesPage.e577694152af", " · {{value1}} refund/dispute flagged", { value1: promotion.adjustedRedemptions }) : ""}{promotion.maxRedemptions ? ui("ui.app.admin.promotions.PromoCodesPage.9fbe03ec90ed", " · {{value1}} max", { value1: promotion.maxRedemptions }) : ""}</dd></div><div><dt>{ui("ui.app.admin.promotions.PromoCodesPage.f4830a1dae29", "Schedule")}</dt><dd>{promotion.startsAt ? new Date(promotion.startsAt).toLocaleString() : ui("ui.app.admin.promotions.PromoCodesPage.0fe556b25edd", "Immediately")} → {promotion.endsAt ? new Date(promotion.endsAt).toLocaleString() : ui("ui.app.admin.promotions.PromoCodesPage.6c43e8399a11", "No end date")}</dd></div><div><dt>{ui("ui.app.admin.promotions.PromoCodesPage.2793293fdc77", "Gross captured")}</dt><dd>{money(promotion.grossCapturedAmount)}</dd></div></dl>
        <div className={styles.actions}>{promotion.status !== "archived" && <><button type="button" onClick={() => edit(promotion)} disabled={busy}><Pencil size={15} />{" "}{ui("ui.app.admin.promotions.PromoCodesPage.464c4ffd019e", "Edit")}</button><button type="button" onClick={() => void mutate({ action: "status", promotionId: promotion.id, expectedRevision: promotion.revision, status: promotion.status === "active" ? "paused" : "active" })} disabled={busy}>{promotion.status === "active" ? <><Pause size={15} />{" "}{ui("ui.app.admin.promotions.PromoCodesPage.858e4ba7a29f", "Pause")}</> : <><Play size={15} />{" "}{ui("ui.app.admin.promotions.PromoCodesPage.d640c7421da0", "Resume")}</>}</button>{!isOwnerTestPromotion(promotion.code) && <button type="button" className={styles.danger} onClick={() => { setModalError(""); setConfirmDelete(promotion); }} disabled={busy}><Trash2 size={15} />{" "}{ui("ui.app.admin.promotions.PromoCodesPage.e2d0a54968ea", "Delete")}</button>}</>}<button type="button" onClick={() => void showActivity(promotion)} disabled={busy} aria-expanded={open} aria-label={ui("ui.app.admin.promotions.PromoCodesPage.26339839165e", "View activity for {{value1}}", { value1: promotion.code })}><ChevronDown size={15} />{" "}{ui("ui.app.admin.promotions.PromoCodesPage.38da1505ca83", "Activity")}</button></div>
        {open && <section className={styles.activity}><h4>{ui("ui.app.admin.promotions.PromoCodesPage.c1873f8b0102", "Recent uses")}</h4>{activity.loading ? <p>{ui("ui.app.admin.promotions.PromoCodesPage.ba3bbbe10d8b", "Loading…")}</p> : !activity.rows.length ? <p>{ui("ui.app.admin.promotions.PromoCodesPage.54a8b4a2444c", "No checkout has used this code.")}</p> : <div className={styles.tableWrap}><table><thead><tr><th>{ui("ui.app.admin.promotions.PromoCodesPage.99c40ab40592", "Date")}</th><th>{ui("ui.app.admin.promotions.PromoCodesPage.7e1b0d5641f2", "Account")}</th><th>{ui("ui.app.admin.promotions.PromoCodesPage.80dc21673e55", "Pack")}</th><th>{ui("ui.app.admin.promotions.PromoCodesPage.c9b3c38247f7", "Total")}</th><th>{ui("ui.app.admin.promotions.PromoCodesPage.920e413c7d41", "Status")}</th></tr></thead><tbody>{activity.rows.map(row => <tr key={row.orderId}><td>{new Date(row.createdAt).toLocaleString()}</td><td><code>{row.ownerId.slice(0, 8)}…</code></td><td>{row.credits}{" "}{ui("ui.app.admin.promotions.PromoCodesPage.535e52e4a261", "Profiles")}</td><td>{money(row.finalAmount)}</td><td>{row.status}</td></tr>)}</tbody></table></div>}<h4>{ui("ui.app.admin.promotions.PromoCodesPage.964de7c92efe", "Change history")}</h4>{!activity.loading && (!activity.changes.length ? <p>{ui("ui.app.admin.promotions.PromoCodesPage.9fe2d22de32e", "No changes have been recorded.")}</p> : <div className={styles.tableWrap}><table><thead><tr><th>{ui("ui.app.admin.promotions.PromoCodesPage.99c40ab40592", "Date")}</th><th>{ui("ui.app.admin.promotions.PromoCodesPage.c0bf75bd78bf", "Change")}</th><th>{ui("ui.app.admin.promotions.PromoCodesPage.c1c224b03cd9", "Admin")}</th><th>{ui("ui.app.admin.promotions.PromoCodesPage.f81ab834de5f", "Reason")}</th></tr></thead><tbody>{activity.changes.map(change => <tr key={change.id}><td>{new Date(change.createdAt).toLocaleString()}</td><td>{change.action}{" "}{ui("ui.app.admin.promotions.PromoCodesPage.c281c642339e", "· revision")}{" "}{change.revision}</td><td>{change.operatorEmail || ui("ui.app.admin.promotions.PromoCodesPage.8a95a224a545", "Deleted admin")}</td><td>{change.reason}</td></tr>)}</tbody></table></div>)}</section>}
      </article>; })}</div>
    </>}
  </div></main><Footer />
  {editing && <PromotionEditor editing={editing} busy={busy} error={modalError} onClose={() => { setModalError(""); setEditing(null); }} onChange={setEditing} onSave={() => void mutate(editing.id ? { action: "update", promotionId: editing.id, expectedRevision: editing.revision, promotion: editing.value } : { action: "create", promotion: editing.value }, "modal")} />}
  {confirmDelete && <DeletePromotion promotion={confirmDelete} busy={busy} error={modalError} onClose={() => { setModalError(""); setConfirmDelete(null); }} onDelete={() => void mutate({ action: "status", promotionId: confirmDelete.id, expectedRevision: confirmDelete.revision, status: "archived" }, "modal")} />}
  </>;
}

function useModalFocus(onClose: () => void, busy: boolean) {
  const dialog = useRef<HTMLElement>(null), close = useRef(onClose), blocked = useRef(busy);
  close.current = onClose; blocked.current = busy;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null, node = dialog.current;
    if (!node) return;
    const focusable = () => [...node.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter(item => !item.hidden);
    (focusable()[0] || node).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !blocked.current) { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable(); if (!items.length) { event.preventDefault(); node.focus(); return; }
      const first = items[0], last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, []);
  return dialog;
}

export function DeletePromotion({ promotion, busy, error, onClose, onDelete }: { promotion: AdminPromotion; busy: boolean; error: string; onClose(): void; onDelete(): void }) {
  const ui = useUiText("app.admin.promotions.PromoCodesPage");
  const dialog = useModalFocus(onClose, busy);
  return <div className={styles.modalBackdrop}><section ref={dialog} tabIndex={-1} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="delete-promo-title"><button type="button" className={styles.modalClose} onClick={onClose} disabled={busy} aria-label={ui("ui.app.admin.promotions.PromoCodesPage.7d9eb7acb13e", "Close")}><X size={18} /></button><p>{ui("ui.app.admin.promotions.PromoCodesPage.6473b3f196fa", "Delete promo code")}</p><h2 id="delete-promo-title">{ui("ui.app.admin.promotions.PromoCodesPage.e2d0a54968ea", "Delete")}{" "}{promotion.code}?</h2><span>{ui("ui.app.admin.promotions.PromoCodesPage.f16060698598", "It will stop working immediately. Payment, redemption, and change history will remain available for your records.")}</span>{error ? <p className={styles.error} role="alert" aria-live="assertive">{error}</p> : null}<div className={styles.modalActions}><button type="button" onClick={onClose} disabled={busy}>{ui("ui.app.admin.promotions.PromoCodesPage.19766ed6ccb2", "Cancel")}</button><button type="button" className={styles.dangerPrimary} disabled={busy} onClick={onDelete}>{busy ? ui("ui.app.admin.promotions.PromoCodesPage.43b5894c3e4e", "Deleting…") : ui("ui.app.admin.promotions.PromoCodesPage.b783180f921b", "Delete code")}</button></div></section></div>;
}

export function PromotionEditor({ editing, busy, error, onClose, onChange, onSave }: { editing: { id: string | null; revision: number | null; value: PromotionForm }; busy: boolean; error: string; onClose(): void; onChange(value: typeof editing): void; onSave(): void }) {
  const ui = useUiText("app.admin.promotions.PromoCodesPage");
  const dialog = useModalFocus(onClose, busy);
  const value = editing.value, set = (patch: Partial<PromotionForm>) => onChange({ ...editing, value: { ...value, ...patch } });
  const ownerTest = Boolean(editing.id && isOwnerTestPromotion(value.code));
  const displayValue = value.discountType === "percent_off" ? value.discountValue / 100 : value.discountValue / 100;
  const eligibleAmounts = packs.filter(pack => value.eligibleOfferKeys.includes(pack.key)).map(pack => pack.amount);
  const limitValid = (limit: number | null) => limit === null || Number.isSafeInteger(limit) && limit > 0;
  const valid = /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(value.code) && value.name.trim().length > 0 && value.eligibleOfferKeys.length > 0 && value.discountValue > 0
    && Number.isSafeInteger(value.discountValue) && Number.isSafeInteger(value.minimumAmount) && value.minimumAmount >= 0
    && (value.discountType !== "percent_off" || value.discountValue <= 10_000)
    && (value.discountType !== "fixed_total" || value.discountValue >= 30 && eligibleAmounts.every(amount => value.discountValue < amount))
    && eligibleAmounts.some(amount => amount >= value.minimumAmount) && limitValid(value.maxRedemptions) && limitValid(value.maxRedemptionsPerOwner)
    && (value.maxRedemptions === null || value.maxRedemptionsPerOwner === null || value.maxRedemptionsPerOwner <= value.maxRedemptions)
    && (!value.startsAt || Number.isFinite(Date.parse(value.startsAt))) && (!value.endsAt || Number.isFinite(Date.parse(value.endsAt)))
    && (!value.startsAt || !value.endsAt || Date.parse(value.startsAt) < Date.parse(value.endsAt));
  return <div className={styles.modalBackdrop}><section ref={dialog} tabIndex={-1} className={`${styles.modal} ${styles.editor}`} role="dialog" aria-modal="true" aria-labelledby="promo-editor-title"><button type="button" className={styles.modalClose} onClick={onClose} disabled={busy} aria-label={ui("ui.app.admin.promotions.PromoCodesPage.7d9eb7acb13e", "Close")}><X size={18} /></button><p>{editing.id ? ui("ui.app.admin.promotions.PromoCodesPage.e8fa111dcaf5", "Edit promo") : ui("ui.app.admin.promotions.PromoCodesPage.b8c98da932bc", "New promo")}</p><h2 id="promo-editor-title">{editing.id ? value.code : ui("ui.app.admin.promotions.PromoCodesPage.c24a413eec4a", "Create a promo code")}</h2>{error ? <p className={styles.error} role="alert" aria-live="assertive">{error}</p> : null}<div className={styles.formGrid}>
    <label>{ui("ui.app.admin.promotions.PromoCodesPage.340f463033e0", "Code")}<input value={value.code} disabled={Boolean(editing.id) || busy} onChange={event => set({ code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32) })} autoCapitalize="characters" autoComplete="off" /><span>{ui("ui.app.admin.promotions.PromoCodesPage.e1261692acf2", "3–32 letters, numbers, dashes, or underscores. A code cannot be renamed.")}</span></label>
    <label>{ui("ui.app.admin.promotions.PromoCodesPage.dcd1d5223f73", "Name")}<input value={value.name} disabled={busy} maxLength={80} onChange={event => set({ name: event.target.value })} /></label>
    <label className={styles.wide}>{ui("ui.app.admin.promotions.PromoCodesPage.a1499b095201", "Internal description")}<textarea value={value.description} disabled={busy} maxLength={500} rows={2} onChange={event => set({ description: event.target.value })} /></label>
    {!editing.id && <label>{ui("ui.app.admin.promotions.PromoCodesPage.1bf0c98cbb3d", "Start status")}<select value={value.status} disabled={busy} onChange={event => set({ status: event.target.value as PromotionForm["status"] })}><option value="paused">{ui("ui.app.admin.promotions.PromoCodesPage.e159b06187d3", "Paused")}</option><option value="active">{ui("ui.app.admin.promotions.PromoCodesPage.92340695899b", "Active")}</option></select></label>}
    {ownerTest && <p className={styles.lockedFields}>{ui("ui.app.admin.promotions.PromoCodesPage.b551416a997c", "Audience, test total, minimum, and eligible packs are protected. You can still change the description, schedule, limits, or pause this code.")}</p>}
    <label>{ui("ui.app.admin.promotions.PromoCodesPage.82d9af69e1a1", "Who can use it")}<select value={value.audience} disabled={busy || ownerTest} onChange={event => set({ audience: event.target.value as PromotionForm["audience"] })}><option value="everyone">{ui("ui.app.admin.promotions.PromoCodesPage.b962e22b63e3", "All signed-in customers")}</option><option value="admin">{ui("ui.app.admin.promotions.PromoCodesPage.01ad8a325b57", "Admins only · internal testing")}</option></select></label>
    <label>{ui("ui.app.admin.promotions.PromoCodesPage.5fc1bee6f576", "Discount type")}<select value={value.discountType} disabled={busy || ownerTest} onChange={event => set({ discountType: event.target.value as PromotionForm["discountType"], discountValue: event.target.value === "fixed_total" ? 30 : event.target.value === "percent_off" ? 1000 : 100 })}><option value="percent_off">{ui("ui.app.admin.promotions.PromoCodesPage.3ef91808fe1d", "Percent off")}</option><option value="amount_off">{ui("ui.app.admin.promotions.PromoCodesPage.4d7bd8c702da", "Dollar amount off")}</option><option value="fixed_total">{ui("ui.app.admin.promotions.PromoCodesPage.dcd6970e8aea", "Set final checkout total")}</option></select></label>
    <label>{value.discountType === "percent_off" ? ui("ui.app.admin.promotions.PromoCodesPage.716d633b125a", "Percent") : value.discountType === "fixed_total" ? ui("ui.app.admin.promotions.PromoCodesPage.4f7e2973451c", "Final total (USD)") : ui("ui.app.admin.promotions.PromoCodesPage.5885859950ca", "Amount off (USD)")}<input type="number" min={value.discountType === "fixed_total" ? .3 : .01} max={value.discountType === "percent_off" ? 100 : 1000000} step={value.discountType === "percent_off" ? .01 : .01} value={displayValue || ""} disabled={busy || ownerTest} onChange={event => set({ discountValue: Math.round(Number(event.target.value) * 100) })} /></label>
    <label>{ui("ui.app.admin.promotions.PromoCodesPage.36c84f77ee41", "Minimum pack price (USD)")}<input type="number" min="0" max="1000000" step="0.01" value={value.minimumAmount / 100 || ""} placeholder={ui("ui.app.admin.promotions.PromoCodesPage.75d0a7642fe8", "No minimum")} disabled={busy || ownerTest} onChange={event => set({ minimumAmount: Math.round(Number(event.target.value || 0) * 100) })} /><span>{ui("ui.app.admin.promotions.PromoCodesPage.f4efe4b320a8", "The regular pack price required before this code can apply.")}</span></label>
    <fieldset className={styles.wide} disabled={busy || ownerTest}><legend>{ui("ui.app.admin.promotions.PromoCodesPage.8ccfba6d3739", "Eligible Profile packs")}</legend>{packs.map(pack => <label key={pack.key}><input type="checkbox" checked={value.eligibleOfferKeys.includes(pack.key)} disabled={busy || ownerTest} onChange={event => set({ eligibleOfferKeys: event.target.checked ? [...value.eligibleOfferKeys, pack.key] : value.eligibleOfferKeys.filter(key => key !== pack.key) })} /> {(pack.label === "1 Profile" ? ui("ui.app.admin.promotions.PromoCodesPage.3eda8b62d6a9", "1 Profile") : pack.label === "10 Profiles" ? ui("ui.app.admin.promotions.PromoCodesPage.ebd500dd81fb", "10 Profiles") : pack.label === "25 Profiles" ? ui("ui.app.admin.promotions.PromoCodesPage.329f23c525ce", "25 Profiles") : "")}</label>)}</fieldset>
    <label>{ui("ui.app.admin.promotions.PromoCodesPage.96dbedeca7df", "Starts")}<input type="datetime-local" value={localDate(value.startsAt)} disabled={busy} onChange={event => set({ startsAt: isoDate(event.target.value) })} /></label>
    <label>{ui("ui.app.admin.promotions.PromoCodesPage.e98982c9f2ba", "Ends")}<input type="datetime-local" value={localDate(value.endsAt)} disabled={busy} onChange={event => set({ endsAt: isoDate(event.target.value) })} /></label>
    <label>{ui("ui.app.admin.promotions.PromoCodesPage.27293bf74e83", "Total use limit")}<input type="number" min="1" step="1" placeholder={ui("ui.app.admin.promotions.PromoCodesPage.f7fcff0d8fea", "No limit")} value={value.maxRedemptions ?? ""} disabled={busy} onChange={event => set({ maxRedemptions: event.target.value ? Number(event.target.value) : null })} /></label>
    <label>{ui("ui.app.admin.promotions.PromoCodesPage.4d794e051d35", "Uses per account")}<input type="number" min="1" step="1" placeholder={ui("ui.app.admin.promotions.PromoCodesPage.f7fcff0d8fea", "No limit")} value={value.maxRedemptionsPerOwner ?? ""} disabled={busy} onChange={event => set({ maxRedemptionsPerOwner: event.target.value ? Number(event.target.value) : null })} /></label>
  </div><div className={styles.modalActions}><button type="button" onClick={onClose} disabled={busy}>{ui("ui.app.admin.promotions.PromoCodesPage.19766ed6ccb2", "Cancel")}</button><button type="button" className={styles.primary} onClick={onSave} disabled={busy || !valid}>{busy ? ui("ui.app.admin.promotions.PromoCodesPage.23e39291d613", "Saving…") : editing.id ? ui("ui.app.admin.promotions.PromoCodesPage.dd0ae7a5cbcf", "Save changes") : ui("ui.app.admin.promotions.PromoCodesPage.97f9a49317f5", "Create promo code")}</button></div></section></div>;
}
