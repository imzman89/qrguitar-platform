import { formatRecordLocation } from "./record-location";
import { FREE_PROFILE_ALLOWANCE } from "@qrguitar/shared";

export type DemoUser = {
  name: string;
  email: string;
  role: "owner" | "builder" | "shop";
  plan?: AccountPlan;
  verificationStatus?: AccountVerificationStatus;
};

export type DemoLoginMode = "register" | "login" | "magic";

type StoredDemoUser = DemoUser & {
  passwordDigest?: string;
  createdAt: string;
  emailVerified: boolean;
  lastLoginAt?: string;
};

type MagicCodeRecord = {
  code: string;
  expiresAt: number;
  tries: number;
};

export type InstrumentCondition = "new" | "used";
export type SaleStatus = "for_sale" | "not_for_sale";
export type OriginalityStatus = "all_original" | "modified" | "unknown";
export type CreatorAccountType = "customer" | "brand" | "shop" | "commercial";
export type AccountPlan = "free" | "paid" | "brand" | "commercial";
export type AccountVerificationStatus = "unverified" | "verified" | "flagged";
export type RecordVerificationStatus = "unverified" | "verified";
export type RecordAuthenticityStatus = "unconfirmed" | "confirmed";
export type RecordSafetyStatus = "clear" | "lost" | "stolen" | "recovered";

