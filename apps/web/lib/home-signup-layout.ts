import type { EditorialSection } from "./site-settings";

const visibleHomeSections = new Set(["hero", "archive", "roles"]);
const previousDefaultOrder = [
  ["hero", "Hero and latest Profile"], ["lifecycle", "Profile lifecycle"],
  ["anatomy", "Profile anatomy"], ["roles", "Role and use cases"],
  ["continuity", "Service, ownership, and provenance"], ["pricing", "Profile access"],
  ["archive", "Public Profile archive"], ["finalCta", "Closing action"]
];

/** Only the exact previous default layout adopts the new gallery-before-signup order. */
export function homeSignupSections(sections: EditorialSection[]) {
  const current = sections.filter(section => visibleHomeSections.has(section.id)).map(section =>
    section.id === "roles" ? { ...section, name: "Free signup", blocks: [] } : section
  );
  const previousDefault = sections.length === previousDefaultOrder.length
    && sections.every((section, index) => section.id === previousDefaultOrder[index][0]
      && section.name === previousDefaultOrder[index][1]);
  return previousDefault ? ["hero", "archive", "roles"].flatMap(id => current.filter(section => section.id === id)) : current;
}

/** Keep legacy content after the edited sections, so future explicit ordering is never migrated again. */
export function mergeHomeSignupSections(saved: EditorialSection[], edited: EditorialSection[]) {
  const previousRoles = saved.find(section => section.id === "roles");
  const current = edited.filter(section => visibleHomeSections.has(section.id)).map(section =>
    section.id === "roles" && previousRoles
      ? { ...section, name: previousRoles.name, blocks: previousRoles.blocks }
      : section
  );
  return [...current, ...saved.filter(section => !visibleHomeSections.has(section.id))];
}
