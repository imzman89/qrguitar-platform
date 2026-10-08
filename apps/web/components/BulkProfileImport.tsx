"use client";
import { useUiText } from "./UiTextProvider";


import { uploadProfileFile, profileFileId } from "../lib/profile-upload-client";
import { Clipboard, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DemoInstrument } from "../lib/local-demo";
import { qrCodeFromSerial } from "../lib/qrguitar-id";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";
import { observeSessionIdentity } from "../lib/session-identity";
import { getContentValue } from "../lib/content-registry";
import { useSiteContent } from "../lib/use-site-content";
import { acquireBulkImportLease, type BulkImportLease } from "../lib/bulk-import-lock";
import {
  autoColumnMapping, bulkDraftKey, bulkHeaders, bulkRowStatus, getSourceHeaders,
  isUncertain, mergeAutoColumnMapping, normalizeHeader, parseRows, readBulkDraft, readBulkCreateResponse, runBulkImport, validateBulkRow,
  type BulkDraft, type BulkRow, type ColumnMapping
} from "../lib/bulk-import";

type BulkProfileImportProps = { onComplete?: () => void; ownerName?: string };
const template = [bulkHeaders.join("\t"), ["Fender", "Stratocaster", "ABC123", "2005", "Electric Guitar", "used", "not_for_sale", "all_original", "Cranston, RI", "https://example.com/photo.jpg", "Owned since 2024", "no", "Example Shop", "2024-01-15"].join("\t")].join("\n");
const importTargets = ["", ...bulkHeaders];

