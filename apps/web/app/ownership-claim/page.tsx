"use client";

import { ArrowLeft, Check, FileCheck2, Gift, Handshake, PackageCheck, ShieldCheck, Store, Wrench } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../../lib/supabase-browser";
import { getContentValue } from "../../lib/content-registry";
import { useSiteContent } from "../../lib/use-site-content";

type EvidenceDraft = { name: string; dataUrl: string; type: string };
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

async function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function claimStatusLabel(status: string) {
  return ({ awaiting_claimant: "Evidence required", awaiting_owner: "Awaiting current owner", admin_review: "Under QRguitar review", approved: "Approved", denied: "Declined", cancelled: "Cancelled", expired: "Expired" } as Record<string, string>)[status] || "Submitted";
}

function OwnershipClaimContent() {
  const content = useSiteContent();
  const searchParams = useSearchParams();
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
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setSignedIn(false);
      return;
    }
    void supabase.auth.getSession().then(async ({ data }) => {
      const active = Boolean(data.session?.user);
      setSignedIn(active);
      if (!active) return;
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/ownership-claims", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(payload.claims)) setClaims(payload.claims);
    });
  }, []);

  function chooseScenario(id: ScenarioId) {
    setScenarioId(id);
    setComplete(false);
    setMessage("");
    const next = scenarios.find((item) => item.id === id);
    setChallengeCode(next?.claimType === "legacy_review" ? createChallengeCode() : "");
    window.requestAnimationFrame(() => document.getElementById("claim-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function addEvidence(files: FileList | null) {
    if (!files?.length) return;
    setMessage("");
    try {
      const room = Math.max(0, 3 - evidence.length);
      const selected = Array.from(files).slice(0, room);
      const next = await Promise.all(selected.map(async (file, index) => ({
        name: file.name,
        dataUrl: await readFile(file),
        type: needsChallenge && evidence.length === 0 && index === 0
          ? "possession_challenge"
          : file.type === "application/pdf" ? "ownership_document" : "identifying_photo"
      })));
      setEvidence((current) => [...current, ...next]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add that evidence.");
    }
  }

  async function submit() {
    if (!scenario) return;
    const token = await getSupabaseAccessToken();
    if (!token) {
      setMessage("Sign in before requesting ownership.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/ownership-claims", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, serial: identifier, claimType: scenario.claimType, challengeCode, acquisitionDetails, ownershipDeclaration, evidence })
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(payload.message || (response.ok ? "Ownership request submitted." : "Could not submit the ownership request."));
      if (response.ok) {
        setComplete(true);
        if (payload.claim) setClaims((current) => [payload.claim, ...current]);
      }
    } catch {
      setMessage("Could not submit the ownership request. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function redeemBuyerCode() {
    const token = await getSupabaseAccessToken();
    if (!token) return setMessage("Sign in before accepting a buyer handoff.");
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/transfers", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "redeem_code", code: buyerCode, orderReference: buyerOrderReference })
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(payload.message || (response.ok ? "Ownership accepted." : "Could not accept that buyer code."));
      if (response.ok) {
        setComplete(true);
        setBuyerCode("");
      }
    } catch {
      setMessage("Could not accept that buyer code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addResponseEvidence(files: FileList | null) {
    if (!files?.length) return;
    try {
      const selected = Array.from(files).slice(0, Math.max(0, 3 - responseEvidence.length));
      const next = await Promise.all(selected.map(async (file) => ({
        name: file.name,
        dataUrl: await readFile(file),
        type: file.type === "application/pdf" ? "ownership_document" : "additional_evidence"
      })));
      setResponseEvidence((current) => [...current, ...next]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add that evidence.");
    }
  }

  async function resubmitEvidence(claimId: string) {
    const token = await getSupabaseAccessToken();
    if (!token) return setMessage("Sign in before submitting evidence.");
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/ownership-claims", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: claimId, action: "resubmit", evidence: responseEvidence })
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(payload.message || (response.ok ? "Evidence submitted." : "Could not submit evidence."));
      if (response.ok) {
        setClaims((current) => current.map((claim) => claim.id === claimId ? { ...claim, status: String(payload.status || "admin_review"), evidenceCount: claim.evidenceCount + responseEvidence.length, adminReviewNote: "" } : claim));
        setResponseEvidence([]);
        setResponseClaimId("");
      }
    } catch {
      setMessage("Could not submit the requested evidence. Try again.");
    } finally {
      setBusy(false);
    }
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

          {signedIn === false ? (
            <section className="card claim-callout"><ShieldCheck aria-hidden="true" /><div><h2>Sign in to continue.</h2><p>Your account keeps the request, evidence, and decision attached to the correct person.</p><Link className="button" href="/login?next=/ownership-claim">Sign in</Link></div></section>
          ) : (
            <>
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
                          <div><input value={buyerCode} onChange={(event) => setBuyerCode(event.target.value.toUpperCase())} autoComplete="one-time-code" placeholder="XXXX-XXXX-XXXX" /><input value={buyerOrderReference} onChange={(event) => setBuyerOrderReference(event.target.value)} autoComplete="off" placeholder="Order/reference if supplied" /><button className="button" type="button" disabled={busy || buyerCode.replace(/[^A-Z0-9]/g, "").length !== 12} onClick={() => void redeemBuyerCode()}>{busy ? "Checking..." : "Accept handoff"}</button></div>
                          <small>A code expires, can be revoked, works once, and never appears in the public QR code or Profile.</small>
                        </section>
                      ) : null}
                      <form className="claim-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                        <label><span>QRguitar ID or exact Serial Number</span><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="off" placeholder="QRG-... or manufacturer serial" /><small>This identifies a Profile only. It does not prove or transfer ownership.</small></label>
                        {needsChallenge ? <div className="claim-challenge"><span>Private possession challenge</span><strong>{challengeCode}</strong><p>Write this code on paper and include it in the first current photo of the instrument. Do not edit it into an old image.</p></div> : null}
                        <label><span>How and when did you acquire it?</span><textarea rows={4} value={acquisitionDetails} onChange={(event) => setAcquisitionDetails(event.target.value)} placeholder="Approximate date, seller/shop, order reference, and circumstances." /></label>
                        <label><span>Ownership declaration</span><textarea rows={3} value={ownershipDeclaration} onChange={(event) => setOwnershipDeclaration(event.target.value)} placeholder="Confirm that you possess the instrument and that your information is truthful." /></label>
                        <label><span>Private evidence (1-3 files)</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple onChange={(event) => void addEvidence(event.target.files)} /><small>{needsChallenge ? "First: current challenge photo. Then add a Serial Number photo, receipt, bill of sale, marketplace record, or estate/gift document." : "Add a receipt, invoice, identifying photo, or other purchase evidence. Each file must be 10 MB or smaller."}</small></label>
                        {evidence.length ? <ul className="claim-evidence-list">{evidence.map((file, index) => <li key={`${file.name}-${index}`}><Check aria-hidden="true" /><span>{file.name}<small>{file.type.replaceAll("_", " ")}</small></span><button type="button" onClick={() => setEvidence((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></li>)}</ul> : null}
                        {message ? <p className="form-message" role="status">{message}</p> : null}
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
                                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple onChange={(event) => void addResponseEvidence(event.target.files)} />
                                  {responseEvidence.length ? <small>{responseEvidence.length} file{responseEvidence.length === 1 ? "" : "s"} ready</small> : null}
                                  <div>
                                    <button className="button" type="button" disabled={busy || !responseEvidence.length} onClick={() => void resubmitEvidence(claim.id)}>{busy ? "Submitting..." : "Submit evidence"}</button>
                                    <button className="button secondary" type="button" onClick={() => { setResponseClaimId(""); setResponseEvidence([]); }}>Cancel</button>
                                  </div>
                                </>
                              ) : <button className="button secondary" type="button" onClick={() => setResponseClaimId(claim.id)}>Add requested evidence</button>}
                            </div>
                          ) : null}
                        </div>
                        <ol>{statusSteps.map((step) => <li className={claim.status === step || (step === "submitted" && claim.status !== "awaiting_claimant") ? "is-current" : ""} key={step}>{step.replaceAll("_", " ")}</li>)}</ol>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
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
