export type DemoUser = {
  name: string;
  email: string;
  role: "owner" | "builder" | "shop";
  plan?: AccountPlan;
  verificationStatus?: AccountVerificationStatus;
};

export type InstrumentCondition = "new" | "used";
export type CreatorAccountType = "customer" | "brand" | "shop" | "commercial";
export type AccountPlan = "free" | "paid" | "brand" | "commercial";
export type AccountVerificationStatus = "unverified" | "verified" | "flagged";
export type RecordVerificationStatus = "unverified" | "verified";

export type DemoInstrument = {
  qrCode: string;
  permanentPath: string;
  name: string;
  brand: string;
  model: string;
  serial: string;
  year: string;
  instrumentCondition?: InstrumentCondition;
  creatorAccountType?: CreatorAccountType;
  packageIncludesFirstTransfer?: boolean;
  verificationStatus?: RecordVerificationStatus;
  instrumentType?: string;
  builder?: string;
  owner: string;
  location: string;
  visibility?: "public" | "private";
  summary: string;
  finish?: string;
  bodyWood?: string;
  neckWood?: string;
  pickups?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  youtubeUrl?: string;
  reverbUrl?: string;
  shopUrl?: string;
  customFields?: CustomProfileField[];
  customLinks?: CustomProfileLink[];
  heroImageDataUrl?: string;
  galleryImageDataUrls?: string[];
  qrStyle: QrStyle;
  createdAt: string;
};

export type CustomProfileField = {
  id: string;
  label: string;
  value: string;
};

export type CustomProfileLink = {
  id: string;
  label: string;
  url: string;
};

export type DemoTransfer = {
  id: string;
  guitarQrCode: string;
  guitarName: string;
  fromOwnerName: string;
  toEmail: string;
  toName: string;
  status: "sent" | "accepted" | "cancelled";
  feeCents: number;
  feeWaivedReason?: "included_plan_transfer";
  claimPath: string;
  createdAt: string;
  acceptedAt?: string;
};

export type QrStyle = {
  foreground: string;
  background: string;
  includeLabel: boolean;
  labelText: string;
  shape: "classic" | "soft";
};

export const defaultQrStyle: QrStyle = {
  foreground: "#f8f6f2",
  background: "#071014",
  includeLabel: true,
  labelText: "Scan for verified QRguitar record",
  shape: "classic"
};

export const demoInstrument: DemoInstrument = {
  qrCode: "QRG-PI260001",
  permanentPath: "/i/QRG-PI260001",
  name: "Reptile",
  brand: "Proper Instruments",
  model: "1-of-1",
  serial: "PI260001",
  year: "2026",
  instrumentCondition: "new",
  creatorAccountType: "brand",
  packageIncludesFirstTransfer: true,
  verificationStatus: "verified",
  instrumentType: "Electric guitar",
  builder: "Gary Z.",
  owner: "Unclaimed",
  location: "Cranston, Rhode Island, USA",
  visibility: "public",
  summary:
    "A one-of-one handcrafted Proper Instruments build with verified builder details, provenance, photos, service notes, ownership transfer readiness, and documentation attached to the instrument for life.",
  finish: "Green and gold relic burst",
  bodyWood: "Alder",
  neckWood: "Maple neck, rosewood board",
  pickups: "Proper Instruments '64 Closetcaster set",
  websiteUrl: "https://qrguitar.com",
  shopUrl: "https://qrguitar.com",
  customFields: [
    { id: "demo-weight", label: "Weight", value: "7 lb 8 oz" },
    { id: "demo-neck", label: "Neck Shape", value: "Medium C" },
    { id: "demo-radius", label: "Neck Radius", value: "9.5 in" },
    { id: "demo-frets", label: "Fretwork", value: "6105 nickel, leveled and crowned" },
    { id: "demo-setup", label: "Setup", value: "10-46 strings, low action, intonated June 2026" },
    { id: "demo-case", label: "Case Candy", value: "Certificate, spec sheet, hang tag, and setup card" }
  ],
  customLinks: [
    { id: "demo-builder-link", label: "Builder Website", url: "https://qrguitar.com" },
    { id: "demo-video-link", label: "Demo Video", url: "https://qrguitar.com" }
  ],
  heroImageDataUrl: "/media/reptile-hero.jpg",
  galleryImageDataUrls: ["/media/reptile-hero.jpg", "/media/reptile-body.jpg", "/media/reptile-record.jpg"],
  qrStyle: defaultQrStyle,
  createdAt: "2026-06-22T00:00:00.000Z"
};

