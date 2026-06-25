import { siteCopy } from "../content/site-copy";

export const siteSettingsKey = "qrguitar.siteSettings";

export type EditableSiteSettings = {
  brandName: string;
  tagline: string;
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
    howHeadline: string;
    howBody: string;
    detailsHeadline: string;
    detailsBody: string;
    audienceHeadline: string;
    audienceBody: string;
    pricingHeadline: string;
    pricingBody: string;
  };
};

export const defaultSiteSettings: EditableSiteSettings = {
  brandName: "QRguitar",
  tagline: "Permanent records for guitars, amps, pedals, builders, shops, collectors, and future owners.",
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
    howHeadline: siteCopy.workflow.headline,
    howBody: siteCopy.workflow.body,
    detailsHeadline: siteCopy.customization.headline,
    detailsBody: siteCopy.customization.body,
    audienceHeadline: siteCopy.audiences.headline,
    audienceBody: siteCopy.audiences.body,
    pricingHeadline: siteCopy.pricing.headline,
    pricingBody: siteCopy.pricing.body
  }
};

export function mergeSiteSettings(settings?: Partial<EditableSiteSettings> | null): EditableSiteSettings {
  return {
    ...defaultSiteSettings,
    ...(settings || {}),
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
      ...(settings?.sections || {})
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
