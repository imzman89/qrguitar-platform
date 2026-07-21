export type PublicCollectionSettings = {
  enabled: boolean;
  handle: string;
  publicName: string;
  accountType: "player" | "collector" | "shop" | "builder" | "luthier" | "other";
  bio: string;
  location: string;
  websiteUrl: string;
  avatarUrl: string;
  allowIndexing: boolean;
  ownerId?: string;
};

export const defaultPublicCollectionSettings: PublicCollectionSettings = {
  enabled: false,
  handle: "",
  publicName: "",
  accountType: "player",
  bio: "",
  location: "",
  websiteUrl: "",
  avatarUrl: "",
  allowIndexing: true
};

export function publicCollectionOwnerKey(ownerId: string) {
  return `public_collection_owner:${ownerId}`;
}

export function publicCollectionHandleKey(handle: string) {
  return `public_collection_handle:${cleanCollectionHandle(handle)}`;
}

export function cleanCollectionHandle(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function cleanPublicCollection(value: Partial<PublicCollectionSettings> | null | undefined): PublicCollectionSettings {
  const enteredAccountType = String(value?.accountType || "");
  const accountType = enteredAccountType === "brand"
    ? "builder"
    : ["player", "collector", "shop", "builder", "luthier", "other"].includes(enteredAccountType)
      ? enteredAccountType as PublicCollectionSettings["accountType"]
      : "player";
  return {
    enabled: value?.enabled === true,
    handle: cleanCollectionHandle(value?.handle),
    publicName: String(value?.publicName || "").trim().replace(/\s+/g, " ").slice(0, 80),
    accountType,
    bio: String(value?.bio || "").trim().slice(0, 600),
    location: String(value?.location || "").trim().slice(0, 160),
    websiteUrl: /^https:\/\//i.test(String(value?.websiteUrl || "")) ? String(value?.websiteUrl || "").trim().slice(0, 500) : "",
    avatarUrl: /^https:\/\//i.test(String(value?.avatarUrl || "")) ? String(value?.avatarUrl || "").trim().slice(0, 1000) : "",
    allowIndexing: value?.allowIndexing !== false,
    ownerId: value?.ownerId ? String(value.ownerId) : undefined
  };
}
