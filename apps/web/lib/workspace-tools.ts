export type WorkspaceType = "player" | "collector" | "shop" | "builder" | "luthier" | "other";
export const WORKSPACE_OPTIONS: ReadonlyArray<{ value: WorkspaceType; label: string }> = [
  { value: "player", label: "Player / owner" },
  { value: "collector", label: "Collector" },
  { value: "shop", label: "Store / retailer" },
  { value: "builder", label: "Builder / brand" },
  { value: "luthier", label: "Luthier / repair shop / technician" },
  { value: "other", label: "Other" }
];

type WorkspaceAction = { href: string; title: string; description: string };
type Workspace = { label: string; title: string; description: string; actions: WorkspaceAction[] };
const collectionAction = { href: "/account?section=collection", title: "Share your collection", description: "Publish your public Profiles together under one link." };
const sellerAction = { href: "/account?section=collection", title: "Connect your website", description: "Send visitors from your public collection and instrument Profiles to your own website." };
const serviceAction = { href: "/dashboard/service", title: "Service workbench", description: "Resume saved work, respond to requested changes, and check owner review status." };
const claimAction = { href: "/ownership-claim", title: "Claim an instrument", description: "Claim an instrument you acquired and check your submitted ownership claims." };
const handoffAction = { href: "/dashboard#saved-profiles", title: "Transfer an instrument", description: "Choose one of your saved Profiles, then open Transfer to prepare its buyer handoff." };
const workspaces: Record<WorkspaceType, Workspace> = {
  player: { label: "Player workspace", title: "Your instruments, in order.", description: "Keep photos, documents, service history, and ownership together for every instrument.", actions: [collectionAction, claimAction, serviceAction] },
  collector: { label: "Collector workspace", title: "Keep the story with the instrument.", description: "Organize your collection, preserve its history, and prepare a clear ownership handoff.", actions: [collectionAction, claimAction, serviceAction] },
  shop: { label: "Store workspace", title: "Make every instrument buyer-ready.", description: "Manage inventory Profiles, share your shop website, and handle ownership transfers from one place.", actions: [sellerAction, { href: "/dashboard/import", title: "Import inventory", description: "Prepare multiple instrument Profiles from a spreadsheet." }, serviceAction] },
  builder: { label: "Builder / brand workspace", title: "Give every build its own record.", description: "Document new instruments, connect buyers to your website, and keep the record ready for its next owner.", actions: [sellerAction, { href: "/dashboard/import", title: "Import your builds", description: "Start Profiles for a batch of instruments from a spreadsheet." }, handoffAction] },
  luthier: { label: "Service provider workspace", title: "Keep customer work moving.", description: "Pick up saved drafts, respond to owner feedback, and document completed work without taking ownership.", actions: [serviceAction, { href: "/installers", title: "Provider network", description: "Learn about applying to the manually reviewed provider network." }, sellerAction] },
  other: { label: "Instrument workspace", title: "Your instruments, in order.", description: "Manage your instrument Profiles, public collection, and ownership handoffs.", actions: [collectionAction, claimAction, serviceAction] }
};

// Workspace preferences change navigation, never account permissions or verification.
export function getWorkspace(value: unknown): Workspace {
  const key = value === "brand" ? "builder" : String(value || "player");
  return workspaces[Object.prototype.hasOwnProperty.call(workspaces, key) ? key as WorkspaceType : "player"];
}
