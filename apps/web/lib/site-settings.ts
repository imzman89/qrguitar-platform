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
      { id: "hero", name: "Hero and latest Profile", visible: true, locked: true, blocks: [] },
      { id: "lifecycle", name: "Profile lifecycle", visible: true, blocks: [
        { id: "home-step-identity", name: "Create identity", title: "Create the identity", body: "Add one real photo and the instrument details you know.", icon: "qr", visible: true, protected: true },
        { id: "home-step-history", name: "Build history", title: "Build the history", body: "Keep service, documents, photos, and ownership connected.", icon: "history", visible: true },
        { id: "home-step-share", name: "Scan and share", title: "Scan and share", body: "Use the permanent QR code wherever the instrument goes.", icon: "photo", visible: true }
      ] },
      { id: "anatomy", name: "Profile anatomy", visible: true, blocks: [
        { id: "home-anatomy-identity", name: "Identity", title: "Identity", body: "Serial Number, specifications, visibility, and permanent QRguitar ID.", icon: "qr", visible: true, protected: true },
        { id: "home-anatomy-proof", name: "Proof", title: "Proof", body: "Photos, selected documents, verification, and authenticity status.", icon: "shield", visible: true },
        { id: "home-anatomy-history", name: "History", title: "History", body: "Service, Timeline events, ownership handoffs, and safety alerts.", icon: "history", visible: true }
      ] },
      { id: "roles", name: "Role and use cases", visible: true, blocks: [
        { id: "home-role-player", name: "Players", title: "Players", body: "Keep an instrument's identity, photos, service, and ownership history together.", icon: "photo", visible: true, protected: true },
        { id: "home-role-collector", name: "Collectors", title: "Collectors", body: "Preserve provenance and choose what becomes part of a public collection.", icon: "shield", visible: true },
        { id: "home-role-shop", name: "Shops and builders", title: "Shops and builders", body: "Prepare Profiles, QR materials, service history, and customer handoffs.", icon: "store", visible: true }
      ] },
      { id: "continuity", name: "Service, ownership, and provenance", visible: true, blocks: [
        { id: "home-continuity-service", name: "Service", title: "Document the work", body: "Keep owner-approved service entries and supporting details connected to the instrument.", icon: "wrench", visible: true, protected: true },
        { id: "home-continuity-ownership", name: "Ownership", title: "Hand it off securely", body: "Use a reviewed claim or owner-initiated transfer when the instrument changes hands.", icon: "transfer", visible: true },
        { id: "home-continuity-provenance", name: "Provenance", title: "Preserve what matters", body: "Carry verified identity, selected documents, and meaningful history forward without rewriting the past.", icon: "history", visible: true }
      ] },
      { id: "pricing", name: "Public beta pricing", visible: true, blocks: [
        { id: "home-price-beta", name: "Free Public Beta", title: "Free Public Beta", label: "$0", body: "Create up to 25 Profiles during public beta without a hard paywall.", ctaLabel: "Create Free Profile", ctaUrl: "/create", items: ["Up to 25 Profiles during beta", "Public, Private, or Unlisted", "QR download included"], icon: "qr", visible: true, protected: true },
        { id: "home-price-commercial", name: "Commercial and brand setup", title: "Commercial / Brand Setup", label: "From $99+", body: "For builders, retailers, repair shops, brands, and commercial accounts that need onboarding or bulk help.", ctaLabel: "Contact QRguitar", ctaUrl: "mailto:support@qrguitar.com", items: ["Builder, retailer, and shop onboarding", "Bulk Profile setup", "QR hardware and verification support"], icon: "store", visible: true }
      ] },
      { id: "finalCta", name: "Closing action", visible: true, blocks: [] }
    ]
  },
  howItWorks: {
    sections: [
      { id: "hero", name: "Hero", visible: true, locked: true, blocks: [] },
      { id: "lifecycle", name: "Instrument lifecycle", visible: true, blocks: [
        { id: "how-step-create", name: "Create or find", title: "Create or find the Profile", body: "Enter the Serial Number first. If a matching Profile exists, use transfer or a reviewed claim instead of creating a duplicate.", icon: "qr", visible: true, protected: true },
        { id: "how-step-build", name: "Add identity", title: "Add identity, photos, and history", body: "Start with the instrument identity and one clear photo, then add the details and history you know.", icon: "photo", visible: true },
        { id: "how-step-qr", name: "Use the QR", title: "Use the permanent QR", body: "Download, share, or print the QR for the instrument, case, counter card, or paperwork.", icon: "qr", visible: true },
        { id: "how-step-maintain", name: "Maintain history", title: "Maintain service and ownership", body: "Add approved service, media, documents, and ownership changes to the same permanent Profile over time.", icon: "history", visible: true }
      ] },
      { id: "identity", name: "Identity and privacy", visible: true, blocks: [] },
      { id: "features", name: "Feature map", visible: true, blocks: [
        { id: "how-feature-identity", name: "Identity and QR", title: "Identity and QR", body: "Keep the QRguitar ID, permitted Serial Number, and permanent Profile link together.", icon: "qr", visible: true, protected: true },
        { id: "how-feature-media", name: "Photos and media", title: "Photos, specs, and media", body: "Show the instrument clearly with useful details, video, and audio.", icon: "photo", visible: true },
        { id: "how-feature-service", name: "Timeline and service", title: "Timeline and service", body: "Record ownership milestones and owner-approved provider work.", icon: "wrench", visible: true },
        { id: "how-feature-docs", name: "Documents and print", title: "Documents and print", body: "Keep private evidence, share selected documents, and print handouts or QR labels.", icon: "document", visible: true },
        { id: "how-feature-privacy", name: "Visibility", title: "Public, Unlisted, or Private", body: "Choose how each Profile is discovered without changing its permanent identity.", icon: "eye", visible: true },
        { id: "how-feature-safety", name: "Safety", title: "Safety and provenance", body: "Publish lost or stolen alerts and preserve reviewed historical evidence.", icon: "shield", visible: true },
        { id: "how-feature-transfer", name: "Transfers and claims", title: "Transfers and claims", body: "Hand the same Profile to its next owner through a recipient-bound workflow.", icon: "transfer", visible: true },
        { id: "how-feature-collections", name: "Collections and Bulk Import", title: "Collections and Bulk Import", body: "Opt into a public collection or prepare larger inventories privately before publishing.", icon: "store", visible: true }
      ] },
      { id: "service", name: "Service and ownership", visible: true, blocks: [] },
      { id: "roles", name: "Role journeys", visible: true, blocks: [
        { id: "how-role-player", name: "Players", title: "Players", body: "Document an instrument, maintain its history, share it, and transfer it when ownership changes.", ctaLabel: "Create a Profile", ctaUrl: "/create", icon: "photo", visible: true, protected: true },
        { id: "how-role-collector", name: "Collectors", title: "Collectors", body: "Choose privacy per Profile, preserve provenance, and opt into a public collection when ready.", ctaLabel: "Create a Profile", ctaUrl: "/create", icon: "shield", visible: true },
        { id: "how-role-shop", name: "Shops", title: "Shops", body: "Bulk import private inventory, refine Profiles, print materials, and transfer to customers.", ctaLabel: "Open inventory tools", ctaUrl: "/dashboard/import", icon: "store", visible: true },
        { id: "how-role-builder", name: "Builders", title: "Builders", body: "Create build Profiles with official specifications, media, and a clean purchaser handoff.", ctaLabel: "Open inventory tools", ctaUrl: "/dashboard/import", icon: "store", visible: true },
        { id: "how-role-brand", name: "Brands", title: "Brands", body: "Keep product identity consistent across new and used instruments while supporting larger rollouts.", ctaLabel: "Open inventory tools", ctaUrl: "/dashboard/import", icon: "store", visible: true },
        { id: "how-role-provider", name: "Service providers", title: "Luthiers / Technicians", body: "Submit repair, restoration, setup, and service work for owner approval.", ctaLabel: "Set up provider tools", ctaUrl: "/account#service-provider", icon: "wrench", visible: true },
        { id: "how-role-buyer", name: "Buyers", title: "Buyers", body: "Review public identity, history, trust signals, and seller collections before transfer or claim.", ctaLabel: "Open Claim Center", ctaUrl: "/ownership-claim", icon: "eye", visible: true }
      ] },
      { id: "faq", name: "Common questions", visible: true, blocks: [
        { id: "how-faq-serial", name: "Serial Number privacy", title: "Can I hide the Serial Number?", body: "Yes. The owner can keep the Serial Number in the private workspace while hiding it from public surfaces without changing the QRguitar ID.", icon: "help", visible: true, protected: true },
        { id: "how-faq-no-serial", name: "No Serial Number", title: "What if there is no Serial Number?", body: "QRguitar assigns a unique six-digit ID. Trust approval requires QRguitar review.", icon: "help", visible: true },
        { id: "how-faq-transfer", name: "Transfer safety", title: "Can scanning the QR transfer ownership?", body: "No. A scan only opens the Profile. The current owner or shop must start a secure, recipient-bound transfer.", icon: "help", visible: true },
        { id: "how-faq-visibility", name: "Catalog privacy", title: "Can I keep a Profile out of the Catalog?", body: "Yes. Choose Unlisted for direct-link access or Private for owner and authorized admin access only.", icon: "help", visible: true }
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
    { id: "process", name: "Partner process", visible: true, blocks: [
      { id: "installer-apply", name: "Apply", title: "Apply", body: "Submit shop details, service area, finish experience, and references.", icon: "store", visible: true, protected: true },
      { id: "installer-verify", name: "Verify", title: "Verify", body: "QRguitar reviews the business and confirms qualified partners.", icon: "shield", visible: true },
      { id: "installer-coordinate", name: "Coordinate", title: "Coordinate", body: "QRguitar connects approved shops and owners for installation or repair-linked documentation.", icon: "transfer", visible: true }
    ] },
    { id: "apply", name: "Partner application", visible: true, blocks: [] }
  ] },
  contact: { sections: [
    { id: "hero", name: "Support introduction", visible: true, locked: true, blocks: [] },
    { id: "categories", name: "Support categories", visible: true, blocks: [
      { id: "contact-account", name: "Account help", title: "Account or login help", body: "Password reset, account access, Profile details, and session issues.", ctaLabel: "Email support", ctaUrl: "mailto:support@qrguitar.com?subject=QRguitar%20account%20help", icon: "help", visible: true, protected: true },
      { id: "contact-profile", name: "Profile and QR help", title: "Profile or QR help", body: "Permanent IDs, photo uploads, QR downloads, visibility, and Profile edits.", ctaLabel: "Email support", ctaUrl: "mailto:support@qrguitar.com?subject=QRguitar%20Profile%20or%20QR%20help", icon: "qr", visible: true },
      { id: "contact-verification", name: "Verification review", title: "Verification review", body: "Manual beta review for specifications, provenance, documents, Serial Numbers, and authenticity evidence.", ctaLabel: "Email support", ctaUrl: "mailto:support@qrguitar.com?subject=QRguitar%20verification%20review", icon: "shield", visible: true },
      { id: "contact-ownership", name: "Ownership help", title: "Lost, stolen, or transfer help", body: "Safety alerts, transfers, claims, and edge cases that need manual support.", ctaLabel: "Email support", ctaUrl: "mailto:support@qrguitar.com?subject=QRguitar%20safety%20or%20transfer%20help", icon: "transfer", visible: true },
      { id: "contact-commercial", name: "Commercial onboarding", title: "Shop, builder, or brand onboarding", body: "Bulk Profile planning, brand logos, QR installs, handouts, and commercial setup.", ctaLabel: "Email support", ctaUrl: "mailto:support@qrguitar.com?subject=QRguitar%20commercial%20onboarding", icon: "store", visible: true }
    ] },
    { id: "checklist", name: "Support checklist", visible: true, blocks: [] }
  ] },
  footer: { sections: [
    { id: "links", name: "Footer links", visible: true, locked: true, blocks: [
      { id: "footer-dashboard", name: "Dashboard", title: "Dashboard", body: "", ctaLabel: "Dashboard", ctaUrl: "/dashboard", icon: "link", visible: true, protected: true },
      { id: "footer-catalog", name: "Catalog", title: "Catalog", body: "", ctaLabel: "Catalog", ctaUrl: "/catalog", icon: "link", visible: true, protected: true },
      { id: "footer-create", name: "Create", title: "Create", body: "", ctaLabel: "Create", ctaUrl: "/create", icon: "link", visible: true },
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
  return {
    id: cleanEditorialText(block.id, fallback?.id || ""),
    name: cleanEditorialText(block.name, fallback?.name || "Untitled block"),
    title: cleanEditorialText(block.title, fallback?.title || ""),
    body: cleanEditorialText(block.body, fallback?.body || ""),
    ...(block.label !== undefined || fallback?.label !== undefined
      ? { label: cleanEditorialText(block.label, fallback?.label || "") }
      : {}),
    ...(icon ? { icon } : {}),
    ...(block.ctaLabel !== undefined || fallback?.ctaLabel !== undefined
      ? { ctaLabel: cleanEditorialText(block.ctaLabel, fallback?.ctaLabel || "") }
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
      const blocks = Array.isArray(section?.blocks)
        ? section.blocks.map((block) => normalizeEditorialBlock(block, fallbackBlocks.get(String(block?.id || ""))))
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
  const freePlan = defaultCards.find((plan) => plan.name.toLowerCase() === "free public beta");
  const commercialPlan = defaultCards.find((plan) => plan.name.toLowerCase() === "commercial / brand setup");
  if (!freePlan || !commercialPlan) {
    return defaultCards;
  }

  const existingFree = cleaned.find((item) => item.name.toLowerCase() === freePlan.name.toLowerCase());
  const existingCommercial = cleaned.find((item) => item.name.toLowerCase() === commercialPlan.name.toLowerCase());

  return [
    existingFree ? { ...freePlan, ...existingFree, name: freePlan.name } : freePlan,
    existingCommercial ? { ...commercialPlan, ...existingCommercial, name: commercialPlan.name } : commercialPlan
  ];
}

function normalizeProfileCopy(value: string) {
  const trimmedValue = value.trim();
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
      eyebrow: settings.sections.howEyebrow,
      headline: settings.sections.howHeadline,
      body: settings.sections.howBody,
      cards: settings.sections.howCards.map((card, index) => ({
        ...card,
        icon: siteCopy.workflow.cards[index]?.icon || siteCopy.workflow.cards[0].icon
      })),
      cta: siteCopy.workflow.cta
    },
    customization: {
      eyebrow: settings.sections.detailsEyebrow,
      headline: settings.sections.detailsHeadline,
      body: settings.sections.detailsBody,
      checks: settings.sections.detailsChecks.map((copy) => ({ icon: CheckCircle2, copy })),
      cta: settings.sections.detailsCta
    },
    audiences: {
      eyebrow: settings.sections.audienceEyebrow,
      headline: settings.sections.audienceHeadline,
      body: settings.sections.audienceBody,
      cards: settings.sections.audienceCards.map((card, index) => ({
        ...card,
        icon: siteCopy.audiences.cards[index]?.icon || siteCopy.audiences.cards[0].icon
      })),
      cta: settings.sections.audienceCta
    },
    pricing: {
      eyebrow: settings.sections.pricingEyebrow,
      headline: getContentValue(settings.content, "home.pricing.headline") || settings.sections.pricingHeadline,
      body: getContentValue(settings.content, "home.pricing.body") || settings.sections.pricingBody,
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
