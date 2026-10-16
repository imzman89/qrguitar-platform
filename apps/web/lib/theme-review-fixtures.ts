import { lstat, open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { defaultQrStyle, type DemoInstrument } from "./local-demo";
import type { PublicCollectionSettings } from "./public-collections";

export type ThemeReviewFixtures = {
  instruments: DemoInstrument[];
  collections: Array<PublicCollectionSettings & { ownerId: string }>;
};

const LIMIT = 256 * 1024;
const invalid = () => new Error("Invalid theme review fixtures.");
const instrumentNotice = "Synthetic demo instrument for isolated theme review; not a real customer record.";
const collectionNotice = "Synthetic demo collection for isolated theme review; not a real business or customer account.";

function object(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) throw invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown, max = 160, empty = false): string {
  if (typeof value !== "string" || value.length > max || (!empty && !value) ||
      value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) throw invalid();
  return value;
}

function media(value: unknown): string {
  const path = text(value);
  if (!/^\/review-content\/demo-[A-Za-z0-9_-]+\.png$/.test(path)) throw invalid();
  return path;
}

export async function readThemeReviewFixtures(): Promise<ThemeReviewFixtures | null> {
  const filename = process.env.QRGUITAR_THEME_REVIEW_FIXTURES;
  if (filename === undefined) return null;
  // This guard precedes every filesystem operation, including metadata reads.
  try {
    const site = new URL(process.env.NEXT_PUBLIC_SITE_URL || "");
    if (process.env.QRGUITAR_BUILD_ENV !== "isolated-local" ||
        process.env.QRGUITAR_LOCAL_REVIEW !== "build" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(site.hostname) ||
        !["http:", "https:"].includes(site.protocol) || site.username || site.password ||
        !isAbsolute(filename) || !/\.json$/i.test(filename) || filename.includes("\0")) {
      throw invalid();
    }
  } catch {
    throw new Error("Theme review fixtures require the isolated local review runtime.");
  }

  try {
    const before = await lstat(filename);
    if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > LIMIT) throw invalid();
    const file = await open(filename, "r");
    let bytes: Buffer;
    try {
      const opened = await file.stat();
      if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino ||
          opened.size !== before.size || opened.mtimeMs !== before.mtimeMs) throw invalid();
      // Bound allocation AND reads, including a file that grows after the size check.
      const buffer = Buffer.alloc(LIMIT + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      const after = await file.stat();
      if (length !== opened.size || length > LIMIT || after.size !== opened.size ||
          after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw invalid();
      bytes = buffer.subarray(0, length);
    } finally {
      await file.close();
    }
    const root = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      ["schema", "instruments", "collections"]);
    if (root.schema !== "qrguitar-theme-demo/r1" || !Array.isArray(root.instruments) ||
        root.instruments.length < 1 || root.instruments.length > 12 ||
        !Array.isArray(root.collections) || root.collections.length > 4) throw invalid();

    const handles = new Set<string>();
    const collections = root.collections.map((value): PublicCollectionSettings & { ownerId: string } => {
      const raw = object(value, ["enabled", "handle", "publicName", "accountType", "ownerId",
        "allowIndexing", "allowMessages", "allowWarrantyHelp", "websiteUrl", "avatarUrl", "warrantyHelpUrl"]);
      const handle = text(raw.handle, 40);
      const publicName = text(raw.publicName);
      const accountType = raw.accountType;
      if (!/^demo-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle) || handles.has(handle) ||
          !publicName.startsWith("Demo ") || raw.enabled !== true || raw.ownerId !== "demo:" + handle ||
          (accountType !== "builder" && accountType !== "shop" && accountType !== "luthier" && accountType !== "collector") ||
          raw.allowIndexing !== false || raw.allowMessages !== false || raw.allowWarrantyHelp !== false ||
          raw.websiteUrl !== "" || raw.avatarUrl !== "" || raw.warrantyHelpUrl !== "") throw invalid();
      handles.add(handle);
      return { enabled: true, handle, publicName, accountType, ownerId: "demo:" + handle,
        bio: collectionNotice, location: "", websiteUrl: "", avatarUrl: "", warrantyHelpUrl: "",
        allowIndexing: false, allowMessages: false, allowWarrantyHelp: false };
    });

    const codes = new Set<string>();
    const instruments = root.instruments.map((value): DemoInstrument => {
      // Omitted identity, documents, history, service and trust keys are forbidden,
      // even when null, empty or false. Never spread untrusted fixture objects.
      const raw = object(value, ["qrCode", "name", "brand", "model", "year", "instrumentType",
        "createdAt", "visibility", "saleStatus", "collectionHandle", "heroImageDataUrl", "galleryImageDataUrls",
        "finish", "bodyWood", "neckWood", "pickups"]);
      const qrCode = text(raw.qrCode, 80);
      const name = text(raw.name);
      const createdAt = text(raw.createdAt, 24);
      if (!/^QRG-DEMO-[A-Z0-9-]+$/.test(qrCode) || codes.has(qrCode) || !name.startsWith("Demo ") ||
          raw.visibility !== "public" || raw.saleStatus !== "not_for_sale" ||
          !Number.isFinite(Date.parse(createdAt)) || new Date(createdAt).toISOString() !== createdAt) throw invalid();
      codes.add(qrCode);
      const collection = raw.collectionHandle === undefined ? undefined :
        collections.find(item => item.handle === text(raw.collectionHandle, 40));
      if (raw.collectionHandle !== undefined && !collection) throw invalid();
      const gallery = raw.galleryImageDataUrls === undefined ? [] : raw.galleryImageDataUrls;
      if (!Array.isArray(gallery) || gallery.length > 12) throw invalid();
      return {
        qrCode, permanentPath: "/i/" + encodeURIComponent(qrCode), name,
        brand: text(raw.brand), model: text(raw.model), year: text(raw.year, 16, true),
        instrumentType: text(raw.instrumentType), createdAt,
        serial: "", owner: collection?.publicName || "Demo collection", location: "", summary: instrumentNotice,
        qrStyle: { ...defaultQrStyle }, visibility: "public", saleStatus: "not_for_sale",
        publicReviewSnapshot: true, verificationStatus: "unverified", authenticityStatus: "unconfirmed",
        showVerificationBadge: false, showAuthenticityBadge: false, showSerialPublic: false,
        heroImageDataUrl: raw.heroImageDataUrl === undefined ? undefined : media(raw.heroImageDataUrl),
        galleryImageDataUrls: gallery.map(media),
        finish: raw.finish === undefined ? undefined : text(raw.finish),
        bodyWood: raw.bodyWood === undefined ? undefined : text(raw.bodyWood),
        neckWood: raw.neckWood === undefined ? undefined : text(raw.neckWood),
        pickups: raw.pickups === undefined ? undefined : text(raw.pickups),
        ...(collection ? { publicCollection: { handle: collection.handle, publicName: collection.publicName,
          accountType: collection.accountType, bio: collectionNotice, location: "", websiteUrl: "", avatarUrl: "",
          allowMessages: false } } : {})
      };
    });
    return { instruments, collections };
  } catch {
    // Never disclose the configured path, OS error, file bytes or parser details.
    throw invalid();
  }
}
