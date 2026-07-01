export type AuthenticityStatus = "unconfirmed" | "confirmed";

export type RecordTrustSettings = {
  authenticityStatus: AuthenticityStatus;
  showVerificationBadge: boolean;
  showAuthenticityBadge: boolean;
  internalVerificationNote: string;
  publicVerificationNote: string;
  internalAuthenticityNote: string;
  publicAuthenticityNote: string;
};

export const defaultRecordTrustSettings: RecordTrustSettings = {
  authenticityStatus: "unconfirmed",
  showVerificationBadge: true,
  showAuthenticityBadge: true,
  internalVerificationNote: "",
  publicVerificationNote: "",
  internalAuthenticityNote: "",
  publicAuthenticityNote: ""
};

export function recordTrustContentKey(qrCode: string) {
  return `record_trust:${String(qrCode || "").trim().toUpperCase()}`;
}

export function mergeRecordTrustSettings(settings?: Partial<RecordTrustSettings> | null): RecordTrustSettings {
  return {
    ...defaultRecordTrustSettings,
    ...(settings || {}),
    authenticityStatus: settings?.authenticityStatus === "confirmed" ? "confirmed" : "unconfirmed",
    showVerificationBadge: settings?.showVerificationBadge === false ? false : true,
    showAuthenticityBadge: settings?.showAuthenticityBadge === false ? false : true,
    internalVerificationNote: String(settings?.internalVerificationNote || "").trim(),
    publicVerificationNote: String(settings?.publicVerificationNote || "").trim(),
    internalAuthenticityNote: String(settings?.internalAuthenticityNote || "").trim(),
    publicAuthenticityNote: String(settings?.publicAuthenticityNote || "").trim()
  };
}
