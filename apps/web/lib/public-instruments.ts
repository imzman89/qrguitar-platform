import { defaultQrStyle, type DemoInstrument } from "./local-demo";
import { mergeRecordTrustSettings, recordTrustContentKey, type RecordTrustSettings } from "./record-trust";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseHttpsJson } from "./supabase-http";
import { supabasePagedRows, supabaseRowsByValues } from "./supabase-pagination";
import { isEligiblePublicProfile, isRetiredPublicProfileCode, normalizePublicProfileCode } from "./public-profile-eligibility";
import { cleanPublicCollection, publicCollectionHandleKey, publicCollectionOwnerKey, type PublicCollectionSettings } from "./public-collections";
import { publicFileUrl } from "./public-file-url";
import {
  availabilityFromSpecs,
  getServiceHistoryEntries,
  isLegacyServiceField,
  isManagedInstrumentSpec,
  originalityFromSpecs,
  profileLinksFromSpecs,
  sanitizePublicInstrument
} from "./instrument-profile-contract";

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
  no_serial_used?: boolean | null;
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
  updated_at: string | null;
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
  issuer_source?: string | null;
  document_date?: string | null;
  description?: string | null;
  file_size_bytes?: number | null;
  related_timeline_event_id?: string | null;
  related_service_event_id?: string | null;
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
  date_precision?: "day" | "month" | "year" | "unknown" | null;
  category?: string | null;
  is_system?: boolean | null;
  related_document_id?: string | null;
  related_media_id?: string | null;
  source_kind?: "owner_reported" | "provider_submitted_owner_approved" | null;
  provider_user_id?: string | null;
  provider_display_name?: string | null;
  provider_verified_at_snapshot?: string | null;
  evidence_reviewed_at?: string | null;
  service_submission_id?: string | null;
  work_order_reference?: string | null;
  parts_installed?: string | null;
  setup_measurements?: string | null;
  who_performed?: "self" | "shop" | "unknown" | null;
};