export type DemoInstrument = {
  /** Internal database identity, exposed only by authenticated owner reads. */
  recordId?: string;
  qrCode: string;
  permanentPath: string;
  name: string;
  brand: string;
  model: string;
  serial: string;
  serialNotUsed?: boolean;
  year: string;
  instrumentCondition?: InstrumentCondition;
  saleStatus?: SaleStatus;
  originalityStatus?: OriginalityStatus;
  creatorAccountType?: CreatorAccountType;
  packageIncludesFirstTransfer?: boolean;
  verificationStatus?: RecordVerificationStatus;
  authenticityStatus?: RecordAuthenticityStatus;
  showVerificationBadge?: boolean;
  showAuthenticityBadge?: boolean;
  showSerialPublic?: boolean;
  serialExceptionApproved?: boolean;
  internalVerificationNote?: string;
  publicVerificationNote?: string;
  internalAuthenticityNote?: string;
  publicAuthenticityNote?: string;
  safetyStatus?: RecordSafetyStatus;
  publicSafetyNote?: string;
  safetyStatusUpdatedAt?: string;
  safetyNote?: string;
  collectionRemovedAt?: string;
  collectionRemovedReason?: string;
  instrumentType?: string;
  builder?: string;
  owner: string;
  publicCollection?: {
    handle: string;
    publicName: string;
    accountType: string;
    websiteUrl?: string;
    bio?: string;
    location?: string;
    avatarUrl?: string;
    allowMessages?: boolean;
  };
  ownerUserEmail?: string;
  location: string;
  visibility?: "public" | "private" | "unlisted";
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
  documentFiles?: CustomDocumentFile[];
  timelineEvents?: ServiceHistoryEntry[];
  serviceEvents?: ServiceHistoryEntry[];
  externalMedia?: ExternalMediaItem[];
  ownershipTransferCount?: number;
  heroImageDataUrl?: string;
  galleryImageDataUrls?: string[];
  qrStyle: QrStyle;
  createdAt: string;
  updatedAt?: string;
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

export type CustomDocumentFile = {
  id?: string;
  mimeType?: string;
  name: string;
  url: string;
  visibility?: "public" | "hidden";
  documentType?: string;
  publicDescription?: string;
  privateNotes?: string;
  issuerSource?: string;
  documentDate?: string;
  description?: string;
  fileSizeBytes?: number;
  relatedTimelineEventId?: string;
  relatedServiceEventId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ServiceHistoryEntry = {
  id: string;
  serviceDate?: string;
  datePrecision?: "day" | "month" | "year" | "unknown";
  category?: string;
  eventType?: string;
  title: string;
  publicDescription?: string;
  privateNotes?: string;
  shopName?: string;
  location?: string;
  isPublic: boolean;
  isSystem?: boolean;
  relatedDocumentId?: string;
  relatedMediaId?: string;
  canEdit?: boolean;
  lockedReason?: string;
  sourceKind?: "owner_reported" | "provider_submitted_owner_approved";
  providerUserId?: string;
  providerDisplayName?: string;
  providerVerifiedAt?: string;
  evidenceReviewedAt?: string;
  serviceSubmissionId?: string;
  workOrderReference?: string;
  partsInstalled?: string;
  setupMeasurements?: string;
  whoPerformed?: "self" | "shop" | "unknown";
  createdAt?: string;
  updatedAt?: string;
};

export type ExternalMediaItem = {
  id: string;
  provider: "youtube" | "vimeo" | "audio" | "link";
  canonicalUrl: string;
  providerId?: string;
  title: string;
  caption?: string;
  thumbnailUrl?: string;
  isPublic: boolean;
  sortOrder?: number;
  createdAt?: string;
};

export type DemoTransfer = {
  id: string;
  guitarQrCode: string;
  guitarName: string;
  fromOwnerName: string;
  fromOwnerEmail?: string;
  toEmail: string;
  toName: string;
  status: "sent" | "accepted" | "cancelled";
  feeCents: number;
  feeWaivedReason?: "included_plan_transfer";
  paymentCollected: boolean;
  paymentCollectedAt?: string;
  paymentMethod?: string;
  claimPath: string;
  createdAt: string;
  claimVerificationCode?: string;
  claimVerificationExpiresAt?: number;
  claimVerificationTries?: number;
  claimEmailVerifiedAt?: string;
  acceptedAt?: string;
  cancelledAt?: string;
  handoffPrepared?: boolean;
  orderReferenceRequired?: boolean;
  expiresAt?: string;
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
  labelText: "Scan QRguitar Profile",
  shape: "classic"
};

export const demoInstrument: DemoInstrument = {
  qrCode: "QRG-LOCAL-SAMPLE",
  permanentPath: "/i/QRG-LOCAL-SAMPLE",
  name: "Local Sample Guitar",
  brand: "QRguitar Lab",
  model: "Development Sample",
  serial: "LOCAL-SAMPLE",
  year: "2026",
  instrumentCondition: "new",
  creatorAccountType: "brand",
  packageIncludesFirstTransfer: false,
  verificationStatus: "unverified",
  instrumentType: "Electric guitar",
  builder: "QRguitar Lab",
  owner: "QRguitar Lab",
  ownerUserEmail: "",
  location: "Local development",
  visibility: "public",
  summary:
    "Local development sample used only when browser draft storage needs a placeholder record.",
  finish: "",
  bodyWood: "",
  neckWood: "",
  pickups: "",
  websiteUrl: "https://www.qrguitar.com",
  shopUrl: "https://www.qrguitar.com",
  customFields: [
    { id: "demo-electronics", label: "Electronics", value: "Local sample electronics" },
    { id: "demo-pickups", label: "Pickups", value: "Local sample pickup set" },
    { id: "demo-neck", label: "Neck", value: "Local sample neck profile" },
    { id: "demo-qr-record", label: "QR Record", value: "Lifetime QRguitar tracker" },
    { id: "demo-weight", label: "Weight", value: "Sample weight" }
  ],
  customLinks: [],
  documentFiles: [],
  heroImageDataUrl: "",
  galleryImageDataUrls: [],
  qrStyle: defaultQrStyle,
  createdAt: "2026-06-22T00:00:00.000Z"
};

const DEMO_INSTRUMENT_CODES = new Set([demoInstrument.qrCode.toUpperCase()]);

const userKey = "qrguitar.demoUser";
const usersKey = "qrguitar.demoUsers";
const magicCodeKey = "qrguitar.demoMagicCodes";
const instrumentsKey = "qrguitar.demoInstruments";
const transfersKey = "qrguitar.demoTransfers";
const ownerCredentialsKey = "qrguitar.ownerCredentials";

type OwnerCredentials = {
  username: string;
  password: string;
};

export const defaultOwnerCredentials: OwnerCredentials = {
  username: "admin",
  password: "admin"
};

const ownerUserFallbackName = "QRguitar Owner";
const ownerUserFallbackEmail = "admin@qrguitar.local";

function normalizeEmail(value: string) {
  const trimmed = String(value || "").trim().toLowerCase();

  if (!trimmed.includes("@")) {
    return trimmed;
  }

  const [rawLocal, ...domainParts] = trimmed.split("@");
  const domain = domainParts.join("@");
  const local = rawLocal.split("+")[0].replace(/\./g, "");

  if (!domain) {
    return trimmed;
  }

  return `${local}@${domain}`;
}

export function getDisplayName(user: Pick<DemoUser, "name" | "email" | "role"> | null) {
  if (user?.name?.trim()) {
    return user.name.trim();
  }

  if (!user?.email) {
    return "Owner";
  }

  const emailLocal = user.email.split("@")[0]?.trim();
  if (!emailLocal) {
    return "Owner";
  }

  return emailLocal
    .split(/[.\-_]/g)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : ""))
    .filter(Boolean)
    .join(" ");
}

