"use client";

import { Clipboard, FileSpreadsheet, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { canonicalInstrumentBrand } from "../lib/instrument-brands";
import { getSupabaseAccessToken } from "../lib/supabase-browser";

type BulkProfileImportProps = {
  onComplete: () => void;
  ownerName: string;
};

type BulkRow = {
  rowNumber: number;
  brand: string;
  model: string;
  serial: string;
  year: string;
  instrumentType: string;
  condition: "new" | "used";
  saleStatus: "for_sale" | "not_for_sale";
  originalityStatus: "all_original" | "modified" | "unknown";
  location: string;
  visibility: "public" | "private" | "unlisted";
  photo: string;
  summary: string;
  showSerialPublic: boolean;
  error: string;
  result: string;
};

const headers = ["brand", "model", "serial", "year", "type", "condition", "sale_status", "originality", "location", "visibility", "photo", "summary", "show_serial"];

const template = [
  headers.join("\t"),
  ["Fender", "Stratocaster", "ABC123", "2005", "Electric Guitar", "used", "not_for_sale", "all_original", "Cranston, RI", "private", "https://example.com/photo.jpg", "Owned since 2024", "yes"].join("\t")
].join("\n");

export function BulkProfileImport({ onComplete, ownerName }: BulkProfileImportProps) {
  const [text, setText] = useState(template);
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const readyCount = useMemo(() => rows.filter((row) => !row.error).length, [rows]);

  function previewRows() {
    const parsed = parseRows(text);
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
    const parsed = rows.length ? rows : parseRows(text);
    if (!rows.length) setRows(parsed);
    const validRows = parsed.filter((row) => !row.error);
    if (!validRows.length) {
      setMessage("Fix the highlighted rows before creating Profiles.");
      return;
    }

    setSaving(true);
    setMessage("");
    let created = 0;
    const results = new Map<number, string>();

    try {
      const token = await getSupabaseAccessToken();
      if (!token) {
        setMessage("Your session expired. Sign in again before importing.");
        return;
      }

      for (const row of validRows) {
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
            serialNotUsed: !row.serial,
            year: row.year,
            instrumentType: row.instrumentType,
            condition: row.condition,
            saleStatus: row.saleStatus,
            originalityStatus: row.originalityStatus,
            ownerName,
            location: row.location,
            visibility: row.visibility,
            summary: row.summary,
            heroImageDataUrl: row.photo,
            photos: [row.photo],
            showSerialPublic: Boolean(row.serial) && row.showSerialPublic,
            documents: [],
            customFields: []
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

  return (
    <details className="advanced-panel bulk-import-panel dashboard-bulk-import">
      <summary>
        <span><FileSpreadsheet size={18} /> Bulk import</span>
        <small>For established shops and brands</small>
      </summary>
      <div className="bulk-import-grid">
        <div className="bulk-import-intro">
          <h3>Add up to 50 Profiles from a spreadsheet.</h3>
          <p>Copy the template into Excel or Google Sheets, add one instrument per row, then paste it back here. Each row needs a real photo URL. Serial Numbers are checked for duplicates before anything is created.</p>
        </div>
        <label className="field custom-wide" htmlFor="dashboardBulkImport">
          <span>Paste tab- or comma-separated inventory</span>
          <textarea id="dashboardBulkImport" rows={9} value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
        </label>
        <div className="bulk-import-actions">
          <button className="button secondary" type="button" onClick={() => void copyTemplate()}><Clipboard size={16} /> Copy Template</button>
          <button className="button secondary" type="button" onClick={previewRows}>Preview Rows</button>
          <button className="button" type="button" onClick={() => void createProfiles()} disabled={saving || (rows.length > 0 && readyCount === 0)}>
            <Upload size={16} /> {saving ? "Creating..." : "Create Ready Profiles"}
          </button>
        </div>
        {rows.length ? (
          <div className="bulk-preview-list" aria-label="Bulk import results">
            {rows.map((row) => (
              <div className={row.error || (row.result && row.result !== "Created") ? "bulk-preview-row has-error" : "bulk-preview-row"} key={row.rowNumber}>
                <strong>Row {row.rowNumber}: {row.brand || "Missing brand"} {row.model || "Missing model"}</strong>
                <span>{[row.year, row.serial || "Generated ID", row.visibility, row.photo ? "Photo ready" : "Photo missing"].filter(Boolean).join(" / ")}</span>
                <small>{row.error || row.result || "Ready"}</small>
              </div>
            ))}
          </div>
        ) : null}
        {message ? <p className="form-message">{message}</p> : null}
      </div>
    </details>
  );
}

function parseRows(source: string) {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const parsedHeaders = splitLine(lines[0], delimiter).map(normalizeHeader);

  return lines.slice(1, 51).map((line, index) => {
    const cells = splitLine(line, delimiter);
    const value = (key: string) => String(cells[parsedHeaders.indexOf(key)] || "").trim();
    const enteredBrand = value("brand");
    const brand = canonicalInstrumentBrand(enteredBrand) || enteredBrand;
    const model = value("model");
    const serialValue = value("serial");
    const serial = /^(none|n\/a|na|no serial|not used)$/i.test(serialValue) ? "" : serialValue;
    const photo = value("photo");
    const visibilityValue = value("visibility").toLowerCase();
    const conditionValue = value("condition").toLowerCase();
    const saleValue = value("sale_status").toLowerCase().replace(/[\s-]+/g, "_");
    const originalityValue = value("originality").toLowerCase().replace(/[\s-]+/g, "_");
    const showSerialValue = value("show_serial").toLowerCase();
    const errors = [
      !brand ? "Brand is required." : "",
      !model ? "Model is required." : "",
      !photo ? "A real photo URL is required." : "",
      photo && !/^https?:\/\//i.test(photo) ? "Photo must use an http or https URL." : ""
    ].filter(Boolean);

    return {
      rowNumber: index + 2,
      brand,
      model,
      serial,
      year: value("year"),
      instrumentType: value("type") || "Other Guitar",
      condition: conditionValue === "new" ? "new" as const : "used" as const,
      saleStatus: saleValue === "for_sale" ? "for_sale" as const : "not_for_sale" as const,
      originalityStatus: originalityValue === "all_original" ? "all_original" as const : originalityValue === "modified" ? "modified" as const : "unknown" as const,
      location: value("location"),
      visibility: visibilityValue === "public" ? "public" as const : visibilityValue === "unlisted" ? "unlisted" as const : "private" as const,
      photo,
      summary: value("summary"),
      showSerialPublic: Boolean(serial) && !["no", "false", "hidden", "private"].includes(showSerialValue),
      error: errors.join(" "),
      result: ""
    };
  });
}

function normalizeHeader(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "make" || normalized === "brand_name") return "brand";
  if (normalized === "serial_number" || normalized === "serial_build_id") return "serial";
  if (normalized === "instrument_type") return "type";
  if (normalized === "availability") return "sale_status";
  if (normalized === "photo_url" || normalized === "image" || normalized === "image_url") return "photo";
  if (normalized === "description") return "summary";
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
