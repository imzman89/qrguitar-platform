import { canonicalInstrumentBrand } from "./instrument-brands";

export const bulkHeaders = ["brand", "model", "serial", "year", "type", "condition", "sale_status", "originality", "location", "photo", "summary", "show_serial", "seller", "acquisition_date"];
export const MAX_BULK_ROWS = 50;
export type ColumnMapping = Record<string, string>;
export type BulkRequest = {
  name: string; brand: string; model: string; serial: string; serialNotUsed: boolean;
  year: string; instrumentType: string; condition: "new" | "used";
  saleStatus: "for_sale" | "not_for_sale"; originalityStatus: "all_original" | "modified" | "unknown";
  ownerName: string; location: string; visibility: "public" | "private"; summary: string;
  heroImageDataUrl: string; photos: string[]; uploadId: string; idempotencyKey: string;
  showSerialPublic: boolean; documents: never[]; customFields: Array<{ label: string; value: string }>;
};
export type BulkAttempt = {
  uploadId: string; idempotencyKey: string;
  phase: "prepared" | "submitting" | "uncertain" | "failed" | "complete";
  body?: BulkRequest; qrCode?: string; uploadGeneration?: number;
};
export type BulkRow = {
  rowNumber: number; brand: string; model: string; serial: string; serialNotUsed: boolean;
  year: string; instrumentType: string; condition: "new" | "used";
  saleStatus: "for_sale" | "not_for_sale"; originalityStatus: "all_original" | "modified" | "unknown";
  location: string; visibility: "public" | "private"; photo: string; summary: string; seller: string;
  acquisitionDate: string; showSerialPublic: boolean; error: string; result: string; duplicateCode: string;
  attempt?: BulkAttempt;
};
export type BulkDraft = { version: 2; ownerId: string; text: string; rows: BulkRow[]; columnMapping: ColumnMapping };
export const bulkDraftKey = (ownerId: string) => `qrguitar.bulkImportDraft.v2:${ownerId}`;

function detectDelimiter(source: string) {
  source = source.replace(/^(?:[ \t]*(?:\r\n|\r|\n))+/, "");
  let quoted = false, commas = 0, tabs = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === ",") commas += 1;
      if (char === "\t") tabs += 1;
      if ((char === "\r" || char === "\n") && (commas || tabs || source.slice(0, index).trim())) break;
    }
  }
  return tabs > commas ? "\t" : ",";
}

/** CSV and TSV both support quoted delimiters, escaped quotes and logical multiline records. */
export function parseDelimited(input: string): Array<{ rowNumber: number; cells: string[] }> {
  const source = input.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(source);
  const records: Array<{ rowNumber: number; cells: string[] }> = [];
  let cells: string[] = [], field = "", quoted = false, afterQuote = false, line = 1, recordLine = 1;
  const endField = () => { cells.push(field); field = ""; afterQuote = false; };
  const endRecord = () => {
    endField();
    if (cells.some((cell) => cell.trim())) records.push({ rowNumber: recordLine, cells });
    cells = [];
  };
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { field += '"'; index += 1; }
        else { quoted = false; afterQuote = true; }
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && source[index + 1] === "\n") index += 1;
        field += "\n"; line += 1;
      } else field += char;
      continue;
    }
    if (char === delimiter) { endField(); continue; }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      endRecord(); line += 1; recordLine = line; continue;
    }
    if (afterQuote) {
      if (char === " " || char === "\t") continue;
      throw new Error(`Row ${line}: unexpected text after a closing quote. Separate columns with commas or tabs.`);
    }
    if (char === '"') {
      if (field.trim()) throw new Error(`Row ${line}: quote the whole field and double any quotes inside it.`);
      field = ""; quoted = true;
    } else field += char;
  }
  if (quoted) throw new Error(`Row ${recordLine}: a quoted field is not closed. No rows were imported.`);
  endRecord();
  return records;
}

