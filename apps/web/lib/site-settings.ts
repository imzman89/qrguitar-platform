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
};

export const defaultSiteSettings: EditableSiteSettings = {
  brandName: "QRguitar",
  tagline: "Permanent records for guitars, amps, pedals, builders, shops, collectors, and future owners.",
  instrumentCategories: [...defaultInstrumentCategories],
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
    description: "Permanent QR records for guitars, amps, pedals, builders, shops, and collectors.",
    keywords: "guitar inventory, guitar authentication, guitar service records, instrument ownership, QRguitar, luthier records",
    image: "/seo/qrguitar-og-v2.png",
    favicon: "/qrguitar-logo-white-orange.svg",
    canonicalUrl: "https://www.qrguitar.com",
    twitterHandle: "@qrguitar",
    robots: "index, follow"
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

export function mergeSiteSettings(settings?: Partial<EditableSiteSettings> | null): EditableSiteSettings {
  return {
    ...defaultSiteSettings,
    ...(settings || {}),
    instrumentCategories: normalizeInstrumentCategories(settings?.instrumentCategories),
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
      ...(settings?.sections || {}),
      howCards: (settings?.sections?.howCards && settings.sections.howCards.length ? settings.sections.howCards : defaultSiteSettings.sections.howCards).map((item) => ({
        title: item?.title?.trim() || "",
        copy: item?.copy?.trim() || ""
      })),
      detailsChecks: settings?.sections?.detailsChecks && settings.sections.detailsChecks.length
        ? settings.sections.detailsChecks.map((item) => item?.trim() || "")
        : defaultSiteSettings.sections.detailsChecks,
      audienceCards: settings?.sections?.audienceCards && settings.sections.audienceCards.length
        ? settings.sections.audienceCards.map((item) => ({ title: item?.title?.trim() || "", copy: item?.copy?.trim() || "" }))
        : defaultSiteSettings.sections.audienceCards,
      pricingCards: settings?.sections?.pricingCards && settings.sections.pricingCards.length
        ? normalizePricingCards(settings.sections.pricingCards)
        : defaultSiteSettings.sections.pricingCards
    },
    seo: {
      ...defaultSiteSettings.seo,
      ...(settings?.seo || {})
    }
  };
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