type ExternalMediaRow = {
  id: string;
  guitar_id: string;
  provider: "youtube" | "vimeo" | "audio" | "link";
  canonical_url: string;
  provider_id: string | null;
  title: string;
  caption: string;
  thumbnail_url: string | null;
  is_public: boolean;
  sort_order: number;
  created_at: string;
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

type PublicCollectionSiteRow = {
  content_key: string;
  content_value: Partial<PublicCollectionSettings> | null;
};

function cleanPublicSpecValue(value?: string | null) {
  const trimmed = String(value || "").trim();
  return trimmed;
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

function resolveMediaSources(paths: string[], qrCode: string) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  return uniquePaths.map((path) => {
    const source = publicUrlOrStoragePath(path);
    if (!source) {
      return "";
    }

    if (source === path && !source.startsWith("/")) {
      return publicFileUrl(qrCode, "media", source);
    }

    return source;
  }).filter(Boolean);
}

function resolveDocumentSources(documents: DocumentRow[], qrCode: string) {
  const resolved = documents.filter((item) => item.is_public).map((document) => {
    const source = publicUrlOrStoragePath(document.storage_path);
    if (!source) {
      return null;
    }

    if (source === document.storage_path && !source.startsWith("/")) {
      return {
        name: document.name,
        url: publicFileUrl(qrCode, "document", source),
        visibility: "public",
        documentType: document.document_type || "",
        publicDescription: document.public_description || "",
        issuerSource: document.issuer_source || "",
        documentDate: document.document_date || "",
        description: document.description || "",
        fileSizeBytes: document.file_size_bytes || undefined,
        relatedTimelineEventId: document.related_timeline_event_id || undefined,
        relatedServiceEventId: document.related_service_event_id || undefined,
        createdAt: document.created_at || ""
      };
    }

    return {
      name: document.name,
      url: source,
      visibility: "public",
      documentType: document.document_type || "",
      publicDescription: document.public_description || "",
      issuerSource: document.issuer_source || "",
      documentDate: document.document_date || "",
      description: document.description || "",
      fileSizeBytes: document.file_size_bytes || undefined,
      relatedTimelineEventId: document.related_timeline_event_id || undefined,
      relatedServiceEventId: document.related_service_event_id || undefined,
      createdAt: document.created_at || ""
    };
  });

  return resolved.filter(Boolean) as NonNullable<DemoInstrument["documentFiles"]>;
}

function mapRecord({
  guitar,
  media,
  specs,
  documents,
  serviceEvents,
  externalMedia,
  ownerName,
  publicCollection,
  trust
}: {
  guitar: GuitarRow;
  media: string[];
  specs: SpecRow[];
  documents: NonNullable<DemoInstrument["documentFiles"]>;
  serviceEvents?: NonNullable<DemoInstrument["serviceEvents"]>;
  externalMedia?: NonNullable<DemoInstrument["externalMedia"]>;
  ownerName?: string;
  publicCollection?: DemoInstrument["publicCollection"];
  trust?: RecordTrustSettings;
}): DemoInstrument {
  const profileFields = specs
    .filter((spec) => !isManagedInstrumentSpec(spec.label))
    .map((spec, index) => ({ id: `${guitar.id}-spec-${index}`, label: spec.label, value: cleanPublicSpecValue(spec.value) }))
    .filter((spec) => spec.label.trim() && spec.value);
  const customFields = profileFields.filter((field) => !isLegacyServiceField(field));
  const condition = specs.find((spec) => spec.label.toLowerCase() === "condition")?.value.toLowerCase() === "new" ? "new" : "used";
  const type = cleanPublicSpecValue(specs.find((spec) => spec.label.toLowerCase() === "type")?.value);
  const finish = cleanPublicSpecValue(specs.find((spec) => spec.label.toLowerCase() === "finish")?.value);
  const hero = publicUrlOrStoragePath(guitar.hero_image_path) || media[0] || "";
  const gallery = Array.from(new Set([hero, ...media].filter(isRenderablePublicMediaSource)));

  const instrument: DemoInstrument = {
    qrCode: guitar.qr_code.toUpperCase(),
    permanentPath: guitar.permanent_path || `/i/${guitar.qr_code.toUpperCase()}`,
    name: guitar.name || "",
    brand: guitar.brand || "",
    model: guitar.model || "",
    serial: trust?.showSerialPublic === true ? guitar.serial_number || "" : "",
    serialNotUsed: guitar.no_serial_used === true,
    year: guitar.year || "",
    instrumentCondition: condition,
    saleStatus: availabilityFromSpecs(specs),
    originalityStatus: originalityFromSpecs(specs),
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
    owner: ownerName || "Collection",
    publicCollection,
    location: guitar.location || "",
    visibility: guitar.visibility === "private" ? "private" : guitar.visibility === "unlisted" ? "unlisted" : "public",
    summary: publicSummary(guitar.summary),
    finish,
    heroImageDataUrl: hero,
    galleryImageDataUrls: gallery,
    customFields,
    customLinks: profileLinksFromSpecs(specs),
    documentFiles: documents,
    timelineEvents: serviceEvents || [],
    serviceEvents: [],
    externalMedia: externalMedia || [],
    qrStyle: defaultQrStyle,
    createdAt: guitar.created_at || "",
    updatedAt: guitar.updated_at || undefined
  };
  instrument.serviceEvents = getServiceHistoryEntries({
    timelineEvents: serviceEvents || [],
    serviceEvents: [],
    customFields: profileFields,
    createdAt: instrument.createdAt
  });
  return instrument;
}

function mapPublicServiceEvent(row: TimelineRow) {
  return {
    id: row.id,
    serviceDate: row.event_date || "",
    datePrecision: row.date_precision || (row.event_date ? "day" : "unknown"),
    category: row.category || row.event_type || "Other",
    eventType: row.event_type || "",
    title: row.title || "Service entry",
    publicDescription: row.description || "",
    shopName: row.shop_name || "",
    location: row.location || "",
    isPublic: row.is_public === true,
    isSystem: row.is_system === true,
    relatedDocumentId: row.related_document_id || undefined,
    relatedMediaId: row.related_media_id || undefined,
    sourceKind: row.source_kind || "owner_reported",
    providerUserId: row.provider_user_id || undefined,
    providerDisplayName: row.provider_display_name || undefined,
    providerVerifiedAt: row.provider_verified_at_snapshot || undefined,
    evidenceReviewedAt: row.evidence_reviewed_at || undefined,
    serviceSubmissionId: row.service_submission_id || undefined,
    workOrderReference: row.work_order_reference || undefined,
    partsInstalled: row.parts_installed || undefined,
    setupMeasurements: row.setup_measurements || undefined,
    whoPerformed: row.who_performed || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined
  };
}

async function loadTrustSettingsMap(qrCodes: string[]) {
  const trustByCode = new Map<string, RecordTrustSettings>();
  if (!qrCodes.length) {
    return trustByCode;
  }

  const rows = await supabaseRowsByValues<SiteContentRow>(
    "/rest/v1/site_content?select=content_key,content_value&order=content_key.asc",
    "content_key", qrCodes.map(recordTrustContentKey),
    { serviceRole: true, timeoutMs: 4000 }
  );

  for (const row of rows) {
    const code = row.content_key.replace(/^record_trust:/, "").toUpperCase();
    trustByCode.set(code, mergeRecordTrustSettings(row.content_value));
  }

  return trustByCode;
}

async function loadRelated(guitars: GuitarRow[], serviceRole = true) {
  if (!guitars.length) {
    return {
      media: new Map<string, string[]>(),
      specs: new Map<string, SpecRow[]>(),
      documents: new Map<string, DocumentRow[]>(),
      profiles: new Map<string, ProfileRow>(),
      collections: new Map<string, NonNullable<DemoInstrument["publicCollection"]>>(),
      serviceEvents: new Map<string, ReturnType<typeof mapPublicServiceEvent>[]>(),
      externalMedia: new Map<string, ExternalMediaRow[]>()
    };
  }

  const ids = guitars.map((guitar) => guitar.id);
  const ownerIds = [...new Set(guitars.map((guitar) => guitar.owner_id).filter(Boolean) as string[])];
  const [mediaRows, specRows, documentRows, profileRows, serviceEventRows, externalMediaRows, collectionRows] = await Promise.all([
    supabaseRowsByValues<MediaRow>("/rest/v1/guitar_media?select=guitar_id,storage_path,sort_order&order=sort_order.asc,id.asc", "guitar_id", ids, { serviceRole }),
    supabaseRowsByValues<SpecRow>("/rest/v1/guitar_specs?select=guitar_id,label,value&order=sort_order.asc,id.asc", "guitar_id", ids, { serviceRole }),
    supabaseRowsByValues<DocumentRow>("/rest/v1/guitar_documents?select=guitar_id,name,storage_path,is_public,document_type,public_description,issuer_source,document_date,description,file_size_bytes,related_timeline_event_id,related_service_event_id,created_at&is_public=eq.true&order=created_at.asc,id.asc", "guitar_id", ids, { serviceRole }),
    supabaseRowsByValues<ProfileRow>("/rest/v1/profiles?select=id,display_name,account_status,hide_public_content&order=id.asc", "id", ownerIds, { serviceRole }),
    supabaseRowsByValues<TimelineRow>("/rest/v1/guitar_timeline_events?select=id,guitar_id,event_date,event_type,title,description,shop_name,location,is_public,created_at,updated_at,date_precision,category,is_system,related_document_id,related_media_id,source_kind,provider_user_id,provider_display_name,provider_verified_at_snapshot,evidence_reviewed_at,service_submission_id,work_order_reference,parts_installed,setup_measurements,who_performed&is_public=eq.true&order=event_date.desc.nullslast,created_at.desc,id.asc", "guitar_id", ids, { serviceRole })
      .catch(async (error: Error) => {
        if (!/column .* does not exist/i.test(error.message)) throw error;
        return supabaseRowsByValues<TimelineRow>("/rest/v1/guitar_timeline_events?select=id,guitar_id,event_date,event_type,title,description,shop_name,location,is_public,created_at,updated_at&is_public=eq.true&order=event_date.desc.nullslast,created_at.desc,id.asc", "guitar_id", ids, { serviceRole });
      }),
    supabaseRowsByValues<ExternalMediaRow>("/rest/v1/guitar_external_media?select=id,guitar_id,provider,canonical_url,provider_id,title,caption,thumbnail_url,is_public,sort_order,created_at&is_public=eq.true&order=sort_order.asc,created_at.asc,id.asc", "guitar_id", ids, { serviceRole })
      .catch((error: Error) => {
        if (/relation .*guitar_external_media.* does not exist/i.test(error.message)) return [];
        throw error;
      }),
    supabaseRowsByValues<PublicCollectionSiteRow>("/rest/v1/site_content?select=content_key,content_value&order=content_key.asc", "content_key", ownerIds.map(publicCollectionOwnerKey), { serviceRole: true })
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

  const collectionHandles = collectionRows.map((row) => cleanPublicCollection(row.content_value).handle).filter(Boolean);
  const handleRows = await supabaseRowsByValues<PublicCollectionSiteRow>(
    "/rest/v1/site_content?select=content_key,content_value&order=content_key.asc",
    "content_key", collectionHandles.map(publicCollectionHandleKey), { serviceRole: true }
  );
  const bindingOwners = new Map(handleRows.map((row) => [row.content_key, row.content_value?.ownerId]));
  const collections = new Map<string, NonNullable<DemoInstrument["publicCollection"]>>();
  for (const row of collectionRows) {
    const ownerId = row.content_key.replace(/^public_collection_owner:/, "");
    const collection = cleanPublicCollection({ ...(row.content_value || {}), ownerId });
    if (row.content_value?.ownerId === ownerId && collection.enabled && collection.handle.length >= 3
        && row.content_value?.handle === collection.handle && collection.publicName && bindingOwners.get(publicCollectionHandleKey(collection.handle)) === ownerId) {
      collections.set(ownerId, {
        handle: collection.handle,
        publicName: collection.publicName,
        accountType: collection.accountType,
        websiteUrl: collection.websiteUrl,
        bio: collection.bio,
        location: collection.location,
        avatarUrl: collection.avatarUrl,
        allowMessages: collection.allowMessages
      });
    }
  }

  const serviceEvents = new Map<string, ReturnType<typeof mapPublicServiceEvent>[]>();
  for (const row of serviceEventRows) {
    serviceEvents.set(row.guitar_id, [...(serviceEvents.get(row.guitar_id) || []), mapPublicServiceEvent(row)]);
  }

  const externalMedia = new Map<string, ExternalMediaRow[]>();
  for (const row of externalMediaRows) {
    externalMedia.set(row.guitar_id, [...(externalMedia.get(row.guitar_id) || []), row]);
  }

  return { media, specs, documents, profiles, collections, serviceEvents, externalMedia };
}

export async function getPublicInstruments(ownerId?: string) {
  noStore();
  const query = new URL("/rest/v1/guitars?select=id,owner_id,qr_code,permanent_path,name,brand,model,year,serial_number,no_serial_used,builder,location,status,visibility,summary,hero_image_path,safety_status,safety_status_updated_at,public_safety_note,admin_archived_at,owner_removed_at,created_at,updated_at&visibility=eq.public&admin_archived_at=is.null&owner_removed_at=is.null&order=created_at.desc,id.asc", "https://supabase.invalid");
  if (ownerId) query.searchParams.set("owner_id", "eq." + ownerId);
  const guitars = await supabasePagedRows<GuitarRow>(query.pathname + query.search, { serviceRole: true });
  const [related, trustByCode] = await Promise.all([
    loadRelated(guitars),
    loadTrustSettingsMap(guitars.map((guitar) => guitar.qr_code))
  ]);
  const visibleGuitars = guitars.filter((guitar) => {
    if (ownerId && guitar.owner_id !== ownerId) return false;
    const profile = related.profiles.get(guitar.owner_id || "");
    return isEligiblePublicProfile(guitar, { ownerProfile: profile });
  });

  return Promise.all(
    visibleGuitars.map(async (guitar) => {
      const heroStoragePath = guitar.hero_image_path || "";
      const media = resolveMediaSources((related.media.get(guitar.id) || []).filter((storagePath) => storagePath !== heroStoragePath), guitar.qr_code);
      const heroImagePath = heroStoragePath ? resolveMediaSources([heroStoragePath], guitar.qr_code)[0] : "";
      const documents = resolveDocumentSources(related.documents.get(guitar.id) || [], guitar.qr_code);
      return sanitizePublicInstrument(mapRecord({
        guitar: { ...guitar, hero_image_path: heroImagePath || guitar.hero_image_path },
        media,
        documents,
        serviceEvents: related.serviceEvents.get(guitar.id) || [],
        externalMedia: (related.externalMedia.get(guitar.id) || []).map((item) => ({
          id: item.id,
          provider: item.provider,
          canonicalUrl: item.canonical_url,
          providerId: item.provider_id || undefined,
          title: item.title,
          caption: item.caption,
          thumbnailUrl: item.thumbnail_url || undefined,
          isPublic: true,
          sortOrder: item.sort_order,
          createdAt: item.created_at
        })),
        specs: related.specs.get(guitar.id) || [],
        ownerName: related.collections.get(guitar.owner_id || "")?.publicName || "Collection",
        publicCollection: related.collections.get(guitar.owner_id || ""),
        trust: trustByCode.get(guitar.qr_code.toUpperCase())
      }));
    })
  );
}

export async function getPublicInstrumentByCode(code: string) {
  noStore();
  const normalizedCode = normalizePublicProfileCode(code);
  if (!normalizedCode || isRetiredPublicProfileCode(normalizedCode)) {
    return null;
  }
  let rows = await supabaseHttpsJson<GuitarRow[]>(`/rest/v1/guitars?select=id,owner_id,qr_code,permanent_path,name,brand,model,year,serial_number,no_serial_used,builder,location,status,visibility,summary,hero_image_path,safety_status,safety_status_updated_at,public_safety_note,admin_archived_at,owner_removed_at,created_at,updated_at&qr_code=eq.${encodeURIComponent(normalizedCode)}&limit=1`, { serviceRole: true });
  if (!rows.length) {
    const redirects = await supabaseHttpsJson<Array<{ guitar_id: string }>>(`/rest/v1/qr_redirects?select=guitar_id&old_path=eq.${encodeURIComponent(`/i/${normalizedCode}`)}&active=eq.true&limit=1`, { serviceRole: true });
    const guitarId = redirects[0]?.guitar_id;
    if (guitarId) {
      rows = await supabaseHttpsJson<GuitarRow[]>(`/rest/v1/guitars?select=id,owner_id,qr_code,permanent_path,name,brand,model,year,serial_number,no_serial_used,builder,location,status,visibility,summary,hero_image_path,safety_status,safety_status_updated_at,public_safety_note,admin_archived_at,owner_removed_at,created_at,updated_at&id=eq.${encodeURIComponent(guitarId)}&limit=1`, { serviceRole: true });
    }
  }
  const data = rows[0] || null;

  if (!data || !isEligiblePublicProfile(data, { allowUnlisted: true })) {
    return null;
  }

  const [related, trustByCode] = await Promise.all([
    loadRelated([data], true),
    loadTrustSettingsMap([data.qr_code])
  ]);
  const ownerProfile = related.profiles.get(data.owner_id || "");
  if (ownerProfile?.hide_public_content === true || ownerProfile?.account_status === "banned" || ownerProfile?.account_status === "removed") {
    return null;
  }
  const heroStoragePath = data.hero_image_path || "";
  const media = resolveMediaSources((related.media.get(data.id) || []).filter((storagePath) => storagePath !== heroStoragePath), data.qr_code);
  const heroImagePath = heroStoragePath ? resolveMediaSources([heroStoragePath], data.qr_code)[0] : "";
  const documents = resolveDocumentSources(related.documents.get(data.id) || [], data.qr_code);

  return sanitizePublicInstrument(mapRecord({
    guitar: { ...data, hero_image_path: heroImagePath || data.hero_image_path },
    media,
    documents,
    serviceEvents: related.serviceEvents.get(data.id) || [],
    externalMedia: (related.externalMedia.get(data.id) || []).map((item) => ({
      id: item.id,
      provider: item.provider,
      canonicalUrl: item.canonical_url,
      providerId: item.provider_id || undefined,
      title: item.title,
      caption: item.caption,
      thumbnailUrl: item.thumbnail_url || undefined,
      isPublic: true,
      sortOrder: item.sort_order,
      createdAt: item.created_at
    })),
    specs: related.specs.get(data.id) || [],
    ownerName: related.collections.get(data.owner_id || "")?.publicName || "Collection",
    publicCollection: related.collections.get(data.owner_id || ""),
    trust: trustByCode.get(data.qr_code.toUpperCase())
  }));
}