export function getOwnerCredentials(): OwnerCredentials {
  if (typeof window === "undefined") {
    return defaultOwnerCredentials;
  }

  const stored = window.localStorage.getItem(ownerCredentialsKey);
  if (!stored) {
    return defaultOwnerCredentials;
  }

  try {
    const parsed = JSON.parse(stored) as OwnerCredentials;
    if (!parsed || typeof parsed !== "object") {
      return defaultOwnerCredentials;
    }

    const username = String(parsed.username || "").trim();
    const password = String(parsed.password || "").trim();
    if (!username || !password) {
      return defaultOwnerCredentials;
    }

    return {
      username,
      password
    };
  } catch {
    return defaultOwnerCredentials;
  }
}

export function setOwnerCredentials(credentials: OwnerCredentials) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    ownerCredentialsKey,
    JSON.stringify({
      username: String(credentials.username || "").trim(),
      password: String(credentials.password || "").trim()
    })
  );
}

export function resetOwnerCredentials() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ownerCredentialsKey);
}

function ownerEmailFromCredential(username: string) {
  const cleaned = String(username || "").trim().toLowerCase();
  return cleaned.includes("@") ? cleaned : `${cleaned}@qrguitar.local`;
}

export function ensureOwnerDemoUser(credentials?: OwnerCredentials) {
  if (typeof window === "undefined") {
    return null;
  }

  const auth = credentials || getOwnerCredentials();
  const email = ownerEmailFromCredential(auth.username);
  const users = getStoredDemoUsers();
  const normalizedEmail = normalizeEmail(email);
  const existingIndex = users.findIndex((entry) => normalizeEmail(entry.email) === normalizedEmail);

  const ownerRecord: StoredDemoUser = {
    name: ownerUserFallbackName,
    email,
    role: "owner",
    plan: "commercial",
    verificationStatus: "verified",
    passwordDigest: btoa(auth.password || ""),
    createdAt: new Date().toISOString(),
    emailVerified: true
  };

  if (existingIndex >= 0) {
    users[existingIndex] = {
      ...users[existingIndex],
      name: ownerUserFallbackName,
      passwordDigest: ownerRecord.passwordDigest,
      plan: "commercial",
      verificationStatus: "verified",
      emailVerified: true
    };
  } else {
    users.push(ownerRecord);
  }

  saveDemoUsers(users);
  const owner = normalizeDemoUser(ownerRecord);
  saveDemoUser(owner);
  return owner;
}

export function getDemoUsers(): DemoUser[] {
  if (typeof window === "undefined") {
    return [];
  }

  const stored = window.localStorage.getItem(usersKey);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as StoredDemoUser[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((user) => {
        if (!user || typeof user !== "object" || typeof user.email !== "string") {
          return null;
        }

        return normalizeDemoUser({
          name: String(user.name || ""),
          email: String(user.email || ""),
          role: user.role || "owner",
          plan: user.plan,
          verificationStatus: user.verificationStatus
        });
      })
      .filter((user): user is DemoUser => Boolean(user && user.email));
  } catch {
    window.localStorage.removeItem(usersKey);
    return [];
  }
}

