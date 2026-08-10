import { CheckCircle2 } from "lucide-react";
import { siteCopy } from "../content/site-copy";
import { defaultContentValues, getContentValue, mergeContentValues } from "./content-registry";
import { defaultInstrumentCategories, normalizeInstrumentCategories } from "./instrument-categories";

export const siteSettingsKey = "qrguitar.siteSettings";
export const publishedSiteSettingsKey = "homepage";

type CardInput = { title: string; copy: string };
type PricingPlanInput = {
  name: string;
  price: string;
  copy: string;
  badge?: string;
  features: string[];
};

export type EditorialIcon = "qr" | "history" | "photo" | "shield" | "store" | "wrench" | "transfer" | "document" | "eye" | "help" | "link";
export type EditorialPageKey = "home" | "howItWorks" | "catalog" | "installers" | "contact" | "footer";

export type EditorialBlock = {
  id: string;
  name: string;
  title: string;
  body: string;
  label?: string;
  icon?: EditorialIcon;
  ctaLabel?: string;
  ctaUrl?: string;
  items?: string[];
  visible: boolean;
  protected?: boolean;
};

export type EditorialSection = {
  id: string;
  name: string;
  visible: boolean;
  locked?: boolean;
  blocks: EditorialBlock[];
};

export type EditorialComposition = Record<EditorialPageKey, { sections: EditorialSection[] }>;

export type EditableSiteSettings = {
  brandName: string;
  tagline: string;
  instrumentCategories: string[];
  brandLogos: Record<string, string>;
  colors: {
    background: string;
    panel: string;
    gold: string;
    cream: string;
    text: string;
  };
  hero: {
    eyebrow: string;
    headline: string;
    body: string;
    primaryCta: string;
    secondaryCta: string;
  };
  sections: {
    howEyebrow: string;
    howHeadline: string;
    howBody: string;
    howCards: CardInput[];
    detailsEyebrow: string;
    detailsHeadline: string;
    detailsBody: string;
    detailsChecks: string[];
    detailsCta: string;
    detailsFeaturedCode: string;
    audienceEyebrow: string;
    audienceHeadline: string;
    audienceBody: string;
    audienceCards: CardInput[];
    audienceCta: string;
    pricingEyebrow: string;
    pricingHeadline: string;
    pricingBody: string;
    pricingCards: PricingPlanInput[];
    pricingEnterpriseTitle: string;
    pricingEnterpriseBody: string;
  };
  seo: {
    title: string;
    description: string;
    keywords: string;
    image: string;
    favicon: string;
    canonicalUrl: string;
    twitterHandle: string;
    robots: string;
  };
  dashboard: {
    pageTitle: string;
    subtitle: string;
    emptyCollectionTitle: string;
    emptyCollectionBody: string;
    firstRecordCtaLabel: string;
    collectionHealthTitle: string;
    collectionHealthHelper: string;
    nextActionsTitle: string;
    nextActionsHelper: string;
    proofGuidanceTitle: string;
    proofGuidanceBody: string;
    serviceGuidanceTitle: string;
    serviceGuidanceBody: string;
    qrGuidanceTitle: string;
    qrGuidanceBody: string;
    privacyGuidanceTitle: string;
    privacyGuidanceBody: string;
    transferGuidanceTitle: string;
    transferGuidanceBody: string;
    verificationGuidanceTitle: string;
    verificationGuidanceBody: string;
  };
  composition: EditorialComposition;
  content: Record<string, string>;
};

export const editorialPageLabels: Record<EditorialPageKey, string> = {
  home: "Homepage",
  howItWorks: "How It Works",
  catalog: "Catalog",
  installers: "Installers",
  contact: "Contact",
  footer: "Footer"
};

export const editorialIconAllowlist: EditorialIcon[] = ["qr", "history", "photo", "shield", "store", "wrench", "transfer", "document", "eye", "help", "link"];

