"use client";

import { Clipboard, FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DemoInstrument } from "../lib/local-demo";
import { canonicalInstrumentBrand } from "../lib/instrument-brands";
import { qrCodeFromSerial } from "../lib/qrguitar-id";
import { getSupabaseAccessToken } from "../lib/supabase-browser";
import { getContentValue } from "../lib/content-registry";
import { useSiteContent } from "../lib/use-site-content";

type BulkProfileImportProps = {
  onComplete?: () => void;
  ownerName?: string;
};

type BulkRow = {
  rowNumber: number;
  brand: string;
  model: string;
  serial: string;
  serialNotUsed: boolean;
  year: string;
  instrumentType: string;
  condition: "new" | "used";
  saleStatus: "for_sale" | "not_for_sale";
  originalityStatus: "all_original" | "modified" | "unknown";
  location: string;
  visibility: "public" | "private" | "unlisted";
  photo: string;
  summary: string;
  seller: string;
  acquisitionDate: string;
  showSerialPublic: boolean;
  error: string;
  result: string;
  duplicateCode: string;
};

const headers = ["brand", "model", "serial", "year", "type", "condition", "sale_status", "originality", "location", "visibility", "photo", "summary", "show_serial", "seller", "acquisition_date"];

const template = [
  headers.join("\t"),
  ["Fender", "Stratocaster", "ABC123", "2005", "Electric Guitar", "used", "not_for_sale", "all_original", "Cranston, RI", "private", "https://example.com/photo.jpg", "Owned since 2024", "yes", "Example Shop", "2024-01-15"].join("\t")
].join("\n");

const importDraftKey = "qrguitar.bulkImportDraft.v1";

type ColumnMapping = Record<string, string>;

const importTargets = ["", ...headers] as const;

