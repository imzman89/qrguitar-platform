export type DemoUser = {
  name: string;
  email: string;
  role: "owner" | "builder" | "shop";
  plan?: AccountPlan;
  verificationStatus?: AccountVerificationStatus;
  instrumentCredits?: number;
  includedTransferCredits?: number;
  stripeCustomerEmail?: string;
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
  requestedAt: number;
};

export type InstrumentCondition = "new" | "used";
export type CreatorAccountType = "customer" | "brand" | "shop" | "commercial";
export type AccountPlan = "free" | "paid" | "brand" | "commercial";
export type AccountVerificationStatus = "unverified" | "verified" | "flagged";
export type RecordVerificationStatus = "unverified" | "verified";

export type DemoInstrument = {
  qrCode: string;
  permanentPath: string;
  creatorAccountEmail?: string;
  ownerAccountEmail?: string;
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
  fromOwnerEmail?: string;
  toEmail: string;
  toName: string;
  status: "sent" | "accepted" | "cancelled";
  feeCents: number;
  feeWaivedReason?: "included_plan_transfer";
  claimPath: string;
  createdAt: string;
  claimVerificationCode?: string;
  claimVerificationExpiresAt?: number;
  claimVerificationTries?: number;
  claimEmailVerifiedAt?: string;
  paidAt?: string;
  stripeSessionId?: string;
  acceptedAt?: string;
  cancelledAt?: string;
};

export type DemoPurchase = {
  id: string;
  itemId: string;
  sessionId: string;
  customerEmail: string;
  credits: number;
  includedTransferCredits: number;
  transferId?: string;
  createdAt: string;
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
const usersKey = "qrguitar.demoUsers";
const magicCodeKey = "qrguitar.demoMagicCodes";
const magicCodeRateLimitKey = "qrguitar.demoMagicCodeRateLimits";
const instrumentsKey = "qrguitar.demoInstruments";
const transfersKey = "qrguitar.demoTransfers";
const purchasesKey = "qrguitar.demoPurchases";
const transferClaimRateLimitKey = "qrguitar.demoTransferClaimRateLimits";

type MagicCodeRateRecord = {
  sentAt: number[];
  blockedUntil?: number;
};

type ClaimRateRecord = {
  sentAt: number[];
  blockedUntil?: number;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUSPICIOUS_DOMAINS = [
  "mailinator.com",
  "tempmail.net",
  "10minutemail.com",
  "guerrillamail.com",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
  "dispostable.com",
  "maildrop.cc",
  "maildrop.io",
  "temp-mail.org",
  "tempail.com",
  "fakemail.net"
];

const MAGIC_CODE_TTL_MS = 10 * 60 * 1000;
const MAGIC_CODE_MIN_SEND_GAP_MS = 20 * 1000;
const MAGIC_CODE_WINDOW_MS = 15 * 60 * 1000;
const MAGIC_CODE_MAX_PER_WINDOW = 5;
const MAGIC_CODE_MAX_ATTEMPTS = 6;
const MAGIC_CODE_BLOCK_MS = 5 * 60 * 1000;

const TRANSFER_CLAIM_TTL_MS = 10 * 60 * 1000;
const TRANSFER_CLAIM_WINDOW_MS = 60 * 60 * 1000;
const TRANSFER_CLAIM_MAX_PER_WINDOW = 8;
const TRANSFER_CLAIM_MIN_GAP_MS = 20 * 1000;
const TRANSFER_CLAIM_BLOCK_MS = 10 * 60 * 1000;

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
}

export function getDemoPurchases(): DemoPurchase[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(purchasesKey) || "[]") as DemoPurchase[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    window.localStorage.removeItem(purchasesKey);
    return [];
  }
}

export function saveDemoPurchase(purchase: DemoPurchase) {
  if (typeof window === "undefined") {
    return;
  }

  const current = getDemoPurchases();
  const withoutDuplicate = current.filter((item) => item.sessionId !== purchase.sessionId);
  window.localStorage.setItem(purchasesKey, JSON.stringify([purchase, ...withoutDuplicate]));
}