export const defaultEditorialComposition: EditorialComposition = {
  home: {
    sections: [
      { id: "hero", name: "Hero and newest Profile", visible: true, locked: true, blocks: [] },
      { id: "archive", name: "Public Profile archive", visible: true, blocks: [] },
      { id: "lifecycle", name: "Profile lifecycle", visible: true, blocks: [
        { id: "home-step-identity", name: "Identify", title: "Identify", body: "Serial Number, photos, specifications, and the permanent QRguitar ID.", icon: "qr", visible: true, protected: true },
        { id: "home-step-history", name: "Document", title: "Document", body: "Service, documents, media, safety, and ownership history.", icon: "document", visible: true },
        { id: "home-step-share", name: "Carry Forward", title: "Carry Forward", body: "Transfer the same Profile when the instrument changes hands.", icon: "transfer", visible: true }
      ] },
      { id: "anatomy", name: "Profile anatomy", visible: true, blocks: [
        { id: "home-anatomy-identity", name: "Identity", title: "Identity", body: "Serial Number, specifications, condition, and QRguitar ID.", icon: "qr", visible: true, protected: true },
        { id: "home-anatomy-history", name: "History", title: "History", body: "Service, Timeline events, ownership, and safety.", icon: "history", visible: true },
        { id: "home-anatomy-documents", name: "Documents", title: "Documents", body: "Receipts, appraisals, build sheets, and other files you choose to share.", icon: "document", visible: true }
      ] },
      { id: "roles", name: "Role and use cases", visible: true, blocks: [
        { id: "home-role-owner", name: "Owners", title: "Owners", body: "Keep your instruments organized, control what's public, and hand the same Profile to the next owner.", ctaLabel: "Create a Profile", ctaUrl: "/create", icon: "photo", visible: true, protected: true },
        { id: "home-role-collector", name: "Collectors", title: "Collectors", body: "Preserve photos, documents, service, and provenance without losing the story.", ctaLabel: "Open your collection", ctaUrl: "/dashboard", icon: "shield", visible: true },
        { id: "home-role-shop", name: "Shops", title: "Shops", body: "Create or import inventory, print QR materials, and transfer Profiles to buyers.", ctaLabel: "See business tools", ctaUrl: "/how-it-works#who-it-is-for", icon: "store", visible: true },
        { id: "home-role-builder", name: "Builders / Brands", title: "Builders / Brands", body: "Issue consistent Profiles for new builds and hand the same Profile to the first owner.", ctaLabel: "See business tools", ctaUrl: "/how-it-works#who-it-is-for", icon: "store", visible: true },
        { id: "home-role-provider", name: "Luthiers / Technicians", title: "Luthiers / Technicians", body: "Submit completed service with private evidence for the owner to review.", ctaLabel: "See service workflow", ctaUrl: "/how-it-works#service-providers", icon: "wrench", visible: true },
        { id: "home-role-buyer", name: "Buyers", title: "Buyers", body: "Review the public history, then receive the same Profile through a secure transfer or claim.", ctaLabel: "Open Claim Center", ctaUrl: "/ownership-claim", icon: "eye", visible: true }
      ] },
      { id: "continuity", name: "Service, ownership, and provenance", visible: true, blocks: [
        { id: "home-continuity-service", name: "Service", title: "Owner-approved service", body: "A provider can submit completed work and private evidence for the owner to review.", icon: "wrench", visible: true, protected: true },
        { id: "home-continuity-ownership", name: "Ownership", title: "Secure ownership handoff", body: "The current owner, shop, or builder starts the transfer. A scan alone never changes ownership.", icon: "transfer", visible: true },
        { id: "home-continuity-provenance", name: "Continuity", title: "The same Profile continues", body: "Approved history stays connected while the QRguitar ID and permanent link remain unchanged.", icon: "history", visible: true }
      ] },
      { id: "pricing", name: "Public beta pricing", visible: true, blocks: [
        { id: "home-price-beta", name: "Owners and collectors", title: "For owners and collectors", label: "$0 during public beta", body: "Create up to 25 Profiles with photos, specifications, privacy controls, history, and downloadable QR codes.", ctaLabel: "Create a Free Profile", ctaUrl: "/create", items: ["Up to 25 Profiles", "Public, Unlisted, or Private", "Downloadable QR codes", "Service and ownership history"], icon: "qr", visible: true, protected: true },
        { id: "home-price-commercial", name: "Shops, builders, and brands", title: "For shops, builders & brands", label: "From $99", body: "Need help with bulk setup, QR hardware, verification, or a commercial rollout? We'll help you get started.", ctaLabel: "Talk to QRguitar", ctaUrl: "mailto:support@qrguitar.com", items: ["Bulk Profile setup", "Business onboarding", "QR hardware and print support", "Verification support"], icon: "store", visible: true }
      ] },
      { id: "finalCta", name: "Closing action", visible: true, blocks: [] }
    ]
  },
  howItWorks: {
    sections: [
      { id: "hero", name: "Hero", visible: true, locked: true, blocks: [] },
      { id: "lifecycle", name: "Instrument lifecycle", visible: true, blocks: [
        { id: "how-step-create", name: "Create or find", title: "Create or find the Profile", body: "Enter the Serial Number and basic details. If the instrument already has a Profile, use the transfer or claim process instead of creating another one.", icon: "qr", visible: true, protected: true },
        { id: "how-step-build", name: "Add what you know", title: "Add what you know", body: "Upload real photos, specifications, service, documents, media, and history.", icon: "photo", visible: true },
        { id: "how-step-qr", name: "Use the QR", title: "Use the QR", body: "Download or print the permanent QR for the instrument, case, tag, shop display, or paperwork.", icon: "qr", visible: true },
        { id: "how-step-maintain", name: "Keep ownership current", title: "Keep ownership current", body: "When the instrument changes hands, transfer the same Profile. Scanning the QR alone never changes ownership.", icon: "transfer", visible: true }
      ] },
      { id: "features", name: "Feature map", visible: true, blocks: [
        { id: "how-feature-identity", name: "Photos and details", title: "Photos & details", body: "Photos, condition, finish, hardware, electronics, weight, and other useful specifications.", icon: "photo", visible: true, protected: true },
        { id: "how-feature-service", name: "Service History", title: "Service History", body: "Setups, repairs, restoration, maintenance, and owner-approved provider submissions.", icon: "wrench", visible: true },
        { id: "how-feature-timeline", name: "Timeline and ownership", title: "Timeline & ownership", body: "Acquisitions, transfers, safety events, service, and other useful history.", icon: "history", visible: true },
        { id: "how-feature-docs", name: "Documents", title: "Documents", body: "Receipts, appraisals, invoices, build sheets, manuals, and other files.", icon: "document", visible: true },
        { id: "how-feature-media", name: "Supplemental Media", title: "Supplemental Media", body: "Video, audio, and approved external media when the Profile has it.", icon: "photo", visible: true },
        { id: "how-feature-safety", name: "Lost or stolen", title: "Lost or stolen", body: "Show a clear public alert when the owner or authorized admin reports an instrument lost or stolen.", icon: "shield", visible: true }
      ] },
      { id: "identity", name: "Identity and privacy", visible: true, blocks: [] },
      { id: "service", name: "Service and ownership", visible: true, blocks: [] },
      { id: "roles", name: "Role journeys", visible: true, blocks: [
        { id: "how-role-player", name: "Players and Collectors", title: "Players and Collectors", body: "Keep instruments organized and preserve the history that matters.", ctaLabel: "Create a Profile", ctaUrl: "/create", icon: "photo", visible: true, protected: true },
        { id: "how-role-shop", name: "Shops", title: "Shops", body: "Create or import inventory, print QR materials, and transfer Profiles after a sale.", ctaLabel: "Open inventory tools", ctaUrl: "/dashboard/import", icon: "store", visible: true },
        { id: "how-role-builder", name: "Builders and Brands", title: "Builders and Brands", body: "Create consistent Profiles for new builds and hand them to the first owner.", ctaLabel: "Open inventory tools", ctaUrl: "/dashboard/import", icon: "store", visible: true },
        { id: "how-role-provider", name: "Luthiers and Technicians", title: "Luthiers and Technicians", body: "Submit completed service for the owner to review and add to the Profile.", ctaLabel: "Set up provider tools", ctaUrl: "/account#service-provider", icon: "wrench", visible: true },
        { id: "how-role-buyer", name: "Buyers", title: "Buyers", body: "Review the public Profile, then receive the same Profile through a secure transfer or claim.", ctaLabel: "Open Claim Center", ctaUrl: "/ownership-claim", icon: "eye", visible: true }
      ] },
      { id: "faq", name: "Common questions", visible: true, blocks: [
        { id: "how-faq-id", name: "QRguitar ID", title: "Does the QRguitar ID change?", body: "No. Editing details, adding history, or changing owners does not replace the QRguitar ID or Profile URL.", icon: "help", visible: true, protected: true },
        { id: "how-faq-serial", name: "Serial Number privacy", title: "Can I hide the Serial Number?", body: "Yes. The owner can hide the separate public Serial Number field without changing the QRguitar ID or printed QR.", icon: "help", visible: true },
        { id: "how-faq-existing", name: "Existing Profile", title: "What if the instrument already has a Profile?", body: "Do not create a duplicate. Use the transfer flow or submit an ownership claim.", icon: "help", visible: true },
        { id: "how-faq-transfer", name: "Transfer safety", title: "Can someone claim an instrument by scanning the QR?", body: "No. A scan is view-only. Ownership requires a secure transfer or reviewed claim.", icon: "help", visible: true },
        { id: "how-faq-visibility", name: "Profile visibility", title: "Can a Profile be private?", body: "Yes. Choose Public, Unlisted, or Private.", icon: "help", visible: true },
        { id: "how-faq-sale", name: "Selling an instrument", title: "What happens when I sell the instrument?", body: "Transfer the existing Profile to the buyer so the QRguitar ID and history stay with the instrument.", icon: "help", visible: true }
      ] },
      { id: "finalCta", name: "Closing action", visible: true, blocks: [] }
    ]
  },
  catalog: { sections: [
    { id: "hero", name: "Catalog introduction", visible: true, locked: true, blocks: [] },
    { id: "guidance", name: "Search guidance", visible: true, blocks: [{ id: "catalog-guide-search", name: "Search guidance", title: "Find the right Profile", body: "Search by QRguitar ID, Serial Number, title, model, or brand, then narrow the results with practical filters.", icon: "help", visible: true, protected: true }] }
  ] },
  installers: { sections: [
    { id: "hero", name: "Installer introduction", visible: true, locked: true, blocks: [] },
    { id: "apply", name: "Partner requirements", visible: true, blocks: [] },
    { id: "process", name: "Partner process", visible: true, blocks: [
      { id: "installer-apply", name: "Apply", title: "Apply", body: "Send your shop details and examples of your work.", icon: "store", visible: true, protected: true },
      { id: "installer-review", name: "Review", title: "Review", body: "QRguitar reviews the business, experience, and installation process.", icon: "shield", visible: true },
      { id: "installer-list", name: "Get listed", title: "Get listed", body: "Approved partners can be added when the public installer directory launches.", icon: "transfer", visible: true }
    ] }
  ] },
  contact: { sections: [
    { id: "hero", name: "Support introduction", visible: true, locked: true, blocks: [] },
    { id: "categories", name: "Support categories", visible: true, blocks: [
      { id: "contact-account", name: "Account and login", title: "Account & login", body: "Password reset, account access, and session problems.", ctaLabel: "Email support", ctaUrl: "mailto:support@qrguitar.com?subject=QRguitar%20account%20help", icon: "help", visible: true, protected: true },
      { id: "contact-profile", name: "Profile and QR", title: "Profile & QR", body: "Profile edits, photos, QR downloads, privacy, and Serial Number visibility.", ctaLabel: "Email support", ctaUrl: "mailto:support@qrguitar.com?subject=QRguitar%20Profile%20or%20QR%20help", icon: "qr", visible: true },
      { id: "contact-verification", name: "Verification", title: "Verification", body: "Questions about QRguitar verification, authenticity, and supporting evidence.", ctaLabel: "Email support", ctaUrl: "mailto:support@qrguitar.com?subject=QRguitar%20verification%20review", icon: "shield", visible: true },
      { id: "contact-ownership", name: "Lost, stolen, and ownership", title: "Lost, stolen & ownership", body: "Safety alerts, transfers, ownership claims, and handoff questions.", ctaLabel: "Email support", ctaUrl: "mailto:support@qrguitar.com?subject=QRguitar%20safety%20or%20transfer%20help", icon: "transfer", visible: true },
      { id: "contact-commercial", name: "Business onboarding", title: "Business onboarding", body: "Bulk Import, brand logos, QR printing, shops, builders, and commercial setup.", ctaLabel: "Email support", ctaUrl: "mailto:support@qrguitar.com?subject=QRguitar%20commercial%20onboarding", icon: "store", visible: true },
      { id: "contact-privacy", name: "Documents and privacy", title: "Documents & privacy", body: "Public documents, private files, receipts, appraisals, and privacy choices.", ctaLabel: "Email support", ctaUrl: "mailto:support@qrguitar.com?subject=QRguitar%20documents%20or%20privacy", icon: "document", visible: true }
    ] },
    { id: "checklist", name: "Support checklist", visible: true, blocks: [] }
  ] },
  footer: { sections: [
    { id: "links", name: "Footer links", visible: true, locked: true, blocks: [
      { id: "footer-dashboard", name: "Dashboard", title: "Dashboard", body: "", ctaLabel: "Dashboard", ctaUrl: "/dashboard", icon: "link", visible: true, protected: true },
      { id: "footer-catalog", name: "Catalog", title: "Catalog", body: "", ctaLabel: "Catalog", ctaUrl: "/catalog", icon: "link", visible: true, protected: true },
      { id: "footer-create", name: "Create Profile", title: "Create Profile", body: "", ctaLabel: "Create Profile", ctaUrl: "/create", icon: "link", visible: true },
      { id: "footer-how", name: "How It Works", title: "How It Works", body: "", ctaLabel: "How It Works", ctaUrl: "/how-it-works", icon: "link", visible: true },
      { id: "footer-privacy", name: "Privacy", title: "Privacy", body: "", ctaLabel: "Privacy", ctaUrl: "/privacy", icon: "link", visible: true, protected: true },
      { id: "footer-terms", name: "Terms", title: "Terms", body: "", ctaLabel: "Terms", ctaUrl: "/terms", icon: "link", visible: true, protected: true },
      { id: "footer-contact", name: "Contact", title: "Contact", body: "", ctaLabel: "Contact", ctaUrl: "/contact", icon: "link", visible: true }
    ] }
  ] }
};

