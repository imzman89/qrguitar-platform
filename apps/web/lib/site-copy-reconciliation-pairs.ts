export type CopySelector = { kind: "content"; key: string } | { kind: "composition"; page: "home"; sectionId: string; blockId: string; field: "body" | "ctaLabel" | "items"; index?: number };
export type ApprovedCopyPair = { id: string; selector: CopySelector; beforeDefault: string; afterDefault: string };
export const approvedCopyAllowlistSha256 = "8c498a9c0da1545e9642b7d61fae199b7739a5c7f06984f14b68701a5683a311";
export const approvedCopyPairs: readonly ApprovedCopyPair[] = [
  {
    "id": "content:home.hero.body",
    "selector": {
      "kind": "content",
      "key": "home.hero.body"
    },
    "beforeDefault": "Keep the photos, specs, service, documents, ownership, and permanent QR with the instrument.",
    "afterDefault": "Photos, specs, and history in one permanent Profile."
  },
  {
    "id": "content:home.hero.secondaryCta",
    "selector": {
      "kind": "content",
      "key": "home.hero.secondaryCta"
    },
    "beforeDefault": "Explore the Catalog",
    "afterDefault": "Catalog"
  },
  {
    "id": "content:home.hero.viewProfile",
    "selector": {
      "kind": "content",
      "key": "home.hero.viewProfile"
    },
    "beforeDefault": "View a real Profile",
    "afterDefault": "View Profile"
  },
  {
    "id": "content:home.archive.heading",
    "selector": {
      "kind": "content",
      "key": "home.archive.heading"
    },
    "beforeDefault": "See what's already documented.",
    "afterDefault": "Profiles"
  },
  {
    "id": "content:home.archive.viewAll",
    "selector": {
      "kind": "content",
      "key": "home.archive.viewAll"
    },
    "beforeDefault": "View all Profiles",
    "afterDefault": "Catalog"
  },
  {
    "id": "content:home.lifecycle.headline",
    "selector": {
      "kind": "content",
      "key": "home.lifecycle.headline"
    },
    "beforeDefault": "Create it once. Keep it current.",
    "afterDefault": "How it works"
  },
  {
    "id": "content:home.anatomy.headline",
    "selector": {
      "kind": "content",
      "key": "home.anatomy.headline"
    },
    "beforeDefault": "See the details that matter.",
    "afterDefault": "Inside a Profile"
  },
  {
    "id": "content:home.anatomy.body",
    "selector": {
      "kind": "content",
      "key": "home.anatomy.body"
    },
    "beforeDefault": "Photos, specifications, service, documents, and ownership stay attached to the same Profile.",
    "afterDefault": "Photos, specs, service records, and documents."
  },
  {
    "id": "content:home.anatomy.cta",
    "selector": {
      "kind": "content",
      "key": "home.anatomy.cta"
    },
    "beforeDefault": "Explore a Profile",
    "afterDefault": "View Profile"
  },
  {
    "id": "content:home.roles.headline",
    "selector": {
      "kind": "content",
      "key": "home.roles.headline"
    },
    "beforeDefault": "One system. Different jobs.",
    "afterDefault": "QRguitar tools"
  },
  {
    "id": "content:home.continuity.headline",
    "selector": {
      "kind": "content",
      "key": "home.continuity.headline"
    },
    "beforeDefault": "The history stays with the instrument.",
    "afterDefault": "Service and ownership"
  },
  {
    "id": "content:home.continuity.body",
    "selector": {
      "kind": "content",
      "key": "home.continuity.body"
    },
    "beforeDefault": "Approved service and completed ownership transfers update the same Profile. The QRguitar ID and link do not change.",
    "afterDefault": "Approved service and completed transfers keep the same Profile and QR link."
  },
  {
    "id": "content:home.continuity.cta",
    "selector": {
      "kind": "content",
      "key": "home.continuity.cta"
    },
    "beforeDefault": "See How It Works",
    "afterDefault": "How it works"
  },
  {
    "id": "content:home.finalCta.headline",
    "selector": {
      "kind": "content",
      "key": "home.finalCta.headline"
    },
    "beforeDefault": "Start with one instrument.",
    "afterDefault": "Create a Profile"
  },
  {
    "id": "content:home.finalCta.secondaryCta",
    "selector": {
      "kind": "content",
      "key": "home.finalCta.secondaryCta"
    },
    "beforeDefault": "Explore the Catalog",
    "afterDefault": "Catalog"
  },
  {
    "id": "content:catalog.hero.headline",
    "selector": {
      "kind": "content",
      "key": "catalog.hero.headline"
    },
    "beforeDefault": "Browse QRguitar Profiles",
    "afterDefault": "Catalog"
  },
  {
    "id": "content:ui.app.collections.page.9fa7b03bfc1e",
    "selector": {
      "kind": "content",
      "key": "ui.app.collections.page.9fa7b03bfc1e"
    },
    "beforeDefault": "Meet the people behind the instruments.",
    "afterDefault": "Collections"
  },
  {
    "id": "content:ui.app.collections.CollectionsDirectoryClient.8bf60f64c1e2",
    "selector": {
      "kind": "content",
      "key": "ui.app.collections.CollectionsDirectoryClient.8bf60f64c1e2"
    },
    "beforeDefault": "The first public collection starts with you.",
    "afterDefault": "No collections yet."
  },
  {
    "id": "content:ui.app.collections.CollectionsDirectoryClient.82a7887fd1d5",
    "selector": {
      "kind": "content",
      "key": "ui.app.collections.CollectionsDirectoryClient.82a7887fd1d5"
    },
    "beforeDefault": "Set up your collection",
    "afterDefault": "Collection settings"
  },
  {
    "id": "content:ui.app.collections.CollectionsDirectoryClient.f507fb6c23a7",
    "selector": {
      "kind": "content",
      "key": "ui.app.collections.CollectionsDirectoryClient.f507fb6c23a7"
    },
    "beforeDefault": "Browse instrument Profiles",
    "afterDefault": "Catalog"
  },
  {
    "id": "content:ui.app.collections.page.f507fb6c23a7",
    "selector": {
      "kind": "content",
      "key": "ui.app.collections.page.f507fb6c23a7"
    },
    "beforeDefault": "Browse instrument Profiles",
    "afterDefault": "Catalog"
  },
  {
    "id": "content:ui.app.collections.page.5ca6750bbc16",
    "selector": {
      "kind": "content",
      "key": "ui.app.collections.page.5ca6750bbc16"
    },
    "beforeDefault": "Your collection settings",
    "afterDefault": "Collection settings"
  },
  {
    "id": "content:ui.app.collections.CollectionsDirectoryClient.76e4997eae2f",
    "selector": {
      "kind": "content",
      "key": "ui.app.collections.CollectionsDirectoryClient.76e4997eae2f"
    },
    "beforeDefault": "Find a member or business",
    "afterDefault": "Search"
  },
  {
    "id": "content:ui.app.collections.CollectionsDirectoryClient.a274dd64efe8",
    "selector": {
      "kind": "content",
      "key": "ui.app.collections.CollectionsDirectoryClient.a274dd64efe8"
    },
    "beforeDefault": "Public name, collection handle, or role",
    "afterDefault": "Name or handle"
  },
  {
    "id": "content:ui.app.collections.CollectionsDirectoryClient.0baf1df98cbe",
    "selector": {
      "kind": "content",
      "key": "ui.app.collections.CollectionsDirectoryClient.0baf1df98cbe"
    },
    "beforeDefault": "No collections match these filters.",
    "afterDefault": "No collections found."
  },
  {
    "id": "content:ui.app.collections.CollectionsDirectoryClient.a73e9c9ae150",
    "selector": {
      "kind": "content",
      "key": "ui.app.collections.CollectionsDirectoryClient.a73e9c9ae150"
    },
    "beforeDefault": "Show all collections",
    "afterDefault": "Clear filters"
  },
  {
    "id": "content:ui.components.HomePageClient.ecbcf256c14d",
    "selector": {
      "kind": "content",
      "key": "ui.components.HomePageClient.ecbcf256c14d"
    },
    "beforeDefault": "One permanent identity",
    "afterDefault": "Permanent Profile"
  },
  {
    "id": "content:ui.components.HomePageClient.bc615fcc90ab",
    "selector": {
      "kind": "content",
      "key": "ui.components.HomePageClient.bc615fcc90ab"
    },
    "beforeDefault": "The same Profile. Every chapter.",
    "afterDefault": "One permanent link."
  },
  {
    "id": "content:ui.components.HomePageClient.eb341bf13357",
    "selector": {
      "kind": "content",
      "key": "ui.components.HomePageClient.eb341bf13357"
    },
    "beforeDefault": "Your privacy, your choice",
    "afterDefault": "Documents"
  },
  {
    "id": "content:ui.components.HomePageClient.a4c1dff0c2e1",
    "selector": {
      "kind": "content",
      "key": "ui.components.HomePageClient.a4c1dff0c2e1"
    },
    "beforeDefault": "Public, unlisted, or just for you.",
    "afterDefault": "Choose which documents to share."
  },
  {
    "id": "content:ui.components.HomePageClient.f5ab906e49d7",
    "selector": {
      "kind": "content",
      "key": "ui.components.HomePageClient.f5ab906e49d7"
    },
    "beforeDefault": "A history that carries forward",
    "afterDefault": "Service history"
  },
  {
    "id": "content:ui.components.HomePageClient.104c2472352a",
    "selector": {
      "kind": "content",
      "key": "ui.components.HomePageClient.104c2472352a"
    },
    "beforeDefault": "Service and ownership, connected.",
    "afterDefault": "Keep service records with the Profile."
  },
  {
    "id": "content:ui.components.HomePageClient.3b67d76945bd",
    "selector": {
      "kind": "content",
      "key": "ui.components.HomePageClient.3b67d76945bd"
    },
    "beforeDefault": "See what's already documented.",
    "afterDefault": "Profiles"
  },
  {
    "id": "content:ui.components.HomePageClient.025320721b82",
    "selector": {
      "kind": "content",
      "key": "ui.components.HomePageClient.025320721b82"
    },
    "beforeDefault": "View all Profiles",
    "afterDefault": "Catalog"
  },
  {
    "id": "content:ui.components.HomePageClient.b655c5fb6426",
    "selector": {
      "kind": "content",
      "key": "ui.components.HomePageClient.b655c5fb6426"
    },
    "beforeDefault": "The history stays with the instrument.",
    "afterDefault": "Service and ownership"
  },
  {
    "id": "content:ui.components.HomePageClient.9a4346833f50",
    "selector": {
      "kind": "content",
      "key": "ui.components.HomePageClient.9a4346833f50"
    },
    "beforeDefault": "Approved service and completed ownership transfers update the same Profile. The QRguitar ID and link do not change.",
    "afterDefault": "Approved service and completed transfers keep the same Profile and QR link."
  },
  {
    "id": "content:ui.components.HomePageClient.7bf7f24c48ad",
    "selector": {
      "kind": "content",
      "key": "ui.components.HomePageClient.7bf7f24c48ad"
    },
    "beforeDefault": "See How It Works",
    "afterDefault": "How it works"
  },
  {
    "id": "content:ui.components.HomePageClient.b575d2660321",
    "selector": {
      "kind": "content",
      "key": "ui.components.HomePageClient.b575d2660321"
    },
    "beforeDefault": "Start with one instrument.",
    "afterDefault": "Create a Profile"
  },
  {
    "id": "content:ui.components.HomePageClient.004ca2d8b070",
    "selector": {
      "kind": "content",
      "key": "ui.components.HomePageClient.004ca2d8b070"
    },
    "beforeDefault": "Explore the Catalog",
    "afterDefault": "Catalog"
  },
  {
    "id": "content:ui.app.catalog.CatalogClient.1fbba5113528",
    "selector": {
      "kind": "content",
      "key": "ui.app.catalog.CatalogClient.1fbba5113528"
    },
    "beforeDefault": "Browse member collections",
    "afterDefault": "Collections"
  },
  {
    "id": "content:ui.app.collections.handle.CollectionsClient.ac53f9376264",
    "selector": {
      "kind": "content",
      "key": "ui.app.collections.handle.CollectionsClient.ac53f9376264"
    },
    "beforeDefault": "No public instrument Profiles yet.",
    "afterDefault": "No Profiles yet."
  },
  {
    "id": "content:ui.app.collections.handle.CollectionsClient.2cbb876d08c4",
    "selector": {
      "kind": "content",
      "key": "ui.app.collections.handle.CollectionsClient.2cbb876d08c4"
    },
    "beforeDefault": "Explore other collections",
    "afterDefault": "All collections"
  },
  {
    "id": "content:ui.app.collections.handle.CollectionsClient.a3da4386e1c1",
    "selector": {
      "kind": "content",
      "key": "ui.app.collections.handle.CollectionsClient.a3da4386e1c1"
    },
    "beforeDefault": "Show all public Profiles",
    "afterDefault": "Clear filters"
  },
  {
    "id": "content:dashboard.hero.headline",
    "selector": {
      "kind": "content",
      "key": "dashboard.hero.headline"
    },
    "beforeDefault": "Your instruments",
    "afterDefault": "My collection"
  },
  {
    "id": "content:dashboard.hero.body",
    "selector": {
      "kind": "content",
      "key": "dashboard.hero.body"
    },
    "beforeDefault": "Manage Profiles, privacy, service, transfers, and QR tools.",
    "afterDefault": "Manage your instrument Profiles."
  },
  {
    "id": "content:dashboard.empty.title",
    "selector": {
      "kind": "content",
      "key": "dashboard.empty.title"
    },
    "beforeDefault": "Your first instrument starts here.",
    "afterDefault": "No instruments yet."
  },
  {
    "id": "content:dashboard.empty.body",
    "selector": {
      "kind": "content",
      "key": "dashboard.empty.body"
    },
    "beforeDefault": "Add one instrument and one real photo to create its permanent QRguitar Profile.",
    "afterDefault": "Add an instrument and a real photo to create its permanent Profile."
  },
  {
    "id": "content:create.hero.body",
    "selector": {
      "kind": "content",
      "key": "create.hero.body"
    },
    "beforeDefault": "Start with the instrument. Add the history as you go.",
    "afterDefault": "Add instrument details and a real photo."
  },
  {
    "id": "content:create.details.body",
    "selector": {
      "kind": "content",
      "key": "create.details.body"
    },
    "beforeDefault": "Add anything useful now. You can keep editing the Profile later.",
    "afterDefault": "Add details or history now or later."
  },
  {
    "id": "content:account.hero.body",
    "selector": {
      "kind": "content",
      "key": "account.hero.body"
    },
    "beforeDefault": "Manage your public identity, security, notifications, business tools, and privacy.",
    "afterDefault": "Manage your account settings."
  },
  {
    "id": "content:contact.hero.body",
    "selector": {
      "kind": "content",
      "key": "contact.hero.body"
    },
    "beforeDefault": "For account access, Profile edits, service history, transfers, lost/stolen alerts, privacy, or business onboarding, email support@qrguitar.com.",
    "afterDefault": "Get help with QRguitar."
  },
  {
    "id": "content:ui.workspace.11c503369f69",
    "selector": {
      "kind": "content",
      "key": "ui.workspace.11c503369f69"
    },
    "beforeDefault": "Keep photos, documents, service history, and ownership together for every instrument.",
    "afterDefault": "Photos, documents, service history, and ownership records."
  },
  {
    "id": "content:ui.workspace.b5efa61cb710",
    "selector": {
      "kind": "content",
      "key": "ui.workspace.b5efa61cb710"
    },
    "beforeDefault": "Organize your collection, preserve its history, and prepare a clear ownership handoff.",
    "afterDefault": "Collection Profiles, history, and ownership transfers."
  },
  {
    "id": "content:ui.workspace.15aa16da501a",
    "selector": {
      "kind": "content",
      "key": "ui.workspace.15aa16da501a"
    },
    "beforeDefault": "Manage inventory Profiles, share your shop website, and handle ownership transfers from one place.",
    "afterDefault": "Inventory Profiles, website links, and ownership transfers."
  },
  {
    "id": "content:ui.workspace.c110fe1e6af2",
    "selector": {
      "kind": "content",
      "key": "ui.workspace.c110fe1e6af2"
    },
    "beforeDefault": "Document new instruments, connect buyers to your website, and keep the record ready for its next owner.",
    "afterDefault": "Build Profiles, website links, and ownership transfers."
  },
  {
    "id": "content:ui.workspace.93363fe59878",
    "selector": {
      "kind": "content",
      "key": "ui.workspace.93363fe59878"
    },
    "beforeDefault": "Pick up saved drafts, respond to owner feedback, and document completed work without taking ownership.",
    "afterDefault": "Drafts, owner feedback, and service records without changing instrument ownership."
  },
  {
    "id": "content:ui.workspace.23160d470c3a",
    "selector": {
      "kind": "content",
      "key": "ui.workspace.23160d470c3a"
    },
    "beforeDefault": "Manage your instrument Profiles, public collection, and ownership handoffs.",
    "afterDefault": "Instrument Profiles, collections, and ownership transfers."
  },
  {
    "id": "content:ui.app.account.page.a5b70b30efb9",
    "selector": {
      "kind": "content",
      "key": "ui.app.account.page.a5b70b30efb9"
    },
    "beforeDefault": "Your saved collection is ready to share.",
    "afterDefault": "Collection page enabled."
  },
  {
    "id": "content:ui.app.account.page.6fb83029b2c0",
    "selector": {
      "kind": "content",
      "key": "ui.app.account.page.6fb83029b2c0"
    },
    "beforeDefault": "How you use QRguitar",
    "afterDefault": "Dashboard tools"
  },
  {
    "id": "content:ui.app.account.page.42e359637e9e",
    "selector": {
      "kind": "content",
      "key": "ui.app.account.page.42e359637e9e"
    },
    "beforeDefault": "What you collect, build, repair, or sell.",
    "afterDefault": "A short description."
  },
  {
    "id": "content:ui.app.create.page.5e16a39b804d",
    "selector": {
      "kind": "content",
      "key": "ui.app.create.page.5e16a39b804d"
    },
    "beforeDefault": "Your permanent QRguitar Profile is ready.",
    "afterDefault": "Profile created."
  },
  {
    "id": "content:ui.app.create.page.d7f3b884c97a",
    "selector": {
      "kind": "content",
      "key": "ui.app.create.page.d7f3b884c97a"
    },
    "beforeDefault": "Give your instrument a permanent home.",
    "afterDefault": "Sign in to create a Profile"
  },
  {
    "id": "content:ui.app.dashboard.service.page.3ab05f868d78",
    "selector": {
      "kind": "content",
      "key": "ui.app.dashboard.service.page.3ab05f868d78"
    },
    "beforeDefault": "Pick up a draft, track owner review, and keep the work you performed connected to the instrument.",
    "afterDefault": "Manage drafts, owner reviews, and completed work."
  },
  {
    "id": "content:ui.app.dashboard.service.page.06e51c1a6440",
    "selector": {
      "kind": "content",
      "key": "ui.app.dashboard.service.page.06e51c1a6440"
    },
    "beforeDefault": "Your first service record starts here",
    "afterDefault": "No service requests yet."
  },
  {
    "id": "composition:home:roles:home-role-owner:body:",
    "selector": {
      "kind": "composition",
      "page": "home",
      "sectionId": "roles",
      "blockId": "home-role-owner",
      "field": "body"
    },
    "beforeDefault": "Keep your instruments organized, control what's public, and hand the same Profile to the next owner.",
    "afterDefault": "Keep your instruments organized and transfer the Profile to the next owner."
  },
  {
    "id": "composition:home:roles:home-role-collector:body:",
    "selector": {
      "kind": "composition",
      "page": "home",
      "sectionId": "roles",
      "blockId": "home-role-collector",
      "field": "body"
    },
    "beforeDefault": "Preserve photos, documents, service, and provenance without losing the story.",
    "afterDefault": "Keep photos, documents, and history with your collection."
  },
  {
    "id": "composition:home:roles:home-role-collector:ctaLabel:",
    "selector": {
      "kind": "composition",
      "page": "home",
      "sectionId": "roles",
      "blockId": "home-role-collector",
      "field": "ctaLabel"
    },
    "beforeDefault": "Open your collection",
    "afterDefault": "Dashboard"
  },
  {
    "id": "composition:home:roles:home-role-shop:body:",
    "selector": {
      "kind": "composition",
      "page": "home",
      "sectionId": "roles",
      "blockId": "home-role-shop",
      "field": "body"
    },
    "beforeDefault": "Create or import inventory, print QR materials, and transfer Profiles to buyers.",
    "afterDefault": "Create or import inventory, print QR cards, and transfer Profiles after a sale."
  },
  {
    "id": "composition:home:roles:home-role-builder:body:",
    "selector": {
      "kind": "composition",
      "page": "home",
      "sectionId": "roles",
      "blockId": "home-role-builder",
      "field": "body"
    },
    "beforeDefault": "Issue consistent Profiles for new builds and hand the same Profile to the first owner.",
    "afterDefault": "Create Profiles for new builds and transfer them to the first owner."
  },
  {
    "id": "composition:home:roles:home-role-provider:body:",
    "selector": {
      "kind": "composition",
      "page": "home",
      "sectionId": "roles",
      "blockId": "home-role-provider",
      "field": "body"
    },
    "beforeDefault": "Submit completed service with private evidence for the owner to review.",
    "afterDefault": "Submit completed service for the owner to review."
  },
  {
    "id": "composition:home:roles:home-role-buyer:body:",
    "selector": {
      "kind": "composition",
      "page": "home",
      "sectionId": "roles",
      "blockId": "home-role-buyer",
      "field": "body"
    },
    "beforeDefault": "Review the public history, then receive the same Profile through a secure transfer or claim.",
    "afterDefault": "Review the photos and history, then request ownership or accept a transfer."
  },
  {
    "id": "composition:home:continuity:home-continuity-service:body:",
    "selector": {
      "kind": "composition",
      "page": "home",
      "sectionId": "continuity",
      "blockId": "home-continuity-service",
      "field": "body"
    },
    "beforeDefault": "A provider can submit completed work and private evidence for the owner to review.",
    "afterDefault": "A provider can submit completed work for owner approval."
  },
  {
    "id": "composition:home:pricing:home-price-beta:body:",
    "selector": {
      "kind": "composition",
      "page": "home",
      "sectionId": "pricing",
      "blockId": "home-price-beta",
      "field": "body"
    },
    "beforeDefault": "Create up to 5 Profiles with photos, specifications, privacy controls, history, and downloadable QR codes.",
    "afterDefault": "Create up to 5 Profiles with photos, specs, history, and downloadable QR codes."
  },
  {
    "id": "composition:home:pricing:home-price-beta:items:1",
    "selector": {
      "kind": "composition",
      "page": "home",
      "sectionId": "pricing",
      "blockId": "home-price-beta",
      "field": "items",
      "index": 1
    },
    "beforeDefault": "Public, Unlisted, or Private",
    "afterDefault": "Choose which documents to share"
  }
];
export const approvedExactCopyAfterValues: Readonly<Record<string, string>> = {
  "home.hero.viewProfile": "View Profile",
  "home.anatomy.body": "Photos, specs, service records, and documents.",
  "home.anatomy.cta": "View Profile",
  "ui.components.HomePageClient.104c2472352a": "Keep service records with the Profile.",
  "ui.workspace.93363fe59878": "Drafts, owner feedback, and service records without changing instrument ownership."
};
