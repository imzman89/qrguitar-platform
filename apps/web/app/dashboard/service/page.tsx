"use client";

import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, ArrowUpRight, FileLock2, RefreshCw, Search, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";
import styles from "./service-workbench.module.css";

const statuses = {
  draft: "Draft",
  changes_requested: "Changes requested",
  submitted: "Awaiting owner review",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired"
} as const;
type Status = keyof typeof statuses;
type WorkItem = {
  id: string; qrCode: string; profileTitle: string; title: string;
  status: Status; workOrderReference: string; serviceType: string;
  evidenceCount: number; emailDeliveryStatus: "not_attempted" | "sent" | "failed";
  updatedAt: string;
};

function isWorkItem(value: unknown): value is WorkItem {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return ["id", "qrCode", "profileTitle", "title", "workOrderReference", "serviceType", "updatedAt"].every((key) => typeof row[key] === "string")
    && Boolean(row.id) && typeof row.status === "string" && Object.hasOwn(statuses, row.status)
    && Number.isInteger(row.evidenceCount) && Number(row.evidenceCount) >= 0
    && ["not_attempted", "sent", "failed"].includes(String(row.emailDeliveryStatus));
}

async function loadProviderWork(token: string, signal: AbortSignal): Promise<WorkItem[]> {
  if (!token) throw new Error("Sign in again to load your service work.");
  const response = await fetch("/api/service-submissions?scope=provider", {
    headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true || !Array.isArray(payload.submissions) || !payload.submissions.every(isWorkItem)) {
    throw new Error(typeof payload?.message === "string" ? payload.message : "Your service work could not be loaded. Try again.");
  }
  return payload.submissions;
}

function filterProviderWork(items: WorkItem[], status: Status | "all", search: string) {
  const query = search.trim().toLowerCase();
  return items.filter((item) => (status === "all" || item.status === status)
    && (!query || [item.workOrderReference, item.title, item.profileTitle, item.qrCode].some((value) => value.toLowerCase().includes(query))));
}

function serviceWorkHref(item: Pick<WorkItem, "qrCode" | "id">) {
  return item.qrCode ? `/service-work/${encodeURIComponent(item.qrCode)}?submission=${encodeURIComponent(item.id)}` : "";
}

function newServiceWorkHref(value: string) {
  const code = value.trim().toUpperCase();
  return /^QRG-[A-Z0-9][A-Z0-9-]{0,75}$/.test(code) ? `/service-work/${encodeURIComponent(code)}` : "";
}

function updatedLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ServiceWorkbenchPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ userId: string; token: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authAttempt, setAuthAttempt] = useState(0);
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [status, setStatus] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [startError, setStartError] = useState("");
  const userId = useRef("");
  const accountRevision = useRef(0);

  useEffect(() => {
    let disposed = false;
    let authResolved = false;
    let unsubscribe: (() => void) | undefined;
    setAuthChecked(false);
    setAuthError("");
    function applySession(next: Session | null) {
      if (disposed) return;
      authResolved = true;
      window.clearTimeout(deadline);
      const nextId = next?.user.id || "";
      if (nextId !== userId.current) {
        userId.current = nextId;
        accountRevision.current++;
        setItems(null);
        setError("");
        setSearch("");
        setStatus("all");
        setQrCode("");
        setStartError("");
      }
      setSession(nextId && next?.access_token ? { userId: nextId, token: next.access_token } : null);
      setAuthError("");
      setAuthChecked(true);
    }
    function failAuth() {
      if (disposed || authResolved) return;
      authResolved = true;
      accountRevision.current++;
      setSession(null);
      setItems(null);
      setAuthChecked(true);
      setAuthError("Your sign-in could not be checked. Try again.");
    }
    const deadline = window.setTimeout(failAuth, 10000);
    try {
      const supabase = createBrowserSupabaseClient();
      const subscription = supabase.auth.onAuthStateChange((_event, next) => applySession(next));
      unsubscribe = () => subscription.data.subscription.unsubscribe();
      void supabase.auth.getSession().then(({ data, error: sessionError }) => {
        if (authResolved || disposed) return;
        if (sessionError) failAuth(); else applySession(data.session);
      }).catch(failAuth);
    } catch {
      failAuth();
    }
    return () => { disposed = true; window.clearTimeout(deadline); unsubscribe?.(); };
  }, [authAttempt]);

  useEffect(() => {
    if (!session) return;
    let disposed = false;
    const revision = accountRevision.current;
    const controller = new AbortController();
    const current = () => !disposed && revision === accountRevision.current && !controller.signal.aborted;
    setLoading(true);
    setError("");
    const deadline = window.setTimeout(() => {
      if (!current()) return;
      controller.abort();
      setLoading(false);
      setError("Loading your service work took too long. Try again.");
    }, 20000);
    void loadProviderWork(session.token, controller.signal).then((next) => {
      if (current()) setItems(next);
    }).catch((cause: unknown) => {
      if (current()) setError(cause instanceof Error ? cause.message : "Your service work could not be loaded. Try again.");
    }).finally(() => {
      window.clearTimeout(deadline);
      if (current()) setLoading(false);
    });
    return () => { disposed = true; controller.abort(); window.clearTimeout(deadline); };
  }, [session, loadAttempt]);

  const visible = useMemo(() => filterProviderWork(items || [], status, search), [items, status, search]);
  const editableCount = (items || []).filter((item) => item.status === "draft" || item.status === "changes_requested").length;
  const reviewCount = (items || []).filter((item) => item.status === "submitted").length;

  return <><Nav /><main className={styles.page}>
    <div className={styles.shell}>
      <Link className={styles.back} href="/dashboard"><ArrowLeft size={16} aria-hidden="true" /> Dashboard</Link>
      <header className={styles.heading}>
        <div><p className={styles.eyebrow}>For luthiers &amp; repair shops</p><h1>Service workbench</h1><p>Pick up a draft, track owner review, and keep the work you performed connected to the instrument.</p></div>
        <Link className={styles.secondary} href="/account?section=provider"><Wrench size={17} aria-hidden="true" /> Business tools</Link>
      </header>

      {!authChecked ? <section className={styles.notice} role="status"><h2>Checking your sign-in…</h2><p>Your private service work will appear here.</p></section>
        : authError ? <section className={styles.notice} role="alert"><h2>Sign-in check unavailable</h2><p>{authError}</p><button className={styles.primary} onClick={() => setAuthAttempt((value) => value + 1)}>Try again</button></section>
        : !session ? <section className={styles.notice}><h2>Sign in to your workbench</h2><p>Use the provider account that performed the work to see its requests and drafts.</p><Link className={styles.primary} href="/login?next=%2Fdashboard%2Fservice">Sign in</Link></section>
        : <>
          <section className={styles.start} aria-labelledby="start-service-title">
            <div><span className={styles.icon}><Wrench size={22} aria-hidden="true" /></span><h2 id="start-service-title">Start a service record</h2><p>Enter the instrument’s QRguitar ID. Private Profiles require the owner to grant your provider account access.</p></div>
            <form onSubmit={(event) => { event.preventDefault(); const href = newServiceWorkHref(qrCode); if (href) { setStartError(""); router.push(href); } else setStartError("Enter the complete QRguitar ID, such as QRG-123456."); }}>
              <label htmlFor="service-qr-code">QRguitar ID</label>
              <div className={styles.startControls}><input id="service-qr-code" value={qrCode} onChange={(event) => { setQrCode(event.target.value); setStartError(""); }} placeholder="QRG-123456" maxLength={80} autoCapitalize="characters" autoComplete="off" spellCheck={false} required aria-invalid={Boolean(startError)} aria-describedby={startError ? "service-start-error" : "service-start-help"} /><button className={styles.primary} type="submit">Continue <ArrowUpRight size={17} aria-hidden="true" /></button></div>
              {startError ? <p className={styles.errorText} id="service-start-error" role="alert">{startError}</p> : <p className={styles.helper} id="service-start-help">Find the ID on the Profile or its QR label.</p>}
            </form>
          </section>

          {items !== null && <div className={styles.stats} aria-label="Counts in the loaded requests">
            <div><strong>{items.length}</strong><span>Requests loaded</span></div><div><strong>{editableCount}</strong><span>Drafts &amp; revisions</span></div><div><strong>{reviewCount}</strong><span>Awaiting owner review</span></div>
          </div>}

          <section className={styles.queue} aria-labelledby="work-queue-title" aria-busy={loading}>
            <div className={styles.queueHeading}><div><h2 id="work-queue-title">Your service requests</h2><p>Up to 100 most recently updated requests for this provider account.</p></div><button className={styles.secondary} disabled={loading} onClick={() => setLoadAttempt((value) => value + 1)}><RefreshCw size={16} aria-hidden="true" /> {loading ? "Loading…" : "Refresh"}</button></div>
            {error && <div className={styles.error} role="alert"><strong>Service work could not be refreshed</strong><p>{error}</p>{items !== null && <p>The requests below are the last successfully loaded snapshot.</p>}<button className={styles.secondary} disabled={loading} onClick={() => setLoadAttempt((value) => value + 1)}>Try again</button></div>}
            {items === null ? !error && <div className={styles.empty} role="status"><h3>Loading your requests…</h3><p>Checking drafts, owner reviews, and completed work.</p></div>
              : items.length === 0 ? <div className={styles.empty}><FileLock2 size={30} aria-hidden="true" /><h3>Your first service record starts here</h3><p>Enter a QRguitar ID above to document completed work. Save a private draft, attach evidence, then send it to the owner for review.</p><p>Approval and visibility are decided by the Profile owner.</p></div>
                : <>
                  <div className={styles.filters}>
                    <label htmlFor="service-search">Search requests<div className={styles.search}><Search size={17} aria-hidden="true" /><input id="service-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Work order, instrument, title, or QR ID" /></div></label>
                    <label htmlFor="service-status">Status<select id="service-status" value={status} onChange={(event) => setStatus(event.target.value as Status | "all")}><option value="all">All statuses</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  </div>
                  <p className={styles.resultCount} role="status">Showing {visible.length} of {items.length} loaded requests</p>
                  {visible.length === 0 ? <div className={styles.empty}><h3>No requests match these filters</h3><p>Try another work-order reference, instrument, or status.</p><button className={styles.secondary} onClick={() => { setSearch(""); setStatus("all"); }}>Clear filters</button></div>
                    : <ul className={styles.list}>{visible.map((item) => <li key={item.id} className={styles.item}>
                      <div className={styles.itemMain}><span className={styles.status} data-status={item.status}>{statuses[item.status]}</span><h3>{item.title || "Untitled service draft"}</h3><p className={styles.instrument}>{item.profileTitle || "Profile unavailable"}{item.qrCode && <span>{item.qrCode}</span>}</p><p className={styles.workOrder}>{item.serviceType || "Service"}{item.workOrderReference && <> · Work order {item.workOrderReference}</>}</p></div>
                      <div className={styles.itemDetails}><dl><div><dt>Private evidence</dt><dd>{item.evidenceCount} {item.evidenceCount === 1 ? "file" : "files"}</dd></div><div><dt>Review email</dt><dd>{item.emailDeliveryStatus === "sent" ? "Sent" : item.emailDeliveryStatus === "failed" ? "Delivery failed" : "Not attempted"}</dd></div><div><dt>Updated</dt><dd>{updatedLabel(item.updatedAt)}</dd></div></dl>{serviceWorkHref(item) ? <Link className={styles.secondary} href={serviceWorkHref(item)} aria-label={`${item.status === "draft" || item.status === "changes_requested" ? "Resume" : "View"} ${item.title || "service draft"} for ${item.profileTitle || item.qrCode}`}>{item.status === "draft" || item.status === "changes_requested" ? "Resume" : "View"}<ArrowUpRight size={16} aria-hidden="true" /></Link> : <span className={styles.helper}>Profile unavailable</span>}</div>
                    </li>)}</ul>}
                  <p className={styles.footnote}><FileLock2 size={16} aria-hidden="true" /> Evidence remains private. A sent email does not mean the owner has approved the work.</p>
                </>}
          </section>
        </>}
    </div>
  </main><Footer /></>;
}