export const defaultSiteSettings: EditableSiteSettings = {
  brandName: "QRguitar",
  tagline: "Permanent QRguitar Profiles for guitars, amps, pedals, builders, shops, collectors, and future owners.",
  instrumentCategories: [...defaultInstrumentCategories],
  brandLogos: {},
  colors: {
    background: "#070c10",
    panel: "#11191e",
    gold: "#f0a12b",
    cream: "#f5f0df",
    text: "#f8f6f2"
  },
  hero: {
    eyebrow: siteCopy.hero.eyebrow,
    headline: siteCopy.hero.headline,
    body: siteCopy.hero.body,
    primaryCta: siteCopy.hero.primaryCta,
    secondaryCta: siteCopy.hero.secondaryCta
  },
  sections: {
    howEyebrow: siteCopy.workflow.eyebrow,
    howHeadline: siteCopy.workflow.headline,
    howBody: siteCopy.workflow.body,
    howCards: siteCopy.workflow.cards.map((card) => ({ title: card.title, copy: card.copy })),
    detailsEyebrow: siteCopy.customization.eyebrow,
    detailsHeadline: siteCopy.customization.headline,
    detailsBody: siteCopy.customization.body,
    detailsChecks: siteCopy.customization.checks.map((item) => item.copy),
    detailsCta: siteCopy.customization.cta,
    detailsFeaturedCode: "",
    audienceEyebrow: siteCopy.audiences.eyebrow,
    audienceHeadline: siteCopy.audiences.headline,
    audienceBody: siteCopy.audiences.body,
    audienceCards: siteCopy.audiences.cards.map((card) => ({ title: card.title, copy: card.copy })),
    audienceCta: siteCopy.audiences.cta,
    pricingEyebrow: siteCopy.pricing.eyebrow,
    pricingHeadline: siteCopy.pricing.headline,
    pricingBody: siteCopy.pricing.body,
    pricingCards: siteCopy.pricing.plans.map((plan) => {
      const typedPlan = plan as typeof plan & { badge?: string };
      return {
        name: typedPlan.name,
        price: typedPlan.price,
        copy: typedPlan.copy,
        badge: typedPlan.badge,
        features: [...typedPlan.features]
      };
    }),
    pricingEnterpriseTitle: siteCopy.pricing.enterpriseTitle,
    pricingEnterpriseBody: siteCopy.pricing.enterpriseBody
  },
  seo: {
    title: "QRguitar",
    description: "Permanent QRguitar Profiles for guitars, amps, pedals, builders, shops, and collectors.",
    keywords: "guitar inventory, guitar authentication, guitar service history, instrument ownership, QRguitar, luthier profiles",
    image: "/seo/qrguitar-og-v2.png",
    favicon: "/qrguitar-logo-white-orange.svg",
    canonicalUrl: "https://www.qrguitar.com",
    twitterHandle: "@qrguitar",
    robots: "index, follow"
  },
  dashboard: {
    pageTitle: "Owner dashboard",
    subtitle: "Manage profiles, photos, documents, visibility, and QR downloads from your dashboard.",
    emptyCollectionTitle: "No instruments yet.",
    emptyCollectionBody: "Register your first instrument to create a permanent QRguitar Profile.",
    firstRecordCtaLabel: "Register your first instrument",
    collectionHealthTitle: "Collection health",
    collectionHealthHelper: "A quick read on your public, private, and unlisted Profiles.",
    nextActionsTitle: "Next best actions",
    nextActionsHelper: "Useful next steps based on your current collection.",
    proofGuidanceTitle: "Proof and documents",
    proofGuidanceBody: "Add receipts, build sheets, appraisals, and repair documents. Hidden documents stay private.",
    serviceGuidanceTitle: "Service history",
    serviceGuidanceBody: "Keep setup, repair, and inspection notes attached to the QRguitar Profile.",
    qrGuidanceTitle: "Permanent QR URLs",
    qrGuidanceBody: "Editing serials, specs, photos, or titles does not change the QRguitar link.",
    privacyGuidanceTitle: "Visibility control",
    privacyGuidanceBody: "Public QRguitar Profiles appear in the catalog. Private profiles stay off public pages.",
    transferGuidanceTitle: "Ownership transfer",
    transferGuidanceBody: "Use transfer tools for normal handoffs and support for edge cases during beta.",
    verificationGuidanceTitle: "Verification and authenticity",
    verificationGuidanceBody: "Manual verification and authenticity review are handled carefully during beta."
  },
  composition: structuredClone(defaultEditorialComposition),
  content: { ...defaultContentValues }
};