const userKey = "qrguitar.demoUser";
const instrumentsKey = "qrguitar.demoInstruments";
const transfersKey = "qrguitar.demoTransfers";

export function getDemoUser(): DemoUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(userKey);
  return stored ? normalizeDemoUser(JSON.parse(stored) as DemoUser) : null;
}

export function saveDemoUser(user: DemoUser) {
  window.localStorage.setItem(userKey, JSON.stringify(normalizeDemoUser(user)));
}

export function clearDemoUser() {
  window.localStorage.removeItem(userKey);
}

export function getDemoInstruments(): DemoInstrument[] {
  if (typeof window === "undefined") {
    return [];
  }

  const stored = window.localStorage.getItem(instrumentsKey);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const items = parsed
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        return normalizeDemoInstrument(item as DemoInstrument);
      })
      .filter((item): item is DemoInstrument => Boolean(item && item.qrCode && item.permanentPath));

    return dedupeDemoInstruments(items);
  } catch (error) {
    console.error("Resetting invalid demo instrument cache.", error);
    window.localStorage.removeItem(instrumentsKey);
    return [];
  }
}

export function getPublicDemoInstruments() {
  return getDemoInstruments().filter((instrument) => instrument.visibility !== "private");
}

export function saveDemoInstrument(instrument: DemoInstrument) {
  const current = getDemoInstruments();
  let nextInstrument = normalizeDemoInstrument(instrument);

  const sameRecord = current.find(
    (item) => item.qrCode.toUpperCase() === nextInstrument.qrCode.toUpperCase() && item.createdAt === nextInstrument.createdAt
  );

  if (sameRecord) {
    const withoutDuplicate = current.filter((item) => item.qrCode.toUpperCase() !== nextInstrument.qrCode.toUpperCase());
    window.localStorage.setItem(instrumentsKey, JSON.stringify([nextInstrument, ...withoutDuplicate]));
    return;
  }

  const duplicateCodeIndex = current.findIndex((item) => item.qrCode.toUpperCase() === nextInstrument.qrCode.toUpperCase());
  if (duplicateCodeIndex !== -1) {
    const next = [...current];
    next[duplicateCodeIndex] = nextInstrument;
    window.localStorage.setItem(instrumentsKey, JSON.stringify(next));
    return;
  }

  const withoutDuplicate = current.filter((item) => item.qrCode.toUpperCase() !== nextInstrument.qrCode.toUpperCase());
  window.localStorage.setItem(instrumentsKey, JSON.stringify([nextInstrument, ...withoutDuplicate]));
}

export function deleteDemoInstrument(qrCode: string) {
  const current = getDemoInstruments();
  window.localStorage.setItem(
    instrumentsKey,
    JSON.stringify(current.filter((item) => item.qrCode.toUpperCase() !== qrCode.toUpperCase()))
  );
}

export function getDemoTransfers(): DemoTransfer[] {
  if (typeof window === "undefined") {
    return [];
  }

  const stored = window.localStorage.getItem(transfersKey);
  return stored ? (JSON.parse(stored) as DemoTransfer[]) : [];
}

export function saveDemoTransfer(transfer: DemoTransfer) {
  const current = getDemoTransfers();
  const withoutDuplicate = current.filter((item) => item.id !== transfer.id);
  window.localStorage.setItem(transfersKey, JSON.stringify([transfer, ...withoutDuplicate]));
}

