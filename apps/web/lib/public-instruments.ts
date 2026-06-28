import { createServerSupabaseClient } from "./supabase-server";
import { defaultQrStyle, type DemoInstrument } from "./local-demo";

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
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

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
        resolved.push({ name: document.name, url: data.signedUrl, visibility: "public" });
      }
      continue;
    }

    resolved.push({ name: document.name, url: source, visibility: "public" });
  }

  return resolved;
}

function mapRecord({
  guitar,
  media,
  specs,
  documents,
  ownerName
}: {
  guitar: GuitarRow;
  media: string[];
  specs: SpecRow[];
  documents: NonNullable<DemoInstrument["documentFiles"]>;
  ownerName?: string;
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
    serial: guitar.serial_number || "",
    year: guitar.year || "",
    instrumentCondition: condition,
    creatorAccountType: "customer",
    packageIncludesFirstTransfer: false,
    verificationStatus: guitar.status === "verified" ? "verified" : "unverified",
    instrumentType: type,
    builder: guitar.builder || "",
    owner: ownerName || guitar.builder || "Unclaimed",
    ownerUserEmail: "",
    location: guitar.location || "",
    visibility: guitar.visibility === "private" ? "private" : guitar.visibility === "unlisted" ? "unlisted" : "public",
    summary: publicSummary(guitar.summary),
    finish,
    heroImageDataUrl: hero,
    galleryImageDataUrls: gallery,
    customFields,
    customLinks: [],
    documentFiles: documents,
    qrStyle: defaultQrStyle,
    createdAt: guitar.created_at || new Date().toISOString()
  };
}

async function loadRelated(guitars: GuitarRow[]) {
  const supabase = createServerSupabaseClient();
  if (!supabase || !guitars.length) {
    return { media: new Map<string, string[]>(), specs: new Map<string, SpecRow[]>(), documents: new Map<string, DocumentRow[]>(), profiles: new Map<string, ProfileRow>() };
  }

  const ids = guitars.map((guitar) => guitar.id);
  const ownerIds = guitars.map((guitar) => guitar.owner_id).filter(Boolean) as string[];
  const [mediaResult, specsResult, documentsResult, profilesResult] = await Promise.all([
    supabase.from("guitar_media").select("guitar_id,storage_path").in("guitar_id", ids),
    supabase.from("guitar_specs").select("guitar_id,label,value").in("guitar_id", ids),
    supabase.from("guitar_documents").select("guitar_id,name,storage_path,is_public").in("guitar_id", ids),
    ownerIds.length ? supabase.from("profiles").select("id,display_name").in("id", ownerIds) : Promise.resolve({ data: [], error: null })
  ]);

  if (mediaResult.error || specsResult.error || documentsResult.error || profilesResult.error) {
    throw new Error(mediaResult.error?.message || specsResult.error?.message || documentsResult.error?.message || profilesResult.error?.message || "Could not load related instrument data.");
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
  for (const row of (profilesResult.data || []) as ProfileRow[]) {
    profiles.set(row.id, row);
  }

  return { media, specs, documents, profiles };
}

export async function getPublicInstruments() {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("guitars")
    .select("id,owner_id,qr_code,permanent_path,name,brand,model,year,serial_number,builder,location,status,visibility,summary,hero_image_path,created_at")
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  if (error || !data) {
    throw new Error(error?.message || "Could not load public instruments.");
  }

  const guitars = data as GuitarRow[];
  const related = await loadRelated(guitars);

  return Promise.all(
    guitars.map(async (guitar) => {
      const heroStoragePath = guitar.hero_image_path || "";
      const media = await resolveMediaSources((related.media.get(guitar.id) || []).filter((storagePath) => storagePath !== heroStoragePath));
      const heroImagePath = heroStoragePath ? (await resolveMediaSources([heroStoragePath]))[0] : "";
      const documents = await resolveDocumentSources(related.documents.get(guitar.id) || []);
      return mapRecord({
        guitar: { ...guitar, hero_image_path: heroImagePath || guitar.hero_image_path },
        media,
        documents,
        specs: related.specs.get(guitar.id) || [],
        ownerName: related.profiles.get(guitar.owner_id || "")?.display_name || guitar.builder || ""
      });
    })
  );
}

export async function getPublicInstrumentByCode(code: string) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("guitars")
    .select("id,owner_id,qr_code,permanent_path,name,brand,model,year,serial_number,builder,location,status,visibility,summary,hero_image_path,created_at")
    .eq("qr_code", code.toUpperCase())
    .maybeSingle<GuitarRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.visibility === "private") {
    return null;
  }

  const related = await loadRelated([data]);
  const heroStoragePath = data.hero_image_path || "";
  const media = await resolveMediaSources((related.media.get(data.id) || []).filter((storagePath) => storagePath !== heroStoragePath));
  const heroImagePath = heroStoragePath ? (await resolveMediaSources([heroStoragePath]))[0] : "";
  const documents = await resolveDocumentSources(related.documents.get(data.id) || []);

  return mapRecord({
    guitar: { ...data, hero_image_path: heroImagePath || data.hero_image_path },
    media,
    documents,
    specs: related.specs.get(data.id) || [],
    ownerName: related.profiles.get(data.owner_id || "")?.display_name || data.builder || "Unclaimed"
  });
}