const editorialPageKeys = Object.keys(defaultEditorialComposition) as EditorialPageKey[];

function cleanEditorialText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.slice(0, 4000) : fallback;
}

function normalizeEditorialBlock(value: unknown, fallback?: EditorialBlock): EditorialBlock {
  const block = value && typeof value === "object" ? value as Partial<EditorialBlock> : {};
  const icon = editorialIconAllowlist.includes(block.icon as EditorialIcon)
    ? block.icon as EditorialIcon
    : fallback?.icon;
  const title = cleanEditorialText(block.title, fallback?.title || "");
  const ctaLabel = cleanEditorialText(block.ctaLabel, fallback?.ctaLabel || "");
  const upgradedTitle = fallback?.id === "footer-create" && title === "Create" ? fallback.title : title;
  const upgradedCtaLabel = fallback?.id === "footer-create" && ctaLabel === "Create" ? fallback.ctaLabel || ctaLabel : ctaLabel;
  return {
    id: cleanEditorialText(block.id, fallback?.id || ""),
    name: cleanEditorialText(block.name, fallback?.name || "Untitled block"),
    title: upgradedTitle,
    body: cleanEditorialText(block.body, fallback?.body || ""),
    ...(block.label !== undefined || fallback?.label !== undefined
      ? { label: cleanEditorialText(block.label, fallback?.label || "") }
      : {}),
    ...(icon ? { icon } : {}),
    ...(block.ctaLabel !== undefined || fallback?.ctaLabel !== undefined
      ? { ctaLabel: upgradedCtaLabel }
      : {}),
    ...(block.ctaUrl !== undefined || fallback?.ctaUrl !== undefined
      ? { ctaUrl: cleanEditorialText(block.ctaUrl, fallback?.ctaUrl || "") }
      : {}),
    ...(Array.isArray(block.items) || fallback?.items
      ? { items: (Array.isArray(block.items) ? block.items : fallback?.items || []).map((item) => cleanEditorialText(item)).slice(0, 20) }
      : {}),
    visible: typeof block.visible === "boolean" ? block.visible : fallback?.visible !== false,
    ...(fallback?.protected || block.protected ? { protected: true } : {})
  };
}

function shouldUpgradeLegacyEditorialBlocks(
  pageKey: EditorialPageKey,
  sectionId: string,
  blocks: Array<Partial<EditorialBlock>>
) {
  const ids = new Set(blocks.map((block) => String(block?.id || "")));
  const bodies = blocks.map((block) => String(block?.body || ""));

  if (pageKey === "home") {
    if (sectionId === "anatomy" && ids.has("home-anatomy-proof")) return true;
    if (sectionId === "roles" && ids.has("home-role-player")) return true;
    if (sectionId === "continuity" && bodies.some((body) => body === "Keep owner-approved service entries and supporting details connected to the instrument.")) return true;
    if (sectionId === "pricing" && bodies.some((body) => body === "Create up to 25 Profiles during public beta without a hard paywall.")) return true;
  }

  if (pageKey === "howItWorks") {
    if (sectionId === "lifecycle" && ids.has("how-step-build") && blocks.some((block) => block?.title === "Add identity, photos, and history")) return true;
    if (sectionId === "features" && (ids.has("how-feature-privacy") || ids.has("how-feature-transfer") || ids.has("how-feature-collections"))) return true;
    if (sectionId === "roles" && (ids.has("how-role-collector") || ids.has("how-role-brand"))) return true;
    if (sectionId === "faq" && ids.has("how-faq-no-serial")) return true;
  }

  if (pageKey === "installers" && sectionId === "process") {
    if (ids.has("installer-verify") || ids.has("installer-coordinate")) return true;
  }

  if (pageKey === "contact" && sectionId === "categories") {
    if (!ids.has("contact-privacy") || blocks.some((block) => block?.title === "Account or login help")) return true;
  }

  return false;
}

export function normalizeEditorialComposition(value?: Partial<EditorialComposition> | null): EditorialComposition {
  return Object.fromEntries(editorialPageKeys.map((pageKey) => {
    const defaults = defaultEditorialComposition[pageKey];
    const candidate = value?.[pageKey];
    if (!candidate || !Array.isArray(candidate.sections)) {
      return [pageKey, structuredClone(defaults)];
    }
    const fallbackById = new Map(defaults.sections.map((section) => [section.id, section]));
    const candidateById = new Map(candidate.sections.map((section) => [String(section?.id || ""), section]));
    const orderedSections = defaults.sections.map((fallback) => candidateById.get(fallback.id) || fallback);
    const sections = orderedSections.map((section) => {
      const fallback = fallbackById.get(String(section?.id || ""));
      const fallbackBlocks = new Map((fallback?.blocks || []).map((block) => [block.id, block]));
      const candidateBlocks = Array.isArray(section?.blocks) ? section.blocks : null;
      const blockSource = candidateBlocks && !shouldUpgradeLegacyEditorialBlocks(pageKey, String(section?.id || ""), candidateBlocks)
        ? candidateBlocks
        : structuredClone(fallback?.blocks || []);
      const blocks = blockSource
        ? blockSource.map((block) => normalizeEditorialBlock(block, fallbackBlocks.get(String(block?.id || ""))))
        : structuredClone(fallback?.blocks || []);
      return {
        id: cleanEditorialText(section?.id, fallback?.id || ""),
        name: cleanEditorialText(section?.name, fallback?.name || "Untitled section"),
        visible: typeof section?.visible === "boolean" ? section.visible : fallback?.visible !== false,
        ...(fallback?.locked || section?.locked ? { locked: true } : {}),
        blocks
      } satisfies EditorialSection;
    });
    return [pageKey, { sections }];
  })) as EditorialComposition;
}

