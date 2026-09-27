"use client";
import { useUiText } from "../../components/UiTextProvider";


import workflow from "../../components/WorkflowWorkspace.module.css";
import { ArrowLeft, Check, FileCheck2, Gift, Handshake, PackageCheck, ShieldCheck, Store, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClaimOwnerReview, type OwnerClaimReview } from "../../components/ClaimOwnerReview";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { getContentValue } from "../../lib/content-registry";
import { useSiteContent } from "../../lib/use-site-content";
import { createClaimSessionGuard, ClaimRequestError, claimReturnPath, claimLinkId, visibleClaimRequests, confirmedClaimMutation, serializeClaimBody, readClaimEvidence, MAX_CLAIM_EVIDENCE_BYTES } from "../../lib/ownership-claim-client";
import { dispatchOptionalTrackingProductEvent, optionalTrackingProductEvents } from "../../lib/optional-tracking-consent";

type EvidenceDraft = { name: string; dataUrl: string; type: string; bytes: number };
type ClaimType = "owner_transfer" | "store_purchase" | "legacy_review";
type ScenarioId = "store" | "builder" | "seller" | "no-transfer" | "gift" | "legacy";
type ClaimSummary = { id: string; status: string; profileTitle: string; qrCode: string; evidenceCount: number; claimType: ClaimType; createdAt: string; adminReviewNote?: string; canWithdraw?: boolean; canSubmitEvidence?: boolean; canCompleteSubmission?: boolean; submissionComplete?: boolean } & OwnerClaimReview;

function canWithdrawClaim(claim: ClaimSummary) {
  return claim.canWithdraw === true && ["awaiting_claimant", "awaiting_owner", "admin_review"].includes(claim.status);
}

function canCompleteClaimSubmission(claim: ClaimSummary) {
  return claim.canCompleteSubmission === true && claim.submissionComplete === false;
}

function claimHasRecoverableSubmission(claim: ClaimSummary) {
  return claim.submissionComplete === true || canCompleteClaimSubmission(claim);
}

function claimSubmissionIncomplete(claim: ClaimSummary) {
  return claim.submissionComplete === false && ["awaiting_owner", "admin_review"].includes(claim.status);
}

function canonicalClaimQrIdentifier(value: unknown) {
  const candidate = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^QRG-[A-Z0-9][A-Z0-9-]{0,75}$/.test(candidate) ? candidate : "";
}

const scenarioDefinitions: Array<{ id: ScenarioId; key: "store" | "builder" | "transfer" | "used" | "gift" | "legacy"; icon: typeof Store; claimType: ClaimType; preferredTransfer?: boolean }> = [
  { id: "store", key: "store", icon: Store, claimType: "store_purchase" },
  { id: "builder", key: "builder", icon: Wrench, claimType: "store_purchase" },
  { id: "seller", key: "transfer", icon: Handshake, claimType: "owner_transfer", preferredTransfer: true },
  { id: "no-transfer", key: "used", icon: PackageCheck, claimType: "legacy_review" },
  { id: "gift", key: "gift", icon: Gift, claimType: "legacy_review" },
  { id: "legacy", key: "legacy", icon: ShieldCheck, claimType: "legacy_review" }
];

const statusSteps = ["submitted", "awaiting_owner", "admin_review", "approved"];

function createChallengeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint8Array(6);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function claimStatusLabel(status: string) {
  return ({ awaiting_claimant: "Evidence required", awaiting_owner: "Awaiting current owner", admin_review: "Under QRguitar review", approved: "Approved", denied: "Declined", cancelled: "Cancelled", expired: "Expired" } as Record<string, string>)[status] || "Submitted";
}

