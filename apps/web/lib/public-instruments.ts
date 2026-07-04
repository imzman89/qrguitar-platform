import { createServerSupabaseClient } from "./supabase-server";
import { defaultQrStyle, type DemoInstrument } from "./local-demo";
import { mergeRecordTrustSettings, recordTrustContentKey, type RecordTrustSettings } from "./record-trust";
import { unstable_noStore as noStore } from "next/cache";

type GuitarRow = {
  id: string;
  owner_id: string | null;
  qr_code: string;
  permanent_path: string | null;
  name: string | null;
  brand: string | null;
  model: string | null;
  year: string | null;
  serial_number: string | null;
  builder: string | null;
  location: string | null;
  status: string | null;
  visibility: string | null;
  summary: string | null;
  hero_image_path: string | null;
  safety_status?: string | null;
  safety_status_updated_at?: string | null;
  public_safety_note?: string | null;
  admin_archived_at?: string | null;
  owner_removed_at?: string | null;
  created_at: string | null;
};

type MediaRow = {
  guitar_id: string;
  storage_path: string;
};

type SpecRow = {
  guitar_id: string;
  label: string;
  value: string;
};

type DocumentRow = {
  guitar_id: string;
  name: string;
  storage_path: string;
  is_public: boolean;
  document_type?: string | null;
  public_description?: string | null;
  created_at?: string | null;
};

type TimelineRow = {
  id: string;
  guitar_id: string;
  event_date: string | null;
  event_type: string | null;
  title: string;
  description: string | null;
  shop_name: string | null;
  location: string | null;
  is_public: boolean | null;
  created_at: string;
  updated_at: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  account_status?: string | null;
  hide_public_content?: boolean | null;
};

type SiteContentRow = {
  content_key: string;
  content_value: Partial<RecordTrustSettings> | null;
};

const RETIRED_PUBLIC_RECORD_CODES = new Set(["QRG-PI260001"]);

export function isRetiredPublicRecordCode(code: string) {
  return RETIRED_PUBLIC_RECORD_CODES.has(String(code || "").trim().toUpperCase());
}

const stalePublicSpecValues = new Set([
  "custom reptile finish",
  "alder",
  "maple neck, rosewood board"
]);

function cleanPublicSpecValue(value?: string | null) {
  const trimmed = String(value || "").trim();
  return stalePublicSpecValues.has(trimmed.toLowerCase()) ? "" : trimmed;
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

function publicUrlOrStoragePath(path?: string | null) {
  const value = (path || "").trim();
  if (!value) {
    return "";
  }

  if (/^(https?:|data:|blob:|\/)/i.test(value)) {
    return value;
  }

  return value;
}

async function resolveMediaSources(paths: string[]) {
  const supabase = createServerSupabaseClient();
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  if (!supabase) {
    return uniquePaths.map(publicUrlOrStoragePath).filter(Boolean);
  }

  const resolved: string[] = [];
  for (const path of uniquePaths) {
    const source = publicUrlOrStoragePath(path);
    if (!source) {
      continue;
    }

    if (source === path && !source.startsWith("/")) {
      const { data } = await supabase.storage.from("instrument-media").createSignedUrl(source, 60 * 60);
      resolved.push(data?.signedUrl || source);
      continue;
    }

    resolved.push(source);
  }

  return resolved;
}

async function resolveDocumentSources(documents: DocumentRow[]) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return [];
  }

  const resolved: NonNullable<DemoInstrument["documentFiles"]> = [];
  for (const document of documents.filter((item) => item.is_public)) {
    const source = publicUrlOrStoragePath(document.storage_path);
    if (!source) {
      continue;
    }

    if (source === document.storage_path && !source.startsWith("/")) {
      const { data } = await supabase.storage.from("instrument-documents").createSignedUrl(source, 60 * 15);
      if (data?.signedUrl) {
        resolved.push({
          name: document.name,
          url: data.signedUrl,
          visibility: "public",
          documentType: document.document_type || "",
          publicDescription: document.public_description || "",
          createdAt: document.created_at || ""
        });
      }
      continue;
    }

    resolved.push({
      name: document.name,
      url: source,
      visibility: "public",
      documentType: document.document_type || "",
      publicDescription: document.public_description || "",
      createdAt: document.created_at || ""
    });
  }

  return resolved;
}