function saveDemoUsers(users: StoredDemoUser[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(usersKey, JSON.stringify(users));
}

function getStoredDemoUsers(): StoredDemoUser[] {
  if (typeof window === "undefined") {
    return [];
  }

  const stored = window.localStorage.getItem(usersKey);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as StoredDemoUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getDemoUser(): DemoUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(userKey);
  if (!stored) {
    return null;
  }

  try {
    return normalizeDemoUser(JSON.parse(stored) as DemoUser);
  } catch {
    window.localStorage.removeItem(userKey);
    return null;
  }
}

export function saveDemoUser(user: DemoUser) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeDemoUser(user);
  window.localStorage.setItem(userKey, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("qrguitar:auth", { detail: normalized }));
}

function getMagicCodes(): Record<string, MagicCodeRecord> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(magicCodeKey) || "{}") as Record<string, MagicCodeRecord>;
  } catch {
    return {};
  }
}

function setMagicCodes(codes: Record<string, MagicCodeRecord>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(magicCodeKey, JSON.stringify(codes));
}

export function findDemoUserByEmail(email: string): DemoUser | null {
  const normalized = normalizeEmail(email);
  const user = getStoredDemoUsers().find((entry) => normalizeEmail(entry.email) === normalized);

  if (!user) {
    return null;
  }

  return normalizeDemoUser({
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan,
    verificationStatus: user.verificationStatus
  });
}

export function registerDemoUser(user: DemoUser & { password?: string }) {
  if (typeof window === "undefined") {
    return { ok: false, reason: "Browser storage unavailable." };
  }

  const normalized = normalizeDemoUser(user);
  if (!normalized.email) {
    return { ok: false, reason: "Email is required." };
  }

  const users = getStoredDemoUsers();
  const email = normalizeEmail(normalized.email);
  if (users.some((entry) => normalizeEmail(entry.email) === email)) {
    return { ok: false, reason: "An account with that email already exists." };
  }

  ensureOwnerDemoUser();

  users.push({
    ...normalized,
    passwordDigest: user.password ? btoa(user.password) : undefined,
    createdAt: new Date().toISOString(),
    emailVerified: user.password ? true : false
  });

  saveDemoUsers(users);
  saveDemoUser({ ...normalized, email });
  return { ok: true, user: normalized };
}

export function loginDemoUserByEmail(email: string) {
  const matched = findDemoUserByEmail(email);

  if (!matched) {
    return { ok: false, reason: "No account found for that email." } as const;
  }

  saveDemoUser(matched);
  return { ok: true, user: matched } as const;
}

export function authenticateDemoUserWithPassword(email: string, password: string) {
  const normalized = normalizeEmail(email);
  const users = getStoredDemoUsers();
  const found = users.find((item) => normalizeEmail(item.email) === normalized);

  if (!found) {
    return { ok: false, reason: "No account found for that email." } as const;
  }

  if (found.passwordDigest && found.passwordDigest !== btoa(password)) {
    return { ok: false, reason: "Password does not match." } as const;
  }

  const user = normalizeDemoUser(found);
  saveDemoUser(user);
  return { ok: true, user } as const;
}

export function sendDemoMagicCode(email: string) {
  const user = findDemoUserByEmail(email);
  if (!user) {
    return { ok: false, reason: "No account found for that email." } as const;
  }

  const normalized = normalizeEmail(email);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codes = getMagicCodes();
  codes[normalized] = { code, expiresAt: Date.now() + 10 * 60 * 1000, tries: 0 };
  setMagicCodes(codes);

  // In production this is emailed by Supabase. For local demo, return the code so you can paste it.
  return { ok: true, code, email: user.email };
}

export function verifyDemoMagicCode(email: string, code: string) {
  const normalized = normalizeEmail(email);
  const codes = getMagicCodes();
  const record = codes[normalized];

  if (!record) {
    return { ok: false, reason: "No magic code was requested." } as const;
  }

  if (Date.now() > record.expiresAt) {
    delete codes[normalized];
    setMagicCodes(codes);
    return { ok: false, reason: "That code has expired." } as const;
  }

  if (record.tries >= 6) {
    delete codes[normalized];
    setMagicCodes(codes);
    return { ok: false, reason: "Too many tries. Request a new code." } as const;
  }

  if (record.code !== String(code).trim()) {
    record.tries += 1;
    codes[normalized] = record;
    setMagicCodes(codes);
    return { ok: false, reason: "That code is not correct." } as const;
  }

  delete codes[normalized];
  setMagicCodes(codes);

  const user = findDemoUserByEmail(normalized);
  if (!user) {
    return { ok: false, reason: "Account was removed before confirmation." } as const;
  }

  saveDemoUser(user);
  return { ok: true, user };
}