export function normalizeHeader(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    make: "brand", brand_name: "brand", serial_number: "serial", serial_build_id: "serial",
    instrument_type: "type", availability: "sale_status", photo_url: "photo", image: "photo", image_url: "photo",
    description: "summary", seller_store: "seller", seller_source: "seller", store: "seller",
    acquired: "acquisition_date", acquired_date: "acquisition_date", show_serial_publicly: "show_serial"
  };
  return aliases[normalized] || normalized;
}
export function getSourceHeaders(source: string) {
  return (parseDelimited(source)[0]?.cells || []).map((cell) => cell.trim());
}
export function mergeAutoColumnMapping(sourceHeaders: string[], current: ColumnMapping) {
  return Object.fromEntries(sourceHeaders.map((header) => [header, current[header] ?? (bulkHeaders.includes(normalizeHeader(header)) ? normalizeHeader(header) : "")]));
}
export function autoColumnMapping(source: string) { return mergeAutoColumnMapping(getSourceHeaders(source), {}); }
export function validateBulkRow(row: Pick<BulkRow, "brand" | "model" | "serial" | "serialNotUsed" | "instrumentType" | "photo">) {
  return [
    !row.brand.trim() ? "Brand is required." : "", !row.model.trim() ? "Model is required." : "",
    !row.instrumentType.trim() ? "Type is required." : "",
    !row.serial.trim() && !row.serialNotUsed ? "Enter a Serial Number or No Serial." : "",
    !row.photo.trim() ? "A real photo URL is required." : "",
    row.photo && !/^https?:\/\//i.test(row.photo) ? "Photo must use an http or https URL." : ""
  ].filter(Boolean);
}
export function parseRows(source: string, mapping: ColumnMapping = {}): BulkRow[] {
  const records = parseDelimited(source);
  if (records.length < 2) return [];
  const count = records.length - 1;
  if (count > MAX_BULK_ROWS) throw new Error(`This file contains ${count} instrument rows. The limit is ${MAX_BULK_ROWS} per import. No rows were imported. Split the file into smaller batches.`);
  const sourceHeaders = records[0].cells.map((cell) => cell.trim());
  if (sourceHeaders.some((header) => !header) || new Set(sourceHeaders).size !== sourceHeaders.length) throw new Error("Every column needs a unique, nonempty heading. No rows were imported.");
  const targets = sourceHeaders.map((header) => mapping[header] ?? normalizeHeader(header));
  const mappedTargets = targets.filter(Boolean);
  if (new Set(mappedTargets).size !== mappedTargets.length) throw new Error("Two columns map to the same field. Change one mapping to Ignore column before importing.");
  return records.slice(1).map(({ rowNumber, cells }) => {
    if (cells.length !== sourceHeaders.length) throw new Error(`Row ${rowNumber} has ${cells.length} columns; the header has ${sourceHeaders.length}. Check quoted fields and delimiters. No rows were imported.`);
    const value = (key: string) => String(cells[targets.indexOf(key)] || "").trim();
    const enteredBrand = value("brand"), serialValue = value("serial");
    const serialNotUsed = /^(none|n\/a|na|no serial|not used)$/i.test(serialValue);
    const serial = serialNotUsed ? "" : serialValue;
    const originality = value("originality").toLowerCase().replace(/[\s-]+/g, "_");
    const row: BulkRow = {
      rowNumber, brand: canonicalInstrumentBrand(enteredBrand) || enteredBrand, model: value("model"), serial, serialNotUsed,
      year: value("year"), instrumentType: value("type"), condition: value("condition").toLowerCase() === "new" ? "new" : "used",
      saleStatus: value("sale_status").toLowerCase().replace(/[\s-]+/g, "_") === "for_sale" ? "for_sale" : "not_for_sale",
      originalityStatus: originality === "all_original" || originality === "modified" ? originality : "unknown",
      location: value("location"), visibility: "public", photo: value("photo"), summary: value("summary"),
      seller: value("seller"), acquisitionDate: value("acquisition_date"),
      showSerialPublic: Boolean(serial) && ["yes", "true", "1", "public"].includes(value("show_serial").toLowerCase()),
      error: "", result: "", duplicateCode: ""
    };
    row.error = validateBulkRow(row).join(" ");
    return row;
  });
}
export function isUncertain(row: Pick<BulkRow, "attempt">) { return row.attempt?.phase === "submitting" || row.attempt?.phase === "uncertain"; }
export function bulkRowStatus(row: Pick<BulkRow, "duplicateCode" | "error" | "result" | "attempt">) {
  if (row.attempt?.phase === "complete" || row.result === "Created") return "Created";
  if (isUncertain(row)) return "Needs confirmation";
  if (row.duplicateCode) return "Duplicate";
  if (row.result) return "Needs Attention";
  if (!row.error) return "Ready";
  return /required|enter a Serial Number/i.test(row.error) ? "Draft" : "Invalid";
}
export function buildBulkRequest(row: BulkRow, ownerName: string, attempt: BulkAttempt, storagePath: string): BulkRequest {
  return {
    name: [row.brand, row.model].filter(Boolean).join(" "), brand: row.brand, model: row.model,
    serial: row.serial, serialNotUsed: row.serialNotUsed, year: row.year, instrumentType: row.instrumentType,
    condition: row.condition, saleStatus: row.saleStatus, originalityStatus: row.originalityStatus,
    ownerName, location: row.location, visibility: "public", summary: row.summary,
    heroImageDataUrl: storagePath, photos: [storagePath], uploadId: attempt.uploadId, idempotencyKey: attempt.idempotencyKey,
    showSerialPublic: Boolean(row.serial) && row.showSerialPublic, documents: [],
    customFields: [row.seller ? { label: "Seller / source", value: row.seller } : null,
      row.acquisitionDate ? { label: "Acquired", value: row.acquisitionDate } : null].filter((field): field is { label: string; value: string } => field !== null)
  };
}
type CreateResult = { ok: boolean; qrCode?: string; message?: string; code?: string; status?: number; resetUploads?: boolean; cleanupUploads?: boolean; uncertain?: boolean };

