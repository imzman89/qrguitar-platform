import { createPublicSupabaseClient } from "./supabase-server";
import { defaultQrStyle, type DemoInstrument } from "./local-demo";
import { mergeRecordTrustSettings, recordTrustContentKey, type RecordTrustSettings } from "./record-trust";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseHttpsJson, supabaseSignedStorageUrl, supabaseStoragePublicUrl } from "./supabase-http";

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

const PUBLIC_MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;

const stalePublicSpecValues = new Set([
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
    return "QRguitar Profile with photos, specs, and instrument details.";
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
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));

  const resolved = await Promise.all(uniquePaths.map(async (path) => {
    const source = publicUrlOrStoragePath(path);
    if (!source) {
      return "";
    }

    if (source === path && !source.startsWith("/")) {
      try {
        const signed = await supabaseSignedStorageUrl("instrument-media", source, PUBLIC_MEDIA_SIGNED_URL_TTL_SECONDS);
        if (signed) {
          return signed;
        }
      } catch {
        // Fall through to a public URL; media signing should not block public profile data.
      }

      return supabaseStoragePublicUrl("instrument-media", source);
    }

    return source;
  }));

  return resolved.filter(Boolean);
}

async function resolveDocumentSources(documents: DocumentRow[]) {
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return [];
  }

  const resolved = await Promise.all(documents.filter((item) => item.is_public).map(async (document) => {
    const source = publicUrlOrStoragePath(document.storage_path);
    if (!source) {
      return null;
    }

    if (source === document.storage_path && !source.startsWith("/")) {
      const publicUrl = supabase.storage.from("instrument-documents").getPublicUrl(source).data.publicUrl;
      return publicUrl
        ? {
            name: document.name,
            url: publicUrl,
            visibility: "public",
            documentType: document.document_type || "",
            publicDescription: document.public_description || "",
            createdAt: document.created_at || ""
          }
        : null;
    }

    return {
      name: document.name,
      url: source,
      visibility: "public",
      documentType: document.document_type || "",
      publicDescription: document.public_description || "",
      createdAt: document.created_at || ""
    };
  }));

  return resolved.filter(Boolean) as NonNullable<DemoInstrument["documentFiles"]>;
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
  const managedSpecLabels = new Set(["condition", "type", "finish", "sale status", "originality"]);
  const customFields = specs
    .filter((spec) => !managedSpecLabels.has(spec.label.trim().toLowerCase()))
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
    serial: trust?.showSerialPublic === true ? guitar.serial_number || "" : "",
    year: guitar.year || "",
    instrumentCondition: condition,
    creatorAccountType: "customer",
    packageIncludesFirstTransfer: false,
    verificationStatus: guitar.status === "verified" ? "verified" : "unverified",
    authenticityStatus: trust?.authenticityStatus || "unconfirmed",
    showVerificationBadge: trust?.showVerificationBadge === false ? false : true,
    showAuthenticityBadge: trust?.showAuthenticityBadge === false ? false : true,
    showSerialPublic: trust?.showSerialPublic === true,
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
  if (!qrCodes.length) {
    return trustByCode;
  }

  const keyFilter = qrCodes.map((code) => `"${recordTrustContentKey(code)}"`).join(",");
  let rows: SiteContentRow[];
  try {
    rows = await supabaseHttpsJson<SiteContentRow[]>(
      `/rest/v1/site_content?select=content_key,content_value&content_key=in.(${keyFilter})`,
      { serviceRole: true, timeoutMs: 4000 }
    );
  } catch {
    return trustByCode;
  }

  for (const row of rows) {
    const code = row.content_key.replace(/^record_trust:/, "").toUpperCase();
    trustByCode.set(code, mergeRecordTrustSettings(row.content_value));
  }

  return trustByCode;
}