export function findDemoTransfer(id: string) {
  return getDemoTransfers().find((transfer) => transfer.id === id) ?? null;
}

export function createDemoTransfer(instrument: DemoInstrument, toEmail: string, toName: string, fromOwnerName = "Current owner") {
  const id = `TR-${randomCodeBody()}`;
  const includedFirstTransfer = allowsIncludedFirstTransfer(instrument);

  const transfer: DemoTransfer = {
    id,
    guitarQrCode: instrument.qrCode,
    guitarName: instrumentDisplayName(instrument),
    fromOwnerName,
    toEmail,
    toName,
    status: "sent",
    feeCents: includedFirstTransfer ? 0 : 700,
    feeWaivedReason: includedFirstTransfer ? "included_plan_transfer" : undefined,
    claimPath: `/transfer/${id}`,
    createdAt: new Date().toISOString()
  };

  saveDemoTransfer(transfer);
  return transfer;
}

export function acceptDemoTransfer(id: string, user: DemoUser) {
  const transfer = findDemoTransfer(id);

  if (!transfer || transfer.status !== "sent") {
    return null;
  }

  const instruments = getDemoInstruments();
  const instrument = instruments.find((item) => item.qrCode === transfer.guitarQrCode);

  if (instrument) {
    saveDemoInstrument({
      ...instrument,
      owner: user.name || transfer.toName || user.email
    });
  }

  const acceptedTransfer: DemoTransfer = {
    ...transfer,
    toEmail: user.email,
    toName: user.name || transfer.toName,
    status: "accepted",
    acceptedAt: new Date().toISOString()
  };

  saveDemoTransfer(acceptedTransfer);
  return acceptedTransfer;
}

export function generatePermanentQrCode(existingCodes: string[] = [], serialNumber = "") {
  const taken = new Set(existingCodes.map((code) => code.toUpperCase()));
  const serialBody = sanitizeCodePart(serialNumber);

  if (serialBody) {
    return `QRG-${serialBody}`;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `QRG-${randomCodeBody()}`;

    if (!taken.has(code)) {
      return code;
    }
  }

  return `QRG-${Date.now().toString(36).toUpperCase()}`;
}

function sanitizeCodePart(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 24);
}

