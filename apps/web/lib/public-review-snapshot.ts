import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { DemoInstrument } from "./local-demo";
import { sanitizePublicInstrument } from "./instrument-profile-contract";
import { normalizePublicProfileCode, isRetiredPublicProfileCode } from "./public-profile-eligibility";

const sourceOrigin = "https://www.qrguitar.com";

export async function readPublicReviewState(): Promise<{ instruments: DemoInstrument[]; workflowCodes: string[] } | null> {
  const filename = process.env.QRGUITAR_PUBLIC_REVIEW_SNAPSHOT;
  if (!filename) return null;

  const site = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://invalid.example");
  if (process.env.QRGUITAR_BUILD_ENV !== "isolated-local" ||
      process.env.QRGUITAR_LOCAL_REVIEW !== "build" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(site.hostname) ||
      !["http:", "https:"].includes(site.protocol) || !isAbsolute(filename)) {
    throw new Error("Public review snapshot requires the isolated local review runtime.");
  }

  const bytes = await readFile(filename);
  if (bytes.length > 2 * 1024 * 1024) throw new Error("Public review snapshot is too large.");
  const snapshot = JSON.parse(bytes.toString("utf8"));
  if (snapshot?.sourceOrigin !== sourceOrigin ||
      typeof snapshot.capturedAt !== "string" || !Number.isFinite(Date.parse(snapshot.capturedAt)) ||
      !Array.isArray(snapshot.instruments) || !snapshot.instruments.length ||
      snapshot.instruments.length > 100) throw new Error("Invalid public review snapshot.");

  const codes = new Set<string>();
  const mediaUrl = (value: string) => {
    if (typeof value !== "string" || !value) throw new Error("Invalid snapshot media URL.");
    if (/^\/review-content\/[a-zA-Z0-9/_-]+\.(?:webp|png|jpe?g|gif|avif|pdf)$/.test(value)) return value;
    const url = new URL(value, sourceOrigin);
    if (url.origin !== sourceOrigin || url.username || url.password ||
        !url.pathname.startsWith("/api/public-file/")) throw new Error("Unexpected snapshot media origin.");
    return url.href;
  };

  const instruments = snapshot.instruments.map((raw: DemoInstrument) => {
    const code = normalizePublicProfileCode(raw?.qrCode);
    if (!code || raw.qrCode !== code || isRetiredPublicProfileCode(code) || codes.has(code) ||
        raw.visibility !== "public" || raw.recordId || raw.ownerUserEmail || raw.publicCollection ||
        !["name", "brand", "model", "year", "instrumentType", "createdAt"].every(key =>
          typeof (raw as unknown as Record<string, unknown>)[key] === "string")) {
      throw new Error("Snapshot must contain distinct public Profiles without local owner identities.");
    }
    codes.add(code);
    const record = sanitizePublicInstrument(raw);
    delete record.recordId;
    delete record.ownerUserEmail;
    delete record.publicCollection;

    return {
      ...record,
      permanentPath: "/i/" + encodeURIComponent(code),
      publicReviewSnapshot: true as const,
      heroImageDataUrl: raw.heroImageDataUrl ? mediaUrl(raw.heroImageDataUrl) : undefined,
      galleryImageDataUrls: (raw.galleryImageDataUrls || []).map(mediaUrl),
      documentFiles: (record.documentFiles || []).map(document => ({
        ...document, url: mediaUrl(document.url)
      }))
    };
  });
  const workflowCodes: unknown = snapshot.localWorkflowCodes ?? [];
  if (!Array.isArray(workflowCodes) || workflowCodes.length > 10 ||
      workflowCodes.some(code => typeof code !== "string" || !codes.has(code)) ||
      new Set(workflowCodes).size !== workflowCodes.length) {
    throw new Error("Local workflow codes must identify distinct existing snapshot Profiles.");
  }
  return { instruments, workflowCodes: workflowCodes as string[] };
}

export async function readPublicReviewSnapshot(): Promise<DemoInstrument[] | null> {
  const review = await readPublicReviewState();
  // An explicitly selected local workflow reads its current database record.
  // Never fall back to an older public snapshot after removal or privacy changes.
  return review ? review.instruments.filter(record => !review.workflowCodes.includes(record.qrCode)) : null;
}