export function clearDemoUser() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(userKey);
  window.dispatchEvent(new CustomEvent("qrguitar:auth"));
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

export function getDemoInstrumentsForOwner(user: DemoUser | null) {
  if (!user?.email) {
    return [];
  }

  const normalizedEmail = normalizeEmail(user.email);
  const ownerRecords = getDemoInstruments().filter(
    (instrument) => normalizeEmail(instrument.ownerUserEmail || "") === normalizedEmail
  );

  return ownerRecords.filter((instrument) => !DEMO_INSTRUMENT_CODES.has(instrument.qrCode.toUpperCase()));
}

export function isDemoInstrumentRecord(instrument: Pick<DemoInstrument, "qrCode">) {
  return DEMO_INSTRUMENT_CODES.has(instrument.qrCode.toUpperCase());
}

export function getPublicDemoInstruments() {
  return dedupeDemoInstruments(getDemoInstruments().filter((instrument) => instrument.visibility !== "private"));
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
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as DemoTransfer[];
    return Array.isArray(parsed) ? parsed.map(normalizeDemoTransfer) : [];
  } catch {
    window.localStorage.removeItem(transfersKey);
    return [];
  }
}

export function saveDemoTransfer(transfer: DemoTransfer) {
  const current = getDemoTransfers();
  const nextTransfer = normalizeDemoTransfer(transfer);
  const withoutDuplicate = current.filter((item) => item.id !== nextTransfer.id);
  window.localStorage.setItem(transfersKey, JSON.stringify([nextTransfer, ...withoutDuplicate]));
}

export function findDemoTransfer(id: string) {
  return getDemoTransfers().find((transfer) => transfer.id === id) ?? null;
}

export function getLatestDemoTransferForInstrument(qrCode: string) {
  return getDemoTransfers()
    .filter((transfer) => transfer.guitarQrCode.toUpperCase() === qrCode.toUpperCase())
    .sort((first, second) => Date.parse(second.createdAt || "") - Date.parse(first.createdAt || ""))[0] ?? null;
}

export function getPendingDemoTransferForInstrument(qrCode: string) {
  return getDemoTransfers()
    .filter((transfer) => transfer.guitarQrCode.toUpperCase() === qrCode.toUpperCase() && transfer.status === "sent")
    .sort((first, second) => Date.parse(second.createdAt || "") - Date.parse(first.createdAt || ""))[0] ?? null;
}

export function validateTransferRecipient(toEmail: string, toName: string) {
  const email = normalizeEmail(toEmail);
  const name = toName.trim();

  if (!name) {
    return "Buyer name is required.";
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid buyer email.";
  }

  return "";
}

export function createDemoTransfer(
  instrument: DemoInstrument,
  toEmail: string,
  toName: string,
  fromOwnerName = "Current owner",
  fromOwnerEmail = ""
) {
  const validationMessage = validateTransferRecipient(toEmail, toName);
  if (validationMessage) {
    return { ok: false, reason: validationMessage } as const;
  }

  const pending = getPendingDemoTransferForInstrument(instrument.qrCode);
  if (pending) {
    return {
      ok: false,
      reason: `There is already a pending transfer for ${pending.toName || pending.toEmail}. Cancel it before creating a new one.`
    } as const;
  }

  const id = `TR-${randomCodeBody()}`;
  const transfer: DemoTransfer = {
    id,
    guitarQrCode: instrument.qrCode,
    guitarName: instrumentDisplayName(instrument),
    fromOwnerName,
    fromOwnerEmail: normalizeEmail(fromOwnerEmail),
    toEmail: normalizeEmail(toEmail),
    toName: toName.trim(),
    status: "sent",
    feeCents: 0,
    paymentCollected: true,
    claimPath: `/transfer/${id}`,
    createdAt: new Date().toISOString()
  };

  saveDemoTransfer(transfer);
  return { ok: true, transfer } as const;
}

