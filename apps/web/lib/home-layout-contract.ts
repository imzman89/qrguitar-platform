import type { EditorialSection } from "./site-settings";

export const compactHomeSectionIds = new Set(["hero", "roles", "pricing"]);

/** Show only controls that affect the compact homepage; retain older saved sections. */
export function compactHomeEditorSections(sections: EditorialSection[]) {
  return sections.filter(section => compactHomeSectionIds.has(section.id)).map(section => section.id === "pricing" ? { ...section, blocks: [] } : section);
}

export function mergeCompactHomeEditorSections(saved: EditorialSection[], edited: EditorialSection[]) {
  const currentPricing = saved.find(section => section.id === "pricing");
  const visible = edited.filter(section => compactHomeSectionIds.has(section.id)).map(section => section.id === "pricing" && currentPricing ? { ...section, blocks: currentPricing.blocks } : section);
  return [...visible, ...saved.filter(section => !compactHomeSectionIds.has(section.id))];
}