"use client";

import Link from "next/link";
import { ChevronDown, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUiText } from "./UiTextProvider";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";
import styles from "./ActionEmailStatus.module.css";

type EventName = "claim.ownerReview" | "claim.moreInfo" | "claim.approved" | "claim.declined" | "claim.expired" | "service.revisionRequested" | "service.approved" | "service.declined" | "service.cancelled" | "ownership.transferAccepted" | "ownership.transferCancelled";
type DeliveryState = "queued" | "leased" | "dispatching" | "retry" | "accepted" | "failed" | "unknown" | "suppressed";
export type ActionEmailItem = { id: string; event: EventName; state: DeliveryState; attempts: number; claimId: string | null; submissionId: string | null; transferId: string | null; updatedAt: string; createdAt: string; nextAttemptAt: string; code: string | null; canRetry: boolean; canReconcile: boolean };
export type ActionEmailPage = { captureEnabled: boolean; dispatchEnabled: boolean; queued: number; unknown: number; failed: number; accepted: number; inFlight: number; suppressed: number; total: number; offset: number; oldestPendingAt: string | null; limit: 50; items: ActionEmailItem[] };
export type ActionEmailResolution = { intentId: string; expectedUpdatedAt: string; resolution: "retry" | "confirmed_accepted" | "confirmed_not_accepted"; reason: string; providerMessageId?: string };
type RequestResult = { kind: "ready"; status: ActionEmailPage; reconciled: boolean } | { kind: "unconfirmed"; status?: ActionEmailPage } | { kind: "disabled" } | { kind: "unavailable" } | { kind: "invalid" };
type Ui = (key: string, fallback: string, values?: Record<string, string | number>) => string;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const EVENTS: EventName[] = ["claim.ownerReview", "claim.moreInfo", "claim.approved", "claim.declined", "claim.expired", "service.revisionRequested", "service.approved", "service.declined", "service.cancelled", "ownership.transferAccepted", "ownership.transferCancelled"];
const STATES: DeliveryState[] = ["queued", "leased", "dispatching", "retry", "accepted", "failed", "unknown", "suppressed"];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const timestamp = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));

export function parseActionEmailItem(value: unknown): ActionEmailItem | null {
  const transferId = record(value) && value.transferId !== undefined ? value.transferId : null;
  if (!record(value) || typeof value.id !== "string" || !UUID.test(value.id) || !EVENTS.includes(value.event as EventName) || !STATES.includes(value.state as DeliveryState)
    || !Number.isInteger(value.attempts) || Number(value.attempts) < 0 || Number(value.attempts) > 6 || !timestamp(value.updatedAt) || !timestamp(value.createdAt) || !timestamp(value.nextAttemptAt)
    || typeof value.canRetry !== "boolean" || typeof value.canReconcile !== "boolean" || (value.code !== null && (typeof value.code !== "string" || !/^[a-z_]{1,100}$/.test(value.code)))
    || (String(value.event).startsWith("service.") ? typeof value.submissionId !== "string" || !UUID.test(value.submissionId) || value.claimId !== null || transferId !== null
      : String(value.event).startsWith("ownership.") ? typeof transferId !== "string" || !UUID.test(transferId) || value.claimId !== null || value.submissionId !== null
      : typeof value.claimId !== "string" || !UUID.test(value.claimId) || value.submissionId !== null || transferId !== null)) return null;
  return { id: value.id, event: value.event as EventName, state: value.state as DeliveryState, attempts: Number(value.attempts), claimId: value.claimId as string | null, submissionId: value.submissionId as string | null, transferId: transferId as string | null,
    updatedAt: value.updatedAt, createdAt: value.createdAt, nextAttemptAt: value.nextAttemptAt, code: value.code as string | null, canRetry: value.canRetry, canReconcile: value.canReconcile };
}

export function parseActionEmailPage(value: unknown): ActionEmailPage | null {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 50 || value.limit !== 50 || typeof value.captureEnabled !== "boolean" || typeof value.dispatchEnabled !== "boolean"
    || (value.oldestPendingAt !== null && !timestamp(value.oldestPendingAt))) return null;
  const counts = {} as Record<"queued" | "unknown" | "failed" | "accepted" | "inFlight" | "suppressed" | "total" | "offset", number>;
  for (const key of ["queued", "unknown", "failed", "accepted", "inFlight", "suppressed", "total", "offset"] as const) {
    if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0) return null;
    counts[key] = Number(value[key]);
  }
  const items = value.items.map(parseActionEmailItem);
  if (items.some(item => !item)) return null;
  return { captureEnabled: value.captureEnabled, dispatchEnabled: value.dispatchEnabled, ...counts, oldestPendingAt: value.oldestPendingAt as string | null, limit: 50, items: items as ActionEmailItem[] };
}

export function actionEmailSessionChanged(event: string, previousActor: string, nextActor: string | undefined) {
  if (event === "INITIAL_SESSION") return false;
  if (event === "SIGNED_OUT") return true;
  return Boolean(previousActor && (!nextActor || nextActor !== previousActor));
}

export async function boundedActionEmailSession<T>(read: () => Promise<T>, signal?: AbortSignal, timeoutMs = 15000) {
  let rejectStop: (error: Error) => void = () => {};
  const stopped = new Promise<never>((_resolve, reject) => { rejectStop = reject; });
  const stop = () => rejectStop(new Error("Administrator session check timed out or was cancelled."));
  if (signal?.aborted) stop(); else signal?.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(stop, timeoutMs);
  try { return await Promise.race([Promise.resolve().then(read), stopped]); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", stop); }
}

export function actionEmailResolutionValid(value: ActionEmailResolution) {
  const reason = value.reason.trim();
  const receipt = value.providerMessageId?.trim();
  return UUID.test(value.intentId) && timestamp(value.expectedUpdatedAt) && ["retry", "confirmed_accepted", "confirmed_not_accepted"].includes(value.resolution)
    && reason.length >= 10 && reason.length <= 1000 && !/[\x00-\x1f\x7f]/.test(reason)
    && (value.resolution === "confirmed_accepted" ? !!receipt && receipt.length <= 300 && !/[\x00-\x1f\x7f]/.test(receipt) : value.providerMessageId == null);
}

function resolutionSaved(item: ActionEmailItem | undefined, input: ActionEmailResolution) {
  if (!item || item.id !== input.intentId) return false;
  if (input.resolution === "confirmed_accepted") return item.state === "accepted";
  if (input.resolution === "confirmed_not_accepted") return ["retry", "failed", "suppressed"].includes(item.state);
  return item.state === "retry";
}

async function timedRequest(fetcher: typeof fetch, input: RequestInfo | URL, init: RequestInit, outerSignal?: AbortSignal, timeoutMs = 15000) {
  const controller = new AbortController();
  let rejectAbort: (error: Error) => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const abort = () => { controller.abort(); rejectAbort(new Error("Action-email request timed out or was cancelled.")); };
  if (outerSignal?.aborted) abort(); else outerSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    return await Promise.race([(async () => {
      const response = await fetcher(input, { ...init, signal: controller.signal });
      return { response, payload: await responseObject(response) };
    })(), aborted]);
  } finally { clearTimeout(timer); outerSignal?.removeEventListener("abort", abort); }
}

async function responseObject(response: Response) {
  try { const value: unknown = await response.json(); return record(value) ? value : null; }
  catch { return null; }
}

