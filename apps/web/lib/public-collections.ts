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
  allowMessages: boolean;
  allowWarrantyHelp: boolean;
  warrantyHelpUrl: string;
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
  allowIndexing: true,
  allowMessages: false,
  allowWarrantyHelp: false,
  warrantyHelpUrl: ""
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

/** Public account links use explicit HTTPS URLs; invalid entries are never published. */
export function cleanCollectionWebsite(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text.length > 500 || !/^https:\/\//i.test(text) || /[\s\\]/.test(text)) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.href.length > 500) return "";
    return url.href;
  } catch {
    return "";
  }
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
    websiteUrl: cleanCollectionWebsite(value?.websiteUrl),
    avatarUrl: /^https:\/\//i.test(String(value?.avatarUrl || "")) ? String(value?.avatarUrl || "").trim().slice(0, 1000) : "",
    allowIndexing: value?.allowIndexing !== false,
    allowMessages: value?.allowMessages === true,
    allowWarrantyHelp: value?.allowWarrantyHelp === true,
    warrantyHelpUrl: cleanCollectionWebsite(value?.warrantyHelpUrl),
    ownerId: value?.ownerId ? String(value.ownerId) : undefined
  };
}
