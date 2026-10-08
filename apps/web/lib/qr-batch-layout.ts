export const RETAIL_QR_SIDE_MM = 38.1;
export const MAX_QR_BATCH_LABELS = 500;
export type QrBatchStock = "letter" | "a4" | "single";
export type QrBatchSettings = {
  stock: QrBatchStock; sideMm: number;
  labelWidthMm?: number; labelHeightMm?: number;
  topMm: number; bottomMm: number; leftMm: number; rightMm: number;
  gapXMm: number; gapYMm: number; skip: number;
};
export type QrBatchRequest = { code: string; quantity: number };
export type QrBatchCell = { code: string; copy: number; xMm: number; yMm: number; sideMm: number; slot: number };
export type QrBatchPlan = { widthMm: number; heightMm: number; columns: number; rows: number; capacity: number; count: number; pages: QrBatchCell[][] };
export const defaultQrBatchSettings: QrBatchSettings = {
  stock: "letter", sideMm: RETAIL_QR_SIDE_MM,
  topMm: 6.35, bottomMm: 6.35, leftMm: 6.35, rightMm: 6.35,
  gapXMm: 3.175, gapYMm: 3.175, skip: 0
};

export function qrBatchGeometry(settings: QrBatchSettings) {
  if (!["letter", "a4", "single"].includes(settings.stock) || ![25, 32, 38.1].includes(settings.sideMm)) throw new Error("Choose a supported paper and QR size.");
  const single = settings.stock === "single";
  const [widthMm, heightMm] = single
    ? [settings.labelWidthMm === undefined ? settings.sideMm : settings.labelWidthMm,
       settings.labelHeightMm === undefined ? settings.sideMm : settings.labelHeightMm]
    : settings.stock === "a4" ? [210, 297] : [215.9, 279.4];
  const values = [settings.topMm, settings.bottomMm, settings.leftMm, settings.rightMm, settings.gapXMm, settings.gapYMm];
  if (values.some(value => !Number.isFinite(value) || value < 0 || value > 100)) throw new Error("Margins and gaps must be between 0 and 100 mm.");
  if (single) {
    if ([widthMm, heightMm].some(value => !Number.isFinite(value) || value < settings.sideMm || value > 200)) {
      throw new Error("Thermal label width and height must each fit the QR size and be no larger than 200 mm.");
    }
    if (settings.skip !== 0) throw new Error("Thermal labels print one label per page. Used-label skip must be zero.");
    return { widthMm, heightMm, columns: 1, rows: 1, capacity: 1,
      topMm: (heightMm - settings.sideMm) / 2, leftMm: (widthMm - settings.sideMm) / 2,
      gapXMm: 0, gapYMm: 0 };
  }
  const topMm = settings.topMm, leftMm = settings.leftMm;
  const gapXMm = settings.gapXMm, gapYMm = settings.gapYMm;
  const usableWidth = widthMm - leftMm - settings.rightMm;
  const usableHeight = heightMm - topMm - settings.bottomMm;
  const columns = Math.floor((usableWidth + gapXMm + 1e-8) / (settings.sideMm + gapXMm));
  const rows = Math.floor((usableHeight + gapYMm + 1e-8) / (settings.sideMm + gapYMm));
  const capacity = columns * rows;
  if (columns < 1 || rows < 1) throw new Error("A QR label does not fit. Reduce the margins or choose larger paper.");
  if (!Number.isInteger(settings.skip) || settings.skip < 0 || settings.skip >= capacity) throw new Error(`Skip between 0 and ${capacity - 1} used labels on the first sheet.`);
  return { widthMm, heightMm, columns, rows, capacity, topMm, leftMm, gapXMm, gapYMm };
}

export function buildQrBatchPlan(requests: QrBatchRequest[], settings: QrBatchSettings): QrBatchPlan {
  const geometry = qrBatchGeometry(settings);
  if (!requests.length) throw new Error("Select at least one public Profile.");
  const seen = new Set<string>();
  let count = 0;
  for (const request of requests) {
    // Never silently combine identifiers or replace one instrument with another.
    if (!request.code || request.code.trim() !== request.code || request.code.length > 160 || seen.has(request.code.toUpperCase())) throw new Error("Each instrument must have one distinct QRguitar ID.");
    if (!Number.isInteger(request.quantity) || request.quantity < 1 || request.quantity > MAX_QR_BATCH_LABELS) throw new Error(`Use whole copy counts between 1 and ${MAX_QR_BATCH_LABELS}.`);
    seen.add(request.code.toUpperCase()); count += request.quantity;
  }
  if (count > MAX_QR_BATCH_LABELS) throw new Error(`Print up to ${MAX_QR_BATCH_LABELS} labels per batch.`);
  const pages: QrBatchCell[][] = [];
  let absolute = settings.skip;
  for (const request of requests) for (let copy = 1; copy <= request.quantity; copy++, absolute++) {
    const page = Math.floor(absolute / geometry.capacity), slot = absolute % geometry.capacity;
    (pages[page] ||= []).push({ code: request.code, copy, slot, sideMm: settings.sideMm,
      xMm: geometry.leftMm + (slot % geometry.columns) * (settings.sideMm + geometry.gapXMm),
      yMm: geometry.topMm + Math.floor(slot / geometry.columns) * (settings.sideMm + geometry.gapYMm) });
  }
  return { ...geometry, count, pages };
}
