export type GuitarVisibility = "public" | "unlisted" | "private";
export type MemberRole = "owner" | "builder" | "shop" | "admin";
export type GuitarStatus = "verified" | "unverified" | "transferred" | "archived";
export type FieldVisibility = "public" | "private" | "transfer_only";
export type PlanTier = "single" | "pack_10" | "pack_25" | "bulk_50" | "business" | "enterprise";

export type GuitarProfile = {
  id: string;
  qrCode: string;
  name: string;
  brand: string;
  model?: string;
  year?: string;
  serialNumber?: string;
  instrumentType?: string;
  builder?: string;
  location?: string;
  status: GuitarStatus;
  ownerDisplayName?: string;
  visibility: GuitarVisibility;
  transferable?: boolean;
  claimed?: boolean;
  heroImageUrl?: string;
  brandLogoUrl?: string;
  theme?: ProfileTheme;
  summary: string;
  specs: GuitarSpec[];
  timeline: TimelineEvent[];
  gallery: MediaAsset[];
  documents: DocumentAsset[];
  ownership: OwnershipRecord[];
  repairs: RepairRecord[];
  commerce?: CommerceInfo;
  qr?: QrCodeInfo;
  privacy?: ProfilePrivacy;
};

export type AccountEntitlements = {
  planTier: PlanTier;
  purchasedCodeCount: number;
  remainingCodeCount: number;
  freeOwnershipTransfersIncluded: boolean;
  remainingFreeOwnershipTransfers: number | "unlimited";
  businessBrandingEnabled: boolean;
  bulkHandoffEnabled: boolean;
};

export type TransferPolicy = {
  transferFeeCents: number;
  purchaserPaysTransferFee: boolean;
  freeForIncludedPlan: boolean;
  minimumIncludedTransferCodeCount: number;
  includedTransfersPerPurchasedCode: number;
};

export type GuitarSpec = {
  label: string;
  value: string;
  visibility?: FieldVisibility;
};

export type TimelineEvent = {
  id: string;
  date: string;
  title: string;
  description: string;
};

export type MediaAsset = {
  id: string;
  url: string;
  alt: string;
  caption?: string;
  visibility?: FieldVisibility;
  sortOrder?: number;
};

export type DocumentAsset = {
  id: string;
  name: string;
  url: string;
  documentType?: "certificate" | "appraisal" | "receipt" | "warranty" | "repair" | "build_sheet" | "other";
  visibility?: FieldVisibility;
};

export type ProfileTheme = {
  accentColor?: string;
  layoutStyle?: "classic" | "premium_mobile" | "builder_brand";
  badgeLabels?: string[];
};

export type OwnershipRecord = {
  id: string;
  ownerDisplayName: string;
  startedAt?: string;
  endedAt?: string;
  transferNote?: string;
  visibility?: FieldVisibility;
};

export type OwnershipTransfer = {
  id: string;
  guitarId: string;
  fromAccountId?: string;
  toEmail: string;
  toName?: string;
  status: "draft" | "sent" | "accepted" | "expired" | "cancelled";
  feeCents: number;
  feeWaivedReason?: "bulk_brand_account" | "admin_comp" | "included_plan_transfer";
  createdAt: string;
  acceptedAt?: string;
};

export type RepairRecord = {
  id: string;
  date: string;
  provider?: string;
  title: string;
  description: string;
  cost?: string;
  documents?: DocumentAsset[];
  media?: MediaAsset[];
  visibility?: FieldVisibility;
};

export type CommerceInfo = {
  forSale: boolean;
  askingPrice?: string;
  currency?: string;
  buyUrl?: string;
  contactSeller?: boolean;
};

export type QrCodeInfo = {
  permanentUrl: string;
  pngUrl?: string;
  svgUrl?: string;
  scanCount?: number;
  lastScannedAt?: string;
};

export type ProfilePrivacy = {
  ownerContactVisibility: FieldVisibility;
  defaultFieldVisibility: FieldVisibility;
  allowBuilderEdits?: boolean;
  allowShopEdits?: boolean;
};

export const sampleGuitar: GuitarProfile = {
  id: "sample-1",
  qrCode: "QRG-0001",
  name: "Reptile",
  brand: "Proper Instruments",
  model: "Custom Offset",
  year: "2026",
  serialNumber: "PI260001",
  instrumentType: "Electric guitar",
  builder: "Proper Instruments",
  location: "Cranston, Rhode Island, USA",
  status: "verified",
  ownerDisplayName: "Unclaimed",
  visibility: "public",
  transferable: true,
  claimed: false,
  heroImageUrl: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=1200&q=80",
  theme: {
    accentColor: "#c89a45",
    layoutStyle: "premium_mobile",
    badgeLabels: ["One of One", "Handmade", "Verified", "Lifetime Record"]
  },
  summary:
    "A permanent digital identity for a one-of-one handcrafted instrument. Specs, ownership, provenance, repairs, media, and documentation stay with the guitar for life.",
  specs: [
    { label: "Body", value: "Chambered alder" },
    { label: "Neck", value: "Roasted maple" },
    { label: "Pickups", value: "Custom wound humbuckers" },
    { label: "Finish", value: "High-gloss reptile burst" }
  ],
  timeline: [
    {
      id: "event-1",
      date: "2026-06-01",
      title: "Instrument registered",
      description: "Initial QRguitar identity created and verified."
    },
    {
      id: "event-2",
      date: "2026-06-12",
      title: "Builder record attached",
      description: "Builder details, specs, and provenance notes were added."
    }
  ],
  gallery: [],
  documents: [],
  ownership: [],
  repairs: [],
  commerce: {
    forSale: false
  },
  qr: {
    permanentUrl: "https://qrguitar.com/i/QRG-0001",
    scanCount: 24
  },
  privacy: {
    ownerContactVisibility: "private",
    defaultFieldVisibility: "public",
    allowBuilderEdits: true,
    allowShopEdits: false
  }
};

export const defaultTransferPolicy: TransferPolicy = {
  transferFeeCents: 700,
  purchaserPaysTransferFee: false,
  freeForIncludedPlan: true,
  minimumIncludedTransferCodeCount: 25,
  includedTransfersPerPurchasedCode: 1
};

export function entitlementsForCodePurchase(codeCount: number): AccountEntitlements {
  const includesFirstTransfers = codeCount >= defaultTransferPolicy.minimumIncludedTransferCodeCount;
  const isBrandScale = includesFirstTransfers;

  return {
    planTier: codeCount >= 50 ? "bulk_50" : codeCount >= 25 ? "pack_25" : codeCount >= 10 ? "pack_10" : "single",
    purchasedCodeCount: codeCount,
    remainingCodeCount: codeCount,
    freeOwnershipTransfersIncluded: includesFirstTransfers,
    remainingFreeOwnershipTransfers: includesFirstTransfers ? codeCount * defaultTransferPolicy.includedTransfersPerPurchasedCode : 0,
    businessBrandingEnabled: isBrandScale,
    bulkHandoffEnabled: includesFirstTransfers
  };
}
