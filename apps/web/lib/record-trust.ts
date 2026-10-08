export type AuthenticityStatus = "unconfirmed" | "confirmed";

export type RecordTrustSettings = {
  authenticityStatus: AuthenticityStatus;
  showVerificationBadge: boolean;
  showAuthenticityBadge: boolean;
  showSerialPublic: boolean;
  serialExceptionApproved: boolean;
  internalVerificationNote: string;
  publicVerificationNote: string;
  internalAuthenticityNote: string;
  publicAuthenticityNote: string;
};

export const defaultRecordTrustSettings: RecordTrustSettings = {
  authenticityStatus: "unconfirmed",
  showVerificationBadge: true,
  showAuthenticityBadge: true,
  showSerialPublic: false,
  serialExceptionApproved: false,
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
    // Legacy trust rows predate this preference. Preserve their original public
    // serial display while continuing to honor every explicit hide choice.
    showSerialPublic: settings != null && settings.showSerialPublic !== false,
    serialExceptionApproved: settings?.serialExceptionApproved === true,
    internalVerificationNote: String(settings?.internalVerificationNote || "").trim(),
    publicVerificationNote: String(settings?.publicVerificationNote || "").trim(),
    internalAuthenticityNote: String(settings?.internalAuthenticityNote || "").trim(),
    publicAuthenticityNote: String(settings?.publicAuthenticityNote || "").trim()
  };
}
