"use client";

import Link from "next/link";
import { ArrowLeft, FileLock2, Search, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";
import styles from "./service-operations.module.css";

type Provider = {
  userId: string;
  businessName: string;
  publicDisplayName: string;
  website: string;
  location: string;
  serviceCategories: string[];
  verificationStatus: "verified" | "unverified";
  internalReviewNote?: string;
};

type Evidence = { id: string; evidence_type: string; file_name: string; mime_type: string; file_size_bytes: number; created_at: string; previewUrl?: string };
type Activity = { id: string; action: string; note?: string; created_at: string };
type Submission = {
  id: string;
  status: string;
  qrCode: string;
  profileTitle: string;
  provider: Provider | null;
  ownerUserId: string;
  providerUserId: string;
  serviceDate: string;
  serviceType: string;
  title: string;
  workPerformed: string;
  requestedVisibility: string;
  evidence: Evidence[];
  activity: Activity[];
  emailDeliveryStatus: string;
  emailDeliveryMessage: string;
  resultingServiceEventId: string;
  submittedAt: string;
  updatedAt: string;
};

type Payload = { ok?: boolean; message?: string; providers?: Provider[]; submissions?: Submission[] };
type LoadPhase = "loading" | "signed-out" | "unauthorized" | "error" | "ready";

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function AdminServiceWorkflowPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const actorRef = useRef("");
  const loadRevision = useRef(0);
  const actionRef = useRef("");

  const load = useCallback(async (options: { successMessage?: string } = {}) => {
    const revision = ++loadRevision.current;
    setPhase("loading");
    if (!options.successMessage) setMessage("");
    try {
      const { data } = await createBrowserSupabaseClient().auth.getSession();
      const actorId = data.session?.user.id || "";
      const token = data.session?.access_token || "";
      if (revision !== loadRevision.current) return;
      if (!token || !actorId) {
        actorRef.current = "";
        setProviders([]);
        setSubmissions([]);
        setMessage("Sign in with an authorized admin account.");
        setPhase("signed-out");
        return;
      }
      actorRef.current = actorId;
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (status !== "all") query.set("status", status);
      const response = await fetch(`/api/admin/service-workflow?${query.toString()}`, { cache: "no-store", headers: { authorization: `Bearer ${token}` } });
      const payload = await response.json().catch(() => null) as Payload | null;
      if (revision !== loadRevision.current || actorRef.current !== actorId) return;
      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message || "Service workflow could not be loaded.");
        setProviders([]);
        setSubmissions([]);
        setPhase(response.status === 401 ? "signed-out" : response.status === 403 ? "unauthorized" : "error");
      } else {
        setMessage(options.successMessage || "");
        setProviders(Array.isArray(payload.providers) ? payload.providers : []);
        setSubmissions(Array.isArray(payload.submissions) ? payload.submissions : []);
        setPhase("ready");
      }
    } catch (error) {
      if (revision === loadRevision.current) {
        setMessage(error instanceof Error ? `Service workflow could not be loaded: ${error.message}` : "Service workflow could not be loaded. Check your connection and retry.");
        setProviders([]);
        setSubmissions([]);
        setPhase("error");
      }
    }
  }, [search, status]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const { data } = createBrowserSupabaseClient().auth.onAuthStateChange((_event, session) => {
      const nextActorId = session?.user.id || "";
      if (nextActorId === actorRef.current) return;
      actorRef.current = nextActorId;
      loadRevision.current += 1;
      setProviders([]);
      setSubmissions([]);
      setBusy("");
      actionRef.current = "";
      setMessage(nextActorId ? "Refreshing service operations for this account." : "Sign in with an authorized admin account.");
      setPhase(nextActorId ? "loading" : "signed-out");
      if (nextActorId) void load();
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  async function act(body: Record<string, unknown>, successMessage: string) {
    const key = String(body.action || "action") + String(body.providerUserId || body.submissionId || "");
    if (actionRef.current) return;
    actionRef.current = key;
    const expectedActorId = actorRef.current;
    setBusy(key);
    try {
      const { data } = await createBrowserSupabaseClient().auth.getSession();
      const actorId = data.session?.user.id || "";
      const token = data.session?.access_token || "";
      if (!token || !actorId) throw new Error("Admin session expired. Sign in again.");
      if (!expectedActorId || actorId !== expectedActorId) throw new Error("The signed-in account changed. Refresh service operations before trying again.");
      const response = await fetch("/api/admin/service-workflow", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => null) as Payload | null;
      if (actorRef.current !== actorId) return;
      const confirmed = response.ok && payload?.ok === true;
      const resultMessage = payload?.message || (confirmed ? successMessage : "Admin action failed. The server response did not confirm a saved change.");
      if (!confirmed) {
        setMessage(resultMessage);
        return;
      }
      await load({ successMessage: resultMessage });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The admin action could not be completed. Try again.");
    } finally {
      if (actionRef.current === key) actionRef.current = "";
      setBusy((current) => current === key ? "" : current);
    }
  }

  const filteredProviders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return providers.filter((provider) => !term || JSON.stringify(provider).toLowerCase().includes(term));
  }, [providers, search]);

  return <>
    <Nav />
    <main className={`section admin-service-page ${styles.workspace}`}>
      <div className="shell admin-service-shell">
        <Link className="text-link service-back" href="/admin"><ArrowLeft size={16} /> Back to Admin</Link>
        <header className="admin-service-hero">
          <div><div className="eyebrow">Admin service operations</div><h1>Providers and submissions.</h1><p>Review provider status, private evidence metadata, notification state, and the audit trail without approving on an owner&apos;s behalf.</p></div>
          <div className="admin-service-counts"><span><strong>{phase === "ready" ? providers.length : "—"}</strong> providers</span><span><strong>{phase === "ready" ? submissions.length : "—"}</strong> submissions</span></div>
        </header>
        {phase === "ready" ? <div className="admin-service-filters">
          <label><Search size={15} /><input aria-label="Search providers and submissions" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search provider, Profile, or work" /></label>
          <select aria-label="Submission status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="changes_requested">Changes requested</option><option value="approved">Approved</option><option value="declined">Declined</option><option value="cancelled">Cancelled</option><option value="expired">Expired</option></select>
          <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void load()}>Refresh</button>
        </div> : null}
        {phase === "ready" && message ? <div className="admin-message" role="status">{message}</div> : null}
        {phase === "loading" ? <section className="card admin-panel-card" role="status"><h2>Loading service operations.</h2></section> : null}
        {phase === "signed-out" || phase === "unauthorized" ? <section className="card admin-panel-card" role="alert"><h2>{phase === "signed-out" ? "Admin sign-in required." : "Admin access required."}</h2><p>{message || "Use an authorized admin account to open Service Operations."}</p><div className="form-actions"><Link className="button" href="/login?next=%2Fadmin%2Fservice-workflow">Sign in</Link>{phase === "unauthorized" ? <button className="button secondary" type="button" onClick={() => void load()}>Retry access</button> : null}</div></section> : null}
        {phase === "error" ? <section className="card admin-panel-card" role="alert"><h2>Service Operations is temporarily unavailable.</h2><p>{message || "Service operations could not be loaded."}</p><button className="button secondary" type="button" onClick={() => void load()}>Try again</button></section> : null}
        {phase === "ready" ? <>
          <section className="admin-service-section">
            <div className="admin-section-head"><div><div className="eyebrow">Service providers</div><h2>Provider accounts</h2><p>Verification applies to the account. It does not verify every service entry.</p></div></div>
            <div className="admin-service-list">
              {filteredProviders.length ? filteredProviders.map((provider) => {
                const action = provider.verificationStatus === "verified" ? "revoke_provider" : "verify_provider";
                const key = action + provider.userId;
                return <article className="admin-service-card" key={provider.userId}>
                  <div className="admin-service-card__main"><ShieldCheck /><div><strong>{provider.publicDisplayName || provider.businessName || "Unnamed provider"}</strong><span>{provider.businessName || "No business name"}{provider.location ? ` - ${provider.location}` : ""}</span><small>{provider.serviceCategories?.join(" - ") || "No service categories"}</small></div></div>
                  <span className={`service-provider-state ${provider.verificationStatus}`}>{provider.verificationStatus === "verified" ? "Verified Service Provider" : "Unverified provider"}</span>
                  {provider.internalReviewNote ? <p className="admin-service-note">Internal note: {provider.internalReviewNote}</p> : null}
                  <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void act({ action, providerUserId: provider.userId }, action === "verify_provider" ? "Provider verified." : "Provider verification revoked.")}>{busy === key ? "Saving…" : action === "verify_provider" ? "Verify provider" : "Revoke verification"}</button>
                </article>;
              }) : <p className="admin-empty">No provider accounts match this view.</p>}
            </div>
          </section>
          <section className="admin-service-section">
            <div className="admin-section-head"><div><div className="eyebrow">Service submissions</div><h2>Private review queue</h2><p>Owner approval remains required before canonical service history is created.</p></div></div>
            <div className="admin-service-list">
              {submissions.length ? submissions.map((submission) => <article className="admin-service-card admin-service-submission" key={submission.id}>
                <div className="admin-service-submission__heading"><div><span className={`service-status service-status--${submission.status}`}>{label(submission.status)}</span><h3>{submission.title}</h3><p>{submission.profileTitle || submission.qrCode} - {submission.serviceType} - {submission.serviceDate || "Date not provided"}</p></div>{submission.qrCode ? <Link className="text-link" href={`/edit/${encodeURIComponent(submission.qrCode)}`}>Open Profile</Link> : null}</div>
                <div className="admin-service-meta"><span><strong>Provider</strong>{submission.provider?.publicDisplayName || submission.provider?.businessName || "Provider account"}</span><span><strong>Evidence</strong>{submission.evidence.length} private file{submission.evidence.length === 1 ? "" : "s"}</span><span><strong>Email</strong>{label(submission.emailDeliveryStatus || "not_attempted")}</span><span><strong>Updated</strong>{formatDate(submission.updatedAt)}</span></div>
                <p>{submission.workPerformed}</p>
                {submission.emailDeliveryMessage ? <small className="admin-service-note">Notification: {submission.emailDeliveryMessage}</small> : null}
                {submission.evidence.length ? <details><summary><FileLock2 size={14} /> Private evidence</summary><ul>{submission.evidence.map((item) => <li key={item.id}>{item.previewUrl ? <a href={item.previewUrl} target="_blank" rel="noreferrer">{item.file_name}</a> : item.file_name} - {label(item.evidence_type)} - {Math.ceil(item.file_size_bytes / 1024)} KB</li>)}</ul></details> : null}
                {submission.activity.length ? <details><summary>Audit trail</summary><ul>{submission.activity.map((item) => <li key={item.id}><strong>{label(item.action)}</strong> - {formatDate(item.created_at)}{item.note ? ` - ${item.note}` : ""}</li>)}</ul></details> : null}
                <div className="admin-service-actions">
                  {(["draft", "submitted", "changes_requested"].includes(submission.status)) ? <><button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void act({ action: "cancel_submission", submissionId: submission.id }, "Submission cancelled.")}>{busy === `cancel_submission${submission.id}` ? "Saving…" : "Cancel submission"}</button><button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void act({ action: "expire_submission", submissionId: submission.id }, "Submission expired.")}>{busy === `expire_submission${submission.id}` ? "Saving…" : "Expire submission"}</button></> : null}
                  {submission.status === "approved" && submission.resultingServiceEventId ? <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void act({ action: "mark_evidence_reviewed", submissionId: submission.id }, "Evidence marked reviewed.")}>{busy === `mark_evidence_reviewed${submission.id}` ? "Saving…" : "Mark evidence reviewed"}</button> : null}
                </div>
              </article>) : <p className="admin-empty">No service submissions match this view.</p>}
            </div>
          </section>
        </> : null}
      </div>
    </main>
    <Footer />
  </>;
}
