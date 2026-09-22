"use client";
import { useUiText } from "../../../components/UiTextProvider";


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
  const ui = useUiText("app.dashboard.service.page");
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
      setError(ui("ui.app.dashboard.service.page.aa14a3ce2771", "Loading your service work took too long. Try again."));
    }, 20000);
    void loadProviderWork(session.token, controller.signal).then((next) => {
      if (current()) setItems(next);
    }).catch((cause: unknown) => {
      if (current()) setError(cause instanceof Error ? cause.message : ui("ui.app.dashboard.service.page.19d09c5fcaff", "Your service work could not be loaded. Try again."));
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
      <Link className={styles.back} href="/dashboard"><ArrowLeft size={16} aria-hidden="true" />{" "}{ui("ui.app.dashboard.service.page.67b696468610", "Dashboard")}</Link>
      <header className={styles.heading}>
        <div><p className={styles.eyebrow}>{ui("ui.app.dashboard.service.page.5e2ab5d6c101", "For luthiers & repair shops")}</p><h1>{ui("ui.app.dashboard.service.page.3f9b5c09e0a6", "Service workbench")}</h1><p>{ui("ui.app.dashboard.service.page.3ab05f868d78", "Pick up a draft, track owner review, and keep the work you performed connected to the instrument.")}</p></div>
        <Link className={styles.secondary} href="/account?section=provider"><Wrench size={17} aria-hidden="true" />{" "}{ui("ui.app.dashboard.service.page.6ba0be9a0111", "Business tools")}</Link>
      </header>

      {!authChecked ? <section className={styles.notice} role="status"><h2>{ui("ui.app.dashboard.service.page.d677c4c20422", "Checking your sign-in…")}</h2><p>{ui("ui.app.dashboard.service.page.1baa4ff16741", "Your private service work will appear here.")}</p></section>
        : authError ? <section className={styles.notice} role="alert"><h2>{ui("ui.app.dashboard.service.page.0591283e2c7f", "Sign-in check unavailable")}</h2><p>{authError}</p><button className={styles.primary} onClick={() => setAuthAttempt((value) => value + 1)}>{ui("ui.app.dashboard.service.page.d8b8392e2c54", "Try again")}</button></section>
        : !session ? <section className={styles.notice}><h2>{ui("ui.app.dashboard.service.page.5acef34720ff", "Sign in to your workbench")}</h2><p>{ui("ui.app.dashboard.service.page.af0469e0e44e", "Use the provider account that performed the work to see its requests and drafts.")}</p><Link className={styles.primary} href="/login?next=%2Fdashboard%2Fservice">{ui("ui.app.dashboard.service.page.bfd402b2f6f3", "Sign in")}</Link></section>
        : <>
          <section className={styles.start} aria-labelledby="start-service-title">
            <div><span className={styles.icon}><Wrench size={22} aria-hidden="true" /></span><h2 id="start-service-title">{ui("ui.app.dashboard.service.page.8a366259b6c3", "Start a service record")}</h2><p>{ui("ui.app.dashboard.service.page.1956b220efa1", "Enter the instrument’s QRguitar ID. Private Profiles require the owner to grant your provider account access.")}</p></div>
            <form onSubmit={(event) => { event.preventDefault(); const href = newServiceWorkHref(qrCode); if (href) { setStartError(""); router.push(href); } else setStartError("Enter the complete QRguitar ID, such as QRG-123456."); }}>
              <label htmlFor="service-qr-code">{ui("ui.app.dashboard.service.page.a6c8f92c19f4", "QRguitar ID")}</label>
              <div className={styles.startControls}><input id="service-qr-code" value={qrCode} onChange={(event) => { setQrCode(event.target.value); setStartError(""); }} placeholder={ui("ui.app.dashboard.service.page.9746a68d757f", "QRG-123456")} maxLength={80} autoCapitalize="characters" autoComplete="off" spellCheck={false} required aria-invalid={Boolean(startError)} aria-describedby={startError ? "service-start-error" : "service-start-help"} /><button className={styles.primary} type="submit">{ui("ui.app.dashboard.service.page.31fbef162594", "Continue")}{" "}<ArrowUpRight size={17} aria-hidden="true" /></button></div>
              {startError ? <p className={styles.errorText} id="service-start-error" role="alert">{startError}</p> : <p className={styles.helper} id="service-start-help">{ui("ui.app.dashboard.service.page.7f5463de2f50", "Find the ID on the Profile or its QR label.")}</p>}
            </form>
          </section>

          {items !== null && <div className={styles.stats} aria-label={ui("ui.app.dashboard.service.page.6ef59b6a264d", "Counts in the loaded requests")}>
            <div><strong>{items.length}</strong><span>{ui("ui.app.dashboard.service.page.0640eff79a67", "Requests loaded")}</span></div><div><strong>{editableCount}</strong><span>{ui("ui.app.dashboard.service.page.61b848363968", "Drafts & revisions")}</span></div><div><strong>{reviewCount}</strong><span>{ui("ui.app.dashboard.service.page.6f97ecb34e76", "Awaiting owner review")}</span></div>
          </div>}

          <section className={styles.queue} aria-labelledby="work-queue-title" aria-busy={loading}>
            <div className={styles.queueHeading}><div><h2 id="work-queue-title">{ui("ui.app.dashboard.service.page.1b0ecbc5aba3", "Your service requests")}</h2><p>{ui("ui.app.dashboard.service.page.a47c545d96bd", "Up to 100 most recently updated requests for this provider account.")}</p></div><button className={styles.secondary} disabled={loading} onClick={() => setLoadAttempt((value) => value + 1)}><RefreshCw size={16} aria-hidden="true" /> {loading ? ui("ui.app.dashboard.service.page.ba3bbbe10d8b", "Loading…") : ui("ui.app.dashboard.service.page.0e9161011702", "Refresh")}</button></div>
            {error && <div className={styles.error} role="alert"><strong>{ui("ui.app.dashboard.service.page.ce5c412d6488", "Service work could not be refreshed")}</strong><p>{error}</p>{items !== null && <p>{ui("ui.app.dashboard.service.page.dce6611fee94", "The requests below are the last successfully loaded snapshot.")}</p>}<button className={styles.secondary} disabled={loading} onClick={() => setLoadAttempt((value) => value + 1)}>{ui("ui.app.dashboard.service.page.d8b8392e2c54", "Try again")}</button></div>}
            {items === null ? !error && <div className={styles.empty} role="status"><h3>{ui("ui.app.dashboard.service.page.5d37aeb39fed", "Loading your requests…")}</h3><p>{ui("ui.app.dashboard.service.page.45cff2c7c744", "Checking drafts, owner reviews, and completed work.")}</p></div>
              : items.length === 0 ? <div className={styles.empty}><FileLock2 size={30} aria-hidden="true" /><h3>{ui("ui.app.dashboard.service.page.06e51c1a6440", "Your first service record starts here")}</h3><p>{ui("ui.app.dashboard.service.page.b90ff6b8cd21", "Enter a QRguitar ID above to document completed work. Save a private draft, attach evidence, then send it to the owner for review.")}</p><p>{ui("ui.app.dashboard.service.page.abb835ab195b", "Approval and visibility are decided by the Profile owner.")}</p></div>
                : <>
                  <div className={styles.filters}>
                    <label htmlFor="service-search">{ui("ui.app.dashboard.service.page.d188ca78be54", "Search requests")}<div className={styles.search}><Search size={17} aria-hidden="true" /><input id="service-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ui("ui.app.dashboard.service.page.1b157f484a02", "Work order, instrument, title, or QR ID")} /></div></label>
                    <label htmlFor="service-status">{ui("ui.app.dashboard.service.page.920e413c7d41", "Status")}<select id="service-status" value={status} onChange={(event) => setStatus(event.target.value as Status | "all")}><option value="all">{ui("ui.app.dashboard.service.page.8ee57323a6f2", "All statuses")}</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  </div>
                  <p className={styles.resultCount} role="status">{ui("ui.app.dashboard.service.page.d604310a789a", "Showing")}{" "}{visible.length}{" "}{ui("ui.app.dashboard.service.page.28391d3bc64e", "of")}{" "}{items.length}{" "}{ui("ui.app.dashboard.service.page.edadbc16b1be", "loaded requests")}</p>
                  {visible.length === 0 ? <div className={styles.empty}><h3>{ui("ui.app.dashboard.service.page.4fc37818e165", "No requests match these filters")}</h3><p>{ui("ui.app.dashboard.service.page.5d1743ecee4f", "Try another work-order reference, instrument, or status.")}</p><button className={styles.secondary} onClick={() => { setSearch(""); setStatus("all"); }}>{ui("ui.app.dashboard.service.page.7179ea0035fc", "Clear filters")}</button></div>
                    : <ul className={styles.list}>{visible.map((item) => <li key={item.id} className={styles.item}>
                      <div className={styles.itemMain}><span className={styles.status} data-status={item.status}>{statuses[item.status]}</span><h3>{item.title || ui("ui.app.dashboard.service.page.9850ac72a395", "Untitled service draft")}</h3><p className={styles.instrument}>{item.profileTitle || ui("ui.app.dashboard.service.page.158e5a22a48c", "Profile unavailable")}{item.qrCode && <span>{item.qrCode}</span>}</p><p className={styles.workOrder}>{item.serviceType || ui("ui.app.dashboard.service.page.d677190e0a99", "Service")}{item.workOrderReference && <>{" "}{ui("ui.app.dashboard.service.page.fe01fc93d1ae", "· Work order")}{" "}{item.workOrderReference}</>}</p></div>
                      <div className={styles.itemDetails}><dl><div><dt>{ui("ui.app.dashboard.service.page.d9f533ca8b8b", "Private evidence")}</dt><dd>{item.evidenceCount} {item.evidenceCount === 1 ? ui("ui.app.dashboard.service.page.3b9c358f36f0", "file") : ui("ui.app.dashboard.service.page.3d7db37d08f9", "files")}</dd></div><div><dt>{ui("ui.app.dashboard.service.page.b2bde187af4f", "Review email")}</dt><dd>{item.emailDeliveryStatus === "sent" ? ui("ui.app.dashboard.service.page.c16bc82bf1f0", "Sent") : item.emailDeliveryStatus === "failed" ? ui("ui.app.dashboard.service.page.b486522010d5", "Delivery failed") : ui("ui.app.dashboard.service.page.a16cb9bd9d66", "Not attempted")}</dd></div><div><dt>{ui("ui.app.dashboard.service.page.3a5ecca188c0", "Updated")}</dt><dd>{updatedLabel(item.updatedAt)}</dd></div></dl>{serviceWorkHref(item) ? <Link className={styles.secondary} href={serviceWorkHref(item)} aria-label={ui("ui.app.dashboard.service.page.9fc42bd9c76b", "{{value1}} {{value2}} for {{value3}}", { value1: item.status === "draft" || item.status === "changes_requested" ? "Resume" : "View", value2: item.title || "service draft", value3: item.profileTitle || item.qrCode })}>{item.status === "draft" || item.status === "changes_requested" ? ui("ui.app.dashboard.service.page.d640c7421da0", "Resume") : ui("ui.app.dashboard.service.page.dcc839a4015c", "View")}<ArrowUpRight size={16} aria-hidden="true" /></Link> : <span className={styles.helper}>{ui("ui.app.dashboard.service.page.158e5a22a48c", "Profile unavailable")}</span>}</div>
                    </li>)}</ul>}
                  <p className={styles.footnote}><FileLock2 size={16} aria-hidden="true" />{" "}{ui("ui.app.dashboard.service.page.1c4cb6f2a379", "Evidence remains private. A sent email does not mean the owner has approved the work.")}</p>
                </>}
          </section>
        </>}
    </div>
  </main><Footer /></>;
}