function randomCodeBody() {
  if (typeof window !== "undefined" && window.crypto) {
    const bytes = new Uint8Array(5);
    window.crypto.getRandomValues(bytes);

    return Array.from(bytes)
      .map((byte) => byte.toString(36).padStart(2, "0"))
      .join("")
      .toUpperCase()
      .slice(0, 10);
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase().slice(0, 10);
}

function dedupeDemoInstruments(instruments: DemoInstrument[]): DemoInstrument[] {
  const byCode = new Map<string, DemoInstrument>();

  for (const instrument of instruments) {
    const code = instrument.qrCode.toUpperCase();
    const existing = byCode.get(code);
    const currentDate = Date.parse(instrument.createdAt || "");
    const existingDate = existing ? Date.parse(existing.createdAt || "") : NaN;

    if (!existing || Number.isNaN(existingDate) || (!Number.isNaN(currentDate) && currentDate > existingDate)) {
      byCode.set(code, instrument);
    }
  }

  return Array.from(byCode.values());
}

export function findDemoInstrument(code: string) {
  return getDemoInstruments().find((instrument) => instrument.qrCode.toUpperCase() === code.toUpperCase()) ?? null;
}

export function instrumentToProfileUrl(instrument: DemoInstrument) {
  return instrument.permanentPath || `/i/${instrument.qrCode}`;
}

export function instrumentDisplayName(instrument: Pick<DemoInstrument, "name" | "brand" | "model" | "serial">) {
  const makeModel = [instrument.brand, instrument.model].filter(Boolean).join(" ");
  return instrument.name || makeModel || instrument.serial || "Untitled instrument";
}

export function getAccountPlan(user?: Pick<DemoUser, "plan"> | null): AccountPlan {
  return user?.plan === "paid" || user?.plan === "brand" || user?.plan === "commercial" ? user.plan : "free";
}

export function getAccountVerificationStatus(
  user?: Pick<DemoUser, "plan" | "verificationStatus"> | null
): AccountVerificationStatus {
  if (user?.verificationStatus === "flagged") {
    return "flagged";
  }

  if (user?.verificationStatus === "verified") {
    return "verified";
  }

  return getAccountPlan(user) === "free" ? "unverified" : "verified";
}

export function getInstrumentVerificationStatus(
  instrument: Pick<DemoInstrument, "verificationStatus">
): RecordVerificationStatus {
  return instrument.verificationStatus === "verified" ? "verified" : "unverified";
}

export function getDefaultInstrumentVerificationStatus(user?: Pick<DemoUser, "plan" | "verificationStatus"> | null) {
  return getAccountVerificationStatus(user) === "verified" ? "verified" : "unverified";
}

export function isFreeInstrumentLimitReached(user: DemoUser | null, instruments: DemoInstrument[]) {
  return getAccountPlan(user) === "free" && instruments.length >= 2;
}

export function getInstrumentCondition(instrument: Pick<DemoInstrument, "instrumentCondition">): InstrumentCondition {
  return instrument.instrumentCondition === "new" ? "new" : "used";
}

export function allowsIncludedFirstTransfer(
  instrument: Pick<DemoInstrument, "instrumentCondition" | "creatorAccountType" | "packageIncludesFirstTransfer">
) {
  if (getInstrumentCondition(instrument) !== "new") {
    return false;
  }

  return (
    instrument.packageIncludesFirstTransfer === true ||
    instrument.creatorAccountType === "brand" ||
    instrument.creatorAccountType === "shop" ||
    instrument.creatorAccountType === "commercial"
  );
}

export function transferFeeLabel(instrument: Pick<DemoInstrument, "instrumentCondition" | "creatorAccountType" | "packageIncludesFirstTransfer">) {
  return allowsIncludedFirstTransfer(instrument) ? "$0 included first handoff" : "$7 transfer when ownership changes";
}

export function transferHelperCopy(instrument: Pick<DemoInstrument, "instrumentCondition" | "creatorAccountType" | "packageIncludesFirstTransfer">) {
  return allowsIncludedFirstTransfer(instrument)
    ? "This new instrument has an included first-owner handoff through the creator account or package."
    : "Used/customer records do not include a free transfer by default. Create a paid transfer link when ownership changes.";
}

function normalizeDemoInstrument(instrument: DemoInstrument): DemoInstrument {
  const style = instrument.qrStyle || defaultQrStyle;
  const hasLegacyDefaultQr = style.foreground === "#071014" && style.background === "#f5f0df";
  const normalizedCode = String(instrument.qrCode || "").trim().toUpperCase();
  const normalizedPath = instrument.permanentPath || `/i/${normalizedCode}`;

  return {
    ...instrument,
    qrCode: normalizedCode || instrument.qrCode,
    permanentPath: normalizedPath,
    createdAt: instrument.createdAt || new Date().toISOString(),
    visibility: instrument.visibility || "public",
    instrumentCondition: getInstrumentCondition(instrument),
    creatorAccountType: instrument.creatorAccountType || "customer",
    packageIncludesFirstTransfer: instrument.packageIncludesFirstTransfer === true,
    verificationStatus: getInstrumentVerificationStatus(instrument),
    qrStyle: hasLegacyDefaultQr ? defaultQrStyle : style
  };
}

function normalizeDemoUser(user: DemoUser): DemoUser {
  const plan = getAccountPlan(user);

  return {
    ...user,
    plan,
    verificationStatus: user.verificationStatus === "flagged" ? "flagged" : plan === "free" ? "unverified" : "verified"
  };
}
