export type CatalogFilters = {
  query: string; brand: string; availability: string; condition: string; trust: string;
  authenticity: string; originality: string; safety: string; service: string;
  sortMode: "Newest" | "Oldest" | "Title" | "Year";
};
export const defaultCatalogFilters: CatalogFilters = {
  query: "", brand: "All brands", availability: "All availability", condition: "All conditions",
  trust: "All trust statuses", authenticity: "All authenticity statuses", originality: "All originality statuses",
  safety: "All safety statuses", service: "All service histories", sortMode: "Newest"
};
const choices: Partial<Record<keyof CatalogFilters, readonly string[]>> = {
  availability: ["All availability", "For Sale", "Not for Sale"], condition: ["All conditions", "New", "Used"],
  trust: ["All trust statuses", "Verified", "Unverified"], authenticity: ["All authenticity statuses", "Authenticity Confirmed", "Authenticity Unconfirmed"],
  originality: ["All originality statuses", "All Original", "Modified"], safety: ["All safety statuses", "Safety Alert"],
  service: ["All service histories", "Has Service History"], sortMode: ["Newest", "Oldest", "Title", "Year"]
};
const queryKey = (key: keyof CatalogFilters) => key === "query" ? "q" : key === "sortMode" ? "sort" : key;
export function readCatalogFilters(search: string): CatalogFilters {
  const params = new URLSearchParams(search);
  const values = { ...defaultCatalogFilters };
  for (const key of Object.keys(values) as Array<keyof CatalogFilters>) {
    const value = params.get(queryKey(key));
    if (value !== null && (!choices[key] || choices[key]?.includes(value))) {
      Object.assign(values, { [key]: value || defaultCatalogFilters[key] });
    }
  }
  return values;
}
export function catalogFilterUrl(pathname: string, search: string, filters: CatalogFilters) {
  const params = new URLSearchParams(search);
  for (const key of Object.keys(defaultCatalogFilters) as Array<keyof CatalogFilters>) {
    params.delete(queryKey(key));
    if (filters[key] !== defaultCatalogFilters[key]) params.set(queryKey(key), filters[key]);
  }
  const query = params.toString();
  return pathname + (query ? "?" + query : "");
}