/** Only the registry's explicit precommit rejection authorizes replacing staged paths. */
export async function readBulkCreateResponse(response: Pick<Response, "ok" | "status" | "json">): Promise<CreateResult> {
  const payload = await response.json().catch(() => null) as Partial<CreateResult> | null;
  if (!payload || typeof payload.ok !== "boolean") {
    return { ok: false, status: response.status, uncertain: true, message: "Creation was not confirmed. Retry to check this same request." };
  }
  return {
    ...payload,
    ok: response.ok && payload.ok,
    status: response.status,
    resetUploads: response.status === 409 && payload.ok === false && payload.code === "upload_session_changed" && payload.resetUploads === true && payload.uncertain !== true
  };
}
type ImportPorts = {
  ownerName: string; makeKey: () => string;
  /** Must durably save or throw. Called BEFORE external writes and after every result. */
  persist: (rows: BulkRow[]) => void;
  upload: (row: BulkRow, uploadId: string) => Promise<string>;
  create: (body: BulkRequest) => Promise<CreateResult>;
};
/** Deterministic orchestration with injected I/O; completed and uncertain rows survive interruption. */
export async function runBulkImport(initialRows: BulkRow[], ports: ImportPorts) {
  let rows: BulkRow[] = initialRows.map((row) => ({ ...row, attempt: row.attempt ? { ...row.attempt } : undefined }));
  let created = 0, stoppedReason = "";
  const save = (index: number, next: BulkRow) => {
    rows = rows.map((row, rowIndex) => rowIndex === index ? next : row);
    ports.persist(rows);
  };
  for (let index = 0; index < rows.length; index += 1) {
    let row = rows[index];
    const wasUncertain = isUncertain(row);
    if (row.error || row.result === "Created" || row.attempt?.phase === "complete") continue;
    let attempt: BulkAttempt = row.attempt || { uploadId: ports.makeKey(), idempotencyKey: ports.makeKey(), phase: "prepared" };
    save(index, { ...row, attempt, result: "Preparing photo..." });
    if (!attempt.body) {
      let storagePath: string;
      try { storagePath = await ports.upload(row, attempt.uploadId); }
      catch (error) {
        save(index, { ...row, attempt: { ...attempt, phase: "failed" }, result: error instanceof Error ? error.message : "The photo could not be prepared. Retry this row." });
        continue;
      }
      attempt = { ...attempt, body: buildBulkRequest(row, ports.ownerName, attempt, storagePath) };
    }
    attempt = { ...attempt, phase: "submitting" };
    row = { ...row, attempt, result: "Confirming Profile creation..." };
    // Persist the immutable payload before POST, including on every retry.
    save(index, row);
    let result: CreateResult;
    try { result = await ports.create(attempt.body!); }
    catch { result = { ok: false, uncertain: true, message: "The connection ended before creation was confirmed. Retry to check this same request." }; }
    if (result.ok) {
      save(index, { ...row, attempt: { ...attempt, phase: "complete", qrCode: result.qrCode }, result: "Created" });
      created += 1;
    } else {
      const resetUploads = result.status === 409 && result.code === "upload_session_changed" && result.resetUploads === true && result.uncertain !== true;
      const uncertain = !resetUploads && (result.uncertain || result.code === "request_in_progress" || wasUncertain);
      const nextAttempt: BulkAttempt = { ...attempt, phase: uncertain ? "uncertain" : "failed" };
      // This 409 guarantees no commit. Keep both keys and row data; retry stages the photo again.
      // Generic cleanup hints, timeouts and unknown outcomes keep the exact submitted body.
      if (resetUploads) { delete nextAttempt.body; nextAttempt.uploadGeneration = (attempt.uploadGeneration || 0) + 1; }
      save(index, { ...row, attempt: nextAttempt, result: result.message || "Could not create this Profile. Retry this row." });
      if (uncertain) { stoppedReason = "One request still needs confirmation. Retry to check it before continuing the remaining rows."; break; }
    }
  }
  return { rows, created, stoppedReason };
}

