import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient, getAuthenticatedUser, getSupabaseEnvStatus } from "../../../lib/supabase-server";
import { defaultQrStyle, type DemoInstrument, type QrStyle } from "../../../lib/local-demo";

const MEDIA_BUCKET = "instrument-media";
const DOCUMENT_BUCKET = "instrument-documents";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

type AccountPlan = "free" | "paid" | "brand" | "commercial";

type SupabasePlan = "single" | "pack_10" | "pack_25" | "bulk_50" | "business" | "enterprise";

type CreateInstrumentRequest = {
  name?: string;
  brand: string;
  model: string;
  serial: string;
  year: string;
  instrumentType?: string;
  builder?: string;
  finish?: string;
  condition: "new" | "used";
  ownerName: string;
  ownerEmail?: string;
  location: string;
  visibility: "public" | "private" | "unlisted";
  summary: string;
  photos: string[];
  heroImageDataUrl?: string;
  documents?: Array<{ name: string; dataUrl: string; visibility?: "public" | "hidden" }>;
  customFields?: Array<{ label: string; value: string }>;
  accountPlan?: AccountPlan;
};

type UpdateInstrumentRequest = Omit<CreateInstrumentRequest, "accountPlan"> & {
  qrCode: string;
};

type SupabaseCreateResponse = {
  ok: boolean;
  qrCode?: string;
  permanentPath?: string;
  message?: string;
};

type SupabaseReadResponse = {
  ok: boolean;
  instrument?: DemoInstrument;
  instruments?: DemoInstrument[];
  count?: number;
  message?: string;
};

type LoadRecordsResult = {
  records: DemoInstrument[];
  ownerEmail?: string;
  ownerName?: string;
  error?: string;
};

type GuitarRow = {
  id: string;
  owner_id: string | null;
  qr_code: string;
  permanent_path: string;
  name: string;
  brand: string;
  model: string | null;
  year: string | null;
  serial_number: string | null;
  builder: string | null;
  location: string | null;
  status: string;
  visibility: string;
  summary: string;
  hero_image_path: string | null;
  created_at: string;
};

type GuitarMediaRow = {
  guitar_id: string;
  storage_path: string;
};

type GuitarDocumentRow = {
  guitar_id: string;
  name: string;
  storage_path: string;
  is_public: boolean;
};

type GuitarSpecRow = {
  guitar_id: string;
  label: string;
  value: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

function supabaseUnavailableResponse(action: "read" | "write") {
  const status = getSupabaseEnvStatus();
  const missing = status.missing.length ? status.missing.join(", ") : "Supabase server configuration";
  const message = isProductionRuntime()
    ? "QRguitar records are temporarily unavailable."
    : `Supabase is not configured for ${action}. Missing: ${missing}. Add the values to apps/web/.env.local locally and Vercel Environment Variables in production.`;

  return NextResponse.json(
    { ok: false, instruments: [], count: 0, message } satisfies SupabaseReadResponse,
    { status: isProductionRuntime() ? 200 : 503 }
  );
}

function supabaseReadErrorResponse(message: string) {
  const safeMessage = isProductionRuntime()
    ? "QRguitar records are temporarily unavailable."
    : `Supabase read failed: ${message}`;

  return NextResponse.json(
    { ok: false, instruments: [], count: 0, message: safeMessage } satisfies SupabaseReadResponse,
    { status: isProductionRuntime() ? 200 : 502 }
  );
}

function supabaseWriteUnavailableResponse() {
  const status = getSupabaseEnvStatus();
  const missing = status.missing.length ? status.missing.join(", ") : "Supabase server configuration";
  const message = isProductionRuntime()
    ? "QRguitar records are temporarily unavailable."
    : `Supabase is not configured for write. Missing: ${missing}. Add the values to apps/web/.env.local locally and Vercel Environment Variables in production.`;

  return NextResponse.json({ ok: false, message } satisfies SupabaseCreateResponse, { status: 503 });
}

function sanitizeCodePart(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 24);
}

function normalizeLookupEmail(value: string) {
  const trimmed = String(value || "").trim().toLowerCase();
  const parts = trimmed.split("@");
  if (parts.length !== 2) {
    return trimmed;
  }

  const localPart = parts[0];
  const domain = parts[1];

  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${localPart.split("+")[0].replace(/\./g, "")}@${domain}`;
  }

  return trimmed;
}

function makeBaseCode(serial: string) {
  const body = sanitizeCodePart(serial);
  if (body) {
    return `QRG-${body}`.slice(0, 32);
  }

  return `QRG-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function nextFreeCode(existing?: string) {
  if (!existing) {
    return `QRG-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
  }

  return `${existing}-${randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

function mapPlan(plan: AccountPlan): SupabasePlan {
  if (plan === "brand" || plan === "commercial") {
    return "business";
  }

  if (plan === "paid") {
    return "pack_25";
  }

  return "single";
}

function isVerifiedPlan(plan: AccountPlan) {
  return plan === "paid" || plan === "brand" || plan === "commercial";
}

function readServerEmailList(key: "QRGUITAR_ADMIN_EMAILS" | "QRGUITAR_BETA_TESTER_EMAILS") {
  return (process.env[key] || "")
    .split(",")
    .map((item) => normalizeLookupEmail(item))
    .filter(Boolean);
}

function hasLaunchTestingAccess(email: string) {
  const normalized = normalizeLookupEmail(email);
  if (!normalized) {
    return false;
  }

  return [...readServerEmailList("QRGUITAR_ADMIN_EMAILS"), ...readServerEmailList("QRGUITAR_BETA_TESTER_EMAILS")].includes(normalized);
}

function coerceAccountPlan(value: string): AccountPlan {
  if (value === "paid" || value === "brand" || value === "commercial" || value === "free") {
    return value;
  }

  return "free";
}

function mapSupabasePlanToAccountPlan(plan?: SupabasePlan | string | null): AccountPlan {
  if (plan === "business" || plan === "enterprise") {
    return "commercial";
  }

  if (plan === "pack_10" || plan === "pack_25" || plan === "bulk_50") {
    return "paid";
  }

  if (plan === "single") {
    return "free";
  }

  return "free";
}

function isDataUrl(value: string) {
  return /^data:[^;]+;base64,/.test(value || "");
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], "base64")
  };
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("png")) {
    return "png";
  }

  if (mimeType.includes("webp")) {
    return "webp";
  }

  return "jpg";
}