async function loadRelated(guitars: GuitarRow[]) {
  if (!guitars.length) {
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
  const idFilter = ids.map(encodeURIComponent).join(",");
  const ownerIdFilter = ownerIds.map(encodeURIComponent).join(",");
  const [mediaRows, specRows, documentRows, profileRows, serviceEventRows] = await Promise.all([
    supabaseHttpsJson<MediaRow[]>(`/rest/v1/guitar_media?select=guitar_id,storage_path&guitar_id=in.(${idFilter})`),
    supabaseHttpsJson<SpecRow[]>(`/rest/v1/guitar_specs?select=guitar_id,label,value&guitar_id=in.(${idFilter})`),
    supabaseHttpsJson<DocumentRow[]>(`/rest/v1/guitar_documents?select=guitar_id,name,storage_path,is_public,document_type,public_description,created_at&guitar_id=in.(${idFilter})`),
    ownerIds.length
      ? supabaseHttpsJson<ProfileRow[]>(`/rest/v1/profiles?select=id,display_name,account_status,hide_public_content&id=in.(${ownerIdFilter})`)
      : Promise.resolve([]),
    supabaseHttpsJson<TimelineRow[]>(`/rest/v1/guitar_timeline_events?select=id,guitar_id,event_date,event_type,title,description,shop_name,location,is_public,created_at,updated_at&guitar_id=in.(${idFilter})&is_public=eq.true&order=event_date.desc.nullslast,created_at.desc`)
      .catch((error: Error) => (/column .* does not exist/i.test(error.message) ? [] : Promise.reject(error)))
  ]);

  const media = new Map<string, string[]>();
  for (const row of mediaRows) {
    media.set(row.guitar_id, [...(media.get(row.guitar_id) || []), row.storage_path]);
  }

  const specs = new Map<string, SpecRow[]>();
  for (const row of specRows) {
    specs.set(row.guitar_id, [...(specs.get(row.guitar_id) || []), row]);
  }

  const documents = new Map<string, DocumentRow[]>();
  for (const row of documentRows) {
    documents.set(row.guitar_id, [...(documents.get(row.guitar_id) || []), row]);
  }

  const profiles = new Map<string, ProfileRow>();
  for (const row of profileRows) {
    profiles.set(row.id, row);
  }

  const serviceEvents = new Map<string, ReturnType<typeof mapPublicServiceEvent>[]>();
  for (const row of serviceEventRows) {
    serviceEvents.set(row.guitar_id, [...(serviceEvents.get(row.guitar_id) || []), mapPublicServiceEvent(row)]);
  }

  return { media, specs, documents, profiles, serviceEvents };
}

export async function getPublicInstruments() {
  noStore();
  const guitars = await supabaseHttpsJson<GuitarRow[]>("/rest/v1/guitars?select=id,owner_id,qr_code,permanent_path,name,brand,model,year,serial_number,builder,location,status,visibility,summary,hero_image_path,safety_status,safety_status_updated_at,public_safety_note,admin_archived_at,owner_removed_at,created_at&visibility=eq.public&admin_archived_at=is.null&owner_removed_at=is.null&order=created_at.desc");
  const [related, trustByCode] = await Promise.all([
    loadRelated(guitars),
    loadTrustSettingsMap(guitars.map((guitar) => guitar.qr_code))
  ]);
  const visibleGuitars = guitars.filter((guitar) => {
    const profile = related.profiles.get(guitar.owner_id || "");
    return profile?.hide_public_content !== true && profile?.account_status !== "banned" && profile?.account_status !== "removed";
  });

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
  const rows = await supabaseHttpsJson<GuitarRow[]>(`/rest/v1/guitars?select=id,owner_id,qr_code,permanent_path,name,brand,model,year,serial_number,builder,location,status,visibility,summary,hero_image_path,safety_status,safety_status_updated_at,public_safety_note,admin_archived_at,owner_removed_at,created_at&qr_code=eq.${encodeURIComponent(code.toUpperCase())}&limit=1`);
  const data = rows[0] || null;

  if (!data || data.visibility === "private" || data.admin_archived_at || data.owner_removed_at) {
    return null;
  }

  const [related, trustByCode] = await Promise.all([
    loadRelated([data]),
    loadTrustSettingsMap([data.qr_code])
  ]);
  const ownerProfile = related.profiles.get(data.owner_id || "");
  if (ownerProfile?.hide_public_content === true || ownerProfile?.account_status === "banned" || ownerProfile?.account_status === "removed") {
    return null;
  }
  const heroStoragePath = data.hero_image_path || "";
  const media = await resolveMediaSources((related.media.get(data.id) || []).filter((storagePath) => storagePath !== heroStoragePath));
  const heroImagePath = heroStoragePath ? (await resolveMediaSources([heroStoragePath]))[0] : "";
  const documents = await resolveDocumentSources(related.documents.get(data.id) || []);

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
