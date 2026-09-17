import { randomUUID } from "node:crypto";

export type SavedMedia = {
  id: string; storage_path: string; alt: string; sort_order: number;
};
export type SavedDocument = {
  id: string; name: string; storage_path: string; is_public: boolean; updated_at: string;
  document_type: string | null; public_description: string | null; private_notes: string | null;
  issuer_source: string | null; document_date: string | null; description: string | null;
  related_timeline_event_id: string | null; related_service_event_id: string | null;
  mime_type: string | null; file_size_bytes: number | null;
};

export class ProfileSaveError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "invalid_profile") { super(message); }
}

type Upload = { bytes: Buffer; mimeType: string; extension: string };
type PreparedSource = { path: string; upload?: Upload };
type PreparedDocument = {
  id: string | null; name: string; storage_path: string; is_public: boolean;
  document_type: string; public_description: string; private_notes: string;
  issuer_source: string; document_date: string; description: string;
  related_timeline_event_id: string; related_service_event_id: string;
  mime_type: string | null; file_size_bytes: number | null; upload?: Upload;
};

function text(value: unknown, limit: number, label: string) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > limit) throw new ProfileSaveError(`${label} is invalid or too long.`);
  return value.trim();
}
function list(value: unknown, limit: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > limit) throw new ProfileSaveError(`${label} must contain no more than ${limit} items.`);
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProfileSaveError("Invalid document.");
  return value as Record<string, unknown>;
}
function decodeUpload(source: string, kind: "image" | "document"): Upload {
  const limit = (kind === "image" ? 12 : 25) * 1024 * 1024;
  if (source.length > Math.ceil(limit / 3) * 4 + 100) throw new ProfileSaveError(`This ${kind} file is too large.`);
  const match = /^data:(image\/jpeg|image\/png|image\/webp|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
  if (!match || (kind === "image" && match[1] === "application/pdf")) {
    throw new ProfileSaveError(kind === "image" ? "Only JPG, PNG, and WEBP photos are supported." : "Only PDF, JPG, PNG, and WEBP documents are supported.");
  }
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > limit || bytes.toString("base64").replace(/=+$/, "") !== match[2].replace(/=+$/, "")) {
    throw new ProfileSaveError(`The ${kind} upload is incomplete or invalid.`);
  }
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[match[1]]!;
  return { bytes, mimeType: match[1], extension };
}

// Match complete bucket paths on our own Storage origin, never substrings or query values.
export function existingAssetPath(source: string, paths: string[], bucket: string, supabaseUrl: string) {
  if (paths.includes(source)) return source;
  try {
    const url = new URL(source);
    if (url.origin !== new URL(supabaseUrl).origin) return "";
    const pathname = decodeURIComponent(url.pathname);
    const prefixes = [
      `/storage/v1/object/public/${bucket}/`, `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`, `/storage/v1/render/image/public/${bucket}/`
    ];
    for (const prefix of prefixes) {
      if (pathname.startsWith(prefix)) {
        const path = pathname.slice(prefix.length);
        return paths.includes(path) ? path : "";
      }
    }
  } catch { /* Invalid or malformed URLs are rejected by the caller. */ }
  return "";
}

