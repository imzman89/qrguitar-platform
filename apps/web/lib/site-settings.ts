import { CheckCircle2 } from "lucide-react";
import { siteCopy } from "../content/site-copy";
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
    collectionHealthHelper: "A quick read on how complete and visible your profiles are.",
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
  }
};

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
    }
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
      ...settings.hero
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
      headline: settings.sections.pricingHeadline,
      body: settings.sections.pricingBody,
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
  const favicon = toAbsolutePublicUrl(settings.seo.favicon || "/qrguitar-logo-white-orange.svg", canonicalUrl);

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
