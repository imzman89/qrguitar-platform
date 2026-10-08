import { buildQrBatchPlan, type QrBatchRequest, type QrBatchSettings } from "./qr-batch-layout";
import { printQrSvg, svgDataUrl } from "./qr-print-output";

export type QrBatchRecord = { qrCode: string; title: string; isPublic: boolean; serial?: string };
export type QrBatchIdentity = { id: string; token: string };

export function awaitQrBatchWork<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("The print operation was cancelled.", "AbortError"));
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
  });
}

export function validateQrBatchRecords(records: QrBatchRecord[], requests: QrBatchRequest[]) {
  if (requests.some(request => !request || typeof request.code !== "string" || !request.code)) throw new Error("Choose a valid instrument for each label.");
  const indexed = new Map<string, QrBatchRecord>();
  for (const record of records) {
    const key = record.qrCode.toUpperCase();
    if (indexed.has(key)) throw new Error("The inventory contains a duplicate QRguitar ID. Refresh before printing.");
    indexed.set(key, record);
  }
  for (const request of requests) {
    const record = indexed.get(request.code.toUpperCase());
    if (!record || record.qrCode !== request.code) throw new Error("A selected Profile is no longer in your inventory. Refresh and choose again.");
    if (record.isPublic !== true) throw new Error("A selected Profile is unavailable for customer labels. Check its public visibility and account settings before printing.");
  }
}

export async function loadQrBatchInventory(identity: QrBatchIdentity, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<QrBatchRecord[]> {
  const response = await fetcher("/api/print/qr", { signal, cache: "no-store", headers: { authorization: `Bearer ${identity.token}`, "Cache-Control": "no-cache" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !Array.isArray(payload.instruments)) throw new Error(response.status === 401 ? "Sign in again to print your inventory." : "Your saved inventory could not be loaded. Try again.");
  if (payload.actorId !== identity.id || payload.instruments.some((record: QrBatchRecord) => typeof record?.qrCode !== "string" || !record.qrCode || typeof record.title !== "string" || typeof record.isPublic !== "boolean")) throw new Error("The inventory response is incomplete or the account changed. Refresh before printing.");
  return payload.instruments.map((record: QrBatchRecord) => ({ qrCode: record.qrCode, title: record.title, isPublic: record.isPublic, ...(typeof record.serial === "string" && record.serial ? { serial: record.serial } : {}) }));
}

/** Preparation is all-or-nothing; changed sessions and cancelled work never publish partial labels. */
export async function prepareQrBatch({ requests, settings, readIdentity, loadInventory = loadQrBatchInventory, renderQr = printQrSvg, isCurrent, signal }: {
  requests: QrBatchRequest[]; settings: QrBatchSettings;
  readIdentity: () => Promise<QrBatchIdentity | null>;
  loadInventory?: typeof loadQrBatchInventory;
  renderQr?: typeof printQrSvg;
  isCurrent: () => boolean; signal: AbortSignal;
}) {
  const plan = buildQrBatchPlan(requests, settings);
  const current = () => { signal.throwIfAborted(); if (!isCurrent()) throw new DOMException("The print selection changed.", "AbortError"); };
  current();
  const identity = await awaitQrBatchWork(readIdentity(), signal); current();
  if (!identity?.id || !identity.token) throw new Error("Sign in to print labels from your inventory.");
  const records = await awaitQrBatchWork(loadInventory(identity, signal), signal); current();
  validateQrBatchRecords(records, requests);
  const images: Record<string, string> = {};
  // Bounded work keeps large retail batches responsive; repeated copies reuse one exact QR.
  for (let index = 0; index < requests.length; index += 6) {
    await awaitQrBatchWork(Promise.all(requests.slice(index, index + 6).map(async request => {
      const svg = await renderQr(request.code, settings.sideMm); current();
      images[request.code] = svgDataUrl(svg);
    })), signal); current();
  }
  const finalIdentity = await awaitQrBatchWork(readIdentity(), signal); current();
  if (!finalIdentity || finalIdentity.id !== identity.id) throw new DOMException("The signed-in account changed.", "AbortError");
  return { plan, images, ownerId: identity.id };
}
