import type { EditableSiteSettings, EditorialPageKey } from "./site-settings";

export type ChangeReviewItem = { category: string; key: string; before: string; after: string };

function reviewValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "(empty)";
  const rendered = typeof value === "string" ? value : JSON.stringify(value);
  return rendered.length > 260 ? `${rendered.slice(0, 257)}…` : rendered;
}

export function settingsChangeReview(draft: EditableSiteSettings, live: EditableSiteSettings): ChangeReviewItem[] {
  const changes: ChangeReviewItem[] = [];
  const changedContent = new Set(Object.keys(draft.content).filter((key) => draft.content[key] !== live.content[key]));
  const add = (category: string, key: string, before: unknown, after: unknown) => {
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ category, key, before: reviewValue(before), after: reviewValue(after) });
    }
  };
  const addRecord = (category: string, prefix: string, before: Record<string, unknown>, after: Record<string, unknown>, mirroredContent: Record<string, string> = {}) => {
    for (const key of Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort()) {
      if (mirroredContent[key] && changedContent.has(mirroredContent[key])) continue;
      add(category, `${prefix}.${key}`, before[key], after[key]);
    }
  };

  addRecord("Content", "content", live.content, draft.content);
  addRecord("Theme", "colors", live.colors, draft.colors);
  addRecord("Brand assets", "brandLogos", live.brandLogos, draft.brandLogos);
  addRecord("SEO", "seo", live.seo, draft.seo, { title: "seo.global.title", description: "seo.global.description", image: "seo.global.image" });
  for (const page of Object.keys(draft.composition) as EditorialPageKey[]) {
    add("Composition", `composition.${page}`, live.composition[page], draft.composition[page]);
  }
  if (!changedContent.has("global.brand.name")) add("General", "brandName", live.brandName, draft.brandName);
  if (!changedContent.has("global.brand.tagline")) add("General", "tagline", live.tagline, draft.tagline);
  add("General", "instrumentCategories", live.instrumentCategories, draft.instrumentCategories);
  addRecord("Layout settings", "hero", live.hero, draft.hero, {
    eyebrow: "home.hero.eyebrow", headline: "home.hero.headline", body: "home.hero.body",
    primaryCta: "home.hero.primaryCta", secondaryCta: "home.hero.secondaryCta"
  });
  addRecord("Layout settings", "sections", live.sections, draft.sections, {
    howHeadline: "home.lifecycle.headline", howBody: "home.lifecycle.body",
    pricingHeadline: "home.pricing.headline", pricingBody: "home.pricing.body"
  });
  addRecord("Dashboard", "dashboard", live.dashboard, draft.dashboard, {
    pageTitle: "dashboard.hero.headline", subtitle: "dashboard.hero.body",
    emptyCollectionTitle: "dashboard.empty.title", emptyCollectionBody: "dashboard.empty.body"
  });
  return changes;
}
