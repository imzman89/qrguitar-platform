import { adminJson, requireAdmin } from "../_utils";
import { mergeRecordTrustSettings, recordTrustContentKey } from "../../../../lib/record-trust";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type GuitarRow = {
  id: string;
  owner_id: string | null;
  qr_code: string;
  permanent_path: string | null;
  name: string | null;
  brand: string | null;
  model: string | null;
  status: string | null;
  visibility: string | null;
  safety_status?: string | null;
  created_at: string | null;
  updated_at?: string | null;
};

type SiteContentRow = {
  content_key: string;
  content_value: unknown;
};

function countByGuitar<T extends { guitar_id?: string | null }>(rows: T[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.guitar_id) {
      counts.set(row.guitar_id, (counts.get(row.guitar_id) || 0) + 1);
    }
  }
  return counts;
}

export async function GET(request: Request) {
  const access = await requireAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  const { supabase } = access;
  const [guitarsResult, documentsResult, serviceResult, transfersResult, authUsers] = await Promise.all([
    supabase
      .from("guitars")
      .select("id,owner_id,qr_code,permanent_path,name,brand,model,status,visibility,safety_status,created_at,updated_at")
      .order("created_at", { ascending: false }),
    supabase.from("guitar_documents").select("id,guitar_id,is_public,document_type,created_at"),
    supabase.from("guitar_timeline_events").select("id,guitar_id,is_public,event_type,title,created_at"),
    supabase.from("ownership_transfers").select("id,guitar_id,status,to_email,created_at,accepted_at"),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ]);

  if (guitarsResult.error) {
    return adminJson({ ok: false, message: guitarsResult.error.message || "Could not load records." }, { status: 500 });
  }

  const guitars = (guitarsResult.data || []) as GuitarRow[];
  const documentCounts = countByGuitar((documentsResult.data || []) as Array<{ guitar_id: string | null }>);
  const serviceCounts = countByGuitar((serviceResult.data || []) as Array<{ guitar_id: string | null }>);
  const transferCounts = countByGuitar((transfersResult.data || []) as Array<{ guitar_id: string | null }>);
  const usersById = new Map((authUsers.data?.users || []).map((user) => [user.id, user.email || ""]));

  const trustKeys = guitars.map((guitar) => recordTrustContentKey(guitar.qr_code));
  const trustResult = trustKeys.length
    ? await supabase.from("site_content").select("content_key,content_value").in("content_key", trustKeys)
    : { data: [], error: null };
  const trustByCode = new Map<string, ReturnType<typeof mergeRecordTrustSettings>>();
  for (const row of (trustResult.data || []) as SiteContentRow[]) {
    const code = row.content_key.replace(/^record_trust:/, "").toUpperCase();
    trustByCode.set(code, mergeRecordTrustSettings(row.content_value as Parameters<typeof mergeRecordTrustSettings>[0]));
  }

  return adminJson({
    ok: true,
    records: guitars.map((guitar) => {
      const trust = trustByCode.get(guitar.qr_code.toUpperCase());
      return {
        id: guitar.id,
        qrCode: guitar.qr_code,
        permanentPath: guitar.permanent_path || `/i/${guitar.qr_code}`,
        title: guitar.name || [guitar.brand, guitar.model].filter(Boolean).join(" ") || guitar.qr_code,
        brand: guitar.brand || "",
        model: guitar.model || "",
        ownerId: guitar.owner_id || "",
        ownerEmail: usersById.get(guitar.owner_id || "") || "",
        visibility: guitar.visibility || "private",
        verificationStatus: guitar.status === "verified" ? "Verified" : "Unverified",
        authenticityStatus: trust?.authenticityStatus === "confirmed" ? "Authenticity Confirmed" : "Authenticity Unconfirmed",
        safetyStatus: guitar.safety_status || "clear",
        serviceEventCount: serviceCounts.get(guitar.id) || 0,
        proofDocumentCount: documentCounts.get(guitar.id) || 0,
        transferCount: transferCounts.get(guitar.id) || 0,
        createdAt: guitar.created_at || "",
        updatedAt: guitar.updated_at || ""
      };
    }),
    proofDocuments: documentsResult.data || [],
    serviceEvents: serviceResult.data || [],
    transfers: transfersResult.data || []
  });
}