function documentExtensionForMimeType(mimeType: string) {
  if (mimeType === "application/pdf") {
    return "pdf";
  }

  if (mimeType === "text/plain") {
    return "txt";
  }

  if (mimeType.includes("png")) {
    return "png";
  }

  if (mimeType.includes("webp")) {
    return "webp";
  }

  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return "jpg";
  }

  return "bin";
}

async function uploadImageSource(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  ownerId: string,
  guitarId: string,
  source: string,
  prefix: string
) {
  if (!isDataUrl(source)) {
    return null;
  }

  const parsed = parseDataUrl(source);
  if (!parsed) {
    return null;
  }

  const objectPath = `${ownerId}/${guitarId}/${prefix}-${randomUUID()}.${documentExtensionForMimeType(parsed.mimeType)}`;
  const upload = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, parsed.bytes, {
    contentType: parsed.mimeType,
    upsert: false
  });

  if (upload.error) {
    throw upload.error;
  }

  return objectPath;
}

async function uploadDocumentSource(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  ownerId: string,
  guitarId: string,
  source: string,
  prefix: string
) {
  if (!isDataUrl(source)) {
    return null;
  }

  const parsed = parseDataUrl(source);
  if (!parsed) {
    return null;
  }

  const objectPath = `${ownerId}/${guitarId}/${prefix}-${randomUUID()}.${documentExtensionForMimeType(parsed.mimeType)}`;
  const upload = await supabase.storage.from(DOCUMENT_BUCKET).upload(objectPath, parsed.bytes, {
    contentType: parsed.mimeType,
    upsert: false
  });

  if (upload.error) {
    throw upload.error;
  }

  return objectPath;
}

