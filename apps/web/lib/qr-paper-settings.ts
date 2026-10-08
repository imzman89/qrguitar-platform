import { qrBatchGeometry, type QrBatchSettings, type QrBatchStock } from "./qr-batch-layout";

type PaperStorage = Pick<Storage, "getItem" | "setItem">;
type SavedPapers = { version: 1; lastStock: QrBatchStock; stocks: Partial<Record<QrBatchStock, QrBatchSettings>> };
const stocks: QrBatchStock[] = ["letter", "a4", "single"];
function storageKey(actorId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorId)) throw new Error("Sign in to save your paper settings.");
  return "qrguitar.qr-paper.v1:" + actorId;
}
function cleanSettings(value: unknown): QrBatchSettings {
  if (!value || typeof value !== "object") throw new Error("Saved paper settings are unavailable.");
  const source = value as Record<string, unknown>;
  // Store paper preferences only. Never retain instrument IDs, copy counts,
  // prepared QR data, credentials, or a used-label skip count for the next job.
  const fields = ["stock", "sideMm", "topMm", "bottomMm", "leftMm", "rightMm", "gapXMm", "gapYMm", "labelWidthMm", "labelHeightMm"];
  const settings = Object.fromEntries(fields.filter(field => source[field] !== undefined).map(field => [field, source[field]])) as QrBatchSettings;
  settings.skip = 0;
  qrBatchGeometry(settings);
  return settings;
}
function readSaved(actorId: string, storage: PaperStorage): SavedPapers | null {
  try {
    const raw = storage.getItem(storageKey(actorId));
    if (!raw || raw.length > 8000) return null;
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !stocks.includes(value.lastStock) || !value.stocks || typeof value.stocks !== "object") return null;
    const entries = Object.entries(value.stocks).map(([stock, settings]) => {
      if (!stocks.includes(stock as QrBatchStock)) throw new Error("Unknown saved paper.");
      const clean = cleanSettings(settings);
      if (clean.stock !== stock) throw new Error("Saved paper does not match its stock.");
      return [stock, clean];
    });
    return { version: 1, lastStock: value.lastStock, stocks: Object.fromEntries(entries) };
  } catch { return null; }
}
export function readQrPaperSettings(actorId: string, storage: PaperStorage, stock?: QrBatchStock): QrBatchSettings | null {
  const saved = readSaved(actorId, storage);
  const settings = saved?.stocks[stock || saved.lastStock];
  return settings ? { ...settings, skip: 0 } : null;
}
export function saveQrPaperSettings(actorId: string, settings: QrBatchSettings, storage: PaperStorage) {
  const key = storageKey(actorId), clean = cleanSettings(settings), previous = readSaved(actorId, storage);
  const saved: SavedPapers = { version: 1, lastStock: clean.stock, stocks: { ...(previous?.stocks || {}), [clean.stock]: clean } };
  try { storage.setItem(key, JSON.stringify(saved)); }
  catch { throw new Error("This browser could not save your paper settings. You can still print this job."); }
}