function mapRecord({
  guitar,
  media,
  specs,
  documents,
  serviceEvents,
  ownerName,
  trust
}: {
  guitar: GuitarRow;
  media: string[];
  specs: SpecRow[];
  documents: NonNullable<DemoInstrument["documentFiles"]>;
  serviceEvents?: NonNullable<DemoInstrument["serviceEvents"]>;
  ownerName?: string;
  trust?: RecordTrustSettings;
}): DemoInstrument {
  const customFields = specs
    .filter((spec) => !["condition", "type", "finish"].includes(spec.label.toLowerCase()))
    .map((spec, index) => ({ id: `${guitar.id}-spec-${index}`, label: spec.label, value: cleanPublicSpecValue(spec.value) }))
    .filter((spec) => spec.label.trim() && spec.value);
  const condition = specs.find((spec) => spec.label.toLowerCase() === "condition")?.value.toLowerCase() === "new" ? "new" : "used";
  const type = cleanPublicSpecValue(specs.find((spec) => spec.label.toLowerCase() === "type")?.value);
  const finish = cleanPublicSpecValue(specs.find((spec) => spec.label.toLowerCase() === "finish")?.value);
  const hero = publicUrlOrStoragePath(guitar.hero_image_path) || media[0] || "";
  const gallery = Array.from(new Set([hero, ...media].filter(isRenderablePublicMediaSource)));

  return {
    qrCode: guitar.qr_code.toUpperCase(),
    permanentPath: guitar.permanent_path || `/i/${guitar.qr_code.toUpperCase()}`,
    name: guitar.name || "",
    brand: guitar.brand || "",
    model: guitar.model || "",
    serial: trust?.showSerialPublic === false ? "" : guitar.serial_number || "",
    year: guitar.year || "",
    instrumentCondition: condition,
    creatorAccountType: "customer",
    packageIncludesFirstTransfer: false,
    verificationStatus: guitar.status === "verified" ? "verified" : "unverified",
    authenticityStatus: trust?.authenticityStatus || "unconfirmed",
    showVerificationBadge: trust?.showVerificationBadge === false ? false : true,
    showAuthenticityBadge: trust?.showAuthenticityBadge === false ? false : true,
    showSerialPublic: trust?.showSerialPublic === false ? false : true,
    serialExceptionApproved: trust?.serialExceptionApproved === true,
    publicVerificationNote: trust?.publicVerificationNote || "",
    publicAuthenticityNote: trust?.publicAuthenticityNote || "",
    safetyStatus: guitar.safety_status === "lost" || guitar.safety_status === "stolen" || guitar.safety_status === "recovered" ? guitar.safety_status : "clear",
    publicSafetyNote: guitar.public_safety_note || "",
    safetyStatusUpdatedAt: guitar.safety_status_updated_at || "",
    instrumentType: type,
    builder: guitar.builder || "",
    owner: ownerName || guitar.builder || "Unclaimed",
    location: guitar.location || "",
    visibility: guitar.visibility === "private" ? "private" : guitar.visibility === "unlisted" ? "unlisted" : "public",
    summary: publicSummary(guitar.summary),
    finish,
    heroImageDataUrl: hero,
    galleryImageDataUrls: gallery,
    customFields,
    customLinks: [],
    documentFiles: documents,
    serviceEvents: serviceEvents || [],
    qrStyle: defaultQrStyle,
    createdAt: guitar.created_at || new Date().toISOString()
  };
}

function mapPublicServiceEvent(row: TimelineRow) {
  return {
    id: row.id,
    serviceDate: row.event_date || "",
    eventType: row.event_type || "",
    title: row.title || "Service entry",
    publicDescription: row.description || "",
    shopName: row.shop_name || "",
    location: row.location || "",
    isPublic: row.is_public === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined
  };
}