async function resolveImageSource(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  source: string
) {
  if (!source || source.startsWith("http://") || source.startsWith("https://") || source.startsWith("data:")) {
    return source;
  }

  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(source, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl || source;
}

function isRenderablePublicMediaSource(source: string) {
  return /^(https?:|data:|blob:|\/)/i.test(source || "");
}

function publicSummary(value?: string | null) {
  const summary = String(value || "").trim();
  if (!summary) {
    return "";
  }

  if (/\b(buy now|checkout|check out the full listing|view listing)\b/i.test(summary)) {
    return "Public QRguitar record with photos, specs, and instrument details.";
  }

  return summary;
}

async function resolveDocumentSource(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  source: string
) {
  if (!source || source.startsWith("http://") || source.startsWith("https://") || source.startsWith("data:")) {
    return source;
  }

  const { data } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(source, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl || source;
}

async function resolveImageSources(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  sources: string[]
) {
  return Promise.all(Array.from(new Set(sources.filter(Boolean))).map((source) => resolveImageSource(supabase, source)));
}

async function mapExistingMediaSource(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  rows: GuitarMediaRow[],
  source: string
) {
  if (!source || isDataUrl(source)) {
    return "";
  }

  if (rows.some((row) => row.storage_path === source)) {
    return source;
  }

  const decodedSource = decodeURIComponent(source);
  const pathFromUrl = rows.find((row) => decodedSource.includes(row.storage_path));
  if (pathFromUrl) {
    return pathFromUrl.storage_path;
  }

  for (const row of rows) {
    const signedUrl = await resolveImageSource(supabase, row.storage_path);
    if (source === signedUrl) {
      return row.storage_path;
    }
  }

  return "";
}

async function resolveDocumentSources(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  documents: GuitarDocumentRow[]
) {
  return Promise.all(
    documents.map(async (document) => ({
      name: document.name,
      url: await resolveDocumentSource(supabase, document.storage_path),
      visibility: document.is_public ? "public" as const : "hidden" as const
    }))
  );
}

function instrumentConditionFromSpec(specs: GuitarSpecRow[]) {
  const condition = specs.find((spec) => spec.label.trim().toLowerCase() === "condition")?.value?.trim().toLowerCase();
  return condition === "new" ? "new" : "used";
}

function specValue(specs: GuitarSpecRow[], label: string) {
  return specs.find((spec) => spec.label.trim().toLowerCase() === label.toLowerCase())?.value?.trim() || "";
}

function mapInstrumentRow({
  guitar,
  media,
  specs,
  ownerEmail,
  ownerName
}: {
  guitar: GuitarRow;
  media: GuitarMediaRow[];
  specs: GuitarSpecRow[];
  ownerEmail?: string;
  ownerName?: string;
}): DemoInstrument {
  const customFields = specs
    .filter((spec) => {
      const label = spec.label.trim().toLowerCase();
      return spec.label.trim() && !["condition", "type", "finish"].includes(label);
    })
    .map((spec, index) => ({
      id: `${guitar.id}-spec-${index}`,
      label: spec.label,
      value: spec.value
    }));

  const demoHeroFallback = guitar.qr_code?.toUpperCase() === "QRG-PI260001" ? "/media/reptile-hero.jpg" : "";
  const heroImageDataUrl = guitar.hero_image_path || media[0]?.storage_path || demoHeroFallback;
  const galleryImageDataUrls = Array.from(
    new Set([heroImageDataUrl, ...media.map((item) => item.storage_path)].filter(isRenderablePublicMediaSource))
  );

  return {
    qrCode: guitar.qr_code.toUpperCase(),
    permanentPath: guitar.permanent_path || `/i/${guitar.qr_code.toUpperCase()}`,
    name: guitar.name || [guitar.brand, guitar.model].filter(Boolean).join(" ") || guitar.qr_code,
    brand: guitar.brand || "",
    model: guitar.model || "",
    serial: guitar.serial_number || "",
    year: guitar.year || "",
    instrumentCondition: instrumentConditionFromSpec(specs),
    creatorAccountType: "customer",
    packageIncludesFirstTransfer: false,
    verificationStatus: guitar.status === "verified" ? "verified" : "unverified",
    instrumentType: specValue(specs, "Type") || guitar.model || "",
    builder: guitar.builder || specValue(specs, "Builder"),
    owner: ownerName || ownerEmail || "Unclaimed",
    ownerUserEmail: ownerEmail,
    location: guitar.location || "",
    visibility: guitar.visibility === "private" ? "private" : guitar.visibility === "unlisted" ? "unlisted" : "public",
    summary: publicSummary(guitar.summary),
    finish: specValue(specs, "Finish"),
    heroImageDataUrl,
    galleryImageDataUrls,
    customFields,
    customLinks: [],
    qrStyle: defaultQrStyle as QrStyle,
    createdAt: guitar.created_at
  };
}

function stripAnonymousInstrumentFields(instrument: DemoInstrument) {
  const publicInstrument = { ...instrument };
  delete publicInstrument.ownerUserEmail;
  return publicInstrument;
}

async function loadRecordsForUser(supabase: ReturnType<typeof createServerSupabaseClient>, owner: User): Promise<LoadRecordsResult> {
  if (!supabase) {
    return { records: [], ownerEmail: owner.email || "", ownerName: "", error: "Supabase is not configured." };
  }

  const profile = await supabase.from("profiles").select("id,display_name").eq("id", owner.id).maybeSingle<ProfileRow>();
  const guitars = await supabase.from("guitars").select("*").eq("owner_id", owner.id).order("created_at", { ascending: false });

  if (profile.error) {
    return { records: [], ownerEmail: owner.email || "", ownerName: owner.email || "", error: profile.error.message };
  }

  if (guitars.error) {
    return { records: [], ownerEmail: owner.email || "", ownerName: profile.data?.display_name || owner.email || "", error: guitars.error.message };
  }

  if (!guitars.data) {
    return { records: [], ownerEmail: owner.email || "", ownerName: profile.data?.display_name || owner.email || "" };
  }

  const guitarIds = guitars.data.map((item) => item.id);
  const [mediaResult, specsResult, documentsResult] = await Promise.all([
    guitarIds.length
      ? supabase.from("guitar_media").select("guitar_id,storage_path").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null }),
    guitarIds.length
      ? supabase.from("guitar_specs").select("guitar_id,label,value").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null }),
    guitarIds.length
      ? supabase.from("guitar_documents").select("guitar_id,name,storage_path,is_public").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  const relatedError = mediaResult.error || specsResult.error || documentsResult.error;
  if (relatedError) {
    return {
      records: [],
      ownerEmail: owner.email || "",
      ownerName: profile.data?.display_name || owner.email || "",
      error: relatedError.message
    };
  }

  const mediaByGuitar = new Map<string, GuitarMediaRow[]>();
  for (const item of mediaResult.data || []) {
    const row = item as GuitarMediaRow;
    const list = mediaByGuitar.get(row.guitar_id) || [];
    list.push(row);
    mediaByGuitar.set(row.guitar_id, list);
  }

  const specsByGuitar = new Map<string, GuitarSpecRow[]>();
  for (const item of specsResult.data || []) {
    const row = item as GuitarSpecRow;
    const list = specsByGuitar.get(row.guitar_id) || [];
    list.push(row);
    specsByGuitar.set(row.guitar_id, list);
  }

  const documentsByGuitar = new Map<string, GuitarDocumentRow[]>();
  for (const item of documentsResult.data || []) {
    const row = item as GuitarDocumentRow;
    const list = documentsByGuitar.get(row.guitar_id) || [];
    list.push(row);
    documentsByGuitar.set(row.guitar_id, list);
  }

  return {
    records: await Promise.all(
      guitars.data.map(async (guitar) => {
        const heroStoragePath = (guitar as GuitarRow).hero_image_path || "";
        const media = await resolveImageSources(
          supabase,
          (mediaByGuitar.get(guitar.id) || [])
            .map((item) => item.storage_path)
            .filter((storagePath) => storagePath !== heroStoragePath)
        );
        const heroImagePath = heroStoragePath ? await resolveImageSource(supabase, heroStoragePath) : "";
        const documents = await resolveDocumentSources(supabase, documentsByGuitar.get(guitar.id) || []);

        const instrument = mapInstrumentRow({
          guitar: { ...(guitar as GuitarRow), hero_image_path: heroImagePath || (guitar as GuitarRow).hero_image_path },
          media: media.map((storagePath) => ({ guitar_id: guitar.id, storage_path: storagePath })),
          specs: specsByGuitar.get(guitar.id) || [],
          ownerEmail: owner.email || "",
          ownerName: profile.data?.display_name || owner.user_metadata?.display_name || owner.email || ""
        });
        instrument.documentFiles = documents;
        return instrument;
      })
    ),
    ownerEmail: owner.email || "",
    ownerName: profile.data?.display_name || owner.user_metadata?.display_name || owner.email || ""
  };
}

