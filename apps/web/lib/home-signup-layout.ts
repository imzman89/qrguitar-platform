import type { EditorialSection } from "./site-settings";

/** The signup panel replaces the old role picker and service disclosure. */
export function homeSignupSections(sections: EditorialSection[]) {
  return sections.filter(section => section.id !== "continuity").map(section =>
    section.id === "roles" ? { ...section, name: "Free signup", blocks: [] } : section
  );
}

/** Keep saved legacy content when the owner reorders or hides current sections. */
export function mergeHomeSignupSections(saved: EditorialSection[], edited: EditorialSection[]) {
  const previousRoles = saved.find(section => section.id === "roles");
  const current = edited.filter(section => section.id !== "continuity").map(section =>
    section.id === "roles" && previousRoles
      ? { ...section, name: previousRoles.name, blocks: previousRoles.blocks }
      : section
  );
  for (let index = 0; index < saved.length; index++) {
    if (saved[index].id === "continuity") current.splice(Math.min(index, current.length), 0, saved[index]);
  }
  return current;
}
