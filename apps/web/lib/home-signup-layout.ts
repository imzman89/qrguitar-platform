import type { EditorialSection } from "./site-settings";

const visibleHomeSections = new Set(["hero", "archive", "roles"]);

/** Keep the homepage focused while preserving the owner's section order and visibility. */
export function homeSignupSections(sections: EditorialSection[]) {
  return sections.filter(section => visibleHomeSections.has(section.id)).map(section =>
    section.id === "roles" ? { ...section, name: "Free signup", blocks: [] } : section
  );
}

/** Editing this presentation must not erase saved content from retired homepage sections. */
export function mergeHomeSignupSections(saved: EditorialSection[], edited: EditorialSection[]) {
  const previousRoles = saved.find(section => section.id === "roles");
  const current = edited.filter(section => visibleHomeSections.has(section.id)).map(section =>
    section.id === "roles" && previousRoles
      ? { ...section, name: previousRoles.name, blocks: previousRoles.blocks }
      : section
  );
  for (let index = 0; index < saved.length; index++) {
    if (!visibleHomeSections.has(saved[index].id)) current.splice(Math.min(index, current.length), 0, saved[index]);
  }
  return current;
}
