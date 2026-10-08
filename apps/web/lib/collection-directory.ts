import { getProfilePhotoUrls } from "./instrument-profile-contract";
import type { DemoInstrument } from "./local-demo";

export const collectionRoles = {
  player: "Players / owners",
  collector: "Collectors",
  shop: "Stores / retailers",
  builder: "Builders / brands",
  luthier: "Luthiers / repair shops",
  other: "Other members"
} as const;

export function collectionRoleLabel(accountType: string) {
  const labels: Record<string, string> = { player: "Player / owner", collector: "Collector", shop: "Store / retailer", builder: "Builder / brand", luthier: "Luthier / repair shop", other: "Member" };
  return Object.hasOwn(labels, accountType) ? labels[accountType] : "Member";
}

export type DirectoryCollection = { handle: string; name: string; accountType: string; count: number; image: string };

/** Derive the directory only from the already authorized public instrument feed. */
export function buildCollectionDirectory(records: DemoInstrument[]): DirectoryCollection[] {
  const grouped = new Map<string, DirectoryCollection>();
  const seen = new Set<string>();
  for (const record of records) {
    const collection = record.publicCollection;
    if (record.visibility !== "public" || !collection?.handle || !collection.publicName || seen.has(record.qrCode)) continue;
    seen.add(record.qrCode);
    const existing = grouped.get(collection.handle);
    const image = getProfilePhotoUrls(record)[0] || "";
    grouped.set(collection.handle, existing
      ? { ...existing, count: existing.count + 1, image: existing.image || image }
      : { handle: collection.handle, name: collection.publicName, accountType: collection.accountType, count: 1, image });
  }
  return [...grouped.values()].sort((first, second) => second.count - first.count || first.name.localeCompare(second.name));
}

export function filterCollectionDirectory(collections: DirectoryCollection[], query: string, role: string) {
  const search = query.trim().toLocaleLowerCase();
  return collections.filter((collection) => (role === "all" || collection.accountType === role)
    && (!search || [collection.name, collection.handle, collectionRoleLabel(collection.accountType)].some((value) => value.toLocaleLowerCase().includes(search))));
}