export function BulkProfileImport({ onComplete = () => undefined, ownerName = "" }: BulkProfileImportProps) {
  const content = useSiteContent();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "ready" | "attention" | "duplicate" | "invalid" | "created">("all");
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [draftLoaded, setDraftLoaded] = useState(false);

  const readyCount = useMemo(() => rows.filter((row) => !row.error).length, [rows]);
  const visibleRows = rows.filter((row) => filter === "all"
    || (filter === "ready" && !row.error && !row.result)
    || (filter === "attention" && Boolean(row.error || (row.result && row.result !== "Created")))
    || (filter === "duplicate" && Boolean(row.duplicateCode))
    || (filter === "invalid" && Boolean(row.error) && !row.duplicateCode)
    || (filter === "created" && row.result === "Created"));

  useEffect(() => {
    const saved = window.localStorage.getItem(importDraftKey);
    if (saved) {
      try {
        const draft = JSON.parse(saved) as { text?: string; rows?: BulkRow[]; columnMapping?: ColumnMapping };
        setText(String(draft.text || ""));
        setRows(Array.isArray(draft.rows) ? draft.rows : []);
        setColumnMapping(draft.columnMapping || {});
      } catch {
        setText(saved);
      }
    }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    if (text.trim()) window.localStorage.setItem(importDraftKey, JSON.stringify({ text, rows, columnMapping }));
    else window.localStorage.removeItem(importDraftKey);
  }, [columnMapping, draftLoaded, rows, text]);

  const sourceHeaders = useMemo(() => getSourceHeaders(text), [text]);

  async function loadFile(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) { setMessage("Choose a CSV or TSV file smaller than 2 MB."); return; }
    const source = await file.text();
    const mapping = autoColumnMapping(source);
    setText(source);
    setColumnMapping(mapping);
    const parsed = parseRows(source, mapping);
    setRows(parsed);
    setMessage(`${file.name}: ${parsed.length} row${parsed.length === 1 ? "" : "s"} reviewed.`);
  }

  async function previewRows() {
    const mapping = sourceHeaders.length ? mergeAutoColumnMapping(sourceHeaders, columnMapping) : {};
    setColumnMapping(mapping);
    let parsed = parseRows(text, mapping);
    const token = await getSupabaseAccessToken();
    if (token) {
      const response = await fetch("/api/instruments?scope=mine", { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await response.json().catch(() => null) as { instruments?: DemoInstrument[] } | null;
      const existingBySerial = new Map((payload?.instruments || []).filter((item) => item.serial).map((item) => [item.serial.trim().toLowerCase(), item.qrCode]));
      parsed = parsed.map((row) => {
        const duplicateCode = row.serial ? existingBySerial.get(row.serial.toLowerCase()) || "" : "";
        return duplicateCode ? { ...row, duplicateCode, error: [row.error, `Serial Number already belongs to ${duplicateCode}. Use transfer or claim instead.`].filter(Boolean).join(" ") } : row;
      });
    }
    setRows(parsed);
    setMessage(parsed.length ? String(parsed.length) + " row" + (parsed.length === 1 ? "" : "s") + " reviewed. " + String(parsed.filter((row) => !row.error).length) + " ready." : "Paste a header row and at least one instrument row.");
  }

  async function copyTemplate() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(template);
      setMessage("Template copied.");
    } catch {
      setMessage("Could not copy automatically. Select the template above and copy it manually.");
    }
  }

  async function createProfiles() {
    let parsed = rows.length ? rows : parseRows(text, columnMapping);
    const token = await getSupabaseAccessToken();
    if (!token) {
      setMessage("Your session expired. Sign in again before importing.");
      return;
    }

    const existingResponse = await fetch("/api/instruments?scope=mine", { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    const existingPayload = await existingResponse.json().catch(() => null) as { instruments?: DemoInstrument[] } | null;
    const existingBySerial = new Map((existingPayload?.instruments || []).filter((item) => item.serial).map((item) => [item.serial.trim().toLowerCase(), item.qrCode]));
    parsed = parsed.map((row) => {
      if (!row.serial) return row;
      const duplicateCode = existingBySerial.get(row.serial.toLowerCase()) || "";
      return duplicateCode ? { ...row, duplicateCode, error: `Serial Number already belongs to ${duplicateCode}. Use transfer or claim instead.` } : row;
    });
    setRows(parsed);
    const validRows = parsed.filter((row) => !row.error && row.result !== "Created");
    if (!validRows.length) {
      setMessage("Fix the highlighted rows before creating Profiles.");
      return;
    }

    setSaving(true);
    setMessage("");
    let created = 0;
    const results = new Map<number, string>();

    try {
      for (const row of validRows) {
        const uploadId = createClientKey();
        const idempotencyKey = createClientKey();
        let storagePath = "";
        try {
          const dataUrl = await remoteImageToDataUrl(row.photo);
          const uploadResponse = await fetch("/api/instruments/uploads", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: "Bearer " + token
            },
            body: JSON.stringify({ uploadId, kind: "image", dataUrl, index: 0 })
          });
          const uploadPayload = await uploadResponse.json().catch(() => null) as { ok?: boolean; storagePath?: string; message?: string } | null;
          if (!uploadResponse.ok || !uploadPayload?.ok || !uploadPayload.storagePath) {
            results.set(row.rowNumber, uploadPayload?.message || "The photo could not be staged for import.");
            continue;
          }
          storagePath = uploadPayload.storagePath;
        } catch (error) {
          results.set(row.rowNumber, error instanceof Error ? error.message : "The photo could not be prepared for import.");
          continue;
        }

        const response = await fetch("/api/instruments", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer " + token
          },
          body: JSON.stringify({
            name: [row.brand, row.model].filter(Boolean).join(" "),
            brand: row.brand,
            model: row.model,
            serial: row.serial,
            serialNotUsed: row.serialNotUsed,
            year: row.year,
            instrumentType: row.instrumentType,
            condition: row.condition,
            saleStatus: row.saleStatus,
            originalityStatus: row.originalityStatus,
            ownerName,
            location: row.location,
            visibility: "private",
            summary: row.summary,
            heroImageDataUrl: storagePath,
            photos: [storagePath],
            uploadId,
            idempotencyKey,
            showSerialPublic: Boolean(row.serial) && row.showSerialPublic,
            documents: [],
            customFields: [
              row.seller ? { label: "Seller / source", value: row.seller } : null,
              row.acquisitionDate ? { label: "Acquired", value: row.acquisitionDate } : null
            ].filter(Boolean)
          })
        });
        const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
        if (response.ok && payload?.ok) {
          created += 1;
          results.set(row.rowNumber, "Created");
        } else {
          results.set(row.rowNumber, payload?.message || "Could not create this Profile.");
        }
      }

      setRows((current) => current.map((row) => ({ ...row, result: results.get(row.rowNumber) || row.result })));
      setMessage(String(created) + " Profile" + (created === 1 ? "" : "s") + " created. Rows with errors were left untouched.");
      if (created) onComplete();
    } catch {
      setMessage("The import stopped because the connection failed. No unprocessed rows were submitted. Preview the rows and try again.");
    } finally {
      setSaving(false);
    }
  }

  function updateRow(rowNumber: number, field: "brand" | "model" | "serial" | "instrumentType" | "photo", value: string) {
    setRows((current) => current.map((row) => {
      if (row.rowNumber !== rowNumber) return row;
      const next = { ...row, [field]: value, serialNotUsed: field === "serial" ? /^(none|n\/a|na|no serial|not used)$/i.test(value.trim()) : row.serialNotUsed, duplicateCode: "", result: "" };
      if (field === "serial" && next.serialNotUsed) next.serial = "";
      return { ...next, error: validateBulkRow(next).join(" ") };
    }));
  }

  function updateColumnMapping(sourceHeader: string, targetHeader: string) {
    const next = { ...columnMapping, [sourceHeader]: targetHeader };
    setColumnMapping(next);
    setRows(parseRows(text, next));
    setMessage("Column mapping updated. Review the rows before creating Profiles.");
  }

  return (
    <section className="bulk-import-workspace">
      <header className="bulk-import-heading"><div><span className="eyebrow">Bulk Import</span><h1>{getContentValue(content, "bulkImport.hero.headline")}</h1><p>{getContentValue(content, "bulkImport.hero.body")}</p></div><button className="button secondary" type="button" onClick={() => void copyTemplate()}><Clipboard size={16} /> {getContentValue(content, "bulkImport.actions.template")}</button></header>
      <ol className="import-steps" aria-label="Import workflow"><li className={text ? "is-complete" : "is-active"}><b>1</b><span>Add inventory</span></li><li className={rows.length ? "is-complete" : ""}><b>2</b><span>Map columns</span></li><li className={rows.length ? "is-active" : ""}><b>3</b><span>Preview & validate</span></li><li><b>4</b><span>Create private Profiles</span></li></ol>
      <div className="bulk-import-grid">
        <div className="bulk-import-intro">
          <h2>1. Add inventory</h2>
          <p>Upload CSV/TSV or paste spreadsheet rows. Required: Brand, Model, Type, a Serial Number or explicit no-serial value, and a real photo URL.</p>
          <label className="import-file-drop"><Upload size={20} /><span><b>Choose CSV or TSV</b><small>Comma and tab delimiters are detected automatically.</small></span><input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => void loadFile(event.target.files?.[0])} /></label>
        </div>
        <label className="field custom-wide" htmlFor="dashboardBulkImport">
          <span>Or paste spreadsheet rows</span>
          <textarea id="dashboardBulkImport" rows={8} value={text} onChange={(event) => { setText(event.target.value); setRows([]); }} spellCheck={false} placeholder={template} />
        </label>
        <div className="bulk-import-actions">
          <button className="button secondary" type="button" onClick={() => { const mapping = autoColumnMapping(template); setText(template); setColumnMapping(mapping); setRows(parseRows(template, mapping)); }}>Load example</button>
          <button className="button secondary" type="button" onClick={() => void previewRows()}>Map & preview rows</button>
          <button className="button" type="button" onClick={() => void createProfiles()} disabled={saving || (rows.length > 0 && readyCount === 0)}>
            <Upload size={16} /> {saving ? "Creating..." : "Create Ready Profiles"}
          </button>
        </div>
        {rows.length ? (
          <div className="bulk-preview-workspace">
            <div className="import-mapping">
              <div><span className="eyebrow">Column mapping</span><h2>Review detected headings</h2><p>Correct any heading before creating Profiles.</p></div>
              <div className="import-mapping-grid">
                {sourceHeaders.map((sourceHeader) => (
                  <label key={sourceHeader}>
                    <span>{sourceHeader}</span>
                    <select aria-label={`Map ${sourceHeader} column`} value={columnMapping[sourceHeader] ?? normalizeHeader(sourceHeader)} onChange={(event) => updateColumnMapping(sourceHeader, event.target.value)}>
                      {importTargets.map((target) => <option key={target || "ignore"} value={target}>{target ? target.replaceAll("_", " ") : "Ignore column"}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            <div className="bulk-preview-toolbar"><strong>{readyCount} ready / {rows.length} total</strong><div>{(["all", "ready", "attention", "duplicate", "invalid", "created"] as const).map((item) => <button className={filter === item ? "is-active" : ""} key={item} type="button" onClick={() => setFilter(item)}>{item === "attention" ? "Needs attention" : item}</button>)}</div></div>
          <div className="bulk-preview-list" aria-label="Bulk import results">
            {visibleRows.map((row) => (
              <div className={row.error || (row.result && row.result !== "Created") ? "bulk-preview-row has-error" : "bulk-preview-row"} key={row.rowNumber}>
                <strong>Row {row.rowNumber}: {row.brand || "Missing brand"} {row.model || "Missing model"}</strong>
                <span>{[row.year, row.serial || "No Serial Number", row.serial ? qrCodeFromSerial(row.serial) : "QRguitar ID assigned at creation", "Private on creation", row.photo ? "Photo ready" : "Photo missing"].filter(Boolean).join(" / ")}</span>
                {row.result !== "Created" ? <div className="bulk-row-editor"><input aria-label={`Row ${row.rowNumber} brand`} value={row.brand} onChange={(event) => updateRow(row.rowNumber, "brand", event.target.value)} placeholder="Brand" /><input aria-label={`Row ${row.rowNumber} model`} value={row.model} onChange={(event) => updateRow(row.rowNumber, "model", event.target.value)} placeholder="Model" /><input aria-label={`Row ${row.rowNumber} Serial Number`} value={row.serialNotUsed ? "No Serial" : row.serial} onChange={(event) => updateRow(row.rowNumber, "serial", event.target.value)} placeholder="Serial Number or No Serial" /><input aria-label={`Row ${row.rowNumber} type`} value={row.instrumentType} onChange={(event) => updateRow(row.rowNumber, "instrumentType", event.target.value)} placeholder="Type" /><input aria-label={`Row ${row.rowNumber} photo URL`} value={row.photo} onChange={(event) => updateRow(row.rowNumber, "photo", event.target.value)} placeholder="https:// photo URL" /></div> : null}
                <small>{row.error || row.result || "Ready"}</small>
                {row.duplicateCode ? <a href={`/i/${row.duplicateCode}`} target="_blank" rel="noreferrer">Open existing Profile</a> : null}
              </div>
            ))}
          </div>
          </div>
        ) : null}
        {message ? <p className="form-message">{message}</p> : null}
      </div>
    </section>
  );
}

function createClientKey() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

async function remoteImageToDataUrl(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("The photo URL could not be downloaded.");
  const blob = await response.blob();
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(blob.type)) {
    throw new Error("Photo URLs must point to a JPG, PNG, or WebP image.");
  }
  if (blob.size > 12 * 1024 * 1024) throw new Error("Use a photo smaller than 12MB.");
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("The photo could not be read."));
    reader.readAsDataURL(blob);
  });
}