function isSafeEditorialUrl(value: string) {
  if (!value.trim()) return true;
  return /^(\/[^/]|https?:\/\/|mailto:)/i.test(value.trim());
}

function containsUnsafeEditorialMarkup(value: string) {
  return /<\s*script\b|javascript\s*:|on\w+\s*=/i.test(value);
}

export function validateEditorialComposition(composition: EditorialComposition) {
  const errors: Record<string, string> = {};
  for (const pageKey of editorialPageKeys) {
    const path = `composition.${pageKey}`;
    const defaults = defaultEditorialComposition[pageKey];
    const page = composition?.[pageKey];
    if (!page || !Array.isArray(page.sections)) {
      errors[path] = "This page needs its supported section structure.";
      continue;
    }
    const ids = page.sections.map((section) => section.id);
    const expectedIds = defaults.sections.map((section) => section.id);
    if (new Set(ids).size !== ids.length) errors[`${path}.sections`] = "Section IDs must be unique.";
    const missing = expectedIds.filter((id) => !ids.includes(id));
    const unsupported = ids.filter((id) => !expectedIds.includes(id));
    if (missing.length || unsupported.length) {
      errors[`${path}.sections`] = `Keep every supported section exactly once${missing.length ? `; missing ${missing.join(", ")}` : ""}${unsupported.length ? `; unsupported ${unsupported.join(", ")}` : ""}.`;
    }
    for (const locked of defaults.sections.filter((section) => section.locked)) {
      const expectedIndex = expectedIds.indexOf(locked.id);
      const actualIndex = ids.indexOf(locked.id);
      const candidate = page.sections[actualIndex];
      if (actualIndex !== expectedIndex || candidate?.visible === false) {
        errors[`${path}.${locked.id}`] = "This required section must stay visible in its fixed position.";
      }
    }
    for (const section of page.sections) {
      const sectionPath = `${path}.${section.id || "unknown"}`;
      if (!section.id.trim() || !section.name.trim()) errors[sectionPath] = "Section ID and name are required.";
      if (containsUnsafeEditorialMarkup(section.name)) errors[sectionPath] = "Unsafe markup is not allowed.";
      if (section.blocks.length > 12) errors[`${sectionPath}.blocks`] = "Use no more than 12 blocks in one section.";
      const blockIds = section.blocks.map((block) => block.id);
      if (new Set(blockIds).size !== blockIds.length) errors[`${sectionPath}.blocks`] = "Block IDs must be unique.";
      const defaultSection = defaults.sections.find((item) => item.id === section.id);
      if ((defaultSection?.blocks.length || 0) > 0 && section.blocks.length < 1) {
        errors[`${sectionPath}.blocks`] = "Keep at least one block in this section.";
      }
      for (const protectedBlock of defaultSection?.blocks.filter((block) => block.protected) || []) {
        if (!blockIds.includes(protectedBlock.id)) errors[`${sectionPath}.blocks`] = `Protected block ${protectedBlock.name} cannot be removed.`;
      }
      for (const block of section.blocks) {
        const blockPath = `${sectionPath}.${block.id || "unknown"}`;
        if (!block.id.trim() || !block.name.trim() || !block.title.trim()) errors[blockPath] = "Block ID, semantic name, and title are required.";
        if (block.icon && !editorialIconAllowlist.includes(block.icon)) errors[`${blockPath}.icon`] = "Choose an approved icon.";
        if (block.ctaUrl && !isSafeEditorialUrl(block.ctaUrl)) errors[`${blockPath}.ctaUrl`] = "Use a local, HTTPS, HTTP, or mailto URL.";
        if ([block.name, block.title, block.body, block.label || "", block.ctaLabel || "", block.ctaUrl || "", ...(block.items || [])].some(containsUnsafeEditorialMarkup)) {
          errors[blockPath] = "Unsafe HTML or script content is not allowed.";
        }
      }
    }
  }
  return errors;
}

export function getEditorialSection(settings: EditableSiteSettings, page: EditorialPageKey, id: string) {
  return settings.composition[page].sections.find((section) => section.id === id);
}

export function resolveVisibleEditorialSections(settings: EditableSiteSettings, page: EditorialPageKey) {
  return settings.composition[page].sections.filter((section) => section.visible !== false);
}

function normalizePricingCards(cards: PricingPlanInput[]) {
  const cleaned = cards
    .filter((item) => item && typeof item.name === "string" && item.name.trim().length > 0)
    .map((item) => ({
      name: item.name.trim(),
      price: item.price?.trim() || "",
      copy: item.copy?.trim() || "",
      badge: item.badge?.trim() || "",
      features: item.features && item.features.length ? item.features.map((feature) => feature?.trim() || "") : [""]
    }));

  const defaultCards = defaultSiteSettings.sections.pricingCards;
  const freePlan = defaultCards[0];
  const commercialPlan = defaultCards[1];
  if (!freePlan || !commercialPlan) {
    return defaultCards;
  }

  const existingFree = cleaned.find((item) => /free|owner|collector/i.test(item.name)) || cleaned[0];
  const existingCommercial = cleaned.find((item, index) => index > 0 && /commercial|shop|builder|brand/i.test(item.name)) || cleaned[1];

  return [
    existingFree ? { ...freePlan, ...existingFree, name: freePlan.name } : freePlan,
    existingCommercial ? { ...commercialPlan, ...existingCommercial, name: commercialPlan.name } : commercialPlan
  ];
}