export function cancelDemoTransfer(id: string) {
  const transfer = findDemoTransfer(id);

  if (!transfer || transfer.status !== "sent") {
    return { ok: false, reason: "This transfer cannot be cancelled." } as const;
  }

  const cancelledTransfer: DemoTransfer = {
    ...transfer,
    status: "cancelled",
    cancelledAt: new Date().toISOString()
  };

  saveDemoTransfer(cancelledTransfer);
  return { ok: true, transfer: cancelledTransfer } as const;
}

export function markTransferPaymentCollected(id: string, method = "manual") {
  const transfer = findDemoTransfer(id);

  if (!transfer || transfer.status !== "sent") {
    return { ok: false, reason: "Only pending transfers can be marked paid." } as const;
  }

  if (transfer.feeCents === 0) {
    const nextTransfer: DemoTransfer = {
      ...transfer,
      paymentCollected: true,
      paymentCollectedAt: transfer.paymentCollectedAt || new Date().toISOString(),
      paymentMethod: transfer.paymentMethod || "included"
    };
    saveDemoTransfer(nextTransfer);
    return { ok: true, transfer: nextTransfer } as const;
  }

  const nextTransfer: DemoTransfer = {
    ...transfer,
    paymentCollected: true,
    paymentCollectedAt: new Date().toISOString(),
    paymentMethod: method || "manual"
  };

  saveDemoTransfer(nextTransfer);
  return { ok: true, transfer: nextTransfer } as const;
}

export function sendDemoTransferClaimCode(id: string, email: string) {
  const transfer = findDemoTransfer(id);

  if (!transfer) {
    return { ok: false, reason: "This transfer link was not found." } as const;
  }

  if (transfer.status !== "sent") {
    return { ok: false, reason: "This transfer is no longer pending." } as const;
  }

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail !== normalizeEmail(transfer.toEmail)) {
    return { ok: false, reason: "Use the buyer email listed on this transfer." } as const;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const nextTransfer: DemoTransfer = {
    ...transfer,
    toEmail: normalizedEmail,
    claimVerificationCode: code,
    claimVerificationExpiresAt: Date.now() + 10 * 60 * 1000,
    claimVerificationTries: 0,
    claimEmailVerifiedAt: undefined
  };

  saveDemoTransfer(nextTransfer);
  return { ok: true, code, transfer: nextTransfer } as const;
}

export function verifyDemoTransferClaimCode(id: string, email: string, code: string) {
  const transfer = findDemoTransfer(id);

  if (!transfer) {
    return { ok: false, reason: "This transfer link was not found." } as const;
  }

  if (transfer.status !== "sent") {
    return { ok: false, reason: "This transfer is no longer pending." } as const;
  }

  if (normalizeEmail(email) !== normalizeEmail(transfer.toEmail)) {
    return { ok: false, reason: "Use the buyer email listed on this transfer." } as const;
  }

  if (!transfer.claimVerificationCode || !transfer.claimVerificationExpiresAt) {
    return { ok: false, reason: "Send a verification code first." } as const;
  }

  if (Date.now() > transfer.claimVerificationExpiresAt) {
    saveDemoTransfer({
      ...transfer,
      claimVerificationCode: undefined,
      claimVerificationExpiresAt: undefined,
      claimVerificationTries: undefined
    });
    return { ok: false, reason: "That code expired. Send a new one." } as const;
  }

  if ((transfer.claimVerificationTries || 0) >= 6) {
    saveDemoTransfer({
      ...transfer,
      claimVerificationCode: undefined,
      claimVerificationExpiresAt: undefined,
      claimVerificationTries: undefined
    });
    return { ok: false, reason: "Too many attempts. Send a new code." } as const;
  }

  if (String(code).trim() !== transfer.claimVerificationCode) {
    const nextTransfer = {
      ...transfer,
      claimVerificationTries: (transfer.claimVerificationTries || 0) + 1
    };
    saveDemoTransfer(nextTransfer);
    return { ok: false, reason: "That code is not correct." } as const;
  }

  const verifiedTransfer: DemoTransfer = {
    ...transfer,
    claimVerificationCode: undefined,
    claimVerificationExpiresAt: undefined,
    claimVerificationTries: undefined,
    claimEmailVerifiedAt: new Date().toISOString()
  };

  saveDemoTransfer(verifiedTransfer);
  return { ok: true, transfer: verifiedTransfer } as const;
}

