"use client";

import { ArrowLeft, Check, FileCheck2, Gift, Handshake, PackageCheck, ShieldCheck, Store, Wrench } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { getContentValue } from "../../lib/content-registry";
import { useSiteContent } from "../../lib/use-site-content";
import { createClaimSessionGuard, ClaimRequestError, claimReturnPath, confirmedClaimMutation, serializeClaimBody, readClaimEvidence, MAX_CLAIM_EVIDENCE_BYTES } from "../../lib/ownership-claim-client";

type EvidenceDraft = { name: string; dataUrl: string; type: string; bytes: number };
type ClaimType = "owner_transfer" | "store_purchase" | "legacy_review";
type ScenarioId = "store" | "builder" | "seller" | "no-transfer" | "gift" | "legacy";
type ClaimSummary = { id: string; status: string; profileTitle: string; qrCode: string; evidenceCount: number; claimType: ClaimType; createdAt: string; adminReviewNote?: string };

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
  const content = useSiteContent();
  const searchParams = useSearchParams();
  const returnPath = claimReturnPath(searchParams);
  const claimGuard = useRef<ReturnType<typeof createClaimSessionGuard> | null>(null);
  const reloadClaimsRef = useRef<() => Promise<void>>(async () => undefined);
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
      if (!lease) return;
      const requestRevision = ++claimLoadRevision.current;
      setClaimsLoading(true); setClaimsError("");
      try {
        const payload = await current.request(lease, "/api/ownership-claims");
        if (!current.isCurrent(lease) || requestRevision !== claimLoadRevision.current) return;
        if (!Array.isArray(payload.claims) || payload.claims.some((claim) => !claim || typeof claim.id !== "string" || typeof claim.status !== "string" || typeof claim.profileTitle !== "string" || typeof claim.qrCode !== "string" || !Number.isSafeInteger(claim.evidenceCount) || claim.evidenceCount < 0)) throw new Error("The saved ownership requests could not be read. Please retry.");
        setClaims(payload.claims as ClaimSummary[]);
      } catch (error) {
        if (current.isCurrent(lease) && requestRevision === claimLoadRevision.current) setClaimsError(error instanceof Error ? error.message : "Could not load ownership requests. Please retry.");
      } finally {
        if (current.isCurrent(lease) && requestRevision === claimLoadRevision.current) setClaimsLoading(false);
      }
    };
    reloadClaimsRef.current = reloadClaims;
    const unsubscribe = current.subscribe((snapshot) => {
      if (snapshot.revision !== actorRevision) {
        actorRevision = snapshot.revision;
        claimLoadRevision.current++;
        evidenceRead.current = null;
        setEvidenceReading(false); setClaimsLoading(false); setClaimsError("");
        setClaims([]); setEvidence([]); setResponseEvidence([]); setResponseClaimId("");
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
      if (claimGuard.current === current) { claimGuard.current = null; reloadClaimsRef.current = async () => undefined; }
    };
  }, [returnPath]);

  function chooseScenario(id: ScenarioId) {
    if (busy || evidenceReading) return;
    setEvidence([]);
    setScenarioId(id);
    setComplete(false);
    setMessage("");
    const next = scenarios.find((item) => item.id === id);
    setChallengeCode(next?.claimType === "legacy_review" ? createChallengeCode() : "");
    window.requestAnimationFrame(() => document.getElementById("claim-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function collectEvidence(files: FileList | null, response: boolean) {
    const current = claimGuard.current;
    const lease = current?.lease();
    if (!files?.length || !current || !lease || evidenceRead.current || current.getState().busy) return;
    const existing = response ? responseEvidence : evidence;
    const selected = Array.from(files);
    if (existing.length + selected.length > 3) { setMessage("Choose no more than three evidence files in total."); return; }
    if (existing.reduce((sum, item) => sum + item.bytes, 0) + selected.reduce((sum, item) => sum + item.size, 0) > MAX_CLAIM_EVIDENCE_BYTES) { setMessage("The current secure upload supports up to 3 MB of evidence combined. Choose smaller files and try again."); return; }
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
      if (current.isCurrent(lease) && evidenceRead.current === operation) setMessage(error instanceof Error ? error.message : "Could not read the evidence.");
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
    claimLoadRevision.current++; setClaimsLoading(false); setMessage("");
    try {
      const payload = await current.request(lease, path, { method, headers: { "Content-Type": "application/json" }, body: serializeClaimBody(body) });
      confirmedClaimMutation(kind, payload);
      if (!current.isCurrent(lease)) return;
      onConfirmed(payload);
      setMessage(typeof payload.message === "string" ? payload.message : kind === "buyer" ? "Ownership accepted." : kind === "evidence" ? "Evidence submitted." : "Ownership request submitted.");
    } catch (error) {
      if (current.isCurrent(lease)) setMessage(error instanceof ClaimRequestError && error.uncertain ? `${error.message} The last request may already be saved. Check your request status or collection before retrying.` : error instanceof Error ? error.message : "Could not complete the request.");
    } finally { current.finishWrite(lease); }
  }
  async function submit() {
    if (!scenario) return;
    await writeClaim("/api/ownership-claims", "POST", { identifier, serial: identifier, claimType: scenario.claimType, challengeCode, acquisitionDetails, ownershipDeclaration, evidence }, "claim", (payload) => {
      setComplete(true); setClaims((current) => [payload.claim as ClaimSummary, ...current]);
    });
  }
  async function redeemBuyerCode() {
    await writeClaim("/api/transfers", "PATCH", { action: "redeem_code", code: buyerCode, orderReference: buyerOrderReference }, "buyer", () => { setComplete(true); setBuyerCode(""); });
  }
  async function resubmitEvidence(claimId: string) {
    await writeClaim("/api/ownership-claims", "PATCH", { id: claimId, action: "resubmit", evidence: responseEvidence }, "evidence", (payload) => {
      setClaims((current) => current.map((claim) => claim.id === claimId ? { ...claim, status: String(payload.status), evidenceCount: claim.evidenceCount + responseEvidence.length, adminReviewNote: "" } : claim));
      setResponseEvidence([]); setResponseClaimId("");
    });
  }

  return (
    <>
      <Nav />
      <main className="section claim-center-page">
        <div className="shell">
          <header className="claim-center-hero">
            <div><div className="eyebrow">Ownership Claim Center</div><h1>{getContentValue(content, "claimCenter.hero.headline")}</h1><p className="lede">{getContentValue(content, "claimCenter.hero.body")}</p></div>
            <aside><ShieldCheck aria-hidden="true" /><b>Evidence stays private</b><span>Only the current owner and authorized QRguitar reviewers can access submitted files.</span></aside>
          </header>

          {signedIn === null ? (
            <section className="card" aria-live="polite"><p>{authError || "Checking your sign-in session..."}</p>{authError ? <button type="button" className="button secondary" onClick={() => void claimGuard.current?.start()}>Retry sign-in check</button> : null}</section>
          ) : signedIn === false ? (
            <section className="card claim-callout"><ShieldCheck aria-hidden="true" /><div><h2>Sign in to continue.</h2><p>Your account keeps the request, evidence, and decision attached to the correct person.</p><Link className="button" href={`/login?next=${encodeURIComponent(returnPath)}`}>Sign in</Link></div></section>
          ) : (
            <>
              <div className="claim-load-status">
                {claimsLoading ? <p role="status">Loading your ownership requests...</p> : null}
                {claimsError ? <p role="alert">{claimsError}</p> : null}
                {message && !complete ? <p className="form-message" role="status">{message}</p> : null}
                <button type="button" className="button secondary" disabled={busy || evidenceReading || claimsLoading} onClick={() => void reloadClaimsRef.current()}>Refresh request status</button>
              </div>
              <fieldset disabled={busy || evidenceReading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <section className="claim-scenario-grid" aria-label="Ownership situations">
                {scenarios.map((item) => {
                  const Icon = item.icon;
                  return <button className={scenarioId === item.id ? "claim-scenario-card is-active" : "claim-scenario-card"} type="button" key={item.id} aria-pressed={scenarioId === item.id} onClick={() => chooseScenario(item.id)}><Icon aria-hidden="true" /><span><b>{item.title}</b><small>{item.copy}</small></span></button>;
                })}
              </section>

              {scenario ? (
                <section className="claim-workspace" id="claim-workspace">
                  <header><button type="button" onClick={() => setScenarioId("")}><ArrowLeft aria-hidden="true" /> Change situation</button><div><span>Selected path</span><h2>{scenario.title}</h2></div></header>
                  {scenario.preferredTransfer ? (
                    <div className="claim-preferred-path">
                      <Handshake aria-hidden="true" />
                      <div><h3>The safest path is a seller transfer.</h3><p>The current owner opens the Profile in their Dashboard, chooses <b>Transfer Ownership</b>, and sends a recipient-bound invitation to your account email. The permanent QRguitar ID and history stay unchanged.</p><p className="privacy-note">The public QR code never contains a transfer token and cannot transfer ownership.</p><button className="button secondary" type="button" onClick={() => chooseScenario("no-transfer")}>Seller cannot transfer it</button></div>
                    </div>
                  ) : complete ? (
                    <div className="claim-complete" role="status"><FileCheck2 aria-hidden="true" /><div><h3>Request received.</h3><p>{message}</p><Link className="button" href="/dashboard">Return to Dashboard</Link></div></div>
                  ) : (
                    <div className="claim-form-layout">
                      {scenario.claimType === "store_purchase" ? (
                        <section className="buyer-code-redeem">
                          <span className="mini-eyebrow">Private buyer handoff</span>
                          <h3>Have a code from the shop or builder?</h3>
                          <p>Sign in with the assigned buyer email if one was specified, then enter the one-time code supplied at checkout or pickup.</p>
                          <div><input aria-label="Private buyer handoff code" value={buyerCode} onChange={(event) => setBuyerCode(event.target.value.toUpperCase())} autoComplete="one-time-code" placeholder="XXXX-XXXX-XXXX" /><input aria-label="Order reference supplied by the seller" value={buyerOrderReference} onChange={(event) => setBuyerOrderReference(event.target.value)} autoComplete="off" placeholder="Order/reference if supplied" /><button className="button" type="button" disabled={busy || buyerCode.replace(/[^A-Z0-9]/g, "").length !== 12} onClick={() => void redeemBuyerCode()}>{busy ? "Checking..." : "Accept handoff"}</button></div>
                          <small>A code expires, can be revoked, works once, and never appears in the public QR code or Profile.</small>
                        </section>
                      ) : null}
                      <form className="claim-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                        <label><span>QRguitar ID or exact Serial Number</span><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="off" placeholder="QRG-... or manufacturer serial" /><small>This identifies a Profile only. It does not prove or transfer ownership.</small></label>
                        {needsChallenge ? <div className="claim-challenge"><span>Private possession challenge</span><strong>{challengeCode}</strong><p>Write this code on paper and include it in the first current photo of the instrument. Do not edit it into an old image.</p></div> : null}
                        <label><span>How and when did you acquire it?</span><textarea rows={4} maxLength={3000} value={acquisitionDetails} onChange={(event) => setAcquisitionDetails(event.target.value)} placeholder="Approximate date, seller/shop, order reference, and circumstances." /></label>
                        <label><span>Ownership declaration</span><textarea rows={3} maxLength={1500} value={ownershipDeclaration} onChange={(event) => setOwnershipDeclaration(event.target.value)} placeholder="Confirm that you possess the instrument and that your information is truthful." /></label>
                        <label><span>Private evidence (1-3 files)</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple onChange={(event) => void addEvidence(event.target.files)} /><small>{needsChallenge ? "First: current challenge photo. Then add a Serial Number photo, receipt, bill of sale, marketplace record, or estate/gift document. Up to three files, 3 MB combined." : "Add a receipt, invoice, identifying photo, or other purchase evidence. Up to three files, 3 MB combined."}</small></label>
                        {evidence.length ? <ul className="claim-evidence-list">{evidence.map((file, index) => <li key={`${file.name}-${index}`}><Check aria-hidden="true" /><span>{file.name}<small>{file.type.replaceAll("_", " ")}</small></span><button type="button" onClick={() => setEvidence((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></li>)}</ul> : null}
                        <button type="submit" className="button" disabled={busy || signedIn !== true}>{busy ? "Submitting securely..." : "Submit for review"}</button>
                      </form>
                      <aside className="claim-evidence-guide"><span>What happens next</span><ol><li><b>Submitted</b><small>Your files remain private.</small></li><li><b>Owner response</b><small>The current owner may approve or dispute.</small></li><li><b>QRguitar review</b><small>Unresolved claims require administrator review.</small></li><li><b>Decision</b><small>Approval preserves the same Profile ID, URL, and protected history.</small></li></ol></aside>
                    </div>
                  )}
                </section>
              ) : null}

              {claims.length ? (
                <section className="claim-status-section">
                  <div className="section-head"><div><div className="eyebrow">Your requests</div><h2>Claim status</h2></div></div>
                  <div className="claim-status-list">
                    {claims.slice(0, 6).map((claim) => (
                      <article key={claim.id}>
                        <div>
                          <span>{claimStatusLabel(claim.status)}</span>
                          <h3>{claim.profileTitle}</h3>
                          <small>{claim.qrCode || "Private Profile"} · {claim.evidenceCount} evidence file{claim.evidenceCount === 1 ? "" : "s"}</small>
                          {claim.status === "awaiting_claimant" ? (
                            <div className="claim-response">
                              <p><b>QRguitar needs more information.</b>{claim.adminReviewNote ? ` ${claim.adminReviewNote}` : " Add the requested private evidence below."}</p>
                              {responseClaimId === claim.id ? (
                                <>
                                  <label>Requested evidence (up to three files, 3 MB combined)<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple onChange={(event) => void addResponseEvidence(event.target.files)} /></label>
                                  {responseEvidence.length ? <small>{responseEvidence.length} file{responseEvidence.length === 1 ? "" : "s"} ready</small> : null}
                                  <div>
                                    <button className="button" type="button" disabled={busy || !responseEvidence.length} onClick={() => void resubmitEvidence(claim.id)}>{busy ? "Submitting..." : "Submit evidence"}</button>
                                    <button className="button secondary" type="button" onClick={() => { setResponseClaimId(""); setResponseEvidence([]); }}>Cancel</button>
                                  </div>
                                </>
                              ) : <button className="button secondary" type="button" onClick={() => { setResponseClaimId(claim.id); setResponseEvidence([]); setMessage(""); }}>Add requested evidence</button>}
                            </div>
                          ) : null}
                        </div>
                        <ol>{statusSteps.map((step) => <li className={claim.status === step || (step === "submitted" && claim.status !== "awaiting_claimant") ? "is-current" : ""} key={step}>{step.replaceAll("_", " ")}</li>)}</ol>
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
  return (
    <Suspense fallback={<main className="section claim-center-page"><div className="shell"><section className="card claim-callout"><div><h1>Opening Ownership Claim Center.</h1><p>Loading your secure ownership options.</p></div></section></div></main>}>
      <OwnershipClaimContent />
    </Suspense>
  );
}