export async function requestActionEmailStatus(options: { token: string; offset: number; input?: ActionEmailResolution; signal?: AbortSignal; fetcher?: typeof fetch; timeoutMs?: number }): Promise<RequestResult> {
  const { token, input, signal, timeoutMs } = options;
  if (!token || !Number.isSafeInteger(options.offset) || options.offset < 0 || options.offset > 1000000 || (input && !actionEmailResolutionValid(input))) return { kind: "invalid" };
  const fetcher = options.fetcher || fetch;
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  if (input) {
    const body = JSON.stringify({ intentId: input.intentId, expectedUpdatedAt: input.expectedUpdatedAt, resolution: input.resolution, reason: input.reason.trim(), ...(input.resolution === "confirmed_accepted" ? { providerMessageId: input.providerMessageId!.trim() } : {}) });
    if (new TextEncoder().encode(body).length > 8192) return { kind: "invalid" };
    try {
      const { response, payload } = await timedRequest(fetcher, "/api/admin/action-email", { method: "PATCH", headers, body }, signal, timeoutMs);
      if (payload?.code === "disabled") return { kind: "disabled" };
    } catch { /* A lost mutation response must reconcile through GET and must never be replayed automatically. */ }
  }
  const pageOffset = options.offset;
  try {
    const { response, payload } = await timedRequest(fetcher, `/api/admin/action-email?offset=${pageOffset}`, { headers, cache: "no-store" }, signal, timeoutMs);
    if (payload?.code === "disabled") return { kind: "disabled" };
    if (!response.ok || payload?.ok !== true) return input ? { kind: "unconfirmed" } : { kind: "unavailable" };
    const status = parseActionEmailPage(payload.status);
    if (!status || status.offset !== pageOffset) return input ? { kind: "unconfirmed" } : { kind: "unavailable" };
    if (input && !resolutionSaved(status.items.find(item => item.id === input.intentId), input)) return { kind: "unconfirmed", status };
    return { kind: "ready", status, reconciled: Boolean(input) };
  } catch { return input ? { kind: "unconfirmed" } : { kind: "unavailable" }; }
}
export function ActionEmailStatus({ sessionTimeoutMs = 15000 }: { sessionTimeoutMs?: number } = {}) {
  const ui = useUiText("components.ActionEmailStatus");
  const [mode, setMode] = useState<"loading" | "ready" | "disabled" | "unavailable">("loading");
  const [status, setStatus] = useState<ActionEmailPage | null>(null), [offset, setOffset] = useState(0);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null), [busy, setBusy] = useState(false);
  const revision = useRef(0), actor = useRef(""), operation = useRef<symbol | null>(null), controller = useRef<AbortController | null>(null), offsetRef = useRef(0), noticeRef = useRef<HTMLParagraphElement | null>(null);
  const perform = useCallback(async (input?: ActionEmailResolution, requestedOffset?: number) => {
    const targetOffset = requestedOffset ?? offsetRef.current;
    if (operation.current) return;
    const key = Symbol("action-email-operation"); operation.current = key; setBusy(true); setNotice(null);
    const run = ++revision.current;
    const requestController = new AbortController(); controller.current?.abort(); controller.current = requestController;
    try {
      const session = await boundedActionEmailSession(() => createBrowserSupabaseClient().auth.getSession(), requestController.signal, sessionTimeoutMs);
      if (run !== revision.current) return;
      if (session.error || !session.data.session) {
        setStatus(null); offsetRef.current = 0; setOffset(0); setMode("unavailable"); setNotice({ text: ui("ui.components.ActionEmailStatus.adminRequired", "Sign in with an authorized administrator account to review action-email delivery."), error: true }); return;
      }
      const nextActor = session.data.session.user.id;
      if (actor.current && actor.current !== nextActor) {
        ++revision.current; actor.current = ""; offsetRef.current = 0; setStatus(null); setOffset(0); setMode("unavailable"); setBusy(false); setNotice({ text: ui("ui.components.ActionEmailStatus.accountChanged", "Account changed. Refresh action-email status with the current administrator account."), error: true }); return;
      }
      actor.current = nextActor;
      const result = await requestActionEmailStatus({ token: session.data.session.access_token, offset: targetOffset, input, signal: requestController.signal });
      if (run !== revision.current) return;
      if (result.kind === "disabled") { setStatus(null); setMode("disabled"); return; }
      if (result.kind === "ready") {
        setStatus(result.status); offsetRef.current = result.status.offset; setOffset(result.status.offset); setMode("ready");
        if (result.reconciled) setNotice({ text: ui("ui.components.ActionEmailStatus.saved", "The provider outcome is confirmed in the refreshed delivery record."), error: false });
      } else if (input) {
        if (result.kind === "unconfirmed" && result.status) { setStatus(result.status); offsetRef.current = result.status.offset; setOffset(result.status.offset); setMode("ready"); }
        setNotice({ text: ui("ui.components.ActionEmailStatus.unconfirmed", "The provider outcome is unconfirmed. Refresh delivery status before taking another action; this page will not repeat the update automatically."), error: true });
      } else {
        setStatus(null); setMode("unavailable"); setNotice({ text: ui("ui.components.ActionEmailStatus.unavailable", "Action-email delivery review is unavailable. Refresh and try again."), error: true });
      }
    } catch {
      if (run === revision.current) { setStatus(null); setMode("unavailable"); setNotice({ text: ui("ui.components.ActionEmailStatus.unavailable", "Action-email delivery review is unavailable. Refresh and try again."), error: true }); }
    } finally {
      if (controller.current === requestController) controller.current = null;
      if (operation.current === key) operation.current = null;
      if (run === revision.current) { setBusy(false); if (input) window.requestAnimationFrame(() => noticeRef.current?.focus()); }
    }
  }, [sessionTimeoutMs, ui]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void perform(); });
    const subscription = createBrowserSupabaseClient().auth.onAuthStateChange((event, session) => {
      if (!actor.current && event !== "SIGNED_OUT" && session?.user.id) { actor.current = session.user.id; return; }
      if (!actionEmailSessionChanged(event, actor.current, session?.user.id)) return;
      ++revision.current; controller.current?.abort(); controller.current = null; actor.current = ""; operation.current = null; offsetRef.current = 0;
      setStatus(null); setOffset(0); setMode("unavailable"); setBusy(false); setNotice({ text: ui("ui.components.ActionEmailStatus.accountChanged", "Account changed. Refresh action-email status with the current administrator account."), error: true });
    });
    return () => {
      active = false;
      // Cleanup intentionally invalidates the latest async revision owned by this component.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++revision.current;
      controller.current?.abort(); controller.current = null; operation.current = null; subscription.data.subscription.unsubscribe();
    };
  }, [perform, ui]);
  return <ActionEmailStatusView mode={mode} status={status} offset={offset} busy={busy} notice={notice} noticeRef={noticeRef} ui={ui} onRefresh={() => perform()} onPage={(next) => perform(undefined, next)} onReconcile={(input) => perform(input)} />;
}