export function acceptDemoTransfer(id: string, user: DemoUser) {
  const transfer = findDemoTransfer(id);

  if (!transfer || transfer.status !== "sent") {
    return { ok: false, reason: "This transfer is no longer available." } as const;
  }

  const normalizedBuyerEmail = normalizeEmail(user.email);
  if (normalizedBuyerEmail !== normalizeEmail(transfer.toEmail)) {
    return { ok: false, reason: "Sign in or claim with the buyer email on the transfer." } as const;
  }

  if (!transfer.claimEmailVerifiedAt) {
    return { ok: false, reason: "Verify the buyer email before accepting ownership." } as const;
  }

  const instruments = getDemoInstruments();
  const instrument = instruments.find((item) => item.qrCode === transfer.guitarQrCode);

  if (instrument) {
    saveDemoInstrument({
      ...instrument,
      owner: user.name || transfer.toName || user.email,
      ownerUserEmail: normalizedBuyerEmail,
      visibility: instrument.visibility || "public"
    });
  }

  const acceptedTransfer: DemoTransfer = {
    ...transfer,
    toEmail: normalizedBuyerEmail,
    toName: user.name || transfer.toName,
    status: "accepted",
    acceptedAt: new Date().toISOString()
  };

  saveDemoTransfer(acceptedTransfer);
  return { ok: true, transfer: acceptedTransfer } as const;
}

export function generatePermanentQrCode(existingCodes: string[] = [], serialNumber = "") {
  const taken = new Set(existingCodes.map((code) => code.toUpperCase()));
  const serialCode = String(serialNumber || "")
    .trim()
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^QRG-/, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  if (serialCode) {
    return `QRG-${serialCode}`;
  }

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = `QRG-${randomSixDigitCode()}`;

    if (!taken.has(code)) {
      return code;
    }
  }

  return `QRG-${String(Date.now() % 1_000_000).padStart(6, "0")}`;
}

function randomSixDigitCode() {
  if (typeof window !== "undefined" && window.crypto) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return String(values[0] % 1_000_000).padStart(6, "0");
  }

  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
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
  const name = String(instrument.name || "").trim();
  const brand = String(instrument.brand || "").trim();
  const model = String(instrument.model || "").trim();

  if (name) {
    return name;
  }

  if (brand && model) {
    return model.toLowerCase().startsWith(`${brand.toLowerCase()} `) ? model : `${brand} ${model}`;
  }

  return brand || model || instrument.serial || "Untitled instrument";
}

export function instrumentSubtitle(instrument: Pick<DemoInstrument, "brand" | "model" | "serial" | "year" | "location" | "qrCode" | "showSerialPublic">) {
  const brand = String(instrument.brand || "").trim();
  const location = formatRecordLocation({ location: instrument.location }) || "";
  const year = String(instrument.year || "").trim();
  return [brand, year, location].filter(Boolean).join(" • ");
}

export function getAccountPlan(user?: Pick<DemoUser, "plan" | "email"> | null): AccountPlan {
  return user?.plan === "brand" || user?.plan === "commercial" || user?.plan === "paid" || user?.plan === "free" ? user.plan : "free";
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

  return "unverified";
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
  if (!user) {
    return false;
  }

  if (getAccountPlan(user) === "brand" || getAccountPlan(user) === "commercial") {
    return false;
  }

  const ownedRecords = instruments.filter((instrument) => !isDemoInstrumentRecord(instrument)).length;
  return ownedRecords >= FREE_PROFILE_ALLOWANCE;
}

export function getInstrumentCondition(instrument: Pick<DemoInstrument, "instrumentCondition">): InstrumentCondition {
  return instrument.instrumentCondition === "new" ? "new" : "used";
}

export function allowsIncludedFirstTransfer(
  instrument: Pick<DemoInstrument, "instrumentCondition" | "creatorAccountType" | "packageIncludesFirstTransfer">
) {
  if (instrument.packageIncludesFirstTransfer) {
    return true;
  }

  return (
    instrument.instrumentCondition === "new" &&
    (instrument.creatorAccountType === "brand" || instrument.creatorAccountType === "commercial")
  );
}