function normalizeProfileCopy(value: string) {
  const trimmedValue = value.trim();
  const approvedDefaultUpgrades: Record<string, string> = {
    "Permanent QRguitar Profiles for instruments, builders, shops, collectors, and future owners.": "One Profile for the life of an instrument.",
    "Permanent QRguitar Profiles for guitars, amps, pedals, builders, shops, collectors, and future owners.": "One Profile for the life of an instrument.",
    "Permanent identity for instruments": "FOR OWNERS, SHOPS, BUILDERS & COLLECTORS",
    "FOR BUILDERS, SHOPS, COLLECTORS & PLAYERS": "FOR OWNERS, SHOPS, BUILDERS & COLLECTORS",
    "Every instrument has a story. Keep it connected.": "One Profile for the life of an instrument.",
    "Keep its identity, proof, and history together.": "One Profile for the life of an instrument.",
    "Create a permanent QRguitar Profile with photos, specifications, service history, ownership records, and a QR code that stays with the instrument.": "Keep the photos, specs, service, documents, ownership, and permanent QR with the instrument.",
    "Create one QRguitar Profile for photos, specs, service history, proof, ownership, and lost or stolen alerts. Its permanent QR link stays the same through every update and every owner.": "Keep the photos, specs, service, documents, ownership, and permanent QR with the instrument.",
    "Create Profile": "Create a Profile",
    "Start with the instrument. Build the history over time.": "Create it once. Keep it current.",
    "Simple enough for one guitar. Useful enough for a whole shop.": "Create it once. Keep it current.",
    "Add the facts you know today, then keep photos, service, documents, and ownership connected as the instrument changes hands.": "Start with the instrument. Add the history as it happens.",
    "Start with the basic facts, put the QR where people will actually use it, then keep adding the things that usually get lost.": "Start with the instrument. Add the history as it happens.",
    "Create the identity": "Identify",
    "Add one real photo and the instrument details you know.": "Serial Number, photos, specifications, and the permanent QRguitar ID.",
    "Build the history": "Document",
    "Keep service, documents, photos, and ownership connected.": "Service, documents, media, safety, and ownership history.",
    "Scan and share": "Carry Forward",
    "Use the permanent QR code wherever the instrument goes.": "Transfer the same Profile when the instrument changes hands.",
    "What each profile holds": "INSIDE A PROFILE",
    "The details guitar people ask for, before they ask.": "See the details that matter.",
    "A QRguitar Profile can be as simple or as deep as the instrument needs. Start with the basics, then add the bench notes, proof, media, and history that make the piece easier to sell, service, insure, or pass on.": "Photos, specifications, service, documents, and ownership stay attached to the same Profile.",
    "Build a Profile": "Explore a Profile",
    "Built for guitar people": "WHO USES QRGUITAR",
    "For the bench, the sales floor, the collection room, and the next owner.": "One system. Different jobs.",
    "History that stays useful": "SERVICE & OWNERSHIP",
    "One Profile, through the work and every handoff.": "The history stays with the instrument.",
    "QRguitar keeps the instrument's identity connected while owners decide which service, documents, and history become public.": "Approved service and completed ownership transfers update the same Profile. The QRguitar ID and link do not change.",
    "See the full workflow": "See How It Works",
    "The living archive": "PUBLIC PROFILES",
    "Explore the archive": "See what's already documented.",
    "Free Profiles during public beta.": "Start free. Get help when you need it.",
    "Create QRguitar Profiles free. Commercial setup starts at $99+.": "Start free. Get help when you need it.",
    "Create and maintain QRguitar Profiles without a hard paywall while the registry grows. Paid help is available separately.": "Create Profiles during public beta, or ask QRguitar for hands-on commercial setup.",
    "During public beta, users can create instrument profiles without a hard paywall. Verification, QR hardware, install help, builder/shop onboarding, and commercial setup are available as paid services.": "Create Profiles during public beta, or ask QRguitar for hands-on commercial setup.",
    "Free Public Beta": "For owners and collectors",
    "$0": "$0 during public beta",
    "Commercial / Brand Setup": "For shops, builders & brands",
    "From $99+": "From $99",
    "Give the next instrument a permanent place to live.": "Start with one instrument.",
    "Create a Profile in minutes and keep improving it for years.": "Create the Profile now. Add the rest over time.",
    "Ready when the instrument is": "READY TO BEGIN",
    "Browse Profiles": "Explore the Catalog",
    "The Catalog": "PUBLIC CATALOG",
    "Explore QRguitar Profiles.": "Browse QRguitar Profiles",
    "Search public Profiles by brand, model, year, availability, trust status, service history, and more.": "Search the Catalog by brand, model, year, availability, trust status, service history, and more.",
    "Explore QRguitar Profiles by brand, category, trust status, availability, and history.": "Search the Catalog by brand, model, year, availability, trust status, service history, and more.",
    "QR INSTALLS": "FOR SHOPS & SERVICE PROVIDERS",
    "QR installs": "FOR SHOPS & SERVICE PROVIDERS",
    "Put the Profile where people can use it.": "Turn service work into a Profile customers keep.",
    "Explore QR stickers, tags, plates, and hands-on installation support for instruments and inventory.": "Create or update QRguitar Profiles with owner approval, add documented service, print scannable handouts, and help every instrument leave your shop with a clearer history.",
    "Apply as a Founding Installer": "Apply to the Provider Network",
    "How the program works": "How approval works",
    "Reset filters": "Clear filters",
    "One permanent Profile for every instrument.": "One Profile that stays with the instrument.",
    "QRguitar Print Kit": "Print Suite",
    "Owner dashboard": "Your instruments",
    "Your collection": "Your Profiles",
    "View Profile": "Open Profile"
  };
  if (approvedDefaultUpgrades[trimmedValue]) {
    return approvedDefaultUpgrades[trimmedValue];
  }
  if (trimmedValue === "Every instrument deserves a permanent QRguitar Profile.") {
    return siteCopy.hero.headline;
  }
  if (
    trimmedValue.startsWith("Imagine your guitar hanging on the wall at a local shop.") &&
    trimmedValue.includes("largest living database of guitars and music gear on the planet")
  ) {
    return siteCopy.workflow.body;
  }

  const stalePublic = "Public";
  const stalePublicLower = "public";
  const staleRecord = "Record";
  const staleRecords = "Records";
  const replacements: Array<[RegExp, string]> = [
    [
      /Every instrument deserves a permanent QRguitar Profile\./g,
      siteCopy.hero.headline
    ],
    [
      /^QRguitar creates a lifetime digital identity for guitars, amps, pedals, and custom builds\. Add photos, specs, serial numbers, service history, documents, ownership transfers, lost\/stolen alerts, and a permanent QR code that stays with the instrument wherever it goes\.$/,
      siteCopy.hero.body
    ],
    [
      /^Imagine your guitar hanging on the wall at a local shop\.[\s\S]*largest living database of guitars and music gear on the planet\.$/,
      siteCopy.workflow.body
    ],
    [/^Simple enough for one guitar\. Essential for an entire brand\.$/, siteCopy.workflow.headline],
    [/^What each record holds$/i, siteCopy.customization.eyebrow],
    [/\bCreate up to 25 records during public beta\b/gi, "Create up to 25 profiles during public beta"],
    [/\bUp to 25 records during beta\b/gi, "Up to 25 profiles during beta"],
    [/\bBulk record setup\b/gi, "Bulk profile setup"],
    [/\ba record the customer can keep\b/gi, "a QRguitar Profile the customer can keep"],
    [/\bCreate a Record\b/g, "Create Profile"],
    [/\bCreate Record\b/g, "Create Profile"],
    [/\bCreate Your First Record\b/g, "Create Your First Profile"],
    [/\bBuild a Record\b/g, "Build a Profile"],
    [/\bCreate the record\b/g, "Create the profile"],
    [/\bCreate records\b/g, "Create QRguitar Profiles"],
    [/\bcreate records\b/g, "create QRguitar Profiles"],
    [/\bCreate record\b/g, "Create profile"],
    [/\bcreate record\b/g, "create profile"],
    [/\brecord is built\b/gi, "profile is built"],
    [/\bevery QRguitar record\b/gi, "every QRguitar Profile"],
    [/\bA QRguitar record\b/g, "A QRguitar Profile"],
    [/\bQRguitar record\b/g, "QRguitar Profile"],
    [/\bQRguitar records\b/g, "QRguitar Profiles"],
    [new RegExp(`\\bBrowse ${stalePublic} ${staleRecords}\\b`, "gi"), "Browse QRguitar Profiles"],
    [new RegExp(`\\bSee ${stalePublic} ${staleRecords}\\b`, "gi"), "See QRguitar Profiles"],
    [new RegExp(`\\b${stalePublic} QRguitar ${staleRecords}\\b`, "gi"), "QRguitar Profiles"],
    [new RegExp(`\\b${stalePublic} QRguitar ${staleRecord}\\b`, "gi"), "QRguitar Profile"],
    [new RegExp(`\\b${stalePublicLower} QRguitar ${staleRecords.toLowerCase()}\\b`, "gi"), "QRguitar Profiles"],
    [new RegExp(`\\b${stalePublicLower} QRguitar ${staleRecord.toLowerCase()}\\b`, "gi"), "QRguitar Profile"],
    [new RegExp(`\\b${stalePublic} ${staleRecords}\\b`, "gi"), "QRguitar Profiles"],
    [new RegExp(`\\b${stalePublic} ${staleRecord}\\b`, "gi"), "QRguitar Profile"],
    [new RegExp(`\\b${stalePublicLower} ${staleRecords.toLowerCase()}\\b`, "gi"), "QRguitar Profiles"],
    [new RegExp(`\\b${stalePublicLower} ${staleRecord.toLowerCase()}\\b`, "gi"), "QRguitar Profile"],
    [/\bExplore Public Profiles by brand, type, status, availability, and history\b/gi, "Explore QRguitar Profiles by brand, category, trust status, availability, and history"],
    [/\{count\} Public Profiles\b/g, "{count} Profiles"],
    [/\bExplore QRguitar Profiles by brand, type, status, availability, and history\b/gi, "Explore QRguitar Profiles by brand, category, trust status, availability, and history"],
    [/\{count\} QRguitar Profiles\b/g, "{count} Profiles"],
    [/\bVisible Profiles\b/g, "Public Profiles"],
    [/\bVisible Profile\b/g, "Public Profile"],
    [/\bvisible profiles\b/g, "Public Profiles"],
    [/\bvisible profile\b/g, "Public Profile"],
    [/\bExplore visible instruments\b/gi, "Explore Public Profiles"],
    [/\bChoose Visible, Unlisted, or Private\b/gi, "Choose Public, Unlisted, or Private"],
    [/\bShare selected (?:visible|Public) Profiles\b/gi, "Share your Public Profiles"],
    [/\bwhich visible Profiles\b/gi, "which Public Profiles"],
    [/\bserial\s*\/\s*build information\b/gi, "Serial Number and identity information"],
    [/\bserial\s*\/\s*build ID\b/gi, "Serial Number"],
    [/\bpermanent records\b/gi, "permanent QRguitar Profiles"],
    [/\bpermanent record\b/gi, "permanent QRguitar Profile"],
    [/\binstrument records\b/gi, "instrument profiles"],
    [/\bguitar records\b/gi, "guitar profiles"],
    [/\bbuilder records\b/gi, "builder profiles"],
    [/\bwarranty records\b/gi, "warranty profiles"],
    [/\bVerify important records later\b/gi, "Verify important profiles later"],
    [/\bservice records\b/gi, "service history"],
    [/\bservice profiles\b/gi, "service history"]
  ];

  return replacements.reduce((copy, [pattern, replacement]) => copy.replace(pattern, replacement), value);
}

