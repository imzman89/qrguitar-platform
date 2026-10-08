"use client";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Nav } from "../../../../components/Nav";
import { Footer } from "../../../../components/Footer";
import { createBrowserSupabaseClient } from "../../../../lib/supabase-browser";
import { createServiceSlipSaveController, ServiceSlipSaveError } from "../../../../lib/service-slip-client";
import { emptyServiceSlip, isSlipId, readSavedServiceSlip, readServiceSlip, serviceSlipTextLimits, type SavedServiceSlip, type ServiceSlip, type SlipTextField } from "../../../../lib/service-slips";
import styles from "./service-slips.module.css";
type Auth = { id: string; token: string };
type Controller = ReturnType<typeof createServiceSlipSaveController>;
const endpoint = "/api/service-slips";
function localDate() { const now = new Date(); return [now.getFullYear(), String(now.getMonth()+1).padStart(2,"0"), String(now.getDate()).padStart(2,"0")].join("-"); }

export default function PrivateServiceSlipsPage() {
  const [actorId, setActorId] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [authAttempt, setAuthAttempt] = useState(0);
  const [eligible, setEligible] = useState(false);
  const [items, setItems] = useState<SavedServiceSlip[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [id, setId] = useState("");
  const [saved, setSaved] = useState<SavedServiceSlip | null>(null);
  const [form, setForm] = useState<ServiceSlip>(emptyServiceSlip);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<"" | "uncertain" | "conflict">("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [printRequest, setPrintRequest] = useState<{ stamp: number; actor: string; id: string; revision: number } | null>(null);
  const auth = useRef<Auth | null>(null), epoch = useRef(0), working = useRef(false);
  const writer = useRef<Controller | null>(null);
  const hasChanges = Boolean(id) && JSON.stringify(form) !== JSON.stringify(saved?.data || emptyServiceSlip());
  const unsaved = hasChanges || Boolean(issue) || busy;
  const clear = useCallback(() => {
    epoch.current++; writer.current?.invalidate(); writer.current = null; working.current = false;
    setEligible(false); setItems([]); setHasMore(false); setOffset(0); setId(""); setSaved(null); setForm(emptyServiceSlip()); setBusy(false); setIssue(""); setError(""); setMessage(""); setPrintRequest(null);
  }, []);
  const makeWriter = useCallback((actor: string) => createServiceSlipSaveController(actor, async body => {
    const current = auth.current;
    if (current?.id !== actor) throw new Error("Session changed");
    const response = await fetch(endpoint, { method: "PUT", headers: { authorization: "Bearer " + current.token, "Content-Type": "application/json" }, body, cache: "no-store", signal: AbortSignal.timeout(20000) });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }), []);
  useEffect(() => {
    let disposed = false, resolved = false;
    let subscription: { unsubscribe(): void } | undefined;
    setAuthChecked(false);
    const apply = (next: Session | null) => {
      if (disposed) return;
      resolved = true; window.clearTimeout(deadline);
      const nextId = next?.access_token ? next.user.id : "";
      if (nextId !== auth.current?.id || !writer.current) { clear(); writer.current = nextId ? makeWriter(nextId) : null; }
      auth.current = nextId && next?.access_token ? { id: nextId, token: next.access_token } : null;
      setActorId(auth.current?.id || ""); setAuthChecked(true);
    };
    const fail = () => { if (disposed || resolved) return; apply(null); setError("Your sign-in could not be checked. Try again."); };
    const deadline = window.setTimeout(fail, 10000);
    const conceal = () => { clear(); auth.current = null; setActorId(""); setAuthChecked(false); };
    const pageshow = (event: PageTransitionEvent) => { if (event.persisted) { conceal(); setAuthAttempt(value => value + 1); } };
    window.addEventListener("pagehide", conceal); window.addEventListener("pageshow", pageshow);
    try {
      const client = createBrowserSupabaseClient();
      subscription = client.auth.onAuthStateChange((_event, next) => apply(next)).data.subscription;
      void client.auth.getSession().then(({ data, error: authError }) => { if (resolved || disposed) return; if (authError) fail(); else apply(data.session); }).catch(fail);
    } catch { fail(); }
    return () => { disposed = true; window.clearTimeout(deadline); subscription?.unsubscribe(); window.removeEventListener("pagehide", conceal); window.removeEventListener("pageshow", pageshow); writer.current?.invalidate(); writer.current = null; epoch.current++; };
  }, [authAttempt, clear, makeWriter]);

  useEffect(() => {
    if (!actorId || auth.current?.id !== actorId) return;
    const stamp = ++epoch.current, current = auth.current;
    let disposed = false;
    const valid = () => !disposed && stamp === epoch.current && auth.current?.id === current.id;
    setBusy(true); working.current = true; setError("");
    void (async () => {
      const response = await fetch(endpoint + "?offset=" + offset, { headers: { authorization: "Bearer " + current.token }, cache: "no-store", signal: AbortSignal.timeout(20000) });
      const payload = await response.json().catch(() => null);
      if (!valid()) return;
      if (!response.ok || payload?.ok !== true || payload.actorId !== current.id || !Array.isArray(payload.slips)) throw new Error(payload?.message || "Could not load your service slips.");
      const rows = payload.slips.map((row: unknown) => readSavedServiceSlip(row, current.id));
      setItems(rows); setHasMore(payload.hasMore === true); setEligible(true);
      // Resolve the saved URL independently of the current list page.
      const requestedId = new URL(window.location.href).searchParams.get("id");
      if (requestedId) {
        if (!isSlipId(requestedId)) throw new Error("Invalid service slip link.");
        const detail = await fetch(endpoint + "?id=" + encodeURIComponent(requestedId), { headers: { authorization: "Bearer " + current.token }, cache: "no-store", signal: AbortSignal.timeout(20000) });
        const body = await detail.json().catch(() => null);
        if (!valid()) return;
        if (!detail.ok || body?.ok !== true || body.actorId !== current.id) throw new Error(body?.message || "Could not load the saved slip.");
        const row = readSavedServiceSlip(body.slip, current.id);
        setId(row.id); setSaved(row); setForm(row.data); setIssue(""); writer.current?.invalidate(); writer.current = makeWriter(current.id);
      }
    })().catch(reason => { if (valid()) setError(reason instanceof Error ? reason.message : "Could not load slips."); })
      .finally(() => { if (valid()) { setBusy(false); working.current = false; } });
    return () => { disposed = true; };
  }, [actorId, offset, loadAttempt, makeWriter]);

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const leave = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === "_blank" || target.hasAttribute("download") || target.href === window.location.href) return;
      if (!window.confirm("Leave this slip? Unsaved changes will be lost. An unconfirmed save may already be stored; reopen this slip to check.")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn); document.addEventListener("click", leave, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", leave, true); };
  }, [unsaved]);
  function setUrl(next: string) { const url = new URL(window.location.href); if (next) url.searchParams.set("id", next); else url.searchParams.delete("id"); window.history.replaceState(null, "", url.pathname + url.search); }
  function canLeave() { return !unsaved || window.confirm("Discard unsaved edits and open another slip? If a save was unconfirmed, reopen its saved link to check it."); }
  function newSlip() {
    const currentActor = auth.current?.id;
    if (working.current || !eligible || !currentActor || currentActor !== actorId || !canLeave()) return;
    const source = saved?.owner_id === currentActor ? saved : items.filter(row => row.owner_id === currentActor)
      .reduce<SavedServiceSlip | null>((latest, row) => !latest || Date.parse(row.updated_at) > Date.parse(latest.updated_at) ? row : latest, null);
    const defaults = source?.data;
    const next = crypto.randomUUID(); setId(next); setSaved(null); setForm({ ...emptyServiceSlip(), jobDate: localDate(),
      businessName: defaults?.businessName || "", businessContact: defaults?.businessContact || "",
      footer: defaults?.footer || "", paper: defaults?.paper || "letter" });
    setIssue(""); setError(""); setMessage(""); setUrl(next);
    writer.current?.invalidate(); writer.current = actorId ? makeWriter(actorId) : null;
  }
  function openSlip(row: SavedServiceSlip) {
    if (working.current || !canLeave()) return;
    setId(row.id); setSaved(row); setForm(row.data); setIssue(""); setError(""); setMessage(""); setUrl(row.id);
    writer.current?.invalidate(); writer.current = actorId ? makeWriter(actorId) : null;
  }
  function reloadSlip() {
    if (working.current || !canLeave()) return;
    setIssue(""); setMessage(""); setSaved(null); setId(""); setForm(emptyServiceSlip()); writer.current?.invalidate(); writer.current = actorId ? makeWriter(actorId) : null; setLoadAttempt(value => value + 1);
  }
  async function save(printAfter = false, retry = false) {
    if (working.current || !writer.current || !eligible) return;
    try { if (!retry) readServiceSlip(form); } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Check the slip details.";
      setError(message);
      const field = message === "Choose a valid job date." ? "jobDate"
        : message === "Enter a QRG code or leave the reference empty." ? "qrReference"
        : (Object.keys(serviceSlipTextLimits) as SlipTextField[]).find(key => message.endsWith(" " + key + ".")) || "instrument";
      const control = document.getElementById("slip-" + field);
      control?.closest("details")?.setAttribute("open", "");
      control?.focus();
      return;
    }
    const stamp = epoch.current, actor = auth.current?.id, controller = writer.current;
    working.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const row = await (retry ? controller.retry() : controller.save(id, saved?.revision || 0, form));
      if (stamp !== epoch.current || auth.current?.id !== actor) return;
      setSaved(row); setForm(row.data); setIssue(""); setMessage("Saved to your private service slips.");
      if (printAfter && actor) setPrintRequest({ stamp, actor, id: row.id, revision: row.revision });
      // Refresh this list page only: saving can move a row across page boundaries.
      // Do not reload the selected document or advance the print/session epoch.
      try {
        const current = auth.current;
        if (!current || current.id !== actor) return;
        const response = await fetch(endpoint + "?offset=" + offset, { headers: { authorization: "Bearer " + current.token }, cache: "no-store", signal: AbortSignal.timeout(20000) });
        const payload = await response.json().catch(() => null);
        if (stamp !== epoch.current || auth.current?.id !== actor) return;
        if (!response.ok || payload?.ok !== true || payload.actorId !== actor || !Array.isArray(payload.slips)) throw new Error("List refresh failed");
        const rows = payload.slips.map((item: unknown) => readSavedServiceSlip(item, current.id));
        setItems(rows); setHasMore(payload.hasMore === true);
      } catch {
        if (stamp === epoch.current && auth.current?.id === actor) setError("Your slip was saved, but the list could not be refreshed. Reload slips to update the list.");
      }
    } catch (reason) {
      if (stamp !== epoch.current || auth.current?.id !== actor) return;
      setIssue(reason instanceof ServiceSlipSaveError && reason.kind === "conflict" ? "conflict" : "uncertain");
      setError(reason instanceof Error ? reason.message : "Save not confirmed. Reload this slip to check.");
    } finally { if (stamp === epoch.current) { working.current = false; setBusy(false); } }
  }
  useEffect(() => {
    if (!printRequest || !saved || saved.id !== printRequest.id || saved.revision !== printRequest.revision) return;
    // This effect runs only after the saved preview has committed to the DOM.
    const timeout = window.setTimeout(() => {
      if (printRequest.stamp === epoch.current && auth.current?.id === printRequest.actor) window.print();
      setPrintRequest(null);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [printRequest, saved]);
  const locked = busy || Boolean(issue);
  const printData = saved?.data;
  function textInput(key: SlipTextField, label: string, multiline = false, placeholder = "") {
    return <label className={styles.field} key={key} htmlFor={"slip-" + key}><span>{label}</span>{multiline
      ? <textarea id={"slip-" + key} value={form[key]} maxLength={serviceSlipTextLimits[key]} rows={3} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} placeholder={placeholder} />
      : <input id={"slip-" + key} type={key === "jobDate" ? "date" : "text"} required={key === "instrument"} value={form[key]} maxLength={serviceSlipTextLimits[key]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} placeholder={placeholder} />}</label>;
  }
  return <><div className={styles.screenOnly}><Nav /></div><main className={styles.page} data-private-service-workspace>
    <header className={styles.screenOnly}><Link href="/dashboard" className={styles.back}>← Your workspace</Link><div className={styles.heading}><div><p className={styles.eyebrow}>WORKSHOP / PRIVATE FILES</p><h1>Service slips</h1><p>Every instrument. Your work, saved and ready to hand over.</p></div>{eligible && <button className={styles.primary} disabled={busy} onClick={newSlip}>New service slip</button>}</div>
      <p className={styles.muted}>No QR registration or owner approval needed. These slips stay in your account. <Link href="/dashboard/service">Registered service work →</Link></p>
    </header>
    <div className={styles.screenOnly}>
      {!authChecked ? <p role="status">Checking your sign-in…</p> : !actorId ? <p><Link href="/login?next=%2Fdashboard%2Fservice%2Fslips">Sign in</Link> to open your private files. <button onClick={() => setAuthAttempt(value => value + 1)}>Check sign-in again</button></p> : null}
      {error && <div role="alert" className={styles.alert}><p>{error}</p>{issue === "uncertain" && <button disabled={busy} onClick={() => void save(false, true)}>Retry the same save</button>}{actorId && <button disabled={busy} onClick={reloadSlip}>{issue ? "Reload saved slip (discard local edits)" : "Reload slips"}</button>}</div>}
      {message && <p role="status" className={styles.success}>{message}</p>}
      {busy && <p role="status">{eligible ? "Working…" : "Loading your service slips…"}</p>}
    </div>
    {eligible && actorId && <div className={styles.layout}>
      <aside className={styles.screenOnly + " " + styles.sidebar}><h2>Saved slips</h2><p className={styles.muted}>Private to this account</p>{!items.length && !busy && <p>Your first job starts with a new slip.</p>}
        <ul className={styles.slipList}>{items.map(row => <li key={row.id}><button aria-current={row.id === id ? "page" : undefined} disabled={busy} onClick={() => openSlip(row)}><strong>{row.data.instrument}</strong><span>{row.data.jobReference || "No job reference"} · {row.data.jobDate || "No date"}</span><small>Saved {new Date(row.updated_at).toLocaleDateString()}</small></button></li>)}</ul>
        {(offset > 0 || hasMore) && <div className={styles.pager}><button disabled={busy || offset === 0} onClick={() => { if (canLeave()) setOffset(Math.max(0, offset-50)); }}>Previous</button><button disabled={busy || !hasMore} onClick={() => { if (canLeave()) setOffset(offset+50); }}>Next</button></div>}
      </aside>
      <section className={styles.editor}>
        {!id ? <div className={styles.screenOnly + " " + styles.empty}><h2>Ready for the next instrument.</h2><p>Add the guitar, record the work and save a printable slip for your files.</p><button className={styles.primary} disabled={busy} onClick={newSlip}>Start a service slip</button></div> : <>
          <form className={styles.screenOnly + " " + styles.form} onSubmit={event => { event.preventDefault(); void save(); }}>
            <div className={styles.sectionTitle}><h2>{saved ? "Edit service slip" : "New service slip"}</h2><span>{issue ? "Save needs attention" : hasChanges ? "Unsaved changes" : saved ? "Saved" : "Not saved"}</span></div>
            <fieldset disabled={locked}><legend>Instrument & job</legend><p className={styles.muted}>Only the instrument description is required.</p>
              {textInput("instrument", "Instrument description *", false, "e.g. Sunburst Stratocaster · setup and fret work")}
              <details className={styles.disclosure}><summary>Instrument & job details (optional)</summary><div className={styles.grid}>{textInput("make", "Make")}{textInput("model", "Model")}{textInput("serial", "Serial number")}{textInput("qrReference", "QRG reference (optional)")}{textInput("jobReference", "Your job reference")}{textInput("jobDate", "Job date")}</div></details>
            </fieldset>
            <fieldset disabled={locked}><legend>Work record</legend>{textInput("requestedWork", "Requested work", true)}{textInput("completedWork", "Work completed", true)}<details className={styles.disclosure}><summary>Private workshop notes (optional)</summary>{textInput("privateNotes", "Private workshop notes", true)}<p className={styles.muted}>Private notes are excluded from printing unless you select them below.</p></details></fieldset>
            <details className={styles.disclosure}><summary>Customer details (optional)</summary><fieldset disabled={locked}><legend>Customer</legend><div className={styles.grid}>{textInput("customerName", "Customer name")}{textInput("customerContact", "Contact details")}</div><p className={styles.muted}>Record only what you need for the job. No email or message is sent.</p></fieldset></details>
            <details className={styles.disclosure}><summary>Customize the printed slip</summary><fieldset disabled={locked}><legend>Print settings</legend><p className={styles.muted}>New slips reuse the workshop name, contact, footer and paper size from the selected saved slip, or the newest slip shown. Customer and job details start blank; customer and private-note printing start off.</p><div className={styles.grid}>{textInput("businessName", "Workshop name")}{textInput("businessContact", "Workshop contact")}</div>{textInput("footer", "Footer / care instructions", true)}
              <label className={styles.field}>Paper size<select value={form.paper} onChange={event => setForm(previous => ({ ...previous, paper: event.target.value as "letter" | "a4" }))}><option value="letter">US Letter</option><option value="a4">A4</option></select></label>
              <label className={styles.check}><input type="checkbox" checked={form.printCustomer} onChange={event => setForm(previous => ({ ...previous, printCustomer: event.target.checked }))} />Include customer details on the printout</label>
              <label className={styles.check}><input type="checkbox" checked={form.printPrivateNotes} onChange={event => setForm(previous => ({ ...previous, printPrivateNotes: event.target.checked }))} />Include private workshop notes on the printout</label>
            </fieldset></details>
            <div className={styles.actions}><button className={styles.primary} type="submit" disabled={locked || (!hasChanges && Boolean(saved))}>Save slip</button><button type="button" disabled={locked} onClick={() => void save(true)}>Save & print</button><button type="button" disabled={!saved || busy || Boolean(issue) || hasChanges} onClick={() => window.print()}>Print saved slip</button></div>
          </form>
          {printData ? <section className={styles.document} aria-label="Saved service slip print preview" data-service-slip-print>
            <p className={styles.screenOnly + " " + styles.previewLabel}>SAVED PRINT PREVIEW{hasChanges ? " · Save edits to update this preview" : ""}</p>
            <header className={styles.documentHeader}><div><p className={styles.documentBrand}>{printData.businessName || "Service workshop"}</p>{printData.businessContact && <p>{printData.businessContact}</p>}</div><div><h2>Service slip</h2><p>{printData.jobReference || "Job record"}</p><p>{printData.jobDate}</p></div></header>
            <h3>{printData.instrument}</h3><dl className={styles.facts}>{([ ["Make", printData.make], ["Model", printData.model], ["Serial", printData.serial], ["QRG reference", printData.qrReference] ] as const).filter(([,value]) => value).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            {printData.printCustomer && (printData.customerName || printData.customerContact) && <section><h4>Customer</h4><p>{printData.customerName}</p><p>{printData.customerContact}</p></section>}
            <section><h4>Requested work</h4><p className={styles.prose}>{printData.requestedWork || "—"}</p></section><section><h4>Work completed</h4><p className={styles.prose}>{printData.completedWork || "—"}</p></section>
            {printData.printPrivateNotes && printData.privateNotes && <section><h4>Workshop notes · private copy</h4><p className={styles.prose}>{printData.privateNotes}</p></section>}
            <footer>{printData.footer && <p className={styles.prose}>{printData.footer}</p>}<small>QRguitar · Private service record · Revision {saved?.revision}</small></footer>
          </section> : <p className={styles.screenOnly + " " + styles.muted}>Save the slip to create its print preview.</p>}
        </>}
      </section>
    </div>}
  </main><div className={styles.screenOnly}><Footer /></div><style>{"@media print { html:has([data-private-service-workspace]), body:has([data-private-service-workspace]) { background: white !important; color: black; min-height: 0; } body:has([data-private-service-workspace]) > :not([data-private-service-workspace]):not(:has([data-private-service-workspace])) { display: none !important; } }"}</style><style>{printData?.paper === "a4" ? "@page { size: A4; margin: 14mm; }" : "@page { size: letter; margin: 0.55in; }"}</style></>;
}
