"use client";

import { FileCheck2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../../lib/supabase-browser";

type EvidenceDraft = { name: string; dataUrl: string; type: string };

async function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

export default function OwnershipClaimPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [serial, setSerial] = useState("");
  const [acquisitionDetails, setAcquisitionDetails] = useState("");
  const [ownershipDeclaration, setOwnershipDeclaration] = useState("");
  const [evidence, setEvidence] = useState<EvidenceDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setSignedIn(false);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session?.user)));
  }, []);

  async function addEvidence(files: FileList | null) {
    if (!files?.length) return;
    setMessage("");
    try {
      const room = Math.max(0, 3 - evidence.length);
      const selected = Array.from(files).slice(0, room);
      const next = await Promise.all(selected.map(async (file) => ({
        name: file.name,
        dataUrl: await readFile(file),
        type: file.type === "application/pdf" ? "ownership_document" : "current_instrument_photo"
      })));
      setEvidence((current) => [...current, ...next]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add that evidence.");
    }
  }

  async function submit() {
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
        body: JSON.stringify({ serial, acquisitionDetails, ownershipDeclaration, evidence })
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(payload.message || (response.ok ? "Ownership request submitted." : "Could not submit the ownership request."));
      if (response.ok) setComplete(true);
    } catch {
      setMessage("Could not submit the ownership request. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="section ownership-claim-page">
        <div className="shell narrow-shell">
          <div className="eyebrow">Ownership review</div>
          <h1>Request ownership of an existing Profile.</h1>
          <p className="lede">An exact serial match helps find the right instrument, but it never transfers ownership by itself. QRguitar keeps your evidence private while the current owner or an administrator reviews the request.</p>

          {signedIn === false ? (
            <section className="card claim-callout">
              <ShieldCheck aria-hidden="true" />
              <div>
                <h2>Sign in to continue.</h2>
                <p>Your account keeps the request, evidence, and decision attached to the correct person.</p>
                <a className="button" href="/login?next=/ownership-claim">Sign in</a>
              </div>
            </section>
          ) : complete ? (
            <section className="card claim-callout" role="status">
              <FileCheck2 aria-hidden="true" />
              <div>
                <h2>Request received.</h2>
                <p>{message}</p>
                <a className="button" href="/dashboard">Return to dashboard</a>
              </div>
            </section>
          ) : (
            <section className="card claim-form">
              <label>
                Exact Serial Number
                <input value={serial} onChange={(event) => setSerial(event.target.value)} autoComplete="off" placeholder="Enter the complete serial" />
              </label>
              <label>
                How and when did you acquire the instrument?
                <textarea rows={5} value={acquisitionDetails} onChange={(event) => setAcquisitionDetails(event.target.value)} placeholder="Include the approximate date, seller or shop, and any details that help establish the ownership trail." />
              </label>
              <label>
                Ownership declaration
                <textarea rows={4} value={ownershipDeclaration} onChange={(event) => setOwnershipDeclaration(event.target.value)} placeholder="Confirm that you currently possess the instrument and that the information and evidence are truthful." />
              </label>
              <label>
                Private evidence (1-3 files)
                <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple onChange={(event) => void addEvidence(event.target.files)} />
                <small>Use current instrument photos, a clear serial photo, receipt, bill of sale, or dealer invoice. Each file must be 10 MB or smaller.</small>
              </label>
              {evidence.length ? (
                <ul className="claim-evidence-list">
                  {evidence.map((file, index) => (
                    <li key={`${file.name}-${index}`}>
                      <span>{file.name}</span>
                      <button type="button" className="text-button" onClick={() => setEvidence((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {message ? <p className="form-message" role="status">{message}</p> : null}
              <button type="button" className="button" disabled={busy || signedIn !== true} onClick={() => void submit()}>{busy ? "Submitting..." : "Submit ownership request"}</button>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
