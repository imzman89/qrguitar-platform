"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Printer, QrCode } from "lucide-react";
import { Nav } from "../../../components/Nav";
import { Footer } from "../../../components/Footer";
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";
import { publicProfileUrl } from "../../../lib/profile-url";
import { buildQrBatchPlan, defaultQrBatchSettings, MAX_QR_BATCH_LABELS, qrBatchGeometry, type QrBatchSettings } from "../../../lib/qr-batch-layout";
import { awaitQrBatchWork, loadQrBatchInventory, prepareQrBatch, validateQrBatchRecords, type QrBatchIdentity, type QrBatchRecord } from "../../../lib/qr-batch-client";
import { readQrPaperSettings, saveQrPaperSettings } from "../../../lib/qr-paper-settings";
import styles from "./qr-batch.module.css";

type Prepared = Awaited<ReturnType<typeof prepareQrBatch>> & { key: string };

export default function QrLabelBatchPage() {
  const search = useSearchParams();
  const seedCode = search.get("code") || "";
  const [ownerId, setOwnerId] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [inventory, setInventory] = useState<{ ownerId: string; records: QrBatchRecord[] } | null>(null);
  const [inventoryError, setInventoryError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<QrBatchSettings>(defaultQrBatchSettings);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [imagesReady, setImagesReady] = useState(false);
  const [approved, setApproved] = useState(false);
  const [page, setPage] = useState(0);
  const [scale, setScale] = useState(1);
  const authRef = useRef("");
  const epoch = useRef(0);
  const operation = useRef<AbortController | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const seeded = useRef("");
  const records = inventory?.ownerId === ownerId ? inventory.records : [];
  const requests = Object.entries(quantities).map(([code, quantity]) => ({ code, quantity: quantity.trim() ? Number(quantity) : NaN }));
  const key = JSON.stringify([ownerId, epoch.current, requests, settings]);
  const keyRef = useRef(key); keyRef.current = key;
  const job = prepared?.key === key ? prepared : null;
  let geometry: ReturnType<typeof qrBatchGeometry> | null = null, selectionError = "";
  try { geometry = qrBatchGeometry(settings); if (requests.length) buildQrBatchPlan(requests, settings); }
  catch (error) { selectionError = error instanceof Error ? error.message : "Check your print settings."; }
  const matching = records.filter(record => `${record.title} ${record.qrCode} ${record.serial || ""}`.toLowerCase().includes(filter.toLowerCase().trim()));

  function invalidate() {
    operation.current?.abort(); operation.current = null;
    setPrepared(null); setImagesReady(false); setApproved(false); setBusy(false); setMessage("");
  }
  async function readIdentity(): Promise<QrBatchIdentity | null> {
    const { data, error } = await createBrowserSupabaseClient().auth.getSession();
    if (error) throw new Error("Your sign-in could not be checked. Try again.");
    return data.session ? { id: data.session.user.id, token: data.session.access_token } : null;
  }
  useEffect(() => {
    let active = true;
    try {
      const client = createBrowserSupabaseClient();
      const observe = (id: string) => {
        if (!active) return;
        if (id !== authRef.current) {
          authRef.current = id; epoch.current++; seeded.current = "";
          invalidate(); setInventory(null); setQuantities({}); setOwnerId(id);
          let saved: QrBatchSettings | null = null;
          try { if (id) saved = readQrPaperSettings(id, window.localStorage); } catch { /* Printing remains available without browser storage. */ }
          setSettings(saved || { ...defaultQrBatchSettings });
        }
        setAuthChecked(true);
      };
      const subscription = client.auth.onAuthStateChange((_event, session) => observe(session?.user.id || ""));
      const initialEpoch = epoch.current;
      void client.auth.getSession().then(({ data, error }) => {
        if (!active || epoch.current !== initialEpoch) return;
        if (error) { setInventoryError("Your sign-in could not be checked. Refresh this page to try again."); setAuthChecked(true); }
        else observe(data.session?.user.id || "");
      }).catch(() => { if (active) { setInventoryError("Your sign-in could not be checked. Refresh this page to try again."); setAuthChecked(true); } });
      return () => { active = false; subscription.data.subscription.unsubscribe(); operation.current?.abort(); };
    } catch { setInventoryError("Sign-in is temporarily unavailable."); setAuthChecked(true); }
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    const controller = new AbortController(), revision = epoch.current;
    let active = true;
    setInventory(null); setInventoryError(""); invalidate();
    const timer = setTimeout(() => controller.abort(), 20000);
    void awaitQrBatchWork(readIdentity(), controller.signal).then(async identity => {
      if (!identity || identity.id !== ownerId) throw new Error("Sign in again to load your inventory.");
      const loaded = await loadQrBatchInventory(identity, controller.signal);
      if (!active || controller.signal.aborted || epoch.current !== revision || authRef.current !== ownerId) return;
      setInventory({ ownerId, records: loaded });
    }).catch(error => {
      if (active && epoch.current === revision && authRef.current === ownerId) setInventoryError(controller.signal.aborted ? "Loading took too long. Try again." : error instanceof Error ? error.message : "Inventory is unavailable.");
    }).finally(() => clearTimeout(timer));
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [ownerId, attempt]);

  useEffect(() => {
    if (!inventory || inventory.ownerId !== ownerId || !seedCode || seeded.current === `${ownerId}:${seedCode}`) return;
    seeded.current = `${ownerId}:${seedCode}`;
    const record = inventory.records.find(item => item.qrCode.toUpperCase() === seedCode.toUpperCase());
    if (record?.isPublic) { invalidate(); setQuantities(current => ({ ...current, [record.qrCode]: "1" })); }
    else setMessage("That Profile is unavailable for customer labels. Choose a public Profile from your inventory.");
  }, [inventory, ownerId, seedCode]);

  function checkImages() {
    const images = Array.from(pagesRef.current?.querySelectorAll("img") || []);
    setImagesReady(Boolean(job && images.length === job.plan.count && images.every(image => image.complete && image.naturalWidth > 0)));
  }
  useEffect(() => {
    setImagesReady(false); setPage(0); setApproved(false);
    if (!job) return;
    checkImages();
    const timer = setTimeout(() => { const images = Array.from(pagesRef.current?.querySelectorAll("img") || []); if (images.some(image => !image.complete || !image.naturalWidth)) setMessage("A QR image could not load. Prepare the labels again before printing."); }, 15000);
    return () => clearTimeout(timer);
  }, [prepared, key]);
  useEffect(() => {
    const viewport = previewRef.current;
    if (!viewport || !job) return;
    const measure = () => setScale(Math.min(1, Math.max(0.15, (viewport.clientWidth - 24) / (job.plan.widthMm * 96 / 25.4))));
    const observer = new ResizeObserver(measure); observer.observe(viewport); measure();
    return () => observer.disconnect();
  }, [job?.plan.widthMm]);
  useEffect(() => { const done = () => setApproved(false); window.addEventListener("afterprint", done); return () => window.removeEventListener("afterprint", done); }, []);

  function changeSettings(next: Partial<QrBatchSettings>) {
    invalidate();
    let saved: QrBatchSettings | null = null;
    try { if (next.stock && ownerId && ownerId === authRef.current) saved = readQrPaperSettings(ownerId, window.localStorage, next.stock); } catch { /* Use this job's settings while storage is unavailable. */ }
    setSettings(current => saved ? saved : next.stock
      ? { ...defaultQrBatchSettings, sideMm: current.sideMm, stock: next.stock, skip: 0 }
      : { ...current, ...next });
  }
  async function savePaper() {
    if (!ownerId || ownerId !== authRef.current || busy || selectionError) return;
    const actor = ownerId, revision = epoch.current, capturedKey = key;
    try {
      const identity = await readIdentity();
      if (!identity || identity.id !== actor || authRef.current !== actor || epoch.current !== revision || keyRef.current !== capturedKey) return;
      saveQrPaperSettings(actor, settings, window.localStorage);
      setMessage("Paper settings saved for this account on this browser. Used labels start at zero on the next job.");
    } catch (error) { if (authRef.current === actor && epoch.current === revision) setMessage(error instanceof Error ? error.message : "Paper settings could not be saved."); }
  }
  async function prepare() {
    if (keyRef.current !== key || busy || !requests.length || selectionError) return;
    invalidate(); const controller = new AbortController(); operation.current = controller;
    const capturedKey = key, revision = epoch.current;
    const isCurrent = () => keyRef.current === capturedKey && epoch.current === revision && operation.current === controller;
    setBusy(true);
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const next = await prepareQrBatch({ requests, settings, readIdentity, isCurrent, signal: controller.signal });
      if (isCurrent() && !controller.signal.aborted) setPrepared({ ...next, key: capturedKey });
    } catch (error) { if (isCurrent()) setMessage(controller.signal.aborted ? "Preparation took too long. Try again." : error instanceof Error ? error.message : "Labels could not be prepared."); }
    finally { clearTimeout(timeout); if (isCurrent()) setBusy(false); }
  }
  async function print() {
    if (keyRef.current !== key || !job || !imagesReady || busy) return;
    const controller = new AbortController(); operation.current?.abort(); operation.current = controller;
    const capturedKey = key, revision = epoch.current;
    const current = () => !controller.signal.aborted && operation.current === controller && keyRef.current === capturedKey && epoch.current === revision;
    const timer = setTimeout(() => controller.abort(), 20000);
    setBusy(true); setApproved(false); setMessage("");
    try {
      const identity = await awaitQrBatchWork(readIdentity(), controller.signal); if (!current()) return;
      if (!identity || identity.id !== job.ownerId) throw new Error("Sign in to the account that prepared these labels.");
      const latest = await awaitQrBatchWork(loadQrBatchInventory(identity, controller.signal), controller.signal); if (!current()) return;
      validateQrBatchRecords(latest, requests);
      const finalIdentity = await awaitQrBatchWork(readIdentity(), controller.signal); if (!current()) return;
      if (!finalIdentity || finalIdentity.id !== job.ownerId) throw new Error("The signed-in account changed. Prepare a new batch.");
      const images = Array.from(pagesRef.current?.querySelectorAll("img") || []);
      if (images.length !== job.plan.count || images.some(image => !image.complete || !image.naturalWidth)) throw new Error("Wait for every QR label to load before printing.");
      flushSync(() => setApproved(true));
      window.print();
    } catch (error) { if (current()) { setApproved(false); setMessage(error instanceof Error ? error.message : "The print dialog could not open."); } }
    finally { clearTimeout(timer); if (operation.current === controller) { setBusy(false); if (controller.signal.aborted) setMessage("The inventory check took too long. Try printing again."); } }
  }
  async function downloadPdf() {
    if (keyRef.current !== key || !job || !imagesReady || busy) return;
    const controller = new AbortController(); operation.current?.abort(); operation.current = controller;
    const capturedKey = key, revision = epoch.current;
    const current = () => !controller.signal.aborted && operation.current === controller && keyRef.current === capturedKey && epoch.current === revision;
    const timer = setTimeout(() => controller.abort(), 30000);
    setBusy(true); setMessage("");
    try {
      const identity = await awaitQrBatchWork(readIdentity(), controller.signal); if (!current()) return;
      if (!identity || identity.id !== job.ownerId) throw new Error("Sign in to the account that prepared these labels.");
      const response = await fetch("/api/print/qr", { method: "POST", signal: controller.signal, cache: "no-store", headers: { authorization: `Bearer ${identity.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ expectedActorId: identity.id, requests, settings }) });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message || "The PDF could not be prepared. Try again."); }
      if (!response.headers.get("Content-Type")?.startsWith("application/pdf")) throw new Error("The label file could not be verified. Try again.");
      const blob = await response.blob(); if (!current()) return;
      const finalIdentity = await awaitQrBatchWork(readIdentity(), controller.signal); if (!current()) return;
      if (!finalIdentity || finalIdentity.id !== job.ownerId) throw new Error("The account changed. Prepare a new batch.");
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = "qrguitar-qr-labels.pdf";
      document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage("Your label PDF is ready. Match the paper or label dimensions and print at Actual size / 100%, with Fit / Shrink disabled.");
    } catch (error) { if (current()) setMessage(error instanceof Error ? error.message : "The PDF download could not start."); }
    finally { clearTimeout(timer); if (operation.current === controller) { setBusy(false); if (controller.signal.aborted) setMessage("The PDF took too long. Try again."); } }
  }
  const ready = Boolean(job && imagesReady && !busy);
  const thermal = settings.stock === "single";
  return <>
    <div className="no-print"><Nav /></div>
    <main className={styles.root} data-qr-print-approved={approved && job && imagesReady ? "true" : "false"}>
      <div className={styles.controls}>
        <Link className={styles.back} href="/dashboard"><ArrowLeft size={15} /> Your instruments</Link>
        <header className={styles.header}><div><p className={styles.kicker}>PRINT SUITE / RETAIL LABELS</p><h1>A scan. The whole story.</h1><p>One instrument, repeated labels, or your next inventory batch.</p></div><div className={styles.actions}><button type="button" className="button secondary" onClick={prepare} disabled={!requests.length || !!selectionError || busy || !inventory}>Prepare labels</button><button type="button" className="button secondary" onClick={downloadPdf} disabled={!ready}>Download PDF</button><button type="button" className="button" onClick={print} disabled={!ready}><Printer size={16} />{busy ? "Checking…" : "Print labels"}</button></div></header>
        {!authChecked ? <p role="status">Checking your sign-in…</p> : !ownerId ? <section className={styles.empty}><h2>Your inventory, ready to scan.</h2><p>Sign in to select saved Profiles and print permanent QR labels.</p>{inventoryError ? <p role="alert">{inventoryError}</p> : null}<Link className="button" href="/login?next=%2Fprint%2Fqr">Sign in</Link></section> : <div className={styles.workspace}>
          <section className={styles.inventory} aria-label="Select instruments">
            <div className={styles.sectionHeading}><h2>1. Choose instruments</h2><button type="button" className={styles.textButton} onClick={() => { setAttempt(value => value + 1); }}>Refresh inventory</button></div>
            {inventoryError ? <p role="alert">{inventoryError}</p> : !inventory ? <p role="status">Loading saved inventory…</p> : !records.length ? <div className={styles.empty}><p>Your collection is empty. Create a Profile to start printing labels.</p><Link className="button secondary" href="/create">Create a Profile</Link></div> : <>
              <label className={styles.search}><span>Find an instrument</span><input type="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Name, serial number or QRguitar ID" /></label>
              <div className={styles.selectionActions}><button type="button" className={styles.textButton} onClick={() => { invalidate(); setQuantities(current => ({ ...current, ...Object.fromEntries(matching.filter(record => record.isPublic).slice(0, MAX_QR_BATCH_LABELS).map(record => [record.qrCode, current[record.qrCode] || "1"])) })); }}>Select visible public Profiles</button><button type="button" className={styles.textButton} onClick={() => { invalidate(); setQuantities({}); }}>Clear selection</button></div>
              <div className={styles.records}>{matching.map(record => <div className={styles.record} key={record.qrCode}><label className={styles.pick}><input type="checkbox" disabled={!record.isPublic} checked={Object.hasOwn(quantities, record.qrCode)} onChange={event => { invalidate(); setQuantities(current => { const next = { ...current }; if (event.target.checked) next[record.qrCode] = "1"; else delete next[record.qrCode]; return next; }); }} /><span><strong>{record.title}</strong><small>{record.serial ? `Serial ${record.serial} · ` : ""}{record.qrCode}{!record.isPublic ? " · Requires an available public Profile" : ""}</small></span></label>{Object.hasOwn(quantities, record.qrCode) ? <label className={styles.quantity}><span>Copies for {record.title}</span><input aria-label={`Copies for ${record.qrCode}`} type="number" min="1" max={MAX_QR_BATCH_LABELS} step="1" value={quantities[record.qrCode]} onChange={event => { invalidate(); setQuantities(current => ({ ...current, [record.qrCode]: event.target.value })); }} /></label> : null}</div>)}</div>
              {!matching.length ? <p>No instruments match that search.</p> : null}
            </>}
            <p className={styles.note}>Customer labels open public Profiles. Private records stay private. These labels do not change visibility or ownership.</p>
          </section>
          <section className={styles.options} aria-label="Label and paper settings">
            <h2>2. Match your paper</h2>
            <label>Paper / printer stock<select value={settings.stock} onChange={event => changeSettings({ stock: event.target.value as QrBatchSettings["stock"], skip: 0 })}><option value="letter">US Letter sticker sheet</option><option value="a4">A4 sticker sheet</option><option value="single">Thermal / roll labels · one label per page</option></select></label>
            <label>QR size including scan border<select value={settings.sideMm} onChange={event => changeSettings({ sideMm: Number(event.target.value), skip: 0 })}><option value="38.1">1.5 × 1.5 inches · 38.1 mm</option><option value="32">32 × 32 mm</option><option value="25">25 × 25 mm</option></select></label>
            <p className={styles.note}>The size includes the white scan border. Every copy uses the instrument’s permanent Profile URL.</p>
            {thermal ? <>
              <div className={styles.measurements}>
                {([['labelWidthMm', 'Label width (mm)'], ['labelHeightMm', 'Label height (mm)']] as const).map(([field, label]) => {
                  const value = settings[field] ?? settings.sideMm;
                  return <label key={field}>{label}<input type="number" min={settings.sideMm} max="200" step="0.1" value={Number.isFinite(value) ? value : ""} onChange={event => changeSettings({ [field]: event.target.value.trim() ? Number(event.target.value) : NaN })} /></label>;
                })}
              </div>
              <p className={styles.note}>Match one physical roll label’s width and height. Each PDF page is one label, with the QR centered at its selected size. Larger stock adds white space; it never enlarges or shrinks the QR.</p>
            </> : null}
            {!thermal ? <details className={styles.alignment}><summary>Sheet alignment &amp; used labels</summary><p className={styles.note}>Match the margins and gaps printed on your label stock. All measurements are in millimeters.</p><div className={styles.measurements}>{([['topMm','Top margin'],['bottomMm','Bottom margin'],['leftMm','Left margin'],['rightMm','Right margin'],['gapXMm','Horizontal gap'],['gapYMm','Vertical gap']] as const).map(([field, label]) => <label key={field}>{label}<input type="number" min="0" max="100" step="0.001" value={Number.isFinite(settings[field]) ? settings[field] : ""} onChange={event => changeSettings({ [field]: event.target.value.trim() ? Number(event.target.value) : NaN })} /></label>)}</div><label>Used labels to skip on first sheet<input type="number" min="0" max={geometry ? geometry.capacity - 1 : 0} step="1" value={Number.isFinite(settings.skip) ? settings.skip : ""} onChange={event => changeSettings({ skip: event.target.value.trim() ? Number(event.target.value) : NaN })} /></label></details> : null}
            <p className={styles.stockSummary}>{geometry ? thermal
              ? `1 label per page · ${geometry.widthMm} × ${geometry.heightMm} mm stock`
              : `${geometry.columns} across × ${geometry.rows} down · ${geometry.capacity} labels per sheet`
              : "Check your paper settings"}</p>
            <button type="button" disabled={!ownerId || busy || Boolean(selectionError)} onClick={() => void savePaper()}>Save paper settings</button>
            <p className={styles.note}>Print at <strong>Actual size / 100%</strong>, with <strong>Fit / Shrink disabled</strong>. Turn off headers and footers. {thermal
              ? "Choose the exact label width and height in your printer settings, then test one label before the full roll."
              : "Choose the matching Letter or A4 paper size. For an Epson or other inkjet, test on plain paper first and compare the positions with your sticker sheet before a full run."}</p>
          </section>
        </div>}
        {selectionError || message ? <p className={styles.feedback} role="alert">{selectionError || message}</p> : null}
        <section className={styles.preview} aria-label="QR label preview">
          <div className={styles.previewHeading}><h2>3. Review your labels</h2>{job ? <div className={styles.pageControls}><span>{job.plan.count} labels · {thermal ? "Label" : "Sheet"} {page + 1} of {job.plan.pages.length}</span><button type="button" aria-label={thermal ? "Previous label" : "Previous sheet"} disabled={page === 0} onClick={() => setPage(value => value - 1)}><ChevronLeft size={17} /></button><button type="button" aria-label={thermal ? "Next label" : "Next sheet"} disabled={page + 1 >= job.plan.pages.length} onClick={() => setPage(value => value + 1)}><ChevronRight size={17} /></button></div> : <span>Preview may be scaled. Printing uses your selected dimensions.</span>}</div>
          {job ? <><p className={styles.note} role="status">{imagesReady ? "Labels prepared. Printing and PDF downloads check your saved inventory again." : "Loading every QR label…"}</p><details className={styles.printOrder}><summary>{thermal ? "Print order · one label at a time" : "Print order · left to right, top to bottom"}</summary><ol>{requests.map(request => <li key={request.code}><strong>{records.find(record => record.qrCode === request.code)?.title || request.code}</strong><span>{request.code} · {request.quantity} {request.quantity === 1 ? "copy" : "copies"}</span></li>)}</ol></details></> : <div className={styles.emptyPreview}><QrCode size={32} /><p>Choose Profiles and prepare labels to preview your batch.</p></div>}
        </section>
      </div>
      <style>{`@media print { @page { size: ${job ? `${job.plan.widthMm}mm ${job.plan.heightMm}mm` : "letter"}; margin: 0; } }`}</style>
      <div className={styles.paperViewport} ref={previewRef}>
        {job ? <div className={styles.pages} ref={pagesRef} style={{ "--preview-scale": scale, "--preview-width": `${job.plan.widthMm * 96 / 25.4 * scale}px`, "--preview-height": `${job.plan.heightMm * 96 / 25.4 * scale}px` } as CSSProperties}>{job.plan.pages.map((cells, index) => <div className={styles.paperSpace} data-preview-active={index === page ? "true" : "false"} key={index}><div className={styles.sheet} data-qr-batch-page={index + 1} style={{ width: `${job.plan.widthMm}mm`, height: `${job.plan.heightMm}mm` }}>{cells.map(cell => <img key={cell.slot} className={styles.qr} src={job.images[cell.code]} alt={`QR for ${cell.code}`} data-profile-url={publicProfileUrl(cell.code)} data-qr-batch-code={cell.code} onLoad={checkImages} onError={() => { setImagesReady(false); setMessage("A QR image failed to load. Prepare the labels again before printing."); }} style={{ left: `${cell.xMm}mm`, top: `${cell.yMm}mm`, width: `${cell.sideMm}mm`, height: `${cell.sideMm}mm` }} />)}</div></div>)}</div> : null}
      </div>
      <p className={styles.printUnavailable}>Open QRguitar’s QR label batch, prepare your labels, then choose Print labels.</p>
    </main>
    <div className="no-print"><Footer /></div>
  </>;
}