function normalizeCopyObject<T>(value: T): T {
  if (typeof value === "string") {
    return normalizeProfileCopy(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeCopyObject(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeCopyObject(item)])
    ) as T;
  }

  return value;
}

export function mergeSiteSettings(settings?: Partial<EditableSiteSettings> | null): EditableSiteSettings {
  const sections: Partial<EditableSiteSettings["sections"]> = settings?.sections || {};
  const hasInstrumentCategories = Object.prototype.hasOwnProperty.call(settings || {}, "instrumentCategories");
  return normalizeCopyObject({
    ...defaultSiteSettings,
    ...(settings || {}),
    brandLogos: normalizeBrandLogos(settings?.brandLogos),
    instrumentCategories: Array.isArray(settings?.instrumentCategories)
      ? normalizeInstrumentCategories(settings.instrumentCategories, false)
      : hasInstrumentCategories ? [] : defaultSiteSettings.instrumentCategories,
    colors: {
      ...defaultSiteSettings.colors,
      ...(settings?.colors || {})
    },
    hero: {
      ...defaultSiteSettings.hero,
      ...(settings?.hero || {})
    },
    sections: {
      ...defaultSiteSettings.sections,
      ...sections,
      howCards: Array.isArray(sections.howCards) ? sections.howCards.map((item) => ({
        title: item?.title?.trim() || "",
        copy: item?.copy?.trim() || ""
      })) : defaultSiteSettings.sections.howCards,
      detailsChecks: Array.isArray(sections.detailsChecks)
        ? sections.detailsChecks.map((item) => item?.trim() || "")
        : defaultSiteSettings.sections.detailsChecks,
      audienceCards: Array.isArray(sections.audienceCards)
        ? sections.audienceCards.map((item) => ({ title: item?.title?.trim() || "", copy: item?.copy?.trim() || "" }))
        : defaultSiteSettings.sections.audienceCards,
      pricingCards: Array.isArray(sections.pricingCards)
        ? sections.pricingCards.length ? normalizePricingCards(sections.pricingCards) : []
        : defaultSiteSettings.sections.pricingCards
    },
    seo: {
      ...defaultSiteSettings.seo,
      ...(settings?.seo || {})
    },
    dashboard: {
      ...defaultSiteSettings.dashboard,
      ...(settings?.dashboard || {})
    },
    composition: normalizeEditorialComposition(settings?.composition),
    content: mergeContentValues(settings?.content as Record<string, unknown> | undefined)
  });
}