async function loadPublicRecords(supabase: ReturnType<typeof createServerSupabaseClient>): Promise<LoadRecordsResult> {
  if (!supabase) {
    return { records: [] as DemoInstrument[], error: "Supabase is not configured." };
  }

  const guitars = await supabase
    .from("guitars")
    .select("*")
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  if (guitars.error) {
    return { records: [] as DemoInstrument[], error: guitars.error.message };
  }

  if (!guitars.data) {
    return { records: [] as DemoInstrument[] };
  }

  const guitarIds = guitars.data.map((item) => item.id);
  const [mediaResult, specsResult, documentsResult, profilesResult] = await Promise.all([
    guitarIds.length
      ? supabase.from("guitar_media").select("guitar_id,storage_path").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null }),
    guitarIds.length
      ? supabase.from("guitar_specs").select("guitar_id,label,value").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null }),
    guitarIds.length
      ? supabase.from("guitar_documents").select("guitar_id,name,storage_path,is_public").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null }),
    guitarIds.length
      ? supabase.from("profiles").select("id,display_name").in("id", guitars.data.map((item) => item.owner_id).filter(Boolean) as string[])
      : Promise.resolve({ data: [], error: null })
  ]);

  const relatedError = mediaResult.error || specsResult.error || documentsResult.error || profilesResult.error;
  if (relatedError) {
    return { records: [] as DemoInstrument[], error: relatedError.message };
  }

  const mediaByGuitar = new Map<string, GuitarMediaRow[]>();
  for (const item of mediaResult.data || []) {
    const row = item as GuitarMediaRow;
    const list = mediaByGuitar.get(row.guitar_id) || [];
    list.push(row);
    mediaByGuitar.set(row.guitar_id, list);
  }

  const specsByGuitar = new Map<string, GuitarSpecRow[]>();
  for (const item of specsResult.data || []) {
    const row = item as GuitarSpecRow;
    const list = specsByGuitar.get(row.guitar_id) || [];
    list.push(row);
    specsByGuitar.set(row.guitar_id, list);
  }

  const documentsByGuitar = new Map<string, GuitarDocumentRow[]>();
  for (const item of documentsResult.data || []) {
    const row = item as GuitarDocumentRow;
    const list = documentsByGuitar.get(row.guitar_id) || [];
    list.push(row);
    documentsByGuitar.set(row.guitar_id, list);
  }

  const profilesById = new Map<string, ProfileRow>();
  for (const item of profilesResult.data || []) {
    const row = item as ProfileRow;
    profilesById.set(row.id, row);
  }

  return {
    records: await Promise.all(
      guitars.data.map(async (guitar) => {
        const heroStoragePath = (guitar as GuitarRow).hero_image_path || "";
        const media = await resolveImageSources(
          supabase,
          (mediaByGuitar.get(guitar.id) || [])
            .map((item) => item.storage_path)
            .filter((storagePath) => storagePath !== heroStoragePath)
        );
        const heroImagePath = heroStoragePath ? await resolveImageSource(supabase, heroStoragePath) : "";
        const documents = await resolveDocumentSources(supabase, (documentsByGuitar.get(guitar.id) || []).filter((document) => document.is_public));

        const instrument = mapInstrumentRow({
          guitar: { ...(guitar as GuitarRow), hero_image_path: heroImagePath || (guitar as GuitarRow).hero_image_path },
          media: media.map((storagePath) => ({ guitar_id: guitar.id, storage_path: storagePath })),
          specs: specsByGuitar.get(guitar.id) || [],
          ownerEmail: "",
          ownerName: profilesById.get(guitar.owner_id || "")?.display_name || guitar.builder || ""
        });
        instrument.documentFiles = documents;
        return stripAnonymousInstrumentFields(instrument);
      })
    )
  };
}

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return supabaseUnavailableResponse("read");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const scope = url.searchParams.get("scope") || "";

  if (scope === "mine") {
    const auth = await getAuthenticatedUser(request);
    if (!auth.user) {
      return NextResponse.json({ ok: false, instruments: [], count: 0, message: auth.error || "Sign in required." } satisfies SupabaseReadResponse, { status: 401 });
    }

    if (code) {
      const ownerRecord = await loadRecordsForUser(supabase, auth.user);
      if (ownerRecord.error) {
        return supabaseReadErrorResponse(ownerRecord.error);
      }

      const instrument = ownerRecord.records.find((record) => record.qrCode.toUpperCase() === code.toUpperCase());
      if (!instrument) {
        return NextResponse.json({ ok: false, message: "Instrument not found for this account." } satisfies SupabaseReadResponse, { status: 404 });
      }

      return NextResponse.json({ ok: true, instrument } satisfies SupabaseReadResponse, { status: 200 });
    }

    const result = await loadRecordsForUser(supabase, auth.user);
    if (result.error) {
      return supabaseReadErrorResponse(result.error);
    }

    return NextResponse.json(
      { ok: true, instruments: result.records, count: result.records.length } satisfies SupabaseReadResponse,
      { status: 200 }
    );
  }

  if (code) {
    const { data: guitar, error } = await supabase.from("guitars").select("*").eq("qr_code", code.toUpperCase()).maybeSingle<GuitarRow>();
    if (error) {
      return supabaseReadErrorResponse(error.message);
    }

    if (!guitar) {
      return NextResponse.json({ ok: false, message: "Instrument not found." } satisfies SupabaseReadResponse, { status: 404 });
    }

    if (guitar.visibility === "private") {
      return NextResponse.json({ ok: false, message: "This record is private." } satisfies SupabaseReadResponse, { status: 403 });
    }

    const [mediaResult, specsResult, documentsResult, profileResult] = await Promise.all([
      supabase.from("guitar_media").select("guitar_id,storage_path").eq("guitar_id", guitar.id),
      supabase.from("guitar_specs").select("guitar_id,label,value").eq("guitar_id", guitar.id),
      supabase.from("guitar_documents").select("guitar_id,name,storage_path,is_public").eq("guitar_id", guitar.id),
      guitar.owner_id ? supabase.from("profiles").select("id,display_name").eq("id", guitar.owner_id).maybeSingle<ProfileRow>() : Promise.resolve({ data: null, error: null })
    ]);

    const relatedError = mediaResult.error || specsResult.error || documentsResult.error || profileResult.error;
    if (relatedError) {
      return supabaseReadErrorResponse(relatedError.message);
    }

    const heroStoragePath = guitar.hero_image_path || "";
    const media = await resolveImageSources(
      supabase,
      ((mediaResult.data || []) as GuitarMediaRow[])
        .map((item) => item.storage_path)
        .filter((storagePath) => storagePath !== heroStoragePath)
    );
    const heroImagePath = heroStoragePath ? await resolveImageSource(supabase, heroStoragePath) : "";

    const instrument = mapInstrumentRow({
      guitar: { ...guitar, hero_image_path: heroImagePath || guitar.hero_image_path },
      media: media.map((storagePath) => ({ guitar_id: guitar.id, storage_path: storagePath })),
      specs: (specsResult.data || []) as GuitarSpecRow[],
      ownerEmail: "",
      ownerName: profileResult.data?.display_name || guitar.builder || "Unclaimed"
    });

    instrument.documentFiles = await resolveDocumentSources(
      supabase,
      ((documentsResult.data || []) as GuitarDocumentRow[]).filter((document) => document.is_public)
    );

    return NextResponse.json({ ok: true, instrument: stripAnonymousInstrumentFields(instrument) } satisfies SupabaseReadResponse, { status: 200 });
  }

  const publicResult = await loadPublicRecords(supabase);
  if (publicResult.error) {
    return supabaseReadErrorResponse(publicResult.error);
  }

  return NextResponse.json(
    { ok: true, instruments: publicResult.records, count: publicResult.records.length } satisfies SupabaseReadResponse,
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return supabaseWriteUnavailableResponse();
  }

  const auth = await getAuthenticatedUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, message: auth.error || "Sign in required." } satisfies SupabaseCreateResponse, { status: 401 });
  }

  let body: CreateInstrumentRequest;

  try {
    body = (await request.json()) as CreateInstrumentRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." } satisfies SupabaseCreateResponse, { status: 400 });
  }

  const input = {
    name: String(body.name || "").trim(),
    brand: String(body.brand || "").trim(),
    model: String(body.model || "").trim(),
    serial: String(body.serial || "").trim(),
    year: String(body.year || "").trim(),
    instrumentType: String(body.instrumentType || "").trim(),
    builder: String(body.builder || "").trim(),
    finish: String(body.finish || "").trim(),
    condition: body.condition === "new" ? "new" : "used",
    ownerName: String(body.ownerName || "").trim(),
    ownerEmail: normalizeLookupEmail(auth.user.email || ""),
    location: String(body.location || "").trim(),
    visibility: body.visibility === "private" ? "private" : body.visibility === "unlisted" ? "unlisted" : "public",
    summary: String(body.summary || "").trim(),
    photos: Array.isArray(body.photos) ? body.photos.slice(0, 20) : [],
    documents: Array.isArray(body.documents) ? body.documents.slice(0, 10) : []
  };

  if (!input.brand || !input.model || !input.serial) {
    return NextResponse.json({ ok: false, message: "Brand, model, and serial are required." }, { status: 400 });
  }

  const ownerUser = auth.user;
  const currentProfile = await supabase.from("profiles").select("plan,role").eq("id", ownerUser.id).maybeSingle<{ plan?: SupabasePlan; role?: string }>();
  if (currentProfile.error) {
    return NextResponse.json({ ok: false, message: "Could not read user profile." }, { status: 500 });
  }

  const resolvedAccountPlan = hasLaunchTestingAccess(ownerUser.email || "")
    ? "commercial"
    : mapSupabasePlanToAccountPlan(currentProfile.data?.plan);
  const profileUpsert = await supabase.from("profiles").upsert({
    id: ownerUser.id,
    display_name: input.ownerName || ownerUser.user_metadata?.display_name || ownerUser.email || "",
    role: (currentProfile.data?.role as "owner" | "builder" | "shop" | "admin") || "owner",
    plan: mapPlan(resolvedAccountPlan),
    created_at: new Date().toISOString()
  });

  if (profileUpsert.error) {
    return NextResponse.json({ ok: false, message: "Could not sync user profile." }, { status: 500 });
  }

  const existingProfileCount = await supabase.from("guitars").select("*", { count: "exact", head: true }).eq("owner_id", ownerUser.id);
  if (existingProfileCount.error) {
    return NextResponse.json({ ok: false, message: "Could not verify user record limit." }, { status: 500 });
  }

  const instrumentCount = existingProfileCount.count ?? 0;
  if (instrumentCount < 0) {
    return NextResponse.json({ ok: false, message: "Could not verify user record limit." }, { status: 500 });
  }

  if (!isVerifiedPlan(resolvedAccountPlan) && instrumentCount >= 25) {
    return NextResponse.json(
      { ok: false, message: "Free public beta accounts can create up to 25 records. Contact QRguitar for commercial setup or bulk onboarding." },
      { status: 402 }
    );
  }

  let qrCode = makeBaseCode(input.serial);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { count } = await supabase.from("guitars").select("id", { count: "exact", head: true }).eq("qr_code", qrCode);
    if (!count) {
      break;
    }

    qrCode = nextFreeCode(qrCode);
  }

  const uploadedSources = Array.from(new Set([body.heroImageDataUrl || "", ...input.photos].filter(Boolean)));
  const uploadedMediaPaths: string[] = [];
  const mediaUploadErrors: string[] = [];
  for (const [index, source] of uploadedSources.entries()) {
    try {
      const uploadedPath = await uploadImageSource(supabase, ownerUser.id, qrCode, source, `media-${index + 1}`);
      if (uploadedPath) {
        uploadedMediaPaths.push(uploadedPath);
      }
    } catch {
      mediaUploadErrors.push(`Photo ${index + 1}`);
    }
  }

  const heroImagePath = uploadedMediaPaths[0] || null;
  const permanentPath = `/i/${qrCode}`;

  const guitarPayload = {
    owner_id: ownerUser.id,
    qr_code: qrCode,
    permanent_path: permanentPath,
    name: input.name || `${input.brand} ${input.model}`.trim(),
    brand: input.brand,
    model: input.model,
    year: input.year || null,
    serial_number: input.serial,
    builder: input.builder || null,
    location: input.location || null,
    status: (isVerifiedPlan(resolvedAccountPlan) ? "verified" : "unverified") as "verified" | "unverified" | "transferred",
    visibility: input.visibility as "public" | "unlisted" | "private",
    summary: input.summary || "",
    hero_image_path: heroImagePath
  };

  const { data: insertedGuitar, error: insertError } = await supabase
    .from("guitars")
    .insert(guitarPayload)
    .select("id,qr_code,permanent_path")
    .single();

  if (insertError || !insertedGuitar) {
    return NextResponse.json(
      { ok: false, message: insertError?.message || "Could not create guitar record." },
      { status: 500 }
    );
  }

  if (uploadedMediaPaths.length > 0) {
    const mediaPayload = uploadedMediaPaths.slice(0, 20).map((storagePath, index) => ({
      guitar_id: insertedGuitar.id,
      storage_path: storagePath.slice(0, 2000),
      alt: `Instrument media ${index + 1}`,
      sort_order: index
    }));

    const mediaInsert = await supabase.from("guitar_media").insert(mediaPayload);
    if (mediaInsert.error) {
      return NextResponse.json(
        { ok: true, qrCode: insertedGuitar.qr_code, permanentPath: insertedGuitar.permanent_path, message: "Saved. Media placeholders could not be saved." },
        { status: 200 }
      );
    }
  }

  const uploadedDocuments: Array<{ name: string; storagePath: string; isPublic: boolean }> = [];
  for (const [index, document] of (body.documents || []).entries()) {
    const uploadedPath = await uploadDocumentSource(supabase, ownerUser.id, insertedGuitar.id, document.dataUrl, `document-${index + 1}`);
    if (uploadedPath) {
      uploadedDocuments.push({
        name: document.name || `Document ${index + 1}`,
        storagePath: uploadedPath,
        isPublic: document.visibility === "public"
      });
    }
  }

  if (uploadedDocuments.length > 0) {
    const documentPayload = uploadedDocuments.map((document) => ({
      guitar_id: insertedGuitar.id,
      name: document.name.slice(0, 200),
      storage_path: document.storagePath.slice(0, 2000),
      is_public: document.isPublic
    }));

    const documentInsert = await supabase.from("guitar_documents").insert(documentPayload);
    if (documentInsert.error) {
      return NextResponse.json(
        { ok: true, qrCode: insertedGuitar.qr_code, permanentPath: insertedGuitar.permanent_path, message: "Saved. Document files could not be saved." },
        { status: 200 }
      );
    }
  }

  const specRows = [
    { guitar_id: insertedGuitar.id, label: "Condition", value: input.condition, sort_order: 1 },
    ...(input.instrumentType ? [{ guitar_id: insertedGuitar.id, label: "Type", value: input.instrumentType, sort_order: 2 }] : []),
    ...(input.finish ? [{ guitar_id: insertedGuitar.id, label: "Finish", value: input.finish, sort_order: 3 }] : []),
    ...(body.customFields || [])
      .filter((field) => String(field.label || "").trim() && String(field.value || "").trim())
      .map((field, index) => ({
        guitar_id: insertedGuitar.id,
        label: String(field.label).trim(),
        value: String(field.value).trim(),
        sort_order: index + 4
      }))
  ];
  const specInsert = await supabase.from("guitar_specs").insert(specRows);

  if (specInsert.error) {
    return NextResponse.json(
      { ok: true, qrCode: insertedGuitar.qr_code, permanentPath: insertedGuitar.permanent_path, message: "Saved. Condition details could not be saved." },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      qrCode: insertedGuitar.qr_code,
      permanentPath: insertedGuitar.permanent_path,
      message: mediaUploadErrors.length ? `${mediaUploadErrors.join(", ")} could not be uploaded. The record was saved.` : undefined
    },
    { status: 200 }
  );
}

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return supabaseWriteUnavailableResponse();
  }

  const auth = await getAuthenticatedUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, message: auth.error || "Sign in required." } satisfies SupabaseCreateResponse, { status: 401 });
  }

  let body: UpdateInstrumentRequest;

  try {
    body = (await request.json()) as UpdateInstrumentRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." } satisfies SupabaseCreateResponse, { status: 400 });
  }

  const input = {
    qrCode: String(body.qrCode || "").trim().toUpperCase(),
    name: String(body.name || "").trim(),
    brand: String(body.brand || "").trim(),
    model: String(body.model || "").trim(),
    serial: String(body.serial || "").trim(),
    year: String(body.year || "").trim(),
    instrumentType: String(body.instrumentType || "").trim(),
    builder: String(body.builder || "").trim(),
    finish: String(body.finish || "").trim(),
    condition: body.condition === "new" ? "new" : "used",
    ownerName: String(body.ownerName || "").trim(),
    ownerEmail: normalizeLookupEmail(auth.user.email || ""),
    location: String(body.location || "").trim(),
    visibility: body.visibility === "private" ? "private" : body.visibility === "unlisted" ? "unlisted" : "public",
    summary: String(body.summary || "").trim(),
    photos: Array.isArray(body.photos) ? body.photos.slice(0, 20) : [],
    documents: Array.isArray(body.documents) ? body.documents.slice(0, 10) : []
  };

  if (!input.qrCode || !input.brand || !input.model || !input.serial) {
    return NextResponse.json({ ok: false, message: "Missing required fields." }, { status: 400 });
  }

  const ownerUser = auth.user;
  const existing = await supabase.from("guitars").select("id,owner_id,status,hero_image_path").eq("qr_code", input.qrCode).maybeSingle<GuitarRow>();
  if (existing.error || !existing.data) {
    return NextResponse.json({ ok: false, message: "Instrument record was not found." }, { status: 404 });
  }

  if (existing.data.owner_id !== ownerUser.id) {
    return NextResponse.json({ ok: false, message: "Only the owner can edit this record." }, { status: 403 });
  }

  const currentProfile = await supabase.from("profiles").select("plan,role").eq("id", ownerUser.id).maybeSingle<{ plan?: SupabasePlan; role?: string }>();
  if (currentProfile.error) {
    return NextResponse.json({ ok: false, message: "Could not read user profile." }, { status: 500 });
  }

  const profilePlan: SupabasePlan = hasLaunchTestingAccess(ownerUser.email || "")
    ? "business"
    : currentProfile.data?.plan || "single";

  const profileUpsert = await supabase.from("profiles").upsert({
    id: ownerUser.id,
    display_name: input.ownerName || ownerUser.user_metadata?.display_name || ownerUser.email || "",
    role: currentProfile.data?.role || "owner",
    plan: profilePlan,
    created_at: new Date().toISOString()
  });

  if (profileUpsert.error) {
    return NextResponse.json({ ok: false, message: "Could not sync user profile." }, { status: 500 });
  }

  const currentHeroPath = existing.data.hero_image_path || null;
  const existingMediaResult = await supabase
    .from("guitar_media")
    .select("guitar_id,storage_path")
    .eq("guitar_id", existing.data.id);
  if (existingMediaResult.error) {
    return NextResponse.json({ ok: false, message: "Could not read existing photos." }, { status: 500 });
  }

  const existingMediaRows = (existingMediaResult.data || []) as GuitarMediaRow[];
  const updatedMediaSources = Array.from(new Set([body.heroImageDataUrl || "", ...input.photos].filter(Boolean)));
  const heroCandidate = body.heroImageDataUrl || updatedMediaSources[0] || "";
  const uploadedHeroPath = heroCandidate ? await uploadImageSource(supabase, ownerUser.id, existing.data.id, heroCandidate, "hero") : null;
  const mappedHeroPath = heroCandidate ? await mapExistingMediaSource(supabase, existingMediaRows, heroCandidate) : "";
  const heroImagePath = heroCandidate ? uploadedHeroPath || mappedHeroPath || currentHeroPath : null;
  const { error: updateError } = await supabase
    .from("guitars")
    .update({
      name: input.name || `${input.brand} ${input.model}`.trim(),
      brand: input.brand,
      model: input.model,
      year: input.year || null,
      serial_number: input.serial,
      builder: input.builder || null,
      location: input.location || null,
      status: existing.data.status,
      visibility: input.visibility,
      summary: input.summary || "",
      hero_image_path: heroImagePath,
      updated_at: new Date().toISOString()
    })
    .eq("qr_code", input.qrCode)
    .eq("owner_id", ownerUser.id);

  if (updateError) {
    return NextResponse.json({ ok: false, message: updateError.message || "Could not update record." }, { status: 500 });
  }

  const existingGuitar = existing.data;
  if (!existingGuitar) {
    return NextResponse.json({ ok: false, message: "Instrument record was not found." }, { status: 404 });
  }

  const persistedMediaPaths: string[] = [];
  const mediaUploadErrors: string[] = [];
  for (const [index, source] of updatedMediaSources.entries()) {
    try {
      const uploadedPath = await uploadImageSource(supabase, ownerUser.id, existingGuitar.id, source, `media-${index + 1}`);
      const existingPath = uploadedPath || await mapExistingMediaSource(supabase, existingMediaRows, source);
      if (existingPath && !persistedMediaPaths.includes(existingPath)) {
        persistedMediaPaths.push(existingPath);
      }
    } catch {
      mediaUploadErrors.push(`Photo ${index + 1}`);
    }
  }

  await supabase.from("guitar_media").delete().eq("guitar_id", existingGuitar.id);
  if (persistedMediaPaths.length > 0) {
    const mediaPayload = persistedMediaPaths.map((storagePath, index) => ({
      guitar_id: existingGuitar.id,
      storage_path: storagePath.slice(0, 2000),
      alt: `Instrument media ${index + 1}`,
      sort_order: index
    }));

    const mediaInsert = await supabase.from("guitar_media").insert(mediaPayload);
    if (mediaInsert.error) {
      return NextResponse.json({ ok: true, qrCode: input.qrCode, permanentPath: `/i/${input.qrCode}`, message: "Saved. Media placeholders could not be refreshed." }, { status: 200 });
    }
  }

  const existingDocumentsResult = await supabase
    .from("guitar_documents")
    .select("guitar_id,name,storage_path,is_public")
    .eq("guitar_id", existingGuitar.id);
  const existingDocuments = ((existingDocumentsResult.data || []) as GuitarDocumentRow[]);
  const uploadedDocuments: Array<{ name: string; storagePath: string; isPublic: boolean }> = [];
  for (const [index, document] of (body.documents || []).entries()) {
    const uploadedPath = await uploadDocumentSource(supabase, ownerUser.id, existingGuitar.id, document.dataUrl, `document-${index + 1}`);
    if (uploadedPath) {
      uploadedDocuments.push({
        name: document.name || `Document ${index + 1}`,
        storagePath: uploadedPath,
        isPublic: document.visibility === "public"
      });
      continue;
    }

    const existingDocument = existingDocuments.find((item) => item.name === document.name);
    if (existingDocument) {
      uploadedDocuments.push({
        name: document.name || `Document ${index + 1}`,
        storagePath: existingDocument.storage_path,
        isPublic: document.visibility === "public"
      });
    }
  }

  await supabase.from("guitar_documents").delete().eq("guitar_id", existingGuitar.id);
  if (uploadedDocuments.length > 0) {
    const documentPayload = uploadedDocuments.map((document) => ({
      guitar_id: existingGuitar.id,
      name: document.name.slice(0, 200),
      storage_path: document.storagePath.slice(0, 2000),
      is_public: document.isPublic
    }));
    const documentInsert = await supabase.from("guitar_documents").insert(documentPayload);
    if (documentInsert.error) {
      return NextResponse.json({ ok: true, qrCode: input.qrCode, permanentPath: `/i/${input.qrCode}`, message: "Saved. Document files could not be refreshed." }, { status: 200 });
    }
  }

  await supabase.from("guitar_specs").delete().eq("guitar_id", existingGuitar.id);
  const specRows = [
    { guitar_id: existingGuitar.id, label: "Condition", value: input.condition, sort_order: 1 },
    ...(input.instrumentType ? [{ guitar_id: existingGuitar.id, label: "Type", value: input.instrumentType, sort_order: 2 }] : []),
    ...(input.finish ? [{ guitar_id: existingGuitar.id, label: "Finish", value: input.finish, sort_order: 3 }] : []),
    ...(body.customFields || [])
      .filter((field) => String(field.label || "").trim() && String(field.value || "").trim())
      .map((field, index) => ({
        guitar_id: existingGuitar.id,
        label: String(field.label).trim(),
        value: String(field.value).trim(),
        sort_order: index + 4
      }))
  ];
  const specInsert = await supabase.from("guitar_specs").insert(specRows);
  if (specInsert.error) {
    return NextResponse.json({ ok: true, qrCode: input.qrCode, permanentPath: `/i/${input.qrCode}`, message: "Saved. Condition details could not be refreshed." }, { status: 200 });
  }

  return NextResponse.json({
    ok: true,
    qrCode: input.qrCode,
    permanentPath: `/i/${input.qrCode}`,
    message: mediaUploadErrors.length ? `${mediaUploadErrors.join(", ")} could not be uploaded. The record was saved.` : undefined
  }, { status: 200 });
}