export function hasDemoPurchase(sessionId: string) {
  return getDemoPurchases().some((purchase) => purchase.sessionId === sessionId);
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

function normalizeEmailInput(email: string) {
  return email.trim().toLowerCase();
}

function normalizeEmail(email: string) {
  return normalizeEmailInput(email);
}

function isValidEmailInput(email: string) {
  const normalized = normalizeEmailInput(email);
  if (!normalized || !EMAIL_REGEX.test(normalized)) {
    return { normalized, isValid: false, reason: "Enter a valid email address." } as const;
  }

  const domain = normalized.split("@")[1] || "";
  if (SUSPICIOUS_DOMAINS.includes(domain)) {
    return {
      normalized,
      isValid: false,
      reason: "Temporary email addresses are not allowed for account login."
    } as const;
  }

  return { normalized, isValid: true } as const;
}

export function findDemoUserByEmail(email: string): DemoUser | null {
  const normalized = normalizeEmailInput(email);
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

  const emailValidation = isValidEmailInput(user.email);
  if (!emailValidation.isValid) {
    return { ok: false, reason: emailValidation.reason } as const;
  }

  const normalized = normalizeDemoUser(user);
  if (!normalized.email) {
    return { ok: false, reason: "Email is required." };
  }

  const users = getStoredDemoUsers();
  const email = normalized.email;
  if (users.some((entry) => normalizeEmail(entry.email) === email)) {
    return { ok: false, reason: "An account with that email already exists." };
  }

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
  const validation = isValidEmailInput(email);
  if (!validation.isValid) {
    return { ok: false, reason: validation.reason } as const;
  }

  const matched = findDemoUserByEmail(validation.normalized);

  if (!matched) {
    return { ok: false, reason: "No account found for that email." } as const;
  }

  saveDemoUser(matched);
  return { ok: true, user: matched } as const;
}

export function authenticateDemoUserWithPassword(email: string, password: string) {
  const normalized = normalizeEmailInput(email);
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
  const validation = isValidEmailInput(email);
  if (!validation.isValid) {
    return { ok: false, reason: validation.reason } as const;
  }

  const now = Date.now();
  const rateLimit = canIssueMagicCode(validation.normalized, now);
  if (!rateLimit.ok) {
    return { ok: false, reason: rateLimit.reason } as const;
  }

  const normalized = validation.normalized;
  const user = findDemoUserByEmail(normalized);
  if (!user) {
    recordMagicCodeRequest(normalized, now);
    return { ok: false, reason: "If this email is registered, a code will be sent." } as const;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codes = getMagicCodes();
  codes[normalized] = { code, expiresAt: now + MAGIC_CODE_TTL_MS, tries: 0, requestedAt: now };
  setMagicCodes(codes);
  recordMagicCodeRequest(normalized, now);

  // Browser preview returns the code so the sign-in flow can be tested before email delivery is connected.
  return { ok: true, code, email: user.email };
}

export function verifyDemoMagicCode(email: string, code: string) {
  const validation = isValidEmailInput(email);
  if (!validation.isValid) {
    return { ok: false, reason: validation.reason } as const;
  }

  if (!/^\d{6}$/.test(String(code).trim())) {
    return { ok: false, reason: "Please enter a 6-digit code." } as const;
  }

  const normalized = validation.normalized;
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

  if (record.tries >= MAGIC_CODE_MAX_ATTEMPTS) {
    delete codes[normalized];
    setMagicCodes(codes);
    recordMagicCodeFailure(normalized);
    return { ok: false, reason: "Too many tries. Request a new code." } as const;
  }

  if (record.code !== String(code).trim()) {
    record.tries += 1;
    codes[normalized] = record;
    setMagicCodes(codes);
    recordMagicCodeFailure(normalized);
    return { ok: false, reason: "That code is not correct." } as const;
  }

  delete codes[normalized];
  setMagicCodes(codes);
  clearMagicCodeFailures(normalized);

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

export function userCanEditInstrument(user: DemoUser | null, instrument: Pick<DemoInstrument, "qrCode" | "creatorAccountEmail" | "ownerAccountEmail">) {
  if (!user?.email) {
    return false;
  }

  const userEmail = normalizeEmail(user.email);
  const creatorEmail = normalizeEmail(instrument.creatorAccountEmail || "");
  const ownerEmail = normalizeEmail(instrument.ownerAccountEmail || "");

  if (!creatorEmail && !ownerEmail) {
    return false;
  }

  return userEmail === creatorEmail || userEmail === ownerEmail;
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
  const includedFirstTransfer = allowsIncludedFirstTransfer(instrument);

  const transfer: DemoTransfer = {
    id,
    guitarQrCode: instrument.qrCode,
    guitarName: instrumentDisplayName(instrument),
    fromOwnerName,
    fromOwnerEmail: normalizeEmail(fromOwnerEmail),
    toEmail: normalizeEmail(toEmail),
    toName: toName.trim(),
    status: "sent",
    feeCents: includedFirstTransfer ? 0 : 700,
    feeWaivedReason: includedFirstTransfer ? "included_plan_transfer" : undefined,
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

export function sendDemoTransferClaimCode(id: string, email: string) {
  const emailValidation = isValidEmailInput(email);
  if (!emailValidation.isValid) {
    return { ok: false, reason: emailValidation.reason } as const;
  }

  const transfer = findDemoTransfer(id);

  if (!transfer) {
    return { ok: false, reason: "This transfer link was not found." } as const;
  }

  if (transfer.status !== "sent") {
    return { ok: false, reason: "This transfer is no longer pending." } as const;
  }

  const now = Date.now();
  const normalizedEmail = emailValidation.normalized;
  const rateCheck = canSendTransferClaim(normalizedEmail, id, now);
  if (!rateCheck.ok) {
    return { ok: false, reason: rateCheck.reason } as const;
  }

  if (normalizedEmail !== normalizeEmail(transfer.toEmail)) {
    return { ok: false, reason: "Use the buyer email listed on this transfer." } as const;
  }

  if (transfer.claimVerificationCode && transfer.claimVerificationExpiresAt && transfer.claimVerificationExpiresAt > now) {
    return { ok: false, reason: "A verification code was already sent. Check your email." } as const;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const nextTransfer: DemoTransfer = {
    ...transfer,
    toEmail: normalizedEmail,
    claimVerificationCode: code,
    claimVerificationExpiresAt: now + TRANSFER_CLAIM_TTL_MS,
    claimVerificationTries: 0,
    claimEmailVerifiedAt: undefined
  };

  saveDemoTransfer(nextTransfer);
  recordTransferClaimRequest(id, normalizedEmail, now);
  return { ok: true, code, transfer: nextTransfer } as const;
}

export function verifyDemoTransferClaimCode(id: string, email: string, code: string) {
  if (!/^\d{6}$/.test(String(code).trim())) {
    return { ok: false, reason: "Please enter a 6-digit code." } as const;
  }

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

  if (transfer.feeCents > 0 && !transfer.paidAt) {
    return { ok: false, reason: "Complete the transfer payment before accepting ownership." } as const;
  }

  const instruments = getDemoInstruments();
  const instrument = instruments.find((item) => item.qrCode === transfer.guitarQrCode);

  if (instrument) {
    saveDemoInstrument({
      ...instrument,
      owner: user.name || transfer.toName || user.email,
      ownerAccountEmail: normalizedBuyerEmail,
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

export function markDemoTransferPaid(id: string, stripeSessionId: string) {
  const transfer = findDemoTransfer(id);

  if (!transfer) {
    return { ok: false, reason: "Transfer was not found in this browser." } as const;
  }

  const paidTransfer: DemoTransfer = {
    ...transfer,
    paidAt: transfer.paidAt || new Date().toISOString(),
    stripeSessionId
  };

  saveDemoTransfer(paidTransfer);
  return { ok: true, transfer: paidTransfer } as const;
}

export function applyDemoPurchase({
  itemId,
  sessionId,
  customerEmail,
  credits,
  includedTransferCredits,
  transferId
}: {
  itemId: string;
  sessionId: string;
  customerEmail: string;
  credits: number;
  includedTransferCredits: number;
  transferId?: string;
}) {
  if (!sessionId || hasDemoPurchase(sessionId)) {
    return { ok: true, alreadyApplied: true } as const;
  }

  const currentUser = getDemoUser();
  const nextPlan = itemId === "commercial" ? "commercial" : itemId === "transfer" ? getAccountPlan(currentUser) : "paid";

  if (itemId !== "transfer") {
    saveDemoUser({
      ...(currentUser || {
        name: customerEmail || "QRguitar customer",
        email: customerEmail,
        role: "owner" as const
      }),
      email: currentUser?.email || customerEmail,
      plan: nextPlan,
      verificationStatus: "verified",
      instrumentCredits: (currentUser?.instrumentCredits || 0) + credits,
      includedTransferCredits: (currentUser?.includedTransferCredits || 0) + includedTransferCredits,
      stripeCustomerEmail: customerEmail
    });
  }

  if (transferId) {
    markDemoTransferPaid(transferId, sessionId);
  }

  saveDemoPurchase({
    id: `PUR-${Date.now().toString(36).toUpperCase()}`,
    itemId,
    sessionId,
    customerEmail,
    credits,
    includedTransferCredits,
    transferId,
    createdAt: new Date().toISOString()
  });

  return { ok: true, alreadyApplied: false } as const;
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
    creatorAccountEmail: normalizeEmail(instrument.creatorAccountEmail || ""),
    ownerAccountEmail: normalizeEmail(instrument.ownerAccountEmail || instrument.creatorAccountEmail || ""),
    visibility: instrument.visibility || "public",
    instrumentCondition: getInstrumentCondition(instrument),
    creatorAccountType: instrument.creatorAccountType || "customer",
    packageIncludesFirstTransfer: instrument.packageIncludesFirstTransfer === true,
    verificationStatus: getInstrumentVerificationStatus(instrument),
    qrStyle: hasLegacyDefaultQr ? defaultQrStyle : style
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
    claimPath: transfer.claimPath || `/transfer/${transfer.id}`,
    createdAt: transfer.createdAt || new Date().toISOString()
  };
}

function getMagicCodeRateState(): Record<string, MagicCodeRateRecord> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(magicCodeRateLimitKey) || "{}") as Record<string, MagicCodeRateRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function setMagicCodeRateState(state: Record<string, MagicCodeRateRecord>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(magicCodeRateLimitKey, JSON.stringify(state));
}

function canIssueMagicCode(email: string, now: number) {
  const states = getMagicCodeRateState();
  const current = states[email] || { sentAt: [] };
  const cleaned = current.sentAt.filter((time) => now - time <= MAGIC_CODE_WINDOW_MS);
  const nowLimited = {
    ...current,
    sentAt: cleaned
  };

  if (nowLimited.blockedUntil && now < nowLimited.blockedUntil) {
    states[email] = nowLimited;
    setMagicCodeRateState(states);
    return { ok: false, reason: "Too many magic code requests. Try again in a few minutes." } as const;
  }

  if (cleaned.length >= MAGIC_CODE_MAX_PER_WINDOW) {
    states[email] = { ...nowLimited, blockedUntil: now + MAGIC_CODE_BLOCK_MS };
    setMagicCodeRateState(states);
    return { ok: false, reason: "Too many magic code requests. Try again in a few minutes." } as const;
  }

  const last = cleaned[cleaned.length - 1];
  if (typeof last === "number" && now - last < MAGIC_CODE_MIN_SEND_GAP_MS) {
    states[email] = nowLimited;
    setMagicCodeRateState(states);
    return { ok: false, reason: "Wait a moment before requesting another code." } as const;
  }

  states[email] = nowLimited;
  setMagicCodeRateState(states);
  return { ok: true } as const;
}

function recordMagicCodeRequest(email: string, now: number) {
  const states = getMagicCodeRateState();
  const current = states[email] || { sentAt: [] };
  const cleaned = current.sentAt.filter((time) => now - time <= MAGIC_CODE_WINDOW_MS);
  states[email] = {
    ...current,
    sentAt: [...cleaned, now]
  };
  setMagicCodeRateState(states);
}

function recordMagicCodeFailure(email: string) {
  const states = getMagicCodeRateState();
  const current = states[email];
  if (!current) {
    return;
  }

  current.sentAt = current.sentAt.filter(Boolean);
  states[email] = current;
  setMagicCodeRateState(states);
}

function clearMagicCodeFailures(email: string) {
  const states = getMagicCodeRateState();
  const current = states[email];
  if (!current) {
    return;
  }

  current.blockedUntil = undefined;
  states[email] = current;
  setMagicCodeRateState(states);
}

function getTransferClaimRateState(): Record<string, ClaimRateRecord> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(transferClaimRateLimitKey) || "{}") as Record<string, ClaimRateRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function setTransferClaimRateState(state: Record<string, ClaimRateRecord>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(transferClaimRateLimitKey, JSON.stringify(state));
}

function transferRateKey(transferId: string, email: string) {
  return `${transferId}:${email}`;
}

function canSendTransferClaim(email: string, transferId: string, now: number) {
  const key = transferRateKey(transferId, email);
  const states = getTransferClaimRateState();
  const current = states[key] || { sentAt: [] };
  const cleaned = current.sentAt.filter((time) => now - time <= TRANSFER_CLAIM_WINDOW_MS);
  const nowLimited = {
    ...current,
    sentAt: cleaned
  };

  if (nowLimited.blockedUntil && now < nowLimited.blockedUntil) {
    states[key] = nowLimited;
    setTransferClaimRateState(states);
    return { ok: false, reason: "Too many transfer verification requests. Try again shortly." } as const;
  }

  if (cleaned.length >= TRANSFER_CLAIM_MAX_PER_WINDOW) {
    states[key] = { ...nowLimited, blockedUntil: now + TRANSFER_CLAIM_BLOCK_MS };
    setTransferClaimRateState(states);
    return { ok: false, reason: "Too many transfer verification requests. Try again shortly." } as const;
  }

  const last = cleaned[cleaned.length - 1];
  if (typeof last === "number" && now - last < TRANSFER_CLAIM_MIN_GAP_MS) {
    states[key] = nowLimited;
    setTransferClaimRateState(states);
    return { ok: false, reason: "Wait a moment before requesting another transfer code." } as const;
  }

  states[key] = nowLimited;
  setTransferClaimRateState(states);
  return { ok: true } as const;
}

function recordTransferClaimRequest(transferId: string, email: string, now: number) {
  const key = transferRateKey(transferId, email);
  const states = getTransferClaimRateState();
  const current = states[key] || { sentAt: [] };
  const cleaned = current.sentAt.filter((time) => now - time <= TRANSFER_CLAIM_WINDOW_MS);
  states[key] = {
    ...current,
    sentAt: [...cleaned, now]
  };
  setTransferClaimRateState(states);
}

function normalizeDemoUser(user: DemoUser): DemoUser {
  const plan = getAccountPlan(user);

  return {
    ...user,
    plan,
    instrumentCredits: Math.max(0, Number(user.instrumentCredits || 0)),
    includedTransferCredits: Math.max(0, Number(user.includedTransferCredits || 0)),
    verificationStatus: user.verificationStatus === "flagged" ? "flagged" : plan === "free" ? "unverified" : "verified"
  };
}
