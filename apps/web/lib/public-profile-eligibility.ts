export const retiredPublicProfileCodes = new Set(["QRG-PI260001", "QRG-0001"]);

export function normalizePublicProfileCode(value: string) {
  return String(value || "").trim().toUpperCase();
}

export function isRetiredPublicProfileCode(value: string) {
  return retiredPublicProfileCodes.has(normalizePublicProfileCode(value));
}

type PublicProfileEligibilityRecord = {
  qr_code?: string | null;
  qrCode?: string | null;
  visibility?: string | null;
  admin_archived_at?: string | null;
  owner_removed_at?: string | null;
};

export function isEligiblePublicProfile(
  record: PublicProfileEligibilityRecord,
  options: { allowUnlisted?: boolean } = {}
) {
  const code = normalizePublicProfileCode(record.qr_code || record.qrCode || "");
  const visibility = String(record.visibility || "public").trim().toLowerCase();

  if (!code || isRetiredPublicProfileCode(code) || record.admin_archived_at || record.owner_removed_at) {
    return false;
  }

  return visibility === "public" || (options.allowUnlisted === true && visibility === "unlisted");
}
