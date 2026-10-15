import { createUiText } from "./ui-text";
import { approvedCopyPairs } from "./site-copy-reconciliation-pairs";
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
const privateServiceSlipAction = { href: "/dashboard/service/slips", title: "Service slips", description: "Save and print private job records for any instrument. No QR registration needed." };
const serviceAction = { href: "/dashboard/service", title: "Service workbench", description: "Resume saved work, respond to requested changes, and check owner review status." };
const claimAction = { href: "/ownership-claim", title: "Claim an instrument", description: "Claim an instrument you acquired and check your submitted ownership claims." };
const handoffAction = { href: "/dashboard#saved-profiles", title: "Transfer an instrument", description: "Choose one of your saved Profiles, then open Transfer to prepare its buyer handoff." };
const workspaces: Record<WorkspaceType, Workspace> = {
  player: { label: "Player workspace", title: "Your instruments, in order.", description: "Photos, documents, service history, and ownership records.", actions: [collectionAction, claimAction, handoffAction] },
  collector: { label: "Collector workspace", title: "Keep the story with the instrument.", description: "Collection Profiles, history, and ownership transfers.", actions: [collectionAction, claimAction, handoffAction] },
  shop: { label: "Store workspace", title: "Make every instrument buyer-ready.", description: "Inventory Profiles, website links, and ownership transfers.", actions: [sellerAction, { href: "/dashboard/import", title: "Import inventory", description: "Prepare multiple instrument Profiles from a spreadsheet." }, privateServiceSlipAction] },
  builder: { label: "Builder / brand workspace", title: "Give every build its own record.", description: "Build Profiles, website links, and ownership transfers.", actions: [sellerAction, { href: "/dashboard/import", title: "Import your builds", description: "Start Profiles for a batch of instruments from a spreadsheet." }, handoffAction] },
  luthier: { label: "Service provider workspace", title: "Keep customer work moving.", description: "Drafts, owner feedback, and service records without changing instrument ownership.", actions: [privateServiceSlipAction, { href: "/installers", title: "Provider network", description: "Learn about applying to the manually reviewed provider network." }, sellerAction] },
  other: { label: "Instrument workspace", title: "Your instruments, in order.", description: "Instrument Profiles, collections, and ownership transfers.", actions: [collectionAction, claimAction, handoffAction] }
};

// Workspace preferences change navigation, never account permissions or verification.
export function getWorkspace(value: unknown, content: Record<string, string> = {}): Workspace {
  const key = value === "brand" ? "builder" : String(value || "player");
  const original = workspaces[Object.prototype.hasOwnProperty.call(workspaces, key) ? key as WorkspaceType : "player"];
  if (!Object.keys(content).some((key) => key.startsWith("ui.workspace."))) return original;
  const ui = createUiText(content, "workspace");
  const text = (source: string) => ui(workspaceCopyKeys[source] || "", source);
  return { ...original, label: text(original.label), title: text(original.title), description: text(original.description), actions: original.actions.map(action => ({ ...action, title: text(action.title), description: text(action.description) })) };
}

const registrationDescriptions: Record<WorkspaceType, string> = {
  player: "Your instruments and their history.",
  collector: "Your collection, organized.",
  shop: "Inventory and buyer handoffs.",
  builder: "Build records and handoffs.",
  luthier: "Service records and owner feedback.",
  other: "Instrument Profiles and collections."
};

// Signup-only presentation; retain the shared description when it was customized.
export function getRegistrationWorkspaceDescription(value: WorkspaceType, content: Record<string, string> = {}) {
  const description = getWorkspace(value, content).description;
  const defaultDescription = workspaces[value].description;
  const descriptionKey = workspaceCopyKeys[defaultDescription];
  const isApprovedLegacyDefault = approvedCopyPairs.some(pair =>
    pair.selector.kind === "content" && pair.selector.key === descriptionKey &&
    pair.beforeDefault === description && pair.afterDefault === defaultDescription);
  return description === defaultDescription || isApprovedLegacyDefault ? registrationDescriptions[value] : description;
}

const workspaceCopyKeys: Record<string, string> = {
  "Player / owner": "ui.workspace.faae0c421967",
  "Collector": "ui.workspace.9d0081a4f3d6",
  "Store / retailer": "ui.workspace.679ab74fd398",
  "Builder / brand": "ui.workspace.106bdb72abe8",
  "Luthier / repair shop / technician": "ui.workspace.ea10259a47b1",
  "Other": "ui.workspace.f97e9da0e3b8",
  "Share your collection": "ui.workspace.a5777b0f3289",
  "Publish your public Profiles together under one link.": "ui.workspace.26aad0019e12",
  "Connect your website": "ui.workspace.0d37e112bf12",
  "Send visitors from your public collection and instrument Profiles to your own website.": "ui.workspace.9f43ad820b48",
  "Service workbench": "ui.workspace.3f9b5c09e0a6",
  "Resume saved work, respond to requested changes, and check owner review status.": "ui.workspace.596f15ac8441",
  "Claim an instrument": "ui.workspace.d66a01126f70",
  "Claim an instrument you acquired and check your submitted ownership claims.": "ui.workspace.6faf1a23e1e6",
  "Transfer an instrument": "ui.workspace.cb786dc79eda",
  "Choose one of your saved Profiles, then open Transfer to prepare its buyer handoff.": "ui.workspace.29dcf61286d4",
  "Player workspace": "ui.workspace.ac29024c4ca2",
  "Your instruments, in order.": "ui.workspace.28d82d75f61b",
  "Photos, documents, service history, and ownership records.": "ui.workspace.11c503369f69",
  "Collector workspace": "ui.workspace.a9d6689acf2c",
  "Keep the story with the instrument.": "ui.workspace.5c78caa4b190",
  "Collection Profiles, history, and ownership transfers.": "ui.workspace.b5efa61cb710",
  "Store workspace": "ui.workspace.3d13b890ca59",
  "Make every instrument buyer-ready.": "ui.workspace.8aa1276d62e7",
  "Inventory Profiles, website links, and ownership transfers.": "ui.workspace.15aa16da501a",
  "Import inventory": "ui.workspace.a1e4fd437a50",
  "Prepare multiple instrument Profiles from a spreadsheet.": "ui.workspace.b59faa1dfe22",
  "Builder / brand workspace": "ui.workspace.ee0dff790ddf",
  "Give every build its own record.": "ui.workspace.ecdd24d6daca",
  "Build Profiles, website links, and ownership transfers.": "ui.workspace.c110fe1e6af2",
  "Import your builds": "ui.workspace.da4ee2a6e6ca",
  "Start Profiles for a batch of instruments from a spreadsheet.": "ui.workspace.e3fa8a500176",
  "Service provider workspace": "ui.workspace.2f5a5daaecd3",
  "Keep customer work moving.": "ui.workspace.9bd7ecf60866",
  "Drafts, owner feedback, and service records without changing instrument ownership.": "ui.workspace.93363fe59878",
  "Provider network": "ui.workspace.e84ab388534a",
  "Learn about applying to the manually reviewed provider network.": "ui.workspace.ddf0016f044b",
  "Instrument workspace": "ui.workspace.5b8d6999d0e7",
  "Instrument Profiles, collections, and ownership transfers.": "ui.workspace.23160d470c3a"
};

export function workspaceOptionLabel(label: string, content: Record<string, string> = {}) { return createUiText(content, "workspace")(workspaceCopyKeys[label] || "", label); }