function parseRows(source: string, columnMapping: ColumnMapping = {}) {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const sourceHeaders = splitLine(lines[0], delimiter).map((value) => value.trim());
  const parsedHeaders = sourceHeaders.map((value) => columnMapping[value] ?? normalizeHeader(value));

  return lines.slice(1, 51).map((line, index) => {
    const cells = splitLine(line, delimiter);
    const value = (key: string) => String(cells[parsedHeaders.indexOf(key)] || "").trim();
    const enteredBrand = value("brand");
    const brand = canonicalInstrumentBrand(enteredBrand) || enteredBrand;
    const model = value("model");
    const serialValue = value("serial");
    const serialNotUsed = /^(none|n\/a|na|no serial|not used)$/i.test(serialValue);
    const serial = serialNotUsed ? "" : serialValue;
    const photo = value("photo");
    const conditionValue = value("condition").toLowerCase();
    const saleValue = value("sale_status").toLowerCase().replace(/[\s-]+/g, "_");
    const originalityValue = value("originality").toLowerCase().replace(/[\s-]+/g, "_");
    const showSerialValue = value("show_serial").toLowerCase();
    const row: BulkRow = {
      rowNumber: index + 2,
      brand,
      model,
      serial,
      serialNotUsed,
      year: value("year"),
      instrumentType: value("type") || "Other Guitar",
      condition: conditionValue === "new" ? "new" as const : "used" as const,
      saleStatus: saleValue === "for_sale" ? "for_sale" as const : "not_for_sale" as const,
      originalityStatus: originalityValue === "all_original" ? "all_original" as const : originalityValue === "modified" ? "modified" as const : "unknown" as const,
      location: value("location"),
      visibility: "private" as const,
      photo,
      summary: value("summary"),
      seller: value("seller"),
      acquisitionDate: value("acquisition_date"),
      showSerialPublic: Boolean(serial) && !["no", "false", "hidden", "private"].includes(showSerialValue),
      error: "",
      result: "",
      duplicateCode: ""
    };
    row.error = validateBulkRow(row).join(" ");
    return row;
  });
}