export function ActionEmailStatusView({ mode, status, offset, busy, notice, noticeRef, ui, onRefresh, onPage, onReconcile }: { mode: "loading" | "ready" | "disabled" | "unavailable"; status: ActionEmailPage | null; offset: number; busy: boolean; notice: { text: string; error: boolean } | null; noticeRef?: { current: HTMLParagraphElement | null }; ui: Ui; onRefresh(): void; onPage(offset: number): void; onReconcile(input: ActionEmailResolution): void }) {
  return <section className={styles.section} aria-labelledby="action-email-heading">
    <header className={styles.header}><div><span>{ui("ui.components.ActionEmailStatus.eyebrow", "Action-required delivery")}</span><h2 id="action-email-heading">{ui("ui.components.ActionEmailStatus.title", "Workflow email delivery")}</h2></div><button type="button" title={ui("ui.components.ActionEmailStatus.refresh", "Refresh action-email status")} aria-label={ui("ui.components.ActionEmailStatus.refresh", "Refresh action-email status")} disabled={busy} onClick={onRefresh}><RefreshCw size={17} /></button></header>
    <p className={styles.intro}>{ui("ui.components.ActionEmailStatus.intro", "Review email-provider acceptance for ownership and service updates. These controls do not activate delivery.")}</p>
    {notice ? <p ref={noticeRef} className={notice.error ? styles.error : styles.notice} tabIndex={-1} role={notice.error ? "alert" : "status"}>{notice.text}</p> : null}
    {mode === "disabled" ? <p className={styles.off} role="status"><b>{ui("ui.components.ActionEmailStatus.offTitle", "Controls off.")}</b>{" "}{ui("ui.components.ActionEmailStatus.offBody", "Action-email operator controls are not enabled. No delivery setting was changed.")}</p> : null}
    {mode === "loading" ? <p role="status">{ui("ui.components.ActionEmailStatus.loading", "Loading action-email delivery status...")}</p> : null}
    {mode === "ready" && status ? <>
      <p className={styles.configuration}>{configurationLabel(status, ui)}</p>
      <dl className={styles.metrics}><Metric label={ui("ui.components.ActionEmailStatus.queued", "Queued")} value={status.queued} /><Metric label={ui("ui.components.ActionEmailStatus.unknown", "Outcome unknown")} value={status.unknown} /><Metric label={ui("ui.components.ActionEmailStatus.failed", "Failed")} value={status.failed} /><Metric label={ui("ui.components.ActionEmailStatus.accepted", "Accepted")} value={status.accepted} /><Metric label={ui("ui.components.ActionEmailStatus.inFlight", "In flight")} value={status.inFlight} /><Metric label={ui("ui.components.ActionEmailStatus.suppressed", "Suppressed")} value={status.suppressed} /></dl>
      {status.oldestPendingAt ? <p>{ui("ui.components.ActionEmailStatus.oldest", "Oldest pending:")} {status.oldestPendingAt}</p> : null}
      <div className={styles.list}>{status.items.length ? status.items.map(item => <ActionEmailDelivery key={actionEmailDeliveryKey(item)} item={item} busy={busy} ui={ui} submit={onReconcile} />) : <p>{ui("ui.components.ActionEmailStatus.empty", "No action-email delivery records are on this page.")}</p>}</div>
      {offset > 0 || status.items.length === 50 ? <div className={styles.pages}><button type="button" disabled={busy || offset === 0} onClick={() => onPage(Math.max(0, offset - 50))}>{ui("ui.components.ActionEmailStatus.previous", "Previous")}</button><button type="button" disabled={busy || status.items.length < 50} onClick={() => onPage(offset + 50)}>{ui("ui.components.ActionEmailStatus.next", "Next")}</button></div> : null}
    </> : null}
  </section>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }

function configurationLabel(status: ActionEmailPage, ui: Ui) {
  if (!status.captureEnabled && !status.dispatchEnabled) return ui("ui.components.ActionEmailStatus.configOff", "Capture and dispatch are reported off.");
  if (status.captureEnabled && !status.dispatchEnabled) return ui("ui.components.ActionEmailStatus.configCapture", "Capture is reported enabled; dispatch is off.");
  if (!status.captureEnabled && status.dispatchEnabled) return ui("ui.components.ActionEmailStatus.configMismatch", "Dispatch is reported enabled while capture is off. Review the server configuration.");
  return ui("ui.components.ActionEmailStatus.configActive", "Capture and dispatch are reported enabled.");
}

export function actionEmailDeliveryKey(item: ActionEmailItem) { return `${item.id}:${item.updatedAt}`; }

export function ActionEmailDelivery({ item, busy, ui, submit }: { item: ActionEmailItem; busy: boolean; ui: Ui; submit(input: ActionEmailResolution): void }) {
  const [resolution, setResolution] = useState<"" | "confirmed_accepted" | "confirmed_not_accepted">(""), [reason, setReason] = useState(""), [receipt, setReceipt] = useState("");
  const unknown = item.state === "unknown" && item.canReconcile;
  const retry = !unknown && item.canRetry;
  const selected = retry ? "retry" : resolution;
  const draft: ActionEmailResolution | null = selected ? { intentId: item.id, expectedUpdatedAt: item.updatedAt, resolution: selected, reason, ...(selected === "confirmed_accepted" ? { providerMessageId: receipt } : {}) } : null;
  const valid = Boolean(draft && actionEmailResolutionValid(draft));
  return <details className={styles.delivery}>
    <summary><ChevronDown className={styles.chevron} size={17} aria-hidden="true" /><span>{eventLabel(item.event, ui)}</span><b>{stateLabel(item.state, ui)}</b><small>{ui("ui.components.ActionEmailStatus.attempts", "{{value1}} of 6 attempts", { value1: item.attempts })}</small></summary>
    <div className={styles.deliveryBody}>
      <p>{ui("ui.components.ActionEmailStatus.updated", "Updated:")} <time dateTime={item.updatedAt}>{item.updatedAt}</time></p>
      {item.submissionId ? <Link href={`/service-review/${item.submissionId}`}>{ui("ui.components.ActionEmailStatus.openService", "Open service request")}</Link> : null}
      {unknown || retry ? <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!valid || !draft) return; submit(draft); }}>
        {unknown ? <><p>{ui("ui.components.ActionEmailStatus.noAutomaticRetry", "No automatic retry. Confirm the provider outcome before recording a decision.")}</p><label>{ui("ui.components.ActionEmailStatus.providerOutcome", "Provider outcome")}<select required value={resolution} onChange={event => setResolution(event.target.value as typeof resolution)}><option value="">{ui("ui.components.ActionEmailStatus.chooseOutcome", "Choose confirmed outcome")}</option><option value="confirmed_accepted">{ui("ui.components.ActionEmailStatus.outcomeAccepted", "Accepted by provider")}</option><option value="confirmed_not_accepted">{ui("ui.components.ActionEmailStatus.outcomeNotAccepted", "Not accepted by provider")}</option></select></label></> : null}
        <label>{ui("ui.components.ActionEmailStatus.reason", "Provider evidence and reason")}<textarea required minLength={10} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        {selected === "confirmed_accepted" ? <label>{ui("ui.components.ActionEmailStatus.receipt", "Provider message ID")}<input required maxLength={300} value={receipt} onChange={event => setReceipt(event.target.value)} /><small>{ui("ui.components.ActionEmailStatus.receiptHelp", "Required provider receipt. Acceptance does not confirm inbox delivery.")}</small></label> : null}
        <button type="submit" disabled={busy || !valid}>{busy ? ui("ui.components.ActionEmailStatus.saving", "Saving...") : retry ? ui("ui.components.ActionEmailStatus.queueRetry", "Queue retry") : selected === "confirmed_not_accepted" ? ui("ui.components.ActionEmailStatus.recordNotAccepted", "Record non-acceptance") : selected === "confirmed_accepted" ? ui("ui.components.ActionEmailStatus.recordAccepted", "Record provider acceptance") : ui("ui.components.ActionEmailStatus.recordOutcome", "Record provider outcome")}</button>
      </form> : <p>{item.code ? item.code.replaceAll("_", " ") : ui("ui.components.ActionEmailStatus.noAction", "No manual action is available.")}</p>}
    </div>
  </details>;
}