function OwnershipClaimContent() {
  const ui = useUiText("app.ownership.claim.page");
  const content = useSiteContent();
  const searchParams = useSearchParams();
  const returnPath = claimReturnPath(searchParams);
  const requestedClaim = claimLinkId(searchParams.get("claim"));
  const focusedClaim = useRef("");
  const claimGuard = useRef<ReturnType<typeof createClaimSessionGuard> | null>(null);
  const reloadClaimsRef = useRef<() => Promise<ClaimSummary[] | null>>(async () => null);
  const claimLoadRevision = useRef(0);
  const evidenceRead = useRef<symbol | null>(null);
  const [evidenceReading, setEvidenceReading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState("");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [scenarioId, setScenarioId] = useState<ScenarioId | "">(searchParams.get("handoff") === "buyer-code" ? "builder" : "");
  const [identifier, setIdentifier] = useState(searchParams.get("code") || searchParams.get("serial") || "");
  const [acquisitionDetails, setAcquisitionDetails] = useState("");
  const [ownershipDeclaration, setOwnershipDeclaration] = useState("");
  const [challengeCode, setChallengeCode] = useState("");
  const [evidence, setEvidence] = useState<EvidenceDraft[]>([]);
  const [claims, setClaims] = useState<ClaimSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);
  const [responseClaimId, setResponseClaimId] = useState("");
  const [responseEvidence, setResponseEvidence] = useState<EvidenceDraft[]>([]);
  const [buyerCode, setBuyerCode] = useState("");
  const [buyerOrderReference, setBuyerOrderReference] = useState("");
  const [withdrawClaimId, setWithdrawClaimId] = useState("");
  const [withdrawNotice, setWithdrawNotice] = useState<{ id: string; text: string; error: boolean } | null>(null);
  const [reviewNotice, setReviewNotice] = useState<{ id: string; text: string; error: boolean } | null>(null);
  const [completionNotice, setCompletionNotice] = useState<{ id: string; text: string; error: boolean } | null>(null);
  const scenarios = useMemo(() => scenarioDefinitions.map((item) => ({
    ...item,
    title: getContentValue(content, `claimCenter.scenarios.${item.key}.title`),
    copy: getContentValue(content, `claimCenter.scenarios.${item.key}.body`)
  })), [content]);
  const scenario = useMemo(() => scenarios.find((item) => item.id === scenarioId), [scenarioId, scenarios]);
  const needsChallenge = scenario?.claimType === "legacy_review";

  useEffect(() => {
    const current = createClaimSessionGuard({ auth: () => createBrowserSupabaseClient().auth });
    claimGuard.current = current;
    let actorRevision = -1;
    let loadedRevision = -1;
    const initial = new URLSearchParams(returnPath.split("?")[1] || "");
    const reloadClaims = async () => {
      const lease = current.lease();
      if (!lease) return null;
      const requestRevision = ++claimLoadRevision.current;
      setClaimsLoading(true); setClaimsError("");
      try {
        const payload = await current.request(lease, "/api/ownership-claims");
        if (!current.isCurrent(lease) || requestRevision !== claimLoadRevision.current) return null;
        if (!Array.isArray(payload.claims) || payload.claims.some((claim) => !claim || typeof claim.id !== "string" || typeof claim.status !== "string" || typeof claim.profileTitle !== "string" || typeof claim.qrCode !== "string" || !Number.isSafeInteger(claim.evidenceCount) || claim.evidenceCount < 0 || (claim.canCompleteSubmission !== undefined && typeof claim.canCompleteSubmission !== "boolean") || (claim.submissionComplete !== undefined && typeof claim.submissionComplete !== "boolean") || (claim.canCompleteSubmission === true && claim.submissionComplete !== false))) throw new Error("The saved ownership requests could not be read. Please retry.");
        setClaims(payload.claims as ClaimSummary[]);
        return payload.claims as ClaimSummary[];
      } catch (error) {
        if (current.isCurrent(lease) && requestRevision === claimLoadRevision.current) setClaimsError(error instanceof Error ? error.message : "Could not load ownership requests. Please retry.");
      } finally {
        if (current.isCurrent(lease) && requestRevision === claimLoadRevision.current) setClaimsLoading(false);
      }
      return null;
    };
    reloadClaimsRef.current = reloadClaims;
    const unsubscribe = current.subscribe((snapshot) => {
      if (snapshot.revision !== actorRevision) {
        actorRevision = snapshot.revision;
        claimLoadRevision.current++;
        evidenceRead.current = null;
        setEvidenceReading(false); setClaimsLoading(false); setClaimsError("");
        setClaims([]); setEvidence([]); setResponseEvidence([]); setResponseClaimId("");
        setWithdrawClaimId(""); setWithdrawNotice(null); setReviewNotice(null); setCompletionNotice(null); focusedClaim.current = "";
        setAcquisitionDetails(""); setOwnershipDeclaration(""); setBuyerCode(""); setBuyerOrderReference("");
        setComplete(false); setMessage(""); setChallengeCode("");
        setIdentifier(initial.get("code") || initial.get("serial") || "");
        setScenarioId(initial.get("handoff") === "buyer-code" ? "builder" : "");
      }
      setSignedIn(snapshot.phase === "ready" ? true : snapshot.phase === "signed-out" ? false : null);
      setAuthError(snapshot.error); setBusy(snapshot.busy);
      if (snapshot.phase === "ready" && loadedRevision !== snapshot.revision) {
        loadedRevision = snapshot.revision;
        void reloadClaims();
      }
    });
    void current.start();
    return () => {
      unsubscribe(); current.dispose();
      if (claimGuard.current === current) { claimGuard.current = null; reloadClaimsRef.current = async () => null; }
    };
  }, [returnPath]);

  useEffect(() => {
    if (!signedIn || claimsLoading || claimsError || !requestedClaim || focusedClaim.current === requestedClaim || !claims.some(claim => claim.id.toLowerCase() === requestedClaim)) return;
    const target = document.getElementById("claim-title-" + requestedClaim);
    if (target) { target.focus(); focusedClaim.current = requestedClaim; }
  }, [signedIn, claimsLoading, claimsError, requestedClaim, claims]);

  async function reviewClaim(claimId: string, action: "approve" | "deny", note: string) {
    const current = claimGuard.current;
    const claim = claims.find(item => item.id === claimId);
    if (!current || evidenceRead.current || claimsLoading || claimsError || claim?.canReview !== true || claim.status !== "awaiting_owner" || !note.trim()) return false;
    const lease = current.beginWrite();
    if (!lease) return false;
    claimLoadRevision.current++; setReviewNotice(null);
    try {
      try { await current.request(lease, "/api/ownership-claims", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: serializeClaimBody({ id: claimId, action, note }) }); }
      catch { /* Reconcile lost replies; never replay a decision automatically. */ }
      if (!current.isCurrent(lease)) return false;
      const saved = await reloadClaimsRef.current();
      if (!current.isCurrent(lease)) return false;
      const confirmed = saved?.find(item => item.id === claimId)?.status === (action === "approve" ? "approved" : "denied");
      setReviewNotice({ id: claimId, error: !confirmed, text: confirmed
        ? ui("ui.app.ownership.claim.page.reviewSaved", "Decision saved. The request status below has been refreshed.")
        : ui("ui.app.ownership.claim.page.reviewUnconfirmed", "Your decision could not be confirmed. Refresh the saved request status before trying again.") });
      window.requestAnimationFrame(() => document.getElementById("claim-review-status-" + claimId)?.focus());
      return confirmed;
    } finally { current.finishWrite(lease); }
  }

  function chooseScenario(id: ScenarioId) {
    if (busy || evidenceReading) return;
    setEvidence([]);
    setScenarioId(id);
    setComplete(false);
    setMessage("");
    const next = scenarios.find((item) => item.id === id);
    setChallengeCode(next?.claimType === "legacy_review" ? createChallengeCode() : "");
    window.requestAnimationFrame(() => {
      document.getElementById("claim-workspace-heading")?.focus({ preventScroll: true });
      document.getElementById("claim-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function changeScenario() {
    setScenarioId("");
    window.requestAnimationFrame(() => document.getElementById("claim-situations")?.querySelector("button")?.focus());
  }

  async function collectEvidence(files: FileList | null, response: boolean) {
    const current = claimGuard.current;
    const lease = current?.lease();
    if (!files?.length || !current || !lease || evidenceRead.current || current.getState().busy) return;
    const existing = response ? responseEvidence : evidence;
    const selected = Array.from(files);
    if (existing.length + selected.length > 3) { setMessage(ui("ui.app.ownership.claim.page.40c5fdba5671", "Choose no more than three evidence files in total.")); return; }
    if (existing.reduce((sum, item) => sum + item.bytes, 0) + selected.reduce((sum, item) => sum + item.size, 0) > MAX_CLAIM_EVIDENCE_BYTES) { setMessage(ui("ui.app.ownership.claim.page.b389685c17bd", "The current secure upload supports up to 3 MB of evidence combined. Choose smaller files and try again.")); return; }
    const operation = Symbol("read-evidence");
    evidenceRead.current = operation; setEvidenceReading(true); setMessage("");
    try {
      const next = await Promise.all(selected.map(async (file, index) => ({
        name: file.name, dataUrl: await readClaimEvidence(file), bytes: file.size,
        type: !response && needsChallenge && existing.length === 0 && index === 0 ? "possession_challenge" : file.type === "application/pdf" ? "ownership_document" : response ? "additional_evidence" : "identifying_photo"
      })));
      if (!current.isCurrent(lease) || evidenceRead.current !== operation) return;
      if (response) setResponseEvidence([...existing, ...next]); else setEvidence([...existing, ...next]);
    } catch (error) {
      if (current.isCurrent(lease) && evidenceRead.current === operation) setMessage(error instanceof Error ? error.message : ui("ui.app.ownership.claim.page.c0650627f361", "Could not read the evidence."));
    } finally {
      if (current.isCurrent(lease) && evidenceRead.current === operation) { evidenceRead.current = null; setEvidenceReading(false); }
    }
  }
  const addEvidence = (files: FileList | null) => collectEvidence(files, false);
  const addResponseEvidence = (files: FileList | null) => collectEvidence(files, true);

  async function writeClaim(path: string, method: "POST" | "PATCH", body: Record<string, unknown>, kind: "claim" | "evidence" | "buyer", onConfirmed: (payload: Record<string, unknown>) => void) {
    const current = claimGuard.current;
    if (!current || evidenceRead.current) return;
    const lease = current.beginWrite();
    if (!lease) return;
    const knownClaimIds = kind === "claim" ? new Set(claims.map((claim) => claim.id)) : null;
    claimLoadRevision.current++; setClaimsLoading(false); setMessage("");
    try {
      const payload = await current.request(lease, path, { method, headers: { "Content-Type": "application/json" }, body: serializeClaimBody(body) });
      confirmedClaimMutation(kind, payload);
      if (!current.isCurrent(lease)) return;
      onConfirmed(payload);
      setMessage(typeof payload.message === "string" ? payload.message : kind === "buyer" ? ui("ui.app.ownership.claim.page.85595a4753c6", "Ownership accepted.") : kind === "evidence" ? ui("ui.app.ownership.claim.page.65f71b1451b4", "Evidence submitted.") : ui("ui.app.ownership.claim.page.7562713c29a5", "Ownership request submitted."));
    } catch (error) {
      if (current.isCurrent(lease) && kind === "claim" && error instanceof ClaimRequestError && error.uncertain && knownClaimIds) {
        const saved = await reloadClaimsRef.current();
        if (!current.isCurrent(lease)) return;
        const reportedClaim = error.claimId ? saved?.find((claim) => claim.id.toLowerCase() === error.claimId) : undefined;
        const qrIdentifier = canonicalClaimQrIdentifier(body.identifier);
        const qrMatches = !error.claimId && qrIdentifier ? saved?.filter((claim) => !knownClaimIds.has(claim.id) && claim.canWithdraw === true && claimHasRecoverableSubmission(claim) && claim.qrCode.trim().toUpperCase() === qrIdentifier) || [] : [];
        const recovered = reportedClaim && claimHasRecoverableSubmission(reportedClaim) ? reportedClaim : (qrMatches.length === 1 ? qrMatches[0] : undefined);
        if (recovered) {
          setComplete(true); setEvidence([]); setAcquisitionDetails(""); setOwnershipDeclaration(""); setChallengeCode("");
          setMessage(ui("ui.app.ownership.claim.page.claimRecovered", "Your saved request was found after the interrupted response. Do not submit another request. Use Finish submitting below if it is offered."));
          return;
        }
        if (reportedClaim) {
          setMessage(ui("ui.app.ownership.claim.page.claimPartialRecovered", "A partial request was saved after the interrupted response, but it is not ready to finish. Your local files and declarations remain available here. Refresh or withdraw the saved request before starting a new attempt. This page will not replay the submission automatically."));
          return;
        }
      }
      if (current.isCurrent(lease)) setMessage(error instanceof ClaimRequestError && error.uncertain ? ui("ui.app.ownership.claim.page.7eef482a4cd9", "{{value1}} The last request may already be saved. Check your request status or collection before retrying.", {value1: error.message}) : error instanceof Error ? error.message : ui("ui.app.ownership.claim.page.2a833d45816f", "Could not complete the request."));
    } finally { current.finishWrite(lease); }
  }
  async function submit() {
    if (!scenario) return;
    await writeClaim("/api/ownership-claims", "POST", { identifier, serial: identifier, claimType: scenario.claimType, challengeCode, acquisitionDetails, ownershipDeclaration, evidence }, "claim", (payload) => {
      setComplete(true); setClaims((current) => [payload.claim as ClaimSummary, ...current]);
    });
  }
  async function redeemBuyerCode() {
    await writeClaim("/api/transfers", "PATCH", { action: "redeem_code", code: buyerCode, orderReference: buyerOrderReference }, "buyer", (payload) => {
      const transfer = payload.transfer as { id: string; status: "accepted" };
      void dispatchOptionalTrackingProductEvent({
        name: optionalTrackingProductEvents.ownershipTransferCompleted,
        properties: { method: "buyer_code" }
      }, { dedupeKey: transfer.id });
      setComplete(true); setBuyerCode("");
    });
  }
  async function resubmitEvidence(claimId: string) {
    await writeClaim("/api/ownership-claims", "PATCH", { id: claimId, action: "resubmit", evidence: responseEvidence }, "evidence", (payload) => {
      setClaims((current) => current.map((claim) => claim.id === claimId ? { ...claim, status: String(payload.status), evidenceCount: claim.evidenceCount + responseEvidence.length, adminReviewNote: "" } : claim));
      setResponseEvidence([]); setResponseClaimId("");
    });
  }

  async function withdrawRequest(claimId: string) {
    const current = claimGuard.current;
    const claim = claims.find((item) => item.id === claimId);
    if (!current || evidenceRead.current || claimsLoading || claimsError || withdrawClaimId !== claimId || !claim || !canWithdrawClaim(claim)) return;
    const lease = current.beginWrite();
    if (!lease) return;
    claimLoadRevision.current++;
    setWithdrawNotice(null);
    let rejected = false;
    try {
      try {
        await current.request(lease, "/api/ownership-claims", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: serializeClaimBody({ id: claimId, action: "cancel" }) });
      } catch {
        rejected = true;
      }
      if (!current.isCurrent(lease)) return;
      // Reconcile even a rejected or lost response; another session may have closed the request.
      const saved = await reloadClaimsRef.current();
      if (!current.isCurrent(lease)) return;
      const latest = saved?.find((item) => item.id === claimId);
      const cancelled = latest?.status === "cancelled";
      setWithdrawNotice({ id: claimId, error: !cancelled, text: !saved
        ? ui("ui.app.ownership.claim.page.withdrawRefreshFailure", "The saved request status could not be loaded. Refresh before taking another action.")
        : cancelled ? ui("ui.app.ownership.claim.page.withdrawSuccess", "Ownership request withdrawn.")
        : !latest || !canWithdrawClaim(latest) || !rejected ? ui("ui.app.ownership.claim.page.withdrawConflict", "This request changed before it could be withdrawn. Refresh the latest status and try again.")
        : ui("ui.app.ownership.claim.page.withdrawFailure", "Could not withdraw this request. Refresh its status and try again.") });
      setWithdrawClaimId("");
      if (cancelled && responseClaimId === claimId) { setResponseClaimId(""); setResponseEvidence([]); }
      window.requestAnimationFrame(() => document.getElementById(`withdraw-status-${claimId}`)?.focus());
    } finally { current.finishWrite(lease); }
  }

  async function completeSubmission(claimId: string) {
    const current = claimGuard.current;
    const claim = claims.find((item) => item.id === claimId);
    if (!current || evidenceRead.current || claimsLoading || claimsError || !claim || !canCompleteClaimSubmission(claim)) return false;
    const lease = current.beginWrite();
    if (!lease) return false;
    claimLoadRevision.current++;
    setCompletionNotice(null);
    try {
      try {
        const payload = await current.request(lease, "/api/ownership-claims", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: serializeClaimBody({ id: claimId, action: "complete_submission" }) });
        if (payload.submissionComplete !== true) throw new ClaimRequestError("The server did not confirm submission completion.", true);
      } catch { /* Reconcile every reply, including a lost response; never replay automatically. */ }
      if (!current.isCurrent(lease)) return false;
      const saved = await reloadClaimsRef.current();
      if (!current.isCurrent(lease)) return false;
      const completed = saved?.find((item) => item.id === claimId)?.submissionComplete === true;
      setCompletionNotice({ id: claimId, error: !completed, text: !saved
        ? ui("ui.app.ownership.claim.page.completionRefreshFailure", "The saved submission status could not be loaded. Refresh before taking another action.")
        : completed
          ? ui("ui.app.ownership.claim.page.completionSuccess", "Submission is confirmed. Your saved evidence remains attached.")
          : ui("ui.app.ownership.claim.page.completionUnconfirmed", "The submission is not yet confirmed complete. Your saved files remain attached; refresh and try Finish submitting again.") });
      window.requestAnimationFrame(() => document.getElementById(`completion-status-${claimId}`)?.focus());
      return completed;
    } finally { current.finishWrite(lease); }
  }

  return (
    <>
      <Nav />
      <main className={`section claim-center-page ${workflow.claims}`}>
        <div className="shell">
          <header className="claim-center-hero">
            <div><div className="eyebrow">{ui("ui.app.ownership.claim.page.3915d9578717", "Ownership Claim Center")}</div><h1>{getContentValue(content, "claimCenter.hero.headline")}</h1><p className="lede">{getContentValue(content, "claimCenter.hero.body")}</p></div>
            <aside><ShieldCheck aria-hidden="true" /><b>{ui("ui.app.ownership.claim.page.15a28c155c61", "Evidence stays private")}</b><span>{ui("ui.app.ownership.claim.page.2d6b2b891a03", "Only the current owner and authorized QRguitar reviewers can access submitted files.")}</span></aside>
          </header>

          {signedIn === null ? (
            <section className="card" aria-live="polite"><p>{authError || ui("ui.app.ownership.claim.page.b97f2f9cee97", "Checking your sign-in session...")}</p>{authError ? <button type="button" className="button secondary" onClick={() => void claimGuard.current?.start()}>{ui("ui.app.ownership.claim.page.b72989690e0a", "Retry sign-in check")}</button> : null}</section>
          ) : signedIn === false ? (
            <section className="card claim-callout"><ShieldCheck aria-hidden="true" /><div><h2>{ui("ui.app.ownership.claim.page.73c27c81d398", "Sign in to continue.")}</h2><p>{ui("ui.app.ownership.claim.page.26845d88e5fb", "Your account keeps the request, evidence, and decision attached to the correct person.")}</p><Link className="button" href={`/login?next=${encodeURIComponent(returnPath)}`}>{ui("ui.app.ownership.claim.page.bfd402b2f6f3", "Sign in")}</Link></div></section>
          ) : (
            <>
              <div className="claim-load-status">
                {claimsLoading ? <p role="status">{ui("ui.app.ownership.claim.page.ae324303eaa6", "Loading your ownership requests...")}</p> : null}
                {claimsError ? <p role="alert">{claimsError}</p> : null}
                {requestedClaim && !claimsLoading && !claimsError && !claims.some(claim => claim.id.toLowerCase() === requestedClaim) ? <p role="status">{ui("ui.app.ownership.claim.page.linkUnavailable", "This request is unavailable to this account. Check that you signed in with the account the email was sent to.")}</p> : null}
                {requestedClaim ? <Link href="/ownership-claim">{ui("ui.app.ownership.claim.page.newRequest", "Start a new ownership request")}</Link> : null}
                {reviewNotice && !claims.some(claim => claim.id === reviewNotice.id) ? <p id={"claim-review-status-" + reviewNotice.id} tabIndex={-1} role={reviewNotice.error ? "alert" : "status"}>{reviewNotice.text}</p> : null}
                {withdrawNotice && !claims.some((claim) => claim.id === withdrawNotice.id) ? <p id={`withdraw-status-${withdrawNotice.id}`} tabIndex={-1} role={withdrawNotice.error ? "alert" : "status"}>{withdrawNotice.text}</p> : null}
                {completionNotice && !claims.some((claim) => claim.id === completionNotice.id) ? <p id={`completion-status-${completionNotice.id}`} tabIndex={-1} role={completionNotice.error ? "alert" : "status"}>{completionNotice.text}</p> : null}
                {message && !complete ? <p className="form-message" role="status">{message}</p> : null}
                <button type="button" className="button secondary" disabled={busy || evidenceReading || claimsLoading} onClick={() => void reloadClaimsRef.current()}>{ui("ui.app.ownership.claim.page.6bc7c88e3f4e", "Refresh request status")}</button>
              </div>
              <fieldset disabled={busy || evidenceReading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              {!scenario && !requestedClaim ? (
              <section className="claim-scenario-grid" id="claim-situations" aria-label={ui("ui.app.ownership.claim.page.4c17f2a2ba0a", "Ownership situations")}>
                {scenarios.map((item) => {
                  const Icon = item.icon;
                  return <button className={scenarioId === item.id ? "claim-scenario-card is-active" : "claim-scenario-card"} type="button" key={item.id} aria-pressed={scenarioId === item.id} onClick={() => chooseScenario(item.id)}><Icon aria-hidden="true" /><span><b>{item.title}</b><small>{item.copy}</small></span></button>;
                })}
              </section>
              ) : null}

              {scenario ? (
                <section className="claim-workspace" id="claim-workspace">
                  <header><button type="button" onClick={changeScenario}><ArrowLeft aria-hidden="true" />{" "}{ui("ui.app.ownership.claim.page.b25283ffda7c", "Change situation")}</button><div><span>{ui("ui.app.ownership.claim.page.dade74c3fc37", "Selected path")}</span><h2 id="claim-workspace-heading" tabIndex={-1}>{scenario.title}</h2></div></header>
                  {scenario.preferredTransfer ? (
                    <div className="claim-preferred-path">
                      <Handshake aria-hidden="true" />
                      <div><h3>{ui("ui.app.ownership.claim.page.ec53472eb9b9", "The safest path is a seller transfer.")}</h3><p>{ui("ui.app.ownership.claim.page.b63a29a66da9", "The current owner opens the Profile in their Dashboard, chooses")}{" "}<b>{ui("ui.app.ownership.claim.page.f49cda3a003c", "Transfer Ownership")}</b>{ui("ui.app.ownership.claim.page.f9590f451be6", ", and sends a recipient-bound invitation to your account email. The permanent QRguitar ID and history stay unchanged.")}</p><p className="privacy-note">{ui("ui.app.ownership.claim.page.fead057ffd73", "The public QR code never contains a transfer token and cannot transfer ownership.")}</p><button className="button secondary" type="button" onClick={() => chooseScenario("no-transfer")}>{ui("ui.app.ownership.claim.page.ec2d3e1e3a9e", "Seller cannot transfer it")}</button></div>
                    </div>
                  ) : complete ? (
                    <div className="claim-complete" role="status"><FileCheck2 aria-hidden="true" /><div><h3>{ui("ui.app.ownership.claim.page.2508ed4a8444", "Request received.")}</h3><p>{message}</p><Link className="button" href="/dashboard">{ui("ui.app.ownership.claim.page.16ec0c9189e8", "Return to Dashboard")}</Link></div></div>
                  ) : (
                    <div className="claim-form-layout">
                      {scenario.claimType === "store_purchase" ? (
                        <section className="buyer-code-redeem">
                          <span className="mini-eyebrow">{ui("ui.app.ownership.claim.page.7bce049647c6", "Private buyer handoff")}</span>
                          <h3>{ui("ui.app.ownership.claim.page.26fa15b6bbdb", "Have a code from the shop or builder?")}</h3>
                          <p>{ui("ui.app.ownership.claim.page.ec01e30de3c4", "Sign in with the assigned buyer email if one was specified, then enter the one-time code supplied at checkout or pickup.")}</p>
                          <div><input aria-label={ui("ui.app.ownership.claim.page.ece21dc27db5", "Private buyer handoff code")} value={buyerCode} onChange={(event) => setBuyerCode(event.target.value.toUpperCase())} autoComplete="one-time-code" placeholder={ui("ui.app.ownership.claim.page.12cafdd53605", "XXXX-XXXX-XXXX")} /><input aria-label={ui("ui.app.ownership.claim.page.a53acddde434", "Order reference supplied by the seller")} value={buyerOrderReference} onChange={(event) => setBuyerOrderReference(event.target.value)} autoComplete="off" placeholder={ui("ui.app.ownership.claim.page.eb7a7dd8a26a", "Order/reference if supplied")} /><button className="button" type="button" disabled={busy || buyerCode.replace(/[^A-Z0-9]/g, "").length !== 12} onClick={() => void redeemBuyerCode()}>{busy ? ui("ui.app.ownership.claim.page.2e5f79bb94a8", "Checking...") : ui("ui.app.ownership.claim.page.13e3dc2abccf", "Accept handoff")}</button></div>
                          <small>{ui("ui.app.ownership.claim.page.e58632ca07e5", "A code expires, can be revoked, works once, and never appears in the public QR code or Profile.")}</small>
                        </section>
                      ) : null}
                      <form className="claim-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                        <label><span>{ui("ui.app.ownership.claim.page.d8c8569cfb01", "QRguitar ID or exact Serial Number")}</span><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="off" placeholder={ui("ui.app.ownership.claim.page.963c85e412dd", "QRG-... or manufacturer serial")} /><small>{ui("ui.app.ownership.claim.page.48809e2e7600", "This identifies a Profile only. It does not prove or transfer ownership.")}</small></label>
                        {needsChallenge ? <div className="claim-challenge"><span>{ui("ui.app.ownership.claim.page.d4b4b295ee14", "Private possession challenge")}</span><strong>{challengeCode}</strong><p>{ui("ui.app.ownership.claim.page.5e5f3a9509ad", "Write this code on paper and include it in the first current photo of the instrument. Do not edit it into an old image.")}</p></div> : null}
                        <label><span>{ui("ui.app.ownership.claim.page.c36a3c33bac5", "How and when did you acquire it?")}</span><textarea rows={4} maxLength={3000} value={acquisitionDetails} onChange={(event) => setAcquisitionDetails(event.target.value)} placeholder={ui("ui.app.ownership.claim.page.66029f39ee81", "Approximate date, seller/shop, order reference, and circumstances.")} /></label>
                        <label><span>{ui("ui.app.ownership.claim.page.9cf11b231a0a", "Ownership declaration")}</span><textarea rows={3} maxLength={1500} value={ownershipDeclaration} onChange={(event) => setOwnershipDeclaration(event.target.value)} placeholder={ui("ui.app.ownership.claim.page.edbab83e946f", "Confirm that you possess the instrument and that your information is truthful.")} /></label>
                        <label><span>{ui("ui.app.ownership.claim.page.cabb6cb580cc", "Private evidence (1-3 files)")}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple onChange={(event) => void addEvidence(event.target.files)} /><small>{needsChallenge ? ui("ui.app.ownership.claim.page.88342316aa22", "First: current challenge photo. Then add a Serial Number photo, receipt, bill of sale, marketplace record, or estate/gift document. Up to three files, 3 MB combined.") : ui("ui.app.ownership.claim.page.29cc371cad01", "Add a receipt, invoice, identifying photo, or other purchase evidence. Up to three files, 3 MB combined.")}</small></label>
                        {evidence.length ? <ul className="claim-evidence-list">{evidence.map((file, index) => <li key={`${file.name}-${index}`}><Check aria-hidden="true" /><span>{file.name}<small>{file.type.replaceAll("_", " ")}</small></span><button type="button" onClick={() => setEvidence((current) => current.filter((_, itemIndex) => itemIndex !== index))}>{ui("ui.app.ownership.claim.page.c3812fc4acb8", "Remove")}</button></li>)}</ul> : null}
                        <button type="submit" className="button" disabled={busy || signedIn !== true}>{busy ? ui("ui.app.ownership.claim.page.09e3fad17544", "Submitting securely...") : ui("ui.app.ownership.claim.page.40447e4493fb", "Submit for review")}</button>
                      </form>
                      <aside className="claim-evidence-guide"><span>{ui("ui.app.ownership.claim.page.8f9b77e6e0b4", "What happens next")}</span><ol><li><b>{ui("ui.app.ownership.claim.page.64900440a8c9", "Submitted")}</b><small>{ui("ui.app.ownership.claim.page.3584f595aa34", "Your files remain private.")}</small></li><li><b>{ui("ui.app.ownership.claim.page.9b5d252d528e", "Owner response")}</b><small>{ui("ui.app.ownership.claim.page.0cbc7ff0a4e3", "The current owner may approve or dispute.")}</small></li><li><b>{ui("ui.app.ownership.claim.page.23e8381bc011", "QRguitar review")}</b><small>{ui("ui.app.ownership.claim.page.60789e933c1d", "Unresolved claims require administrator review.")}</small></li><li><b>{ui("ui.app.ownership.claim.page.640ae4baf960", "Decision")}</b><small>{ui("ui.app.ownership.claim.page.24f68feae8fe", "Approval preserves the same Profile ID, URL, and protected history.")}</small></li></ol></aside>
                    </div>
                  )}
                </section>
              ) : null}

              {claims.length ? (
                <section className="claim-status-section">
                  <div className="section-head"><div><div className="eyebrow">{ui("ui.app.ownership.claim.page.4c64a2a1c581", "Your requests")}</div><h2>{ui("ui.app.ownership.claim.page.54403cae6653", "Claim status")}</h2></div></div>
                  <div className="claim-status-list">
                    {visibleClaimRequests(claims, requestedClaim).map((claim) => (
                      <article key={claim.id} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
                        <div>
                          <span>{claimSubmissionIncomplete(claim) ? ui("ui.app.ownership.claim.page.completionStatus", "Submission incomplete") : claimStatusLabel(claim.status)}</span>
                          <h3 id={"claim-title-" + claim.id.toLowerCase()} tabIndex={-1}>{claim.profileTitle}</h3>
                          <small>{claim.qrCode || ui("ui.app.ownership.claim.page.0e2a9633188b", "Private Profile")} · {claim.evidenceCount}{" "}{ui("ui.app.ownership.claim.page.21ea0f42e3ae", "evidence file")}{claim.evidenceCount === 1 ? "" : ui("ui.app.ownership.claim.page.043a718774c5", "s")}</small>
                          <ClaimOwnerReview key={claim.id + ":" + claim.status} claim={claim} disabled={busy || claimsLoading || Boolean(claimsError) || evidenceReading} onDecision={(action, note) => reviewClaim(claim.id, action, note)} />
                          {reviewNotice?.id === claim.id ? <p id={"claim-review-status-" + claim.id} tabIndex={-1} role={reviewNotice.error ? "alert" : "status"}>{reviewNotice.text}</p> : null}
                          {canWithdrawClaim(claim) ? <div className="claim-response">
                            {withdrawClaimId === claim.id ? <div role="group" aria-labelledby={`withdraw-title-${claim.id}`} style={{ display: "grid", gap: 12 }}>
                              <h4 id={`withdraw-title-${claim.id}`} style={{ margin: 0 }}>{ui("ui.app.ownership.claim.page.withdrawConfirmTitle", "Withdraw this ownership request?")}</h4>
                              <p>{ui("ui.app.ownership.claim.page.withdrawConfirmBody", "This closes the pending request. Ownership and submitted evidence stay unchanged. A withdrawn request cannot be reopened.")}</p>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                                <button id={`keep-request-${claim.id}`} className="button secondary" type="button" disabled={busy || evidenceReading} onClick={() => { setWithdrawClaimId(""); window.requestAnimationFrame(() => document.getElementById(`withdraw-request-${claim.id}`)?.focus()); }}>{ui("ui.app.ownership.claim.page.keepRequest", "Keep request")}</button>
                                <button className="button" type="button" disabled={busy || evidenceReading || claimsLoading || Boolean(claimsError)} onClick={() => void withdrawRequest(claim.id)}><X size={16} aria-hidden="true" />{busy ? ui("ui.app.ownership.claim.page.withdrawingRequest", "Withdrawing request...") : ui("ui.app.ownership.claim.page.withdrawConfirmAction", "Yes, withdraw request")}</button>
                              </div>
                            </div> : <button id={`withdraw-request-${claim.id}`} className="button secondary" type="button" disabled={busy || evidenceReading || claimsLoading || Boolean(claimsError)} onClick={() => { setWithdrawClaimId(claim.id); setWithdrawNotice(null); window.requestAnimationFrame(() => document.getElementById(`keep-request-${claim.id}`)?.focus()); }}><X size={16} aria-hidden="true" />{ui("ui.app.ownership.claim.page.withdrawRequest", "Withdraw request")}</button>}
                          </div> : null}
                          {withdrawNotice?.id === claim.id ? <p id={`withdraw-status-${claim.id}`} tabIndex={-1} role={withdrawNotice.error ? "alert" : "status"}>{withdrawNotice.text}</p> : null}
                          {canCompleteClaimSubmission(claim) ? <div className="claim-response">
                            <p><b>{ui("ui.app.ownership.claim.page.completionTitle", "Finish this saved request.")}</b>{" "}{ui("ui.app.ownership.claim.page.completionBody", "Your evidence files are already saved and will be reused. You do not need to upload them again.")}</p>
                            <button id={`complete-submission-${claim.id}`} className="button" type="button" disabled={busy || evidenceReading || claimsLoading || Boolean(claimsError)} onClick={() => void completeSubmission(claim.id)}><FileCheck2 size={16} aria-hidden="true" />{busy ? ui("ui.app.ownership.claim.page.finishingSubmission", "Finishing...") : ui("ui.app.ownership.claim.page.finishSubmitting", "Finish submitting")}</button>
                          </div> : null}
                          {completionNotice?.id === claim.id ? <p id={`completion-status-${claim.id}`} tabIndex={-1} role={completionNotice.error ? "alert" : "status"}>{completionNotice.text}</p> : null}
                          {claim.status === "awaiting_claimant" && claim.canSubmitEvidence === true ? (
                            <div className="claim-response">
                              <p><b>{ui("ui.app.ownership.claim.page.e9672027cf43", "QRguitar needs more information.")}</b>{claim.adminReviewNote ? ui("ui.app.ownership.claim.page.7130515d99f1", " {{value1}}", { value1: claim.adminReviewNote }) : ui("ui.app.ownership.claim.page.aa618133af62", " Add the requested private evidence below.")}</p>
                              {responseClaimId === claim.id ? (
                                <>
                                  <label>{ui("ui.app.ownership.claim.page.339a31e91a30", "Requested evidence (up to three files, 3 MB combined)")}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple onChange={(event) => void addResponseEvidence(event.target.files)} /></label>
                                  {responseEvidence.length ? <small>{responseEvidence.length}{" "}{ui("ui.app.ownership.claim.page.3b9c358f36f0", "file")}{responseEvidence.length === 1 ? "" : ui("ui.app.ownership.claim.page.043a718774c5", "s")}{" "}{ui("ui.app.ownership.claim.page.b24d6d33736e", "ready")}</small> : null}
                                  <div>
                                    <button className="button" type="button" disabled={busy || !responseEvidence.length} onClick={() => void resubmitEvidence(claim.id)}>{busy ? ui("ui.app.ownership.claim.page.64115d5b9c79", "Submitting...") : ui("ui.app.ownership.claim.page.91e287e5015e", "Submit evidence")}</button>
                                    <button className="button secondary" type="button" onClick={() => { setResponseClaimId(""); setResponseEvidence([]); }}>{ui("ui.app.ownership.claim.page.19766ed6ccb2", "Cancel")}</button>
                                  </div>
                                </>
                              ) : <button className="button secondary" type="button" onClick={() => { setResponseClaimId(claim.id); setResponseEvidence([]); setMessage(""); }}>{ui("ui.app.ownership.claim.page.ee26147672a3", "Add requested evidence")}</button>}
                            </div>
                          ) : null}
                        </div>
                        <ol>{statusSteps.map((step) => <li className={claimSubmissionIncomplete(claim) ? step === "submitted" ? "is-current" : "" : claim.status === step || (step === "submitted" && claim.status !== "awaiting_claimant") ? "is-current" : ""} key={step}>{claimSubmissionIncomplete(claim) && step === "submitted" ? ui("ui.app.ownership.claim.page.completionSavedStep", "saved, not submitted") : step.replaceAll("_", " ")}</li>)}</ol>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
              </fieldset>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function OwnershipClaimPage() {
  const ui = useUiText("app.ownership.claim.page");
  return (
    <Suspense fallback={<main className={`section claim-center-page ${workflow.claims}`}><div className="shell"><section className="card claim-callout"><div><h1>{ui("ui.app.ownership.claim.page.6109a1ebd28d", "Opening Ownership Claim Center.")}</h1><p>{ui("ui.app.ownership.claim.page.9f66e1c15c7c", "Loading your secure ownership options.")}</p></div></section></div></main>}>
      <OwnershipClaimContent />
    </Suspense>
  );
}