export async function prepareProfileAssets(options: {
  body: { photos?: unknown; heroImageDataUrl?: unknown; heroImagePath?: unknown; documents?: unknown };
  ownerId: string; guitarId: string; currentHeroPath: string | null; supabaseUrl: string;
  existingMedia: SavedMedia[]; existingDocuments: SavedDocument[];
  upload: (bucket: string, path: string, bytes: Buffer, mimeType: string) => Promise<void>;
}) {
  const { body, ownerId, guitarId, existingMedia, existingDocuments, currentHeroPath, supabaseUrl, upload } = options;
  const suppliedPhotos = list(body.photos, 20, "Photos").map((source) => {
    if (typeof source !== "string" || !source.trim()) throw new ProfileSaveError("A photo is missing. Add it again before saving.");
    return source.trim();
  });
  const hero = body.heroImagePath ?? body.heroImageDataUrl ?? suppliedPhotos[0];
  if (typeof hero !== "string") throw new ProfileSaveError("Choose a main photo.");
  const sources = Array.from(new Set([hero.trim() || suppliedPhotos[0], ...suppliedPhotos].filter(Boolean)));
  if (!sources.length || sources.length > 20) throw new ProfileSaveError("Every Profile needs between 1 and 20 photos.");
  const mediaPaths = [...existingMedia.map((row) => row.storage_path), ...(currentHeroPath ? [currentHeroPath] : [])];
  const photoPlans: PreparedSource[] = sources.map((source) => {
    if (source.startsWith("data:")) {
      const parsed = decodeUpload(source, "image");
      return { path: `${ownerId}/${guitarId}/media-${randomUUID()}.${parsed.extension}`, upload: parsed };
    }
    const path = existingAssetPath(source, mediaPaths, "instrument-media", supabaseUrl);
    if (!path) throw new ProfileSaveError("A photo could not be matched to this Profile. Reload or upload it again.");
    return { path };
  });
  const documentPlans: PreparedDocument[] = [];
  const documents = body.documents === undefined ? existingDocuments.map((document) => ({
    ...document, storagePath: document.storage_path, documentType: document.document_type,
    publicDescription: document.public_description, privateNotes: document.private_notes,
    issuerSource: document.issuer_source, documentDate: document.document_date, description: document.description,
    relatedTimelineEventId: document.related_timeline_event_id, relatedServiceEventId: document.related_service_event_id,
    visibility: document.is_public ? "public" : "hidden"
  })) : list(body.documents, 10, "Documents");
  for (const raw of documents) {
    const document = object(raw);
    const source = document.storagePath ?? document.dataUrl ?? document.url ?? "";
    if (typeof source !== "string") throw new ProfileSaveError("Invalid document source.");
    let existing: SavedDocument | undefined;
    let parsed: Upload | undefined;
    let path = "";
    if (source.startsWith("data:")) {
      parsed = decodeUpload(source, "document");
      path = `${ownerId}/${guitarId}/document-${randomUUID()}.${parsed.extension}`;
    } else {
      path = existingAssetPath(source, existingDocuments.map((row) => row.storage_path), "instrument-documents", supabaseUrl);
      existing = path ? existingDocuments.find((row) => row.storage_path === path) : undefined;
      // Legacy callers can omit a URL, but a name must identify exactly one existing document.
      if (!source && !existing) {
        const matches = existingDocuments.filter((row) => row.name === document.name);
        if (matches.length === 1) { existing = matches[0]; path = existing.storage_path; }
      }
      if (!existing) throw new ProfileSaveError("A document could not be matched to this Profile. Reload or upload it again.");
    }
    const metadata = (key: string, old: string | null | undefined, max: number) => text(
      document[key] === undefined ? old : document[key], max, key
    );
    const documentDate = metadata("documentDate", existing?.document_date, 10);
    if (documentDate && (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate) || (Number.isNaN(Date.parse(documentDate)) || new Date(documentDate).toISOString().slice(0, 10) !== documentDate))) {
      throw new ProfileSaveError("Choose a valid document date.");
    }
    const relatedTimelineEventId = metadata("relatedTimelineEventId", existing?.related_timeline_event_id, 36);
    const relatedServiceEventId = metadata("relatedServiceEventId", existing?.related_service_event_id, 36);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if ([relatedTimelineEventId, relatedServiceEventId].some((id) => id && !uuid.test(id))) {
      throw new ProfileSaveError("Choose a valid related timeline or service event.");
    }
    if (document.visibility !== undefined && document.visibility !== "public" && document.visibility !== "hidden") {
      throw new ProfileSaveError("Choose public or private document visibility.");
    }
    documentPlans.push({
      id: existing?.id || null, storage_path: path,
      name: text(document.name ?? existing?.name, 200, "Document name") || "Document",
      is_public: document.visibility === undefined ? existing?.is_public === true : document.visibility === "public",
      document_type: metadata("documentType", existing?.document_type, 80) || "Other",
      public_description: metadata("publicDescription", existing?.public_description, 1000),
      private_notes: metadata("privateNotes", existing?.private_notes, 2000),
      issuer_source: metadata("issuerSource", existing?.issuer_source, 200),
      document_date: documentDate, description: metadata("description", existing?.description, 1000),
      related_timeline_event_id: relatedTimelineEventId, related_service_event_id: relatedServiceEventId,
      mime_type: existing?.mime_type || parsed?.mimeType || null,
      file_size_bytes: existing?.file_size_bytes ?? parsed?.bytes.length ?? null, upload: parsed
    });
  }
  if (new Set(documentPlans.map((document) => document.storage_path)).size !== documentPlans.length) {
    throw new ProfileSaveError("A document was submitted more than once.");
  }

  // Every transform and metadata validation above finishes before any upload or database write.
  // Upload to new, unique paths. Never delete existing files, including on ambiguous RPC failures.
  for (const photo of photoPlans) {
    if (photo.upload) await upload("instrument-media", photo.path, photo.upload.bytes, photo.upload.mimeType);
  }
  for (const document of documentPlans) {
    if (document.upload) await upload("instrument-documents", document.storage_path, document.upload.bytes, document.upload.mimeType);
  }
  const uniquePhotoPlans = [...new Map(photoPlans.map((photo) => [photo.path, photo])).values()];
  return {
    heroImagePath: photoPlans[0].path,
    media: uniquePhotoPlans.map((photo, index) => {
      const existing = existingMedia.find((row) => row.storage_path === photo.path);
      return { id: existing?.id || null, storage_path: photo.path, alt: existing?.alt || `Instrument media ${index + 1}`, sort_order: index };
    }),
    documents: documentPlans.map(({ upload: _upload, ...document }) => document),
    expectedMedia: existingMedia.map(({ id, storage_path, sort_order }) => ({ id, storage_path, sort_order })),
    expectedDocuments: existingDocuments.map(({ id, updated_at }) => ({ id, updated_at }))
  };
}

export function profileSaveFailure(error: { code?: string; message?: string } | null) {
  if (error?.code === "PGRST202" || error?.code === "42883") {
    return { status: 503, code: "profile_save_unavailable", message: "Profile saving is temporarily unavailable. Your existing Profile has not been replaced." };
  }
  if (error?.code === "PT409" || error?.code === "40001") return { status: 409, code: "profile_changed", message: "This Profile changed while you were saving. Reload it before trying again." };
  if (error?.code === "42501") return { status: 403, code: "profile_save_forbidden", message: "This Profile can no longer be edited by this account." };
  if (error?.code === "P0002") return { status: 404, code: "profile_not_found", message: "QRguitar Profile was not found." };
  if (error?.code === "23505") return { status: 409, code: "profile_identity_conflict", message: "The Serial Number, QR link, or trust settings conflict with an existing Profile. Admin review is required." };
  if (error?.code === "22023" || error?.code === "22007" || error?.code === "22008" || error?.code === "22P02") {
    return { status: 400, code: "invalid_profile", message: error.message || "Check the profile details and try again." };
  }
  return { status: 502, code: "profile_save_unconfirmed", message: "We could not confirm the save. Reload the Profile to check its current state before trying again." };
}