function eventLabel(event: EventName, ui: Ui) {
  const labels: Record<EventName, string> = { "claim.ownerReview": ui("ui.components.ActionEmailStatus.ownerReview", "Ownership review"), "claim.moreInfo": ui("ui.components.ActionEmailStatus.moreInfo", "Ownership evidence request"), "claim.approved": ui("ui.components.ActionEmailStatus.claimApproved", "Ownership claim approved"), "claim.declined": ui("ui.components.ActionEmailStatus.claimDeclined", "Ownership claim declined"), "claim.expired": ui("ui.components.ActionEmailStatus.claimExpired", "Ownership claim expired"), "service.revisionRequested": ui("ui.components.ActionEmailStatus.serviceRevision", "Service revision request"), "service.approved": ui("ui.components.ActionEmailStatus.serviceApproved", "Service work approved"), "service.declined": ui("ui.components.ActionEmailStatus.serviceDeclined", "Service work declined"), "service.cancelled": ui("ui.components.ActionEmailStatus.serviceCancelled", "Service work cancelled"), "ownership.transferAccepted": ui("ui.components.ActionEmailStatus.transferAccepted", "Ownership transfer accepted"), "ownership.transferCancelled": ui("ui.components.ActionEmailStatus.transferCancelled", "Ownership transfer cancelled") };
  return labels[event];
}
function stateLabel(state: DeliveryState, ui: Ui) {
  const labels: Record<DeliveryState, string> = { queued: ui("ui.components.ActionEmailStatus.stateQueued", "Queued"), leased: ui("ui.components.ActionEmailStatus.stateLeased", "Leased"), dispatching: ui("ui.components.ActionEmailStatus.stateDispatching", "Dispatching"), retry: ui("ui.components.ActionEmailStatus.stateRetry", "Retry queued"), accepted: ui("ui.components.ActionEmailStatus.stateAccepted", "Mail provider accepted"), failed: ui("ui.components.ActionEmailStatus.stateFailed", "Failed"), unknown: ui("ui.components.ActionEmailStatus.stateUnknown", "Outcome unknown"), suppressed: ui("ui.components.ActionEmailStatus.stateSuppressed", "Suppressed") };
  return labels[state];
}