export function BulkProfileImport({ onComplete = () => undefined }: BulkProfileImportProps) {
  const ui = useUiText("components.BulkProfileImport");
  const content = useSiteContent();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [message, setMessage] = useState("");
  const [templateCopyState, setTemplateCopyState] = useState<"" | "copying" | "copied" | "manual">("");
  const templateCopyAttempt = useRef(0);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [filter, setFilter] = useState<"all" | "ready" | "attention" | "duplicate" | "invalid" | "draft" | "created">("all");
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [accountGeneration, setAccountGeneration] = useState(0);
  const [storageError, setStorageError] = useState("");
  const [parseError, setParseError] = useState("");
  const activeAccount = useRef("");
  const running = useRef(false);
  const draftLease = useRef<BulkImportLease | null>(null);
  const [leaseState, setLeaseState] = useState<"waiting" | "owned" | "unsupported" | "error" | "signed-out">("waiting");
  const readyCount = useMemo(() => rows.filter((row) => !row.error && row.result !== "Created" && row.attempt?.phase !== "complete").length, [rows]);
  const controlsLocked = leaseState !== "owned" || !draftLoaded || Boolean(storageError) || saving || previewing || rows.some((row) => Boolean(row.attempt));
  const hasUncertain = rows.some(isUncertain);
  const previewIsPrimary = !hasUncertain && (!rows.length || readyCount === 0 || Boolean(parseError));
  const visibleRows = rows.filter((row) => row.rowNumber === editingRow || filter === "all"
    || (filter === "ready" && !row.error && row.result !== "Created")
    || (filter === "attention" && Boolean(row.error || (row.result && row.result !== "Created")))
    || (filter === "duplicate" && Boolean(row.duplicateCode))
    || (filter === "invalid" && bulkRowStatus(row) === "Invalid")
    || (filter === "draft" && bulkRowStatus(row) === "Draft")
    || (filter === "created" && row.result === "Created"));

  useEffect(() => {
    let alive = true;
    const changeAccount = (nextOwner: string) => {
      if (!alive || (activeAccount.current === nextOwner && nextOwner)) return;
      const changed = activeAccount.current !== nextOwner;
      templateCopyAttempt.current += 1; setTemplateCopyState("");
      activeAccount.current = nextOwner;
      // Batched A → signed-out/B → A events still invalidate the released lease,
      // even when React sees the same final owner ID as the previous render.
      if (changed) setAccountGeneration((current) => current + 1);
      draftLease.current?.release(); draftLease.current = null;
      setOwnerId(nextOwner); setDraftLoaded(false); setStorageError(""); setParseError("");
      setText(""); setRows([]); setColumnMapping({}); setMessage(""); setEditingRow(null); setFilter("all");
      setLeaseState(nextOwner ? "waiting" : "signed-out");
      if (!nextOwner) setMessage(ui("ui.components.BulkProfileImport.ad09774ce854", "Sign in to restore your import."));
    };
    let stop: () => void = () => undefined;
    try {
      const supabase = createBrowserSupabaseClient();
      stop = observeSessionIdentity(supabase.auth, changeAccount);
    } catch {
      changeAccount("");
    }
    return () => { alive = false; templateCopyAttempt.current += 1; stop(); draftLease.current?.release(); };
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    let alive = true;
    setDraftLoaded(false); setLeaseState("waiting");
    if (!navigator.locks) {
      setLeaseState("unsupported");
      setMessage(ui("ui.components.BulkProfileImport.36cc5092f659", "This browser cannot coordinate import drafts safely. Open QRguitar in a browser with Web Locks support to continue your saved import."));
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
          setMessage(draft.rows.some(isUncertain) ? ui("ui.components.BulkProfileImport.f94bbd4e2aaa", "An earlier request needs confirmation. Retry to check it before continuing.") : ui("ui.components.BulkProfileImport.f3d830ae925f", "Your saved import is ready to continue."));
        } else if (window.localStorage.getItem("qrguitar.bulkImportDraft.v1")) {
          setMessage(ui("ui.components.BulkProfileImport.e9fa2efddcc0", "An older import draft is still saved in this browser. It cannot be resumed safely because it has no account or request identifiers. Review your collection before starting a replacement import."));
        }
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : "The saved import could not be read. It has been preserved.");
      }
      setDraftLoaded(true); setLeaseState("owned");
    }).catch((error) => {
      if (!alive || draftLease.current !== lease || activeAccount.current !== ownerId) return;
      setLeaseState("error");
      setMessage(error instanceof Error ? error.message : ui("ui.components.BulkProfileImport.788866ad1f08", "This tab could not open the import workspace. Reload to retry."));
    });
    return () => {
      alive = false;
      lease.release();
      if (draftLease.current === lease) draftLease.current = null;
    };
  }, [ownerId, accountGeneration]);

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
    if (file.size > 2_000_000) { setMessage(ui("ui.components.BulkProfileImport.315f32f55f51", "Choose a CSV or TSV file smaller than 2 MB.")); return; }
    try {
      const lease = draftLease.current;
      const source = await file.text();
      if (lease !== draftLease.current || !lease?.isOwned()) return;
      assertDraftOwnership();
      setText(source); setRows([]); setMessage("");
      const mapping = autoColumnMapping(source);
      setColumnMapping(mapping);
      const parsed = parseSource(source, mapping);
      if (parsed) { setRows(parsed); setMessage(ui("ui.components.BulkProfileImport.1891003f33d2", "{{value1}}: {{value2}} row{{value3}} reviewed.", {value1: file.name, value2: parsed.length, value3: parsed.length === 1 ? "" : "s"})); }
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
      setMessage(checked.length ? ui("ui.components.BulkProfileImport.d1ce349f4ee9", "{{value1}} rows reviewed. {{value2}} ready.", {value1: checked.length, value2: checked.filter((row) => !row.error).length}) : ui("ui.components.BulkProfileImport.756c43ace059", "Paste a header row and at least one instrument row."));
    } catch (error) { setMessage(error instanceof Error ? error.message : ui("ui.components.BulkProfileImport.9cf37a46f24e", "Preview could not be completed. Retry.")); }
    finally { running.current = false; setPreviewing(false); }
  }

  async function copyTemplate() {
    const attempt = ++templateCopyAttempt.current, actor = activeAccount.current;
    const isCurrent = () => templateCopyAttempt.current === attempt && activeAccount.current === actor;
    setTemplateCopyState("copying");
    try { await navigator.clipboard.writeText(template); if (isCurrent()) setTemplateCopyState("copied"); }
    catch { if (isCurrent()) setTemplateCopyState("manual"); }
  }

  async function createProfiles() {
    if (running.current || leaseState !== "owned" || !draftLoaded || !ownerId || storageError || parseError || !rows.length) return;
    running.current = true; setSaving(true); setMessage("");
    try {
      const checked = await checkDuplicates(rows);
      persistRows(checked);
      if (!checked.some((row) => !row.error && row.result !== "Created")) { setMessage(ui("ui.components.BulkProfileImport.c5d512d8bc14", "Fix the highlighted rows before creating Profiles.")); return; }
      const result = await runBulkImport(checked, {
        ownerName: "", makeKey: createClientKey,
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
      setMessage(result.stoppedReason || ui("ui.components.BulkProfileImport.aaac9654580c", "{{value1}} Profile{{value2}} created. Completed rows are saved; retry any remaining rows.", {value1: result.created, value2: result.created === 1 ? "" : "s"}));
      if (result.created) onComplete();
    } catch (error) { setMessage(error instanceof Error ? error.message : ui("ui.components.BulkProfileImport.35a1962baa23", "Import stopped. Saved rows can be resumed safely.")); }
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
    setMessage(ui("ui.components.BulkProfileImport.0fa5916a66ba", "Column mapping updated. Review the rows before creating Profiles."));
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
      <header className="bulk-import-heading"><div><span className="eyebrow">{ui("ui.components.BulkProfileImport.01916f7252b9", "Bulk Import")}</span><h1>{getContentValue(content, "bulkImport.hero.headline")}</h1><p>{getContentValue(content, "bulkImport.hero.body")}</p></div><button className="button secondary" type="button" onClick={() => void copyTemplate()}><Clipboard size={16} /> {getContentValue(content, "bulkImport.actions.template")}</button></header>
      {templateCopyState ? <p className="form-message" role="status" aria-live="polite">{templateCopyState === "copying" ? ui("ui.components.BulkProfileImport.33d680f56e85", "Copying template…") : templateCopyState === "copied" ? ui("ui.components.BulkProfileImport.69bc70f7becd", "Template copied.") : ui("ui.components.BulkProfileImport.a906b8c86cc0", "Could not copy automatically. Select and copy the template below.")}</p> : null}
      {templateCopyState === "manual" ? <label className="field custom-wide"><span>{ui("ui.components.BulkProfileImport.0adf88823e4b", "Copyable import template")}</span><textarea aria-label={ui("ui.components.BulkProfileImport.73065a710672", "Bulk import template")} readOnly rows={4} value={template} spellCheck={false} onFocus={(event) => event.currentTarget.select()} /></label> : null}
      <p className="field-note"><a href="/account?section=collection">{ui("ui.components.BulkProfileImport.collectionName", "Collection name")}</a></p>
      <p className="field-note">{ui("ui.components.BulkProfileImport.collectionNameHelp", "Use a name you choose, not necessarily your real name. An existing collection name is managed in Account. Saved retry requests keep their original details.")}</p>
      <ol className="import-steps" aria-label={ui("ui.components.BulkProfileImport.185772fdfdfd", "Import workflow")}><li className={text ? "is-complete" : "is-active"}><b>1</b><span>{ui("ui.components.BulkProfileImport.e70643644860", "Add inventory")}</span></li><li className={rows.length ? "is-complete" : ""}><b>2</b><span>{ui("ui.components.BulkProfileImport.2778414273d9", "Map columns")}</span></li><li className={rows.length ? "is-active" : ""}><b>3</b><span>{ui("ui.components.BulkProfileImport.d14ebd741789", "Review rows")}</span></li><li><b>4</b><span>{ui("ui.components.BulkProfileImport.createInstruments", "Create instruments")}</span></li></ol>
      <div className="bulk-import-grid">
        <div className="bulk-import-intro">
          <h2>{ui("ui.components.BulkProfileImport.f7c46329dcb1", "1. Add inventory")}</h2>
          <p>{ui("ui.components.BulkProfileImport.be0f3406f789", "Upload CSV/TSV or paste spreadsheet rows. Required: Brand, Model, Type, a Serial Number or explicit no-serial value, and a real photo URL.")}</p>
          <label className="import-file-drop"><Upload size={20} /><span><b>{ui("ui.components.BulkProfileImport.139e4dba0251", "Choose CSV or TSV")}</b><small>{ui("ui.components.BulkProfileImport.1fb32101165a", "Comma and tab delimiters are detected automatically.")}</small></span><input disabled={controlsLocked} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => void loadFile(event.target.files?.[0])} /></label>
        </div>
        <label className="field custom-wide" htmlFor="dashboardBulkImport">
          <span>{ui("ui.components.BulkProfileImport.40caac83e202", "Or paste spreadsheet rows")}</span>
          <textarea disabled={controlsLocked} id="dashboardBulkImport" rows={8} value={text} onChange={(event) => { setText(event.target.value); setRows([]); setParseError(""); setMessage(""); }} spellCheck={false} placeholder={template} />
        </label>
        <div className="bulk-import-actions">
          <button className="button secondary" type="button" disabled={controlsLocked} onClick={loadExample}>{ui("ui.components.BulkProfileImport.4dbb46fc867a", "Load example")}</button>
          <button className={previewIsPrimary ? "button" : "button secondary"} type="button" disabled={controlsLocked} onClick={() => void previewRows()}>{ui("ui.components.BulkProfileImport.ae92c9f2f0fa", "Map & preview rows")}</button>
          <button className={previewIsPrimary ? "button secondary" : "button"} type="button" aria-describedby="bulk-import-next-step" onClick={() => void createProfiles()} disabled={leaseState !== "owned" || saving || previewing || !draftLoaded || Boolean(storageError) || Boolean(parseError) || !rows.length || readyCount === 0}>
            <Upload size={16} /> {saving ? ui("ui.components.BulkProfileImport.def70944c9bb", "Creating...") : hasUncertain ? ui("ui.components.BulkProfileImport.confirmSavedImport", "Confirm saved import (same requests)") : ui("ui.components.BulkProfileImport.createInstruments", "Create instruments")}
          </button>
          <button className="button secondary" type="button" disabled={leaseState !== "owned" || !draftLoaded || saving || previewing || hasUncertain || Boolean(storageError)} onClick={startNewImport}>{ui("ui.components.BulkProfileImport.eabc7445dbc1", "Start new import")}</button>
        </div>
        <div id="bulk-import-feedback">
          <p className="field-note" id="bulk-import-next-step">{!rows.length
            ? ui("ui.components.BulkProfileImport.previewBeforeCreate", "Add your inventory, then choose Map & preview rows. No Profiles are created during preview.")
            : previewIsPrimary ? ui("ui.components.BulkProfileImport.correctBeforeCreate", "Correct the highlighted rows and preview again. Profiles can be created when at least one row is ready.")
              : ui("ui.components.BulkProfileImport.catalogReviewBeforeCreate", "Review the ready rows before creating. Saved instruments and photos appear in Catalog. Seller/source and acquisition details stay off the Profile; your saved progress is kept.")}</p>
          {leaseState === "waiting" && ownerId ? <p className="form-message" role="status" aria-live="polite">{ui("ui.components.BulkProfileImport.f95735cf3428", "Waiting to open this account’s import. Close its other import tab; saved progress will load here automatically.")}</p> : null}
          {message ? <p className="form-message" role="status" aria-live="polite">{message}</p> : null}
          {parseError ? <p className="form-message" role="alert">{parseError}</p> : null}
          {storageError ? <p className="form-message" role="alert">{storageError}{" "}{ui("ui.components.BulkProfileImport.040a5f495622", "Reload after resolving the storage issue; the saved draft has been kept.")}</p> : null}
        </div>
        {sourceHeaders.length ? (
          <div className="bulk-preview-workspace">
            <div className="import-mapping">
              <div><span className="eyebrow">{ui("ui.components.BulkProfileImport.47ff1d8d9ef6", "Column mapping")}</span><h2>{ui("ui.components.BulkProfileImport.a9ee1dd2548f", "Review detected headings")}</h2><p>{ui("ui.components.BulkProfileImport.752c0e304f0c", "Correct any heading before creating Profiles.")}</p></div>
              <div className="import-mapping-grid">
                {sourceHeaders.map((sourceHeader) => (
                  <label key={sourceHeader}>
                    <span>{sourceHeader}</span>
                    <select disabled={controlsLocked} aria-label={ui("ui.components.BulkProfileImport.0133a0192f49", "Map {{value1}} column", { value1: sourceHeader })} value={columnMapping[sourceHeader] ?? normalizeHeader(sourceHeader)} onChange={(event) => updateColumnMapping(sourceHeader, event.target.value)}>
                      {importTargets.map((target) => <option key={target || "ignore"} value={target}>{target ? target.replaceAll("_", " ") : ui("ui.components.BulkProfileImport.5151f9e55ec2", "Ignore column")}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            <div className="bulk-preview-toolbar"><strong>{readyCount}{" "}{ui("ui.components.BulkProfileImport.62156aa9442a", "ready /")}{" "}{rows.length}{" "}{ui("ui.components.BulkProfileImport.11239872d178", "total")}</strong><div>{(["all", "ready", "attention", "duplicate", "invalid", "draft", "created"] as const).map((item) => <button className={filter === item ? "is-active" : ""} aria-pressed={filter === item} key={item} type="button" onClick={() => { setEditingRow(null); setFilter(item); }}>{item === "attention" ? ui("ui.components.BulkProfileImport.63cdbf0ebd1d", "Needs Attention") : item.charAt(0).toUpperCase() + item.slice(1)}</button>)}</div></div>
          <div className="bulk-preview-list" aria-label={ui("ui.components.BulkProfileImport.27cd21ba8e71", "Bulk import results")}>
            {!visibleRows.length ? <div role="status"><p>{ui("ui.components.BulkProfileImport.emptyFilteredView", "No rows match this view. Your other rows are kept.")}</p><button className="button secondary" type="button" onClick={() => setFilter("all")}>{ui("ui.components.BulkProfileImport.showAllRows", "Show all rows")}</button></div> : null}
            {visibleRows.map((row) => (
              <div className={row.error || (row.result && row.result !== "Created") ? "bulk-preview-row has-error" : "bulk-preview-row"} key={row.rowNumber} onFocusCapture={() => setEditingRow(row.rowNumber)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEditingRow(null); }}>
                <strong>{ui("ui.components.BulkProfileImport.95110d74c4c0", "Row")}{" "}{row.rowNumber}: {row.brand || ui("ui.components.BulkProfileImport.29bf024f43da", "Missing brand")} {row.model || ui("ui.components.BulkProfileImport.fefe7f33d18d", "Missing model")}</strong>
                <span>{[row.year, row.serial || "No Serial Number", row.serial ? qrCodeFromSerial(row.serial) : "QRguitar ID assigned at creation", "Included in Catalog", row.photo ? "Photo ready" : "Photo missing"].filter(Boolean).join(" / ")}</span>
                {row.result !== "Created" ? <fieldset disabled={leaseState !== "owned" || saving || previewing || Boolean(row.attempt)} className="bulk-row-editor" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} aria-label={ui("ui.components.BulkProfileImport.3bb8703eff27", "Edit row {{value1}}", { value1: row.rowNumber })}><input aria-label={ui("ui.components.BulkProfileImport.eeb091b0f05d", "Row {{value1}} brand", { value1: row.rowNumber })} value={row.brand} onChange={(event) => updateRow(row.rowNumber, "brand", event.target.value)} placeholder={ui("ui.components.BulkProfileImport.090ed4316f1d", "Brand")} /><input aria-label={ui("ui.components.BulkProfileImport.f33cdf26f0b0", "Row {{value1}} model", { value1: row.rowNumber })} value={row.model} onChange={(event) => updateRow(row.rowNumber, "model", event.target.value)} placeholder={ui("ui.components.BulkProfileImport.5e2c614c23f0", "Model")} /><input aria-label={ui("ui.components.BulkProfileImport.011f43f57b88", "Row {{value1}} Serial Number", { value1: row.rowNumber })} value={row.serialNotUsed ? "No Serial" : row.serial} onChange={(event) => updateRow(row.rowNumber, "serial", event.target.value)} placeholder={ui("ui.components.BulkProfileImport.733b7358d78a", "Serial Number or No Serial")} /><input aria-label={ui("ui.components.BulkProfileImport.5bcbc6403d90", "Row {{value1}} type", { value1: row.rowNumber })} value={row.instrumentType} onChange={(event) => updateRow(row.rowNumber, "instrumentType", event.target.value)} placeholder={ui("ui.components.BulkProfileImport.baaddf70fb5d", "Type")} /><input aria-label={ui("ui.components.BulkProfileImport.97e11dbd32a2", "Row {{value1}} photo URL", { value1: row.rowNumber })} value={row.photo} onChange={(event) => updateRow(row.rowNumber, "photo", event.target.value)} placeholder="https:// photo URL" /></fieldset> : null}
                <small>{bulkRowStatus(row)}{row.error || row.result ? ui("ui.components.BulkProfileImport.80b025432964", ": {{value1}}", { value1: row.error || row.result }) : ""}</small>
                {row.attempt?.phase === "complete" && row.attempt.qrCode ? <a href={`/edit/${encodeURIComponent(row.attempt.qrCode)}`}>{ui("ui.components.BulkProfileImport.editCreatedProfile", "Edit created Profile")}</a> : null}
                {row.duplicateCode ? <a href={`/dashboard/profile/${encodeURIComponent(row.duplicateCode)}`} target="_blank" rel="noreferrer">{ui("ui.components.BulkProfileImport.f99c2f0fa023", "Open existing Profile")}</a> : null}
              </div>
            ))}
          </div>
          </div>
        ) : null}
        {hasUncertain ? <p className="fine-print">{ui("ui.components.BulkProfileImport.9e79ebbdd071", "Retry confirms the original request. Keep this draft until its result is known.")}</p> : null}
        <p className="fine-print">{ui("ui.components.BulkProfileImport.catalogImportHelp", "Import up to 50 rows per batch. Saved instruments and photos appear in Catalog and link your collection. Seller/source and acquisition details stay off the Profile. Serial Numbers stay hidden unless show_serial explicitly says yes.")}</p>
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