export function normalizeBrandLogoKey(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeBrandLogos(value?: Record<string, string> | null) {
  const entries = Object.entries(value || {})
    .map(([brand, url]) => [normalizeBrandLogoKey(brand), String(url || "").trim()] as const)
    .filter(([brand, url]) => brand && /^(https?:\/\/|\/)/i.test(url));

  return Object.fromEntries(entries);
}

export function readSiteSettings() {
  if (typeof window === "undefined") {
    return defaultSiteSettings;
  }

  try {
    const stored = window.localStorage.getItem(siteSettingsKey);
    return stored ? mergeSiteSettings(JSON.parse(stored) as Partial<EditableSiteSettings>) : defaultSiteSettings;
  } catch {
    return defaultSiteSettings;
  }
}

export async function fetchPublishedSiteSettings() {
  try {
    const response = await fetch(`/api/site-settings?fresh=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store"
      }
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { ok?: boolean; settings?: Partial<EditableSiteSettings> | null };
    return payload.ok && payload.settings ? mergeSiteSettings(payload.settings) : null;
  } catch {
    return null;
  }
}

export function saveSiteSettings(settings: EditableSiteSettings) {
  window.localStorage.setItem(siteSettingsKey, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("qrguitar:site-settings", { detail: settings }));
}

export function resetSiteSettings() {
  window.localStorage.removeItem(siteSettingsKey);
  window.dispatchEvent(new CustomEvent("qrguitar:site-settings", { detail: defaultSiteSettings }));
}

export function applyThemeSettings(settings: EditableSiteSettings) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.style.setProperty("--bg", settings.colors.background);
  root.style.setProperty("--bg-2", settings.colors.background);
  root.style.setProperty("--panel", settings.colors.panel);
  root.style.setProperty("--panel-2", settings.colors.panel);
  root.style.setProperty("--gold", settings.colors.gold);
  root.style.setProperty("--gold-2", settings.colors.gold);
  root.style.setProperty("--cream", settings.colors.cream);
  root.style.setProperty("--text", settings.colors.text);
  root.style.setProperty("--warm-canvas", `color-mix(in srgb, ${settings.colors.cream} 68%, white)`);
  root.style.setProperty("--light-surface", `color-mix(in srgb, ${settings.colors.cream} 34%, white)`);
  root.style.setProperty("--dark-text", settings.colors.background);
}

export function buildEditableHomeCopy(settings: EditableSiteSettings) {
  return {
    hero: {
      ...siteCopy.hero,
      ...settings.hero,
      eyebrow: getContentValue(settings.content, "home.hero.eyebrow"),
      headline: getContentValue(settings.content, "home.hero.headline"),
      body: getContentValue(settings.content, "home.hero.body"),
      primaryCta: getContentValue(settings.content, "home.hero.primaryCta"),
      secondaryCta: getContentValue(settings.content, "home.hero.secondaryCta")
    },
    workflow: {
      eyebrow: getContentValue(settings.content, "home.lifecycle.eyebrow") || settings.sections.howEyebrow,
      headline: getContentValue(settings.content, "home.lifecycle.headline") || settings.sections.howHeadline,
      body: getContentValue(settings.content, "home.lifecycle.body") || settings.sections.howBody,
      cards: settings.sections.howCards.map((card, index) => ({
        ...card,
        icon: siteCopy.workflow.cards[index]?.icon || siteCopy.workflow.cards[0].icon
      })),
      cta: siteCopy.workflow.cta
    },
    customization: {
      eyebrow: getContentValue(settings.content, "home.anatomy.eyebrow") || settings.sections.detailsEyebrow,
      headline: getContentValue(settings.content, "home.anatomy.headline") || settings.sections.detailsHeadline,
      body: getContentValue(settings.content, "home.anatomy.body") || settings.sections.detailsBody,
      checks: settings.sections.detailsChecks.map((copy) => ({ icon: CheckCircle2, copy })),
      cta: getContentValue(settings.content, "home.anatomy.cta") || settings.sections.detailsCta
    },
    audiences: {
      eyebrow: getContentValue(settings.content, "home.roles.eyebrow") || settings.sections.audienceEyebrow,
      headline: getContentValue(settings.content, "home.roles.headline") || settings.sections.audienceHeadline,
      body: getContentValue(settings.content, "home.roles.body"),
      cards: settings.sections.audienceCards.map((card, index) => ({
        ...card,
        icon: siteCopy.audiences.cards[index]?.icon || siteCopy.audiences.cards[0].icon
      })),
      cta: settings.sections.audienceCta
    },
    pricing: {
      eyebrow: getContentValue(settings.content, "home.pricing.eyebrow") || settings.sections.pricingEyebrow,
      headline: getContentValue(settings.content, "home.pricing.headline") || settings.sections.pricingHeadline,
      body: getContentValue(settings.content, "home.pricing.body"),
      plans: settings.sections.pricingCards.map((plan) => ({
        ...plan,
        icon: siteCopy.workflow.cards[0].icon
      })),
      enterpriseTitle: settings.sections.pricingEnterpriseTitle,
      enterpriseBody: settings.sections.pricingEnterpriseBody
    },
    preview: {
      specsIcon: siteCopy.preview.specsIcon,
      mediaIcon: siteCopy.preview.mediaIcon,
      timelineIcon: siteCopy.preview.timelineIcon,
      docsIcon: siteCopy.preview.docsIcon
    }
  };
}

export function applySeoSettings(settings: EditableSiteSettings) {
  if (typeof document === "undefined") {
    return;
  }

  const canonicalUrl = settings.seo.canonicalUrl || "https://www.qrguitar.com";
  const seoImage = toAbsolutePublicUrl(settings.seo.image || "/seo/qrguitar-og-v2.png", canonicalUrl);
  const faviconSetting = settings.seo.favicon || "/qrguitar-logo-white-orange.svg";
  const favicon = /^https?:\/\//i.test(faviconSetting)
    ? faviconSetting
    : faviconSetting.startsWith("/")
      ? faviconSetting
      : `/${faviconSetting}`;

  document.title = settings.seo.title;
  setMetaTag("description", settings.seo.description);
  setMetaTag("keywords", settings.seo.keywords);
  setMetaTag("robots", settings.seo.robots || "index, follow");
  setMetaProperty("og:site_name", settings.brandName);
  setMetaProperty("og:title", settings.seo.title);
  setMetaProperty("og:description", settings.seo.description);
  setMetaProperty("og:image", seoImage);
  setMetaProperty("og:url", canonicalUrl);
  setMetaProperty("og:locale", "en_US");
  setMetaProperty("og:type", "website");
  setMetaTag("twitter:title", settings.seo.title);
  setMetaTag("twitter:description", settings.seo.description);
  setMetaTag("twitter:image", seoImage);
  setMetaTag("twitter:card", "summary_large_image");
  setMetaTag("twitter:site", settings.seo.twitterHandle);
  setCanonicalLink(canonicalUrl);
  setIconLink("icon", favicon);
  setIconLink("apple-touch-icon", favicon);
  setJsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: settings.brandName || "QRguitar",
        url: canonicalUrl,
        description: settings.seo.description,
        sameAs: [settings.seo.twitterHandle].filter(Boolean),
        logo: seoImage
      },
      {
        "@type": "WebSite",
        name: settings.brandName || "QRguitar",
        url: canonicalUrl,
        description: settings.seo.description,
        publisher: {
          "@type": "Organization",
          name: settings.brandName || "QRguitar",
          sameAs: [settings.seo.twitterHandle]
        }
      }
    ]
  });
}

function toAbsolutePublicUrl(pathOrUrl: string, siteUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const base = siteUrl.replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

function setMetaTag(name: string, content: string) {
  if (!content) {
    return;
  }

  let tag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = name;
    document.head.appendChild(tag);
  }

  tag.content = content;
}

function setMetaProperty(property: string, content: string) {
  if (!content) {
    return;
  }

  let tag = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }

  tag.content = content;
}

function setCanonicalLink(href: string) {
  if (!href) {
    return;
  }

  let link = document.querySelector<HTMLLinkElement>(`link[rel="canonical"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }

  link.href = href;
}

function setIconLink(rel: string, href: string) {
  if (!href) {
    return;
  }

  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }

  link.href = href;
}

function setJsonLd(payload: Record<string, unknown>) {
  let script = document.getElementById("qrguitar-seo-jsonld") as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = "qrguitar-seo-jsonld";
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }

  script.text = JSON.stringify(payload);
}
