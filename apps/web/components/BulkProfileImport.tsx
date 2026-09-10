"use client";

import { uploadProfileFile, profileFileId } from "../lib/profile-upload-client";
import { Clipboard, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DemoInstrument } from "../lib/local-demo";
import { qrCodeFromSerial } from "../lib/qrguitar-id";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";
import { getContentValue } from "../lib/content-registry";
import { useSiteContent } from "../lib/use-site-content";
import { acquireBulkImportLease, type BulkImportLease } from "../lib/bulk-import-lock";
import {
  autoColumnMapping, bulkDraftKey, bulkHeaders, bulkRowStatus, getSourceHeaders,
  isUncertain, mergeAutoColumnMapping, normalizeHeader, parseRows, readBulkDraft, readBulkCreateResponse, runBulkImport, validateBulkRow,
  type BulkDraft, type BulkRow, type ColumnMapping
} from "../lib/bulk-import";

type BulkProfileImportProps = { onComplete?: () => void; ownerName?: string };
const template = [bulkHeaders.join("\t"), ["Fender", "Stratocaster", "ABC123", "2005", "Electric Guitar", "used", "not_for_sale", "all_original", "Cranston, RI", "private", "https://example.com/photo.jpg", "Owned since 2024", "no", "Example Shop", "2024-01-15"].join("\t")].join("\n");
const importTargets = ["", ...bulkHeaders];

