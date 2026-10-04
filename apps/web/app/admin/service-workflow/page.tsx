"use client";
import { editorDeadline, editorRequest } from "../../../lib/editor-request";
import { useUiText } from "../../../components/UiTextProvider";


import Link from "next/link";
import { ArrowLeft, FileLock2, Search, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "../../../components/Footer";
import { AdminWorkspaceGate } from "../../../components/AdminWorkspaceGate";
import { ServiceEmailStatus } from "../../../components/ServiceEmailStatus";
import { ActionEmailStatus } from "../../../components/ActionEmailStatus";
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
  return <AdminWorkspaceGate returnPath="/admin/service-workflow"><ServiceWorkflowWorkspace /></AdminWorkspaceGate>;
}

function ServiceWorkflowWorkspace() {
  const ui = useUiText("app.admin.service.workflow.page");
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
      const { data } = await editorDeadline(createBrowserSupabaseClient().auth.getSession());
      const actorId = data.session?.user.id || "";
      const token = data.session?.access_token || "";
      if (revision !== loadRevision.current) return;
      if (!token || !actorId) {
        actorRef.current = "";
        setProviders([]);
        setSubmissions([]);
        setMessage(ui("ui.app.admin.service.workflow.page.82ffb5c6aa67", "Sign in with an authorized admin account."));
        setPhase("signed-out");
        return;
      }
      actorRef.current = actorId;
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (status !== "all") query.set("status", status);
      const { response, payload } = await editorRequest(`/api/admin/service-workflow?${query.toString()}`, { cache: "no-store", headers: { authorization: `Bearer ${token}` } });
      if (revision !== loadRevision.current || actorRef.current !== actorId) return;
      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message || ui("ui.app.admin.service.workflow.page.8a5ac97eda6c", "Service workflow could not be loaded."));
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
        setMessage(error instanceof Error ? ui("ui.app.admin.service.workflow.page.e526f190f685", "Service workflow could not be loaded: {{value1}}", {value1: error.message}) : ui("ui.app.admin.service.workflow.page.e93c28a5bbd2", "Service workflow could not be loaded. Check your connection and retry."));
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
      setMessage(nextActorId ? ui("ui.app.admin.service.workflow.page.9daf320342e3", "Refreshing service operations for this account.") : ui("ui.app.admin.service.workflow.page.82ffb5c6aa67", "Sign in with an authorized admin account."));
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
      setMessage(error instanceof Error ? error.message : ui("ui.app.admin.service.workflow.page.2fcab2f0dff4", "The admin action could not be completed. Try again."));
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
        <Link className="text-link service-back" href="/admin"><ArrowLeft size={16} />{" "}{ui("ui.app.admin.service.workflow.page.345c74235673", "Back to Admin")}</Link>
        <header className="admin-service-hero">
          <div><div className="eyebrow">{ui("ui.app.admin.service.workflow.page.1370cd33efbe", "Admin service operations")}</div><h1>{ui("ui.app.admin.service.workflow.page.02bcf9461972", "Providers and submissions.")}</h1><p>{ui("ui.app.admin.service.workflow.page.b91be765af15", "Review provider status, private evidence metadata, notification state, and the audit trail without approving on an owner's behalf.")}</p></div>
          <div className="admin-service-counts"><span><strong>{phase === "ready" ? providers.length : "—"}</strong> {providers.length === 1 ? ui("ui.app.admin.service.workflow.page.5c4c1964340a", "provider") : ui("ui.app.admin.service.workflow.page.1e19bab29bc6", "providers")}</span><span><strong>{phase === "ready" ? submissions.length : "—"}</strong> {submissions.length === 1 ? ui("ui.app.admin.service.workflow.page.293f1d2ee206", "submission") : ui("ui.app.admin.service.workflow.page.21e945ad5e3b", "submissions")}</span></div>
        </header>
        {phase !== "signed-out" && phase !== "unauthorized" ? <div className="admin-service-filters" aria-busy={phase === "loading"}>
          <label><Search size={15} /><input aria-label={ui("ui.app.admin.service.workflow.page.960ed4ae09e0", "Search providers and submissions")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ui("ui.app.admin.service.workflow.page.cfcdf881d979", "Search provider, Profile, or work")} /></label>
          <select aria-label={ui("ui.app.admin.service.workflow.page.eeb12e9125ef", "Submission status")} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">{ui("ui.app.admin.service.workflow.page.8ee57323a6f2", "All statuses")}</option><option value="draft">{ui("ui.app.admin.service.workflow.page.ebf12ef47cf5", "Draft")}</option><option value="submitted">{ui("ui.app.admin.service.workflow.page.64900440a8c9", "Submitted")}</option><option value="changes_requested">{ui("ui.app.admin.service.workflow.page.10a92a8ad3ee", "Changes requested")}</option><option value="approved">{ui("ui.app.admin.service.workflow.page.87b42e40c2a2", "Approved")}</option><option value="declined">{ui("ui.app.admin.service.workflow.page.dce083a2c47f", "Declined")}</option><option value="cancelled">{ui("ui.app.admin.service.workflow.page.d353a99eb455", "Cancelled")}</option><option value="expired">{ui("ui.app.admin.service.workflow.page.424a2551d356", "Expired")}</option></select>
          <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void load()}>{ui("ui.app.admin.service.workflow.page.0e9161011702", "Refresh")}</button>
        </div> : null}
        {phase === "ready" && message ? <div className="admin-message" role="status">{message}</div> : null}
        {phase === "loading" ? <section className="card admin-panel-card" role="status"><h2>{ui("ui.app.admin.service.workflow.page.36579725bbe7", "Loading service operations.")}</h2></section> : null}
        {phase === "signed-out" || phase === "unauthorized" ? <section className="card admin-panel-card" role="alert"><h2>{phase === "signed-out" ? ui("ui.app.admin.service.workflow.page.6755e16dc239", "Admin sign-in required.") : ui("ui.app.admin.service.workflow.page.d92c603b66e1", "Admin access required.")}</h2><p>{message || ui("ui.app.admin.service.workflow.page.a9beddcfffc7", "Use an authorized admin account to open Service Operations.")}</p><div className="form-actions"><Link className="button" href="/login?next=%2Fadmin%2Fservice-workflow">{ui("ui.app.admin.service.workflow.page.bfd402b2f6f3", "Sign in")}</Link>{phase === "unauthorized" ? <button className="button secondary" type="button" onClick={() => void load()}>{ui("ui.app.admin.service.workflow.page.e5222230e095", "Retry access")}</button> : null}</div></section> : null}
        {phase === "error" ? <section className="card admin-panel-card" role="alert"><h2>{ui("ui.app.admin.service.workflow.page.2235d7becad3", "Service Operations is temporarily unavailable.")}</h2><p>{message || ui("ui.app.admin.service.workflow.page.2b8eba2e5b40", "Service operations could not be loaded.")}</p><button className="button secondary" type="button" onClick={() => void load()}>{ui("ui.app.admin.service.workflow.page.d8b8392e2c54", "Try again")}</button></section> : null}
        {phase === "ready" ? <>
          <ServiceEmailStatus />
          <ActionEmailStatus />
          <section className="admin-service-section">
            <div className="admin-section-head"><div><div className="eyebrow">{ui("ui.app.admin.service.workflow.page.1f2a406ada3d", "Service providers")}</div><h2>{ui("ui.app.admin.service.workflow.page.a701acdcc02f", "Provider accounts")}</h2><p>{ui("ui.app.admin.service.workflow.page.f3ad7b9b7092", "Verification applies to the account. It does not verify every service entry.")}</p></div></div>
            <div className="admin-service-list">
              {filteredProviders.length ? filteredProviders.map((provider) => {
                const action = provider.verificationStatus === "verified" ? "revoke_provider" : "verify_provider";
                const key = action + provider.userId;
                return <article className="admin-service-card" key={provider.userId}>
                  <div className="admin-service-card__main"><ShieldCheck /><div><strong>{provider.publicDisplayName || provider.businessName || ui("ui.app.admin.service.workflow.page.1b0036566348", "Unnamed provider")}</strong><span>{provider.businessName || ui("ui.app.admin.service.workflow.page.f697e89a6c6c", "No business name")}{provider.location ? ui("ui.app.admin.service.workflow.page.972fd71db140", " - {{value1}}", { value1: provider.location }) : ""}</span><small>{provider.serviceCategories?.join(" - ") || ui("ui.app.admin.service.workflow.page.5e7e4ec8ad13", "No service categories")}</small></div></div>
                  <span className={`service-provider-state ${provider.verificationStatus}`}>{provider.verificationStatus === "verified" ? ui("ui.app.admin.service.workflow.page.0ff0bd8902a3", "Verified Service Provider") : ui("ui.app.admin.service.workflow.page.bd9dee5cd80d", "Unverified provider")}</span>
                  {provider.internalReviewNote ? <p className="admin-service-note">{ui("ui.app.admin.service.workflow.page.5e1a943d8a23", "Internal note:")}{" "}{provider.internalReviewNote}</p> : null}
                  <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void act({ action, providerUserId: provider.userId }, action === "verify_provider" ? "Provider verified." : "Provider verification revoked.")}>{busy === key ? ui("ui.app.admin.service.workflow.page.23e39291d613", "Saving…") : action === "verify_provider" ? ui("ui.app.admin.service.workflow.page.1a07ce7e56f2", "Verify provider") : ui("ui.app.admin.service.workflow.page.4c4fb45e1d74", "Revoke verification")}</button>
                </article>;
              }) : <p className="admin-empty">{ui("ui.app.admin.service.workflow.page.57415e9e8362", "No provider accounts match this view.")}</p>}
            </div>
          </section>
          <section className="admin-service-section">
            <div className="admin-section-head"><div><div className="eyebrow">{ui("ui.app.admin.service.workflow.page.175504a994a1", "Service submissions")}</div><h2>{ui("ui.app.admin.service.workflow.page.469f0138e28e", "Private review queue")}</h2><p>{ui("ui.app.admin.service.workflow.page.dd120f3a6ac6", "Owner approval remains required before canonical service history is created.")}</p></div></div>
            <div className="admin-service-list">
              {submissions.length ? submissions.map((submission) => <article className="admin-service-card admin-service-submission" key={submission.id}>
                <div className="admin-service-submission__heading"><div><span className={`service-status service-status--${submission.status}`}>{label(submission.status)}</span><h3>{submission.title}</h3><p>{submission.profileTitle || submission.qrCode} - {submission.serviceType} - {submission.serviceDate || ui("ui.app.admin.service.workflow.page.11d2535b20b8", "Date not provided")}</p></div>{submission.qrCode ? <Link className="text-link" href={`/edit/${encodeURIComponent(submission.qrCode)}`}>{ui("ui.app.admin.service.workflow.page.f9d77f6cb2f2", "Open Profile")}</Link> : null}</div>
                <div className="admin-service-meta"><span><strong>{ui("ui.app.admin.service.workflow.page.472590ae974d", "Provider")}</strong>{submission.provider?.publicDisplayName || submission.provider?.businessName || ui("ui.app.admin.service.workflow.page.20e8bb9ff8ed", "Provider account")}</span><span><strong>{ui("ui.app.admin.service.workflow.page.03867aea70ac", "Evidence")}</strong>{submission.evidence.length}{" "}{ui("ui.app.admin.service.workflow.page.d55950afe026", "private file")}{submission.evidence.length === 1 ? "" : ui("ui.app.admin.service.workflow.page.043a718774c5", "s")}</span><span><strong>{ui("ui.app.admin.service.workflow.page.969ccbd3cf63", "Email")}</strong>{label(submission.emailDeliveryStatus || "not_attempted")}</span><span><strong>{ui("ui.app.admin.service.workflow.page.3a5ecca188c0", "Updated")}</strong>{formatDate(submission.updatedAt)}</span></div>
                <p>{submission.workPerformed}</p>
                {submission.emailDeliveryMessage ? <small className="admin-service-note">{ui("ui.app.admin.service.workflow.page.16e5c67bfe15", "Notification:")}{" "}{submission.emailDeliveryMessage}</small> : null}
                {submission.evidence.length ? <details><summary><FileLock2 size={14} />{" "}{ui("ui.app.admin.service.workflow.page.d9f533ca8b8b", "Private evidence")}</summary><ul>{submission.evidence.map((item) => <li key={item.id}>{item.previewUrl ? <a href={item.previewUrl} target="_blank" rel="noreferrer">{item.file_name}</a> : item.file_name} - {label(item.evidence_type)} - {Math.ceil(item.file_size_bytes / 1024)}{" "}{ui("ui.app.admin.service.workflow.page.59281a6b2935", "KB")}</li>)}</ul></details> : null}
                {submission.activity.length ? <details><summary>{ui("ui.app.admin.service.workflow.page.c1ada08ce138", "Audit trail")}</summary><ul>{submission.activity.map((item) => <li key={item.id}><strong>{label(item.action)}</strong> - {formatDate(item.created_at)}{item.note ? ui("ui.app.admin.service.workflow.page.972fd71db140", " - {{value1}}", { value1: item.note }) : ""}</li>)}</ul></details> : null}
                <div className="admin-service-actions">
                  {(["draft", "submitted", "changes_requested"].includes(submission.status)) ? <><button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void act({ action: "cancel_submission", submissionId: submission.id }, "Submission cancelled.")}>{busy === `cancel_submission${submission.id}` ? ui("ui.app.admin.service.workflow.page.23e39291d613", "Saving…") : ui("ui.app.admin.service.workflow.page.605434491c73", "Cancel submission")}</button><button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void act({ action: "expire_submission", submissionId: submission.id }, "Submission expired.")}>{busy === `expire_submission${submission.id}` ? ui("ui.app.admin.service.workflow.page.23e39291d613", "Saving…") : ui("ui.app.admin.service.workflow.page.66787aa28f19", "Expire submission")}</button></> : null}
                  {submission.status === "approved" && submission.resultingServiceEventId ? <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void act({ action: "mark_evidence_reviewed", submissionId: submission.id }, "Evidence marked reviewed.")}>{busy === `mark_evidence_reviewed${submission.id}` ? ui("ui.app.admin.service.workflow.page.23e39291d613", "Saving…") : ui("ui.app.admin.service.workflow.page.1f41ae28a484", "Mark evidence reviewed")}</button> : null}
                </div>
              </article>) : <p className="admin-empty">{ui("ui.app.admin.service.workflow.page.a666413ee9fb", "No service submissions match this view.")}</p>}
            </div>
          </section>
        </> : null}
      </div>
    </main>
    <Footer />
  </>;
}