/** Reject incompatible/corrupt drafts without discarding their stored copy. */
export function readBulkDraft(serialized: string, ownerId: string): BulkDraft {
  const value = JSON.parse(serialized) as Partial<BulkDraft>;
  if (value.version !== 2 || value.ownerId !== ownerId || typeof value.text !== "string" || !Array.isArray(value.rows) || !value.columnMapping || typeof value.columnMapping !== "object") throw new Error("This saved import could not be restored safely. Keep the saved draft and contact QRguitar before retrying it.");
  const strings = ["brand", "model", "serial", "year", "instrumentType", "location", "photo", "summary", "seller", "acquisitionDate", "error", "result", "duplicateCode"] as const;
  for (const row of value.rows) {
    if (!row || !Number.isInteger(row.rowNumber) || strings.some((key) => typeof row[key] !== "string") || typeof row.serialNotUsed !== "boolean" || typeof row.showSerialPublic !== "boolean" || (row.visibility !== "private" && row.visibility !== "public")) throw new Error("The saved import contains an invalid row. Keep the draft and contact QRguitar before retrying it.");
    if (row.attempt) {
      const { attempt } = row;
      if (attempt.uploadGeneration !== undefined && (!Number.isSafeInteger(attempt.uploadGeneration) || attempt.uploadGeneration < 0 || attempt.uploadGeneration >= Number.MAX_SAFE_INTEGER)) throw new Error("The saved upload retry identity is invalid. Keep this draft before retrying.");
      if (!/^[a-zA-Z0-9-]{12,80}$/.test(attempt.uploadId) || !/^[a-zA-Z0-9-]{12,100}$/.test(attempt.idempotencyKey) || !["prepared", "submitting", "uncertain", "failed", "complete"].includes(attempt.phase)) throw new Error("The saved import is missing a valid retry identity. Keep the draft and contact QRguitar before retrying it.");
      if ((isUncertain(row) || attempt.phase === "complete") && !attempt.body) throw new Error("A submitted row is missing its original request. Keep the draft and contact QRguitar before retrying it.");
      if (attempt.body && (attempt.body.uploadId !== attempt.uploadId || attempt.body.idempotencyKey !== attempt.idempotencyKey || (attempt.body.visibility !== "private" && attempt.body.visibility !== "public"))) throw new Error("The saved request identity does not match its row. Keep the draft and contact QRguitar before retrying it.");
    }
  }
  return value as BulkDraft;
}

