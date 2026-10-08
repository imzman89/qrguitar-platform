import { defaultContentValues } from "./content-registry";
import type { EditableSiteSettings } from "./site-settings";

// Legacy mirrors must remain explicit even when their typed value is the default.
// Otherwise mergeSiteSettings could promote an older mirror over that value.
const legacyContentKeys = new Set([
  "global.brand.name",
  "global.brand.tagline",
  "home.hero.eyebrow",
  "home.hero.headline",
  "home.hero.body",
  "home.hero.primaryCta",
  "home.hero.secondaryCta",
  "home.lifecycle.headline",
  "home.lifecycle.body",
  "home.pricing.headline",
  "home.pricing.body",
  "dashboard.hero.headline",
  "dashboard.hero.body",
  "dashboard.empty.title",
  "dashboard.empty.body",
  "seo.global.title",
  "seo.global.description",
  "seo.global.image"
]);

export function compactSiteSettingsForClient(settings: EditableSiteSettings): EditableSiteSettings {
  return {
    ...settings,
    content: Object.fromEntries(Object.entries(settings.content).filter(([key, value]) =>
      legacyContentKeys.has(key) || value !== defaultContentValues[key]
    ))
  };
}