function getSourceHeaders(source: string) {
  const headerLine = source.split(/\r?\n/).find((line) => line.trim());
  if (!headerLine) return [];
  const delimiter = headerLine.includes("\t") ? "\t" : ",";
  return splitLine(headerLine, delimiter).map((value) => value.trim()).filter(Boolean);
}

function autoColumnMapping(source: string) {
  return mergeAutoColumnMapping(getSourceHeaders(source), {});
}

function mergeAutoColumnMapping(sourceHeaders: string[], current: ColumnMapping) {
  return Object.fromEntries(sourceHeaders.map((sourceHeader) => [sourceHeader, current[sourceHeader] ?? (headers.includes(normalizeHeader(sourceHeader)) ? normalizeHeader(sourceHeader) : "")]));
}

function validateBulkRow(row: Pick<BulkRow, "brand" | "model" | "serial" | "serialNotUsed" | "instrumentType" | "photo">) {
  return [
    !row.brand.trim() ? "Brand is required." : "",
    !row.model.trim() ? "Model is required." : "",
    !row.instrumentType.trim() ? "Type is required." : "",
    !row.serial.trim() && !row.serialNotUsed ? "Enter a Serial Number or No Serial." : "",
    !row.photo.trim() ? "A real photo URL is required." : "",
    row.photo && !/^https?:\/\//i.test(row.photo) ? "Photo must use an http or https URL." : ""
  ].filter(Boolean);
}

function normalizeHeader(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "make" || normalized === "brand_name") return "brand";
  if (normalized === "serial_number" || normalized === "serial_build_id") return "serial";
  if (normalized === "instrument_type") return "type";
  if (normalized === "availability") return "sale_status";
  if (normalized === "photo_url" || normalized === "image" || normalized === "image_url") return "photo";
  if (normalized === "description") return "summary";
  if (normalized === "seller_store" || normalized === "seller_source" || normalized === "store") return "seller";
  if (normalized === "acquired" || normalized === "acquired_date") return "acquisition_date";
  if (normalized === "show_serial_publicly") return "show_serial";
  return normalized;
}

function splitLine(line: string, delimiter: string) {
  if (delimiter === "\t") return line.split("\t");
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current);
  return values;
}