export function BulkProfileImport({ onComplete = () => undefined, ownerName = "" }: BulkProfileImportProps) {
  const content = useSiteContent();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [filter, setFilter] = useState<"all" | "ready" | "attention" | "duplicate" | "invalid" | "draft" | "created">("all");
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [storageError, setStorageError] = useState("");
  const [parseError, setParseError] = useState("");
  const activeAccount = useRef("");
  const running = useRef(false);
  const draftLease = useRef<BulkImportLease | null>(null);
  const [leaseState, setLeaseState] = useState<"waiting" | "owned" | "unsupported" | "error" | "signed-out">("waiting");
  const readyCount = useMemo(() => rows.filter((row) => !row.error && row.result !== "Created" && row.attempt?.phase !== "complete").length, [rows]);
  const controlsLocked = leaseState !== "owned" || !draftLoaded || Boolean(storageError) || saving || previewing || rows.some((row) => Boolean(row.attempt));
  const hasUncertain = rows.some(isUncertain);
  const visibleRows = rows.filter((row) => filter === "all"
    || (filter === "ready" && !row.error && row.result !== "Created")
    || (filter === "attention" && Boolean(row.error || (row.result && row.result !== "Created")))
    || (filter === "duplicate" && Boolean(row.duplicateCode))
    || (filter === "invalid" && bulkRowStatus(row) === "Invalid")
    || (filter === "draft" && bulkRowStatus(row) === "Draft")
    || (filter === "created" && row.result === "Created"));

  useEffect(() => {
    let alive = true;
    const supabase = createBrowserSupabaseClient();
    const changeAccount = (nextOwner: string) => {
      if (!alive || (activeAccount.current === nextOwner && nextOwner)) return;
      activeAccount.current = nextOwner;
      draftLease.current?.release(); draftLease.current = null;
      setOwnerId(nextOwner); setDraftLoaded(false); setStorageError(""); setParseError("");
      setText(""); setRows([]); setColumnMapping({}); setMessage("");
      setLeaseState(nextOwner ? "waiting" : "signed-out");
      if (!nextOwner) setMessage("Sign in to restore your import.");
    };
    void supabase.auth.getSession().then(({ data }) => changeAccount(data.session?.user.id || ""));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => changeAccount(session?.user.id || ""));
    return () => { alive = false; data.subscription.unsubscribe(); draftLease.current?.release(); };
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    let alive = true;
    setDraftLoaded(false); setLeaseState("waiting");
    if (!navigator.locks) {
      setLeaseState("unsupported");
      setMessage("This browser cannot coordinate import drafts safely. Open QRguitar in a browser with Web Locks support to continue your saved import.");
      return;
    }
    const lease = acquireBulkImportLease(navigator.locks, ownerId);
    draftLease.current = lease;
    void lease.ready.then(() => {
      if (!alive || draftLease.current !== lease || activeAccount.current !== ownerId) return;
      // Read only after acquiring ownership: another tab may have completed rows while this tab waited.
      try {
        lease.assertOwned();
        const saved = window.localStorage.getItem(bulkDraftKey(ownerId));
        if (saved) {
          const draft = readBulkDraft(saved, ownerId);
          setText(draft.text); setRows(draft.rows); setColumnMapping(draft.columnMapping);
          setMessage(draft.rows.some(isUncertain) ? "An earlier request needs confirmation. Retry to check it before continuing." : "Your saved import is ready to continue.");
        } else if (window.localStorage.getItem("qrguitar.bulkImportDraft.v1")) {
          setMessage("An older import draft is still saved in this browser. It cannot be resumed safely because it has no account or request identifiers. Review your collection before starting a replacement import.");
        }
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : "The saved import could not be read. It has been preserved.");
      }
      setDraftLoaded(true); setLeaseState("owned");
    }).catch((error) => {
      if (!alive || draftLease.current !== lease || activeAccount.current !== ownerId) return;
      setLeaseState("error");
      setMessage(error instanceof Error ? error.message : "This tab could not open the import workspace. Reload to retry.");
    });
    return () => {
      alive = false;
      lease.release();
      if (draftLease.current === lease) draftLease.current = null;
    };
  }, [ownerId]);

  function assertDraftOwnership() {
    if (!ownerId || activeAccount.current !== ownerId || draftLease.current?.ownerId !== ownerId) throw new Error("Your account changed. Sign in with the original account to resume its import.");
    draftLease.current.assertOwned();
  }

  function persistRows(nextRows: BulkRow[]) {
    assertDraftOwnership();
    const draft: BulkDraft = { version: 2, ownerId, text, rows: nextRows, columnMapping };
    try { window.localStorage.setItem(bulkDraftKey(ownerId), JSON.stringify(draft)); }
    catch { throw new Error("This browser could not save your import progress. Free browser storage and retry before importing any more rows."); }
    setRows(nextRows);
  }

  useEffect(() => {
    if (!draftLoaded || !ownerId || storageError || running.current || leaseState !== "owned" || draftLease.current?.ownerId !== ownerId || !draftLease.current.isOwned()) return;
    try {
      const draft: BulkDraft = { version: 2, ownerId, text, rows, columnMapping };
      window.localStorage.setItem(bulkDraftKey(ownerId), JSON.stringify(draft));
    } catch { setStorageError("This browser could not save your import progress. Free browser storage before continuing."); }
  }, [columnMapping, draftLoaded, leaseState, ownerId, rows, storageError, text]);

  const sourceHeaders = useMemo(() => {
    try { return getSourceHeaders(text); } catch { return []; }
  }, [text]);

  async function tokenForOwner() {
    assertDraftOwnership();
    const { data } = await createBrowserSupabaseClient().auth.getSession();
    if (!data.session || data.session.user.id !== ownerId || activeAccount.current !== ownerId) throw new Error("Sign in with the original account to continue this saved import.");
    assertDraftOwnership();
    return data.session.access_token;
  }

  function parseSource(source: string, mapping: ColumnMapping) {
    try { const parsed = parseRows(source, mapping); setParseError(""); return parsed; }
    catch (error) { setParseError(error instanceof Error ? error.message : "This file could not be read."); return null; }
  }

  async function loadFile(file?: File) {
    if (!file || controlsLocked) return;
    if (file.size > 2_000_000) { setMessage("Choose a CSV or TSV file smaller than 2 MB."); return; }
    try {
      const lease = draftLease.current;
      const source = await file.text();
      if (lease !== draftLease.current || !lease?.isOwned()) return;
      assertDraftOwnership();
      setText(source); setRows([]); setMessage("");
      const mapping = autoColumnMapping(source);
      setColumnMapping(mapping);
      const parsed = parseSource(source, mapping);
      if (parsed) { setRows(parsed); setMessage(`${file.name}: ${parsed.length} row${parsed.length === 1 ? "" : "s"} reviewed.`); }
    } catch (error) { setParseError(error instanceof Error ? error.message : "The file could not be read."); }
  }

  async function checkDuplicates(input: BulkRow[]) {
    const token = await tokenForOwner();
    const response = await fetch("/api/instruments?scope=mine", { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = await response.json().catch(() => null) as { ok?: boolean; instruments?: DemoInstrument[] } | null;
    assertDraftOwnership();
    if (!response.ok || !payload?.ok || !Array.isArray(payload.instruments)) throw new Error("Your collection could not be checked. Retry before importing.");
    const existingBySerial = new Map(payload.instruments.filter((item) => item.serial).map((item) => [item.serial.trim().toLowerCase(), item.qrCode]));
    return input.map((row) => {
      // A prior POST must replay its own key before a serial lookup can classify it as a duplicate.
      if (row.attempt || row.result === "Created") return row;
      const duplicateCode = row.serial ? existingBySerial.get(row.serial.toLowerCase()) || "" : "";
      return { ...row, duplicateCode, error: [...validateBulkRow(row), duplicateCode ? `Serial Number already belongs to ${duplicateCode}. Use transfer or claim instead.` : ""].filter(Boolean).join(" ") };
    });
  }

  async function previewRows() {
    if (controlsLocked || running.current) return;
    running.current = true; setPreviewing(true);
    try {
      const mapping = mergeAutoColumnMapping(sourceHeaders, columnMapping);
      setColumnMapping(mapping);
      const parsed = rows.length ? rows : parseSource(text, mapping);
      if (!parsed) return;
      const checked = await checkDuplicates(parsed);
      setRows(checked);
      setMessage(checked.length ? `${checked.length} rows reviewed. ${checked.filter((row) => !row.error).length} ready.` : "Paste a header row and at least one instrument row.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Preview could not be completed. Retry."); }
    finally { running.current = false; setPreviewing(false); }
  }

  async function copyTemplate() {
    try { await navigator.clipboard.writeText(template); setMessage("Template copied."); }
    catch { setMessage("Could not copy automatically. Select the template above and copy it manually."); }
  }

  async function createProfiles() {
    if (running.current || leaseState !== "owned" || !draftLoaded || !ownerId || storageError || parseError || !rows.length) return;
    running.current = true; setSaving(true); setMessage("");
    try {
      const checked = await checkDuplicates(rows);
      persistRows(checked);
      if (!checked.some((row) => !row.error && row.result !== "Created")) { setMessage("Fix the highlighted rows before creating Profiles."); return; }
      const result = await runBulkImport(checked, {
        ownerName, makeKey: createClientKey,
        persist: (nextRows) => {
          try { persistRows(nextRows); }
          catch (error) { setStorageError(error instanceof Error ? error.message : "Import progress could not be saved."); throw error; }
        },
        upload: async (row, uploadId) => {
          const file = await remoteImageToBlob(row.photo);
          const fileId = await profileFileId(file,String(row.attempt?.uploadGeneration || 0));
          return uploadProfileFile({file,uploadId,fileId,kind:"image",expectedOwnerId:ownerId,tokenForOwner});
        },
        create: async (body) => {
          const token = await tokenForOwner();
          const response = await fetch("/api/instruments", {
            method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body)
          });
          return readBulkCreateResponse(response);
        }
      });
      setMessage(result.stoppedReason || `${result.created} Profile${result.created === 1 ? "" : "s"} created. Completed rows are saved; retry any remaining rows.`);
      if (result.created) onComplete();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Import stopped. Saved rows can be resumed safely."); }
    finally { running.current = false; setSaving(false); }
  }

  function updateRow(rowNumber: number, field: "brand" | "model" | "serial" | "instrumentType" | "photo", value: string) {
    if (saving || previewing || leaseState !== "owned") return;
    setRows((current) => current.map((row) => {
      if (row.rowNumber !== rowNumber || row.attempt) return row;
      const next = { ...row, [field]: value, serialNotUsed: field === "serial" ? /^(none|n\/a|na|no serial|not used)$/i.test(value.trim()) : row.serialNotUsed, duplicateCode: "", result: "" };
      if (field === "serial" && next.serialNotUsed) { next.serial = ""; next.showSerialPublic = false; }
      return { ...next, error: validateBulkRow(next).join(" ") };
    }));
  }

  function updateColumnMapping(sourceHeader: string, targetHeader: string) {
    if (controlsLocked) return;
    const next = { ...columnMapping, [sourceHeader]: targetHeader };
    setColumnMapping(next); setRows(parseSource(text, next) || []);
    setMessage("Column mapping updated. Review the rows before creating Profiles.");
  }

  function startNewImport() {
    if (saving || previewing || hasUncertain || storageError || leaseState !== "owned") return;
    setText(""); setRows([]); setColumnMapping({}); setMessage(""); setParseError(""); setFilter("all");
  }

  function loadExample() {
    if (controlsLocked) return;
    const mapping = autoColumnMapping(template);
    setText(template); setColumnMapping(mapping); setRows(parseSource(template, mapping) || []); setMessage("");
  }

  return (
    <section className="bulk-import-workspace">
      <header className="bulk-import-heading"><div><span className="eyebrow">Bulk Import</span><h1>{getContentValue(content, "bulkImport.hero.headline")}</h1><p>{getContentValue(content, "bulkImport.hero.body")}</p></div><button className="button secondary" type="button" onClick={() => void copyTemplate()}><Clipboard size={16} /> {getContentValue(content, "bulkImport.actions.template")}</button></header>
      <ol className="import-steps" aria-label="Import workflow"><li className={text ? "is-complete" : "is-active"}><b>1</b><span>Add inventory</span></li><li className={rows.length ? "is-complete" : ""}><b>2</b><span>Map columns</span></li><li className={rows.length ? "is-active" : ""}><b>3</b><span>Review rows</span></li><li><b>4</b><span>Create Private Profiles</span></li></ol>
      <div className="bulk-import-grid">
        <div className="bulk-import-intro">
          <h2>1. Add inventory</h2>
          <p>Upload CSV/TSV or paste spreadsheet rows. Required: Brand, Model, Type, a Serial Number or explicit no-serial value, and a real photo URL.</p>
          <label className="import-file-drop"><Upload size={20} /><span><b>Choose CSV or TSV</b><small>Comma and tab delimiters are detected automatically.</small></span><input disabled={controlsLocked} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => void loadFile(event.target.files?.[0])} /></label>
        </div>
        <label className="field custom-wide" htmlFor="dashboardBulkImport">
          <span>Or paste spreadsheet rows</span>
          <textarea disabled={controlsLocked} id="dashboardBulkImport" rows={8} value={text} onChange={(event) => { setText(event.target.value); setRows([]); setParseError(""); setMessage(""); }} spellCheck={false} placeholder={template} />
        </label>
        <div className="bulk-import-actions">
          <button className="button secondary" type="button" disabled={controlsLocked} onClick={loadExample}>Load example</button>
          <button className="button secondary" type="button" disabled={controlsLocked} onClick={() => void previewRows()}>Map & preview rows</button>
          <button className="button" type="button" onClick={() => void createProfiles()} disabled={leaseState !== "owned" || saving || previewing || !draftLoaded || Boolean(storageError) || Boolean(parseError) || !rows.length || readyCount === 0}>
            <Upload size={16} /> {saving ? "Creating..." : "Create Private Profiles"}
          </button>
          <button className="button secondary" type="button" disabled={leaseState !== "owned" || !draftLoaded || saving || previewing || hasUncertain || Boolean(storageError)} onClick={startNewImport}>Start new import</button>
        </div>
        {sourceHeaders.length ? (
          <div className="bulk-preview-workspace">
            <div className="import-mapping">
              <div><span className="eyebrow">Column mapping</span><h2>Review detected headings</h2><p>Correct any heading before creating Profiles.</p></div>
              <div className="import-mapping-grid">
                {sourceHeaders.map((sourceHeader) => (
                  <label key={sourceHeader}>
                    <span>{sourceHeader}</span>
                    <select disabled={controlsLocked} aria-label={`Map ${sourceHeader} column`} value={columnMapping[sourceHeader] ?? normalizeHeader(sourceHeader)} onChange={(event) => updateColumnMapping(sourceHeader, event.target.value)}>
                      {importTargets.map((target) => <option key={target || "ignore"} value={target}>{target ? target.replaceAll("_", " ") : "Ignore column"}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            <div className="bulk-preview-toolbar"><strong>{readyCount} ready / {rows.length} total</strong><div>{(["all", "ready", "attention", "duplicate", "invalid", "draft", "created"] as const).map((item) => <button className={filter === item ? "is-active" : ""} key={item} type="button" onClick={() => setFilter(item)}>{item === "attention" ? "Needs Attention" : item.charAt(0).toUpperCase() + item.slice(1)}</button>)}</div></div>
          <div className="bulk-preview-list" aria-label="Bulk import results">
            {visibleRows.map((row) => (
              <div className={row.error || (row.result && row.result !== "Created") ? "bulk-preview-row has-error" : "bulk-preview-row"} key={row.rowNumber}>
                <strong>Row {row.rowNumber}: {row.brand || "Missing brand"} {row.model || "Missing model"}</strong>
                <span>{[row.year, row.serial || "No Serial Number", row.serial ? qrCodeFromSerial(row.serial) : "QRguitar ID assigned at creation", "Private on creation", row.photo ? "Photo ready" : "Photo missing"].filter(Boolean).join(" / ")}</span>
                {row.result !== "Created" ? <fieldset disabled={leaseState !== "owned" || saving || previewing || Boolean(row.attempt)} className="bulk-row-editor" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} aria-label={`Edit row ${row.rowNumber}`}><input aria-label={`Row ${row.rowNumber} brand`} value={row.brand} onChange={(event) => updateRow(row.rowNumber, "brand", event.target.value)} placeholder="Brand" /><input aria-label={`Row ${row.rowNumber} model`} value={row.model} onChange={(event) => updateRow(row.rowNumber, "model", event.target.value)} placeholder="Model" /><input aria-label={`Row ${row.rowNumber} Serial Number`} value={row.serialNotUsed ? "No Serial" : row.serial} onChange={(event) => updateRow(row.rowNumber, "serial", event.target.value)} placeholder="Serial Number or No Serial" /><input aria-label={`Row ${row.rowNumber} type`} value={row.instrumentType} onChange={(event) => updateRow(row.rowNumber, "instrumentType", event.target.value)} placeholder="Type" /><input aria-label={`Row ${row.rowNumber} photo URL`} value={row.photo} onChange={(event) => updateRow(row.rowNumber, "photo", event.target.value)} placeholder="https:// photo URL" /></fieldset> : null}
                <small>{bulkRowStatus(row)}{row.error || row.result ? `: ${row.error || row.result}` : ""}</small>
                {row.attempt?.phase === "complete" && row.attempt.qrCode ? <a href={`/edit/${encodeURIComponent(row.attempt.qrCode)}`}>Open created Profile</a> : null}
                {row.duplicateCode ? <a href={`/i/${row.duplicateCode}`} target="_blank" rel="noreferrer">Open existing Profile</a> : null}
              </div>
            ))}
          </div>
          </div>
        ) : null}
        {leaseState === "waiting" && ownerId ? <p className="form-message" role="status" aria-live="polite">Waiting to open this account’s import. Close its other import tab; saved progress will load here automatically.</p> : null}
        {message ? <p className="form-message" role="status" aria-live="polite">{message}</p> : null}
        {parseError ? <p className="form-message" role="alert">{parseError}</p> : null}
        {storageError ? <p className="form-message" role="alert">{storageError} Reload after resolving the storage issue; the saved draft has been kept.</p> : null}
        {hasUncertain ? <p className="fine-print">Retry confirms the original request. Keep this draft until its result is known.</p> : null}
        <p className="fine-print">Import up to 50 rows per batch. Imported Profiles start Private, and Serial Numbers stay hidden unless show_serial explicitly says yes. Review each Profile before publishing it.</p>
      </div>
    </section>
  );
}

function createClientKey() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

async function remoteImageToBlob(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("The photo URL could not be downloaded.");
  const blob = await response.blob();
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(blob.type)) {
    throw new Error("Photo URLs must point to a JPG, PNG, or WebP image.");
  }
  if (blob.size > 12 * 1024 * 1024) throw new Error("Use a photo smaller than 12MB.");
  return blob;
}