async function loadTrustSettingsMap(qrCodes: string[]) {
  const trustByCode = new Map<string, RecordTrustSettings>();
  const supabase = createServerSupabaseClient();
  if (!supabase || !qrCodes.length) {
    return trustByCode;
  }

  const result = await supabase.from("site_content").select("content_key,content_value").in("content_key", qrCodes.map(recordTrustContentKey));
  if (result.error) {
    return trustByCode;
  }

  for (const row of (result.data || []) as SiteContentRow[]) {
    const code = row.content_key.replace(/^record_trust:/, "").toUpperCase();
    trustByCode.set(code, mergeRecordTrustSettings(row.content_value));
  }

  return trustByCode;
}

async function loadRelated(guitars: GuitarRow[]) {
  const supabase = createServerSupabaseClient();
  if (!supabase || !guitars.length) {
    return {
      media: new Map<string, string[]>(),
      specs: new Map<string, SpecRow[]>(),
      documents: new Map<string, DocumentRow[]>(),
      profiles: new Map<string, ProfileRow>(),
      serviceEvents: new Map<string, ReturnType<typeof mapPublicServiceEvent>[]>()
    };
  }

  const ids = guitars.map((guitar) => guitar.id);
  const ownerIds = guitars.map((guitar) => guitar.owner_id).filter(Boolean) as string[];
  const [mediaResult, specsResult, documentsResult, profilesResult, serviceEventsResult] = await Promise.all([
    supabase.from("guitar_media").select("guitar_id,storage_path").in("guitar_id", ids),
    supabase.from("guitar_specs").select("guitar_id,label,value").in("guitar_id", ids),
    supabase.from("guitar_documents").select("guitar_id,name,storage_path,is_public,document_type,public_description,created_at").in("guitar_id", ids),
    ownerIds.length ? supabase.from("profiles").select("id,display_name,account_status,hide_public_content").in("id", ownerIds) : Promise.resolve({ data: [], error: null }),
    supabase
      .from("guitar_timeline_events")
      .select("id,guitar_id,event_date,event_type,title,description,shop_name,location,is_public,created_at,updated_at")
      .in("guitar_id", ids)
      .eq("is_public", true)
      .order("event_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
  ]);

  const serviceEventsColumnsMissing = serviceEventsResult.error && /column .* does not exist/i.test(serviceEventsResult.error.message);

  let profileRows = (profilesResult.data || []) as ProfileRow[];
  let profileError = profilesResult.error;
  if (profileError && /column .* does not exist/i.test(profileError.message || "") && ownerIds.length) {
    const fallbackProfiles = await supabase.from("profiles").select("id,display_name").in("id", ownerIds);
    profileRows = (fallbackProfiles.data || []) as ProfileRow[];
    profileError = fallbackProfiles.error;
  }

  if (mediaResult.error || specsResult.error || documentsResult.error || profileError || (serviceEventsResult.error && !serviceEventsColumnsMissing)) {
    throw new Error(mediaResult.error?.message || specsResult.error?.message || documentsResult.error?.message || profilesResult.error?.message || serviceEventsResult.error?.message || "Could not load related instrument data.");
  }

  const media = new Map<string, string[]>();
  for (const row of (mediaResult.data || []) as MediaRow[]) {
    media.set(row.guitar_id, [...(media.get(row.guitar_id) || []), row.storage_path]);
  }

  const specs = new Map<string, SpecRow[]>();
  for (const row of (specsResult.data || []) as SpecRow[]) {
    specs.set(row.guitar_id, [...(specs.get(row.guitar_id) || []), row]);
  }

  const documents = new Map<string, DocumentRow[]>();
  for (const row of (documentsResult.data || []) as DocumentRow[]) {
    documents.set(row.guitar_id, [...(documents.get(row.guitar_id) || []), row]);
  }

  const profiles = new Map<string, ProfileRow>();
  for (const row of profileRows) {
    profiles.set(row.id, row);
  }

  const serviceEvents = new Map<string, ReturnType<typeof mapPublicServiceEvent>[]>();
  if (!serviceEventsColumnsMissing) {
    for (const row of (serviceEventsResult.data || []) as TimelineRow[]) {
      serviceEvents.set(row.guitar_id, [...(serviceEvents.get(row.guitar_id) || []), mapPublicServiceEvent(row)]);
    }
  }

  return { media, specs, documents, profiles, serviceEvents };
}

export async function getPublicInstruments() {
  noStore();
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("guitars")
    .select("id,owner_id,qr_code,permanent_path,name,brand,model,year,serial_number,builder,location,status,visibility,summary,hero_image_path,safety_status,safety_status_updated_at,public_safety_note,admin_archived_at,owner_removed_at,created_at")
    .eq("visibility", "public")
    .is("admin_archived_at", null)
    .is("owner_removed_at", null)
    .order("created_at", { ascending: false });

  if (error || !data) {
    throw new Error(error?.message || "Could not load public instruments.");
  }

  const guitars = data as GuitarRow[];
  const related = await loadRelated(guitars);
  const visibleGuitars = guitars.filter((guitar) => {
    const profile = related.profiles.get(guitar.owner_id || "");
    return profile?.hide_public_content !== true && profile?.account_status !== "banned" && profile?.account_status !== "removed";
  });
  const trustByCode = await loadTrustSettingsMap(visibleGuitars.map((guitar) => guitar.qr_code));

  return Promise.all(
    visibleGuitars.map(async (guitar) => {
      const heroStoragePath = guitar.hero_image_path || "";
      const media = await resolveMediaSources((related.media.get(guitar.id) || []).filter((storagePath) => storagePath !== heroStoragePath));
      const heroImagePath = heroStoragePath ? (await resolveMediaSources([heroStoragePath]))[0] : "";
      const documents = await resolveDocumentSources(related.documents.get(guitar.id) || []);
      return mapRecord({
        guitar: { ...guitar, hero_image_path: heroImagePath || guitar.hero_image_path },
        media,
        documents,
        serviceEvents: related.serviceEvents.get(guitar.id) || [],
        specs: related.specs.get(guitar.id) || [],
        ownerName: related.profiles.get(guitar.owner_id || "")?.display_name || guitar.builder || "",
        trust: trustByCode.get(guitar.qr_code.toUpperCase())
      });
    })
  );
}

export async function getPublicInstrumentByCode(code: string) {
  noStore();
  if (isRetiredPublicRecordCode(code)) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("guitars")
    .select("id,owner_id,qr_code,permanent_path,name,brand,model,year,serial_number,builder,location,status,visibility,summary,hero_image_path,safety_status,safety_status_updated_at,public_safety_note,admin_archived_at,owner_removed_at,created_at")
    .eq("qr_code", code.toUpperCase())
    .maybeSingle<GuitarRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.visibility === "private" || data.admin_archived_at || data.owner_removed_at) {
    return null;
  }

  const related = await loadRelated([data]);
  const ownerProfile = related.profiles.get(data.owner_id || "");
  if (ownerProfile?.hide_public_content === true || ownerProfile?.account_status === "banned" || ownerProfile?.account_status === "removed") {
    return null;
  }
  const heroStoragePath = data.hero_image_path || "";
  const media = await resolveMediaSources((related.media.get(data.id) || []).filter((storagePath) => storagePath !== heroStoragePath));
  const heroImagePath = heroStoragePath ? (await resolveMediaSources([heroStoragePath]))[0] : "";
  const documents = await resolveDocumentSources(related.documents.get(data.id) || []);
  const trustByCode = await loadTrustSettingsMap([data.qr_code]);

  return mapRecord({
    guitar: { ...data, hero_image_path: heroImagePath || data.hero_image_path },
    media,
    documents,
    serviceEvents: related.serviceEvents.get(data.id) || [],
    specs: related.specs.get(data.id) || [],
    ownerName: related.profiles.get(data.owner_id || "")?.display_name || data.builder || "Unclaimed",
    trust: trustByCode.get(data.qr_code.toUpperCase())
  });
}