export function transferFeeLabel(instrument: Pick<DemoInstrument, "instrumentCondition" | "creatorAccountType" | "packageIncludesFirstTransfer">) {
  return allowsIncludedFirstTransfer(instrument)
    ? "Owner transfer tools are in beta for this record."
    : "Transfer-ready record. Owner transfer tools are in beta.";
}

export function transferHelperCopy(instrument: Pick<DemoInstrument, "instrumentCondition" | "creatorAccountType" | "packageIncludesFirstTransfer">) {
  return allowsIncludedFirstTransfer(instrument)
    ? "Owner transfer tools are in beta for eligible new records."
    : "Ownership tools are in beta. Contact support@qrguitar.com for manual help.";
}

export function isDemoTransferPaid(transfer: Pick<DemoTransfer, "feeCents" | "paymentCollected">) {
  return transfer.feeCents === 0 || transfer.paymentCollected;
}

export function transferFeeAmountLabel(transfer: Pick<DemoTransfer, "feeCents">) {
  return transfer.feeCents === 0 ? "Beta owner-change support" : "Manual owner-change support";
}

export function transferStatusLabel(transfer: Pick<DemoTransfer, "status" | "feeCents" | "paymentCollected">) {
  if (transfer.status === "accepted") {
    return "Claim received. Owner approval tools are in beta.";
  }

  if (transfer.status === "cancelled") {
    return "Transfer cancelled";
  }

  return "Waiting for the next owner to claim this record.";
}

export function transferPaymentInstructions(transfer: Pick<DemoTransfer, "feeCents" | "paymentCollected" | "paymentMethod">) {
  void transfer;
  return "Owner-transfer tools are in beta. Contact support@qrguitar.com for manual help.";
}

function normalizeDemoInstrument(instrument: DemoInstrument): DemoInstrument {
  const style = instrument.qrStyle || defaultQrStyle;
  const hasLegacyDefaultQr = style.foreground === "#071014" && style.background === "#f5f0df";
  const normalizedCode = String(instrument.qrCode || "").trim().toUpperCase();
  const normalizedPath = instrument.permanentPath || `/i/${normalizedCode}`;
  const documentFiles = Array.isArray(instrument.documentFiles)
    ? instrument.documentFiles.map((file) => ({
        ...file,
        visibility: file.visibility === "public" ? "public" as const : "hidden" as const
      }))
    : undefined;

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
    showSerialPublic: instrument.showSerialPublic === true,
    serialExceptionApproved: instrument.serialExceptionApproved === true,
    qrStyle: hasLegacyDefaultQr ? defaultQrStyle : style,
    documentFiles
  };
}

function normalizeDemoTransfer(transfer: DemoTransfer): DemoTransfer {
  return {
    ...transfer,
    id: String(transfer.id || "").trim(),
    guitarQrCode: String(transfer.guitarQrCode || "").trim().toUpperCase(),
    guitarName: transfer.guitarName || "Untitled instrument",
    fromOwnerName: transfer.fromOwnerName || "Current owner",
    fromOwnerEmail: normalizeEmail(transfer.fromOwnerEmail || ""),
    toEmail: normalizeEmail(transfer.toEmail || ""),
    toName: transfer.toName || "New owner",
    status: transfer.status === "accepted" || transfer.status === "cancelled" ? transfer.status : "sent",
    feeCents: Number.isFinite(transfer.feeCents) ? transfer.feeCents : 700,
    paymentCollected: transfer.paymentCollected === true,
    paymentCollectedAt: transfer.paymentCollectedAt || undefined,
    paymentMethod: transfer.paymentMethod || undefined,
    claimPath: transfer.claimPath || `/transfer/${transfer.id}`,
    createdAt: transfer.createdAt || new Date().toISOString()
  };
}

function normalizeDemoUser(user: DemoUser): DemoUser {
  const plan = getAccountPlan(user);
  const verificationStatus =
    user.verificationStatus === "flagged"
      ? "flagged"
      : getAccountVerificationStatus({ ...user, plan }) === "verified"
        ? "verified"
        : "unverified";

  return {
    ...user,
    plan,
    verificationStatus
  };
}
