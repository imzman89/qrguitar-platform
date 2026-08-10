export type ContentFieldType = "text" | "textarea" | "email" | "url";

export type ContentArea =
  | "Global"
  | "Marketing"
  | "Product"
  | "Workflows"
  | "Support & Legal"
  | "Emails"
  | "SEO";

export type ContentClassification =
  | "editable-standard"
  | "editable-advanced"
  | "security-locked"
  | "data-derived"
  | "browser-platform";

export type ContentRegistryEntry = {
  key: string;
  area: ContentArea;
  page: string;
  section: string;
  label: string;
  type: ContentFieldType;
  defaultValue: string;
  help: string;
  minLength?: number;
  maxLength: number;
  required?: boolean;
  classification: ContentClassification;
  previewPath?: string;
  allowedVariables?: string[];
};

function field(
  key: string,
  area: ContentArea,
  page: string,
  section: string,
  label: string,
  defaultValue: string,
  options: Partial<Omit<ContentRegistryEntry, "key" | "area" | "page" | "section" | "label" | "defaultValue">> = {}
): ContentRegistryEntry {
  return {
    key,
    area,
    page,
    section,
    label,
    defaultValue,
    type: options.type || (defaultValue.length > 90 ? "textarea" : "text"),
    help: options.help || "Shown exactly as written after publishing.",
    maxLength: options.maxLength || (defaultValue.length > 90 ? 700 : 120),
    required: options.required ?? true,
    classification: options.classification || "editable-standard",
    previewPath: options.previewPath,
    minLength: options.minLength,
    allowedVariables: options.allowedVariables
  };
}

const coreContentRegistry: ContentRegistryEntry[] = [
  field("global.brand.name", "Global", "Brand", "Identity", "Brand name", "QRguitar", { maxLength: 40, previewPath: "/" }),
  field("global.brand.tagline", "Global", "Brand", "Identity", "Tagline", "One Profile for the life of an instrument.", { maxLength: 180, previewPath: "/" }),
  field("global.navigation.dashboard", "Global", "Header & Navigation", "Primary navigation", "Dashboard label", "Dashboard", { maxLength: 30, previewPath: "/" }),
  field("global.navigation.catalog", "Global", "Header & Navigation", "Primary navigation", "Catalog label", "Catalog", { maxLength: 30, previewPath: "/" }),
  field("global.navigation.create", "Global", "Header & Navigation", "Primary navigation", "Create label", "Create Profile", { maxLength: 30, previewPath: "/" }),
  field("global.navigation.howItWorks", "Global", "Header & Navigation", "Primary navigation", "How It Works label", "How It Works", { maxLength: 40, previewPath: "/" }),
  field("global.footer.description", "Global", "Footer", "Brand", "Footer description", "One Profile for the life of an instrument.", { maxLength: 220, previewPath: "/" }),
  field("global.footer.supportLabel", "Global", "Footer", "Support", "Support link label", "Support", { maxLength: 40, previewPath: "/contact" }),
  field("global.shared.emptyTitle", "Global", "Shared CTAs and states", "Empty states", "Default empty-state title", "Nothing here yet.", { maxLength: 80 }),
  field("global.shared.errorBody", "Global", "Shared CTAs and states", "Errors", "Default error message", "We could not complete that request. Please try again.", { maxLength: 180 }),

  field("home.hero.eyebrow", "Marketing", "Homepage", "Hero", "Eyebrow", "FOR OWNERS, SHOPS, BUILDERS & COLLECTORS", { maxLength: 80, previewPath: "/" }),
  field("home.hero.headline", "Marketing", "Homepage", "Hero", "Headline", "One Profile for the life of an instrument.", { maxLength: 110, previewPath: "/" }),
  field("home.hero.body", "Marketing", "Homepage", "Hero", "Body", "Keep the photos, specs, service, documents, ownership, and permanent QR with the instrument.", { maxLength: 320, previewPath: "/" }),
  field("home.hero.primaryCta", "Marketing", "Homepage", "Hero", "Primary action", "Create a Profile", { maxLength: 40, previewPath: "/" }),
  field("home.hero.secondaryCta", "Marketing", "Homepage", "Hero", "Secondary action", "Explore the Catalog", { maxLength: 50, previewPath: "/" }),
  field("home.lifecycle.eyebrow", "Marketing", "Homepage", "How it works", "Eyebrow", "HOW IT WORKS", { maxLength: 60, previewPath: "/" }),
  field("home.lifecycle.headline", "Marketing", "Homepage", "How it works", "Section headline", "Create it once. Keep it current.", { maxLength: 130, previewPath: "/" }),
  field("home.lifecycle.body", "Marketing", "Homepage", "How it works", "Section body", "Start with the instrument. Add the history as it happens.", { maxLength: 320, previewPath: "/" }),
  field("home.anatomy.eyebrow", "Marketing", "Homepage", "Profile anatomy", "Eyebrow", "INSIDE A PROFILE", { maxLength: 60, previewPath: "/" }),
  field("home.anatomy.headline", "Marketing", "Homepage", "Profile anatomy", "Headline", "See the details that matter.", { maxLength: 100, previewPath: "/" }),
  field("home.anatomy.body", "Marketing", "Homepage", "Profile anatomy", "Body", "Photos, specifications, service, documents, and ownership stay attached to the same Profile.", { maxLength: 240, previewPath: "/" }),
  field("home.anatomy.cta", "Marketing", "Homepage", "Profile anatomy", "Action", "Explore a Profile", { maxLength: 40, previewPath: "/" }),
  field("home.roles.eyebrow", "Marketing", "Homepage", "Who uses QRguitar", "Eyebrow", "WHO USES QRGUITAR", { maxLength: 60, previewPath: "/" }),
  field("home.roles.headline", "Marketing", "Homepage", "Who uses QRguitar", "Headline", "One system. Different jobs.", { maxLength: 100, previewPath: "/" }),
  field("home.roles.body", "Marketing", "Homepage", "Who uses QRguitar", "Optional body", "", { maxLength: 220, required: false, previewPath: "/" }),
  field("home.pricing.eyebrow", "Marketing", "Homepage", "Public beta", "Eyebrow", "PUBLIC BETA", { maxLength: 60, previewPath: "/" }),
  field("home.pricing.headline", "Marketing", "Homepage", "Public beta", "Pricing headline", "Start free. Get help when you need it.", { maxLength: 100, previewPath: "/" }),
  field("home.pricing.body", "Marketing", "Homepage", "Public beta", "Optional body", "", { maxLength: 260, required: false, previewPath: "/" }),
  field("home.finalCta.headline", "Marketing", "Homepage", "Closing action", "Headline", "Start with one instrument.", { maxLength: 120, previewPath: "/" }),
  field("home.finalCta.body", "Marketing", "Homepage", "Closing action", "Body", "Create the Profile now. Add the rest over time.", { maxLength: 180, previewPath: "/" }),
  field("home.finalCta.eyebrow", "Marketing", "Homepage", "Closing action", "Optional eyebrow", "", { maxLength: 70, required: false, previewPath: "/" }),
  field("home.finalCta.primaryCta", "Marketing", "Homepage", "Closing action", "Primary action", "Create a Profile", { maxLength: 40, previewPath: "/" }),
  field("home.finalCta.secondaryCta", "Marketing", "Homepage", "Closing action", "Secondary action", "Explore the Catalog", { maxLength: 40, previewPath: "/" }),
  field("home.archive.eyebrow", "Marketing", "Homepage", "Archive rail", "Eyebrow", "PUBLIC PROFILES", { maxLength: 60, previewPath: "/" }),
  field("home.archive.heading", "Marketing", "Homepage", "Archive rail", "Heading", "See what's already documented.", { maxLength: 100, previewPath: "/" }),
  field("home.archive.body", "Marketing", "Homepage", "Archive rail", "Body", "Browse real QRguitar Profiles from the public Catalog.", { maxLength: 200, previewPath: "/" }),
  field("home.archive.viewAll", "Marketing", "Homepage", "Archive rail", "Archive link", "View all Profiles", { maxLength: 40, previewPath: "/" }),
  field("home.continuity.eyebrow", "Marketing", "Homepage", "Service and ownership", "Eyebrow", "SERVICE & OWNERSHIP", { maxLength: 70, previewPath: "/" }),
  field("home.continuity.headline", "Marketing", "Homepage", "Service and ownership", "Headline", "The history stays with the instrument.", { maxLength: 120, previewPath: "/" }),
  field("home.continuity.body", "Marketing", "Homepage", "Service and ownership", "Body", "Approved service and completed ownership transfers update the same Profile. The QRguitar ID and link do not change.", { maxLength: 260, previewPath: "/" }),
  field("home.continuity.cta", "Marketing", "Homepage", "Service and ownership", "Action", "See How It Works", { maxLength: 40, previewPath: "/" }),

  field("howItWorks.hero.eyebrow", "Marketing", "How It Works", "Hero", "Eyebrow", "HOW QRGUITAR WORKS", { maxLength: 70, previewPath: "/how-it-works" }),
  field("howItWorks.hero.headline", "Marketing", "How It Works", "Hero", "Headline", "One Profile that stays with the instrument.", { maxLength: 110, previewPath: "/how-it-works" }),
  field("howItWorks.hero.body", "Marketing", "How It Works", "Hero", "Body", "Create it once. Keep the photos, specifications, service, documents, and ownership history current as the instrument changes.", { maxLength: 280, previewPath: "/how-it-works" }),
  field("howItWorks.lifecycle.create.title", "Marketing", "How It Works", "Instrument lifecycle", "Create step title", "Create the Profile", { maxLength: 70, previewPath: "/how-it-works" }),
  field("howItWorks.lifecycle.create.body", "Marketing", "How It Works", "Instrument lifecycle", "Create step body", "Add one real photo and the instrument details you know. A permanent QRguitar ID is assigned when no Serial Number is available.", { maxLength: 300, previewPath: "/how-it-works" }),
  field("howItWorks.lifecycle.scan.title", "Marketing", "How It Works", "Instrument lifecycle", "Scan step title", "Scan and learn", { maxLength: 70, previewPath: "/how-it-works" }),
  field("howItWorks.lifecycle.scan.body", "Marketing", "How It Works", "Instrument lifecycle", "Scan step body", "Attach or print the QR code so a player, buyer, or shop can open the instrument's Profile immediately.", { maxLength: 260, previewPath: "/how-it-works" }),
  field("howItWorks.lifecycle.transfer.title", "Marketing", "How It Works", "Instrument lifecycle", "Transfer step title", "Transfer ownership safely", { maxLength: 70, previewPath: "/how-it-works" }),
  field("howItWorks.lifecycle.transfer.body", "Marketing", "How It Works", "Instrument lifecycle", "Transfer step body", "The current owner starts a secure handoff. A Serial Number or QR scan alone can never transfer ownership.", { maxLength: 260, previewPath: "/how-it-works" }),
  field("howItWorks.roles.collectors.body", "Marketing", "How It Works", "Who it serves", "Collectors", "Show a collection, preserve provenance, and keep important evidence private until it is needed.", { maxLength: 240, previewPath: "/how-it-works" }),
  field("howItWorks.roles.shops.body", "Marketing", "How It Works", "Who it serves", "Shops and service providers", "Create clear customer handouts, add service history for review, and let in-store visitors scan complete instrument details.", { maxLength: 260, previewPath: "/how-it-works" }),
  field("howItWorks.faq.serialPrivacy.question", "Marketing", "How It Works", "Common questions", "Serial privacy question", "Can I hide the Serial Number?", { maxLength: 100, previewPath: "/how-it-works" }),
  field("howItWorks.faq.serialPrivacy.answer", "Marketing", "How It Works", "Common questions", "Serial privacy answer", "Yes. The signed-in owner can keep the Serial Number in the private workspace while hiding it from the Catalog, public Profile, metadata, and public API.", { maxLength: 330, previewPath: "/how-it-works" }),

  field("catalog.hero.eyebrow", "Marketing", "Catalog", "Introduction", "Eyebrow", "PUBLIC CATALOG", { maxLength: 50, previewPath: "/catalog" }),
  field("catalog.hero.headline", "Marketing", "Catalog", "Introduction", "Headline", "Browse QRguitar Profiles", { maxLength: 90, previewPath: "/catalog" }),
  field("catalog.hero.body", "Marketing", "Catalog", "Introduction", "Body", "Search the Catalog by brand, model, year, availability, trust status, service history, and more.", { maxLength: 220, previewPath: "/catalog" }),
  field("catalog.empty.title", "Marketing", "Catalog", "Empty state", "Title", "No Profiles match these filters.", { maxLength: 90, previewPath: "/catalog" }),
  field("catalog.empty.body", "Marketing", "Catalog", "Empty state", "Body", "Try removing a filter or searching for something else.", { maxLength: 150, previewPath: "/catalog" }),
  field("catalog.results.all", "Marketing", "Catalog", "Results", "All results label", "{count} Profiles", { allowedVariables: ["count"], maxLength: 70, previewPath: "/catalog" }),
  field("catalog.results.filtered", "Marketing", "Catalog", "Results", "Filtered results label", "{count} Results", { allowedVariables: ["count"], maxLength: 70, previewPath: "/catalog" }),
  field("catalog.actions.reset", "Marketing", "Catalog", "Actions", "Reset filters label", "Clear filters", { maxLength: 40, previewPath: "/catalog" }),
  field("catalog.actions.create", "Marketing", "Catalog", "Actions", "Create label", "Create a Profile", { maxLength: 40, previewPath: "/catalog" }),
  field("catalog.search.placeholder", "Marketing", "Catalog", "Search", "Search placeholder", "Search Profiles", { maxLength: 60, previewPath: "/catalog" }),
  field("cards.attribution.collection", "Marketing", "Shared CTAs and states", "Profile cards", "Collection attribution", "From the collection of", { maxLength: 60, previewPath: "/catalog" }),
  field("profile.attribution.collection", "Product", "Public Profile", "Attribution", "Collection attribution", "From the collection of", { maxLength: 60, previewPath: "/catalog" }),
  field("profile.gallery.label", "Product", "Public Profile", "Gallery", "Gallery label", "Instrument photo gallery", { maxLength: 70, previewPath: "/catalog" }),
  field("profile.gallery.previous", "Product", "Public Profile", "Gallery", "Previous photo label", "Previous photo", { maxLength: 40, previewPath: "/catalog" }),
  field("profile.gallery.next", "Product", "Public Profile", "Gallery", "Next photo label", "Next photo", { maxLength: 40, previewPath: "/catalog" }),
  field("profile.tabs.overview", "Product", "Public Profile", "Navigation", "Overview tab", "Overview", { maxLength: 30, previewPath: "/catalog" }),
  field("profile.tabs.specifications", "Product", "Public Profile", "Navigation", "Details tab", "Details", { maxLength: 30, previewPath: "/catalog" }),
  field("profile.tabs.timeline", "Product", "Public Profile", "Navigation", "Timeline tab", "Timeline", { maxLength: 30, previewPath: "/catalog" }),
  field("profile.tabs.service", "Product", "Public Profile", "Navigation", "Service tab", "Service", { maxLength: 30, previewPath: "/catalog" }),
  field("profile.tabs.media", "Product", "Public Profile", "Navigation", "Media tab", "Media", { maxLength: 30, previewPath: "/catalog" }),
  field("profile.tabs.documents", "Product", "Public Profile", "Navigation", "Documents tab", "Documents", { maxLength: 30, previewPath: "/catalog" }),
  field("profile.verification.title", "Product", "Public Profile", "Trust", "Verification title", "Verified by QRguitar", { maxLength: 60, previewPath: "/catalog" }),
  field("profile.verification.body", "Product", "Public Profile", "Trust", "Verification body", "QRguitar reviewed this Profile and approved the identity information available at the time.", { maxLength: 240, previewPath: "/catalog" }),
  field("profile.authenticity.title", "Product", "Public Profile", "Trust", "Authenticity title", "Authenticity Confirmed", { maxLength: 60, previewPath: "/catalog" }),
  field("profile.authenticity.body", "Product", "Public Profile", "Trust", "Authenticity body", "Available evidence was consistent with the instrument's stated identity.", { maxLength: 240, previewPath: "/catalog" }),
  field("home.anatomy.fallback", "Marketing", "Homepage", "Profile anatomy", "Fallback label", "A permanent identity for every instrument", { maxLength: 100, previewPath: "/" }),

  field("dashboard.hero.headline", "Product", "Dashboard", "Header", "Page title", "Your instruments", { maxLength: 90, previewPath: "/dashboard" }),
  field("dashboard.hero.body", "Product", "Dashboard", "Header", "Subtitle", "Manage Profiles, privacy, service, transfers, and QR tools.", { maxLength: 240, previewPath: "/dashboard" }),
  field("dashboard.collection.title", "Product", "Dashboard", "Collection", "Collection title", "Your Profiles", { maxLength: 70, previewPath: "/dashboard" }),
  field("dashboard.empty.title", "Product", "Dashboard", "Empty state", "Title", "Your first instrument starts here.", { maxLength: 90, previewPath: "/dashboard" }),
  field("dashboard.empty.body", "Product", "Dashboard", "Empty state", "Body", "Add one instrument and one real photo to create its permanent QRguitar Profile.", { maxLength: 200, previewPath: "/dashboard" }),
  field("dashboard.bulkImport.help", "Product", "Dashboard", "Bulk import", "Bulk import help", "Enrolled shops and brands can prepare up to 50 Profiles at a time from a reviewed inventory sheet.", { maxLength: 260, previewPath: "/dashboard" }),
  field("dashboard.actions.create", "Product", "Dashboard", "Actions", "Create action", "Create Profile", { maxLength: 40, previewPath: "/dashboard" }),

  field("create.hero.headline", "Product", "Create Profile", "Header", "Headline", "Create a Profile", { maxLength: 100, previewPath: "/create" }),
  field("create.hero.body", "Product", "Create Profile", "Header", "Body", "Start with the instrument. Add the history as you go.", { maxLength: 280, previewPath: "/create" }),
  field("create.serial.help", "Product", "Create Profile", "Instrument", "Serial Number help", "If the instrument has a Serial Number, QRguitar uses it in the permanent QRguitar ID.", { maxLength: 310, previewPath: "/create" }),
  field("create.serial.generatedHelp", "Product", "Create Profile", "Instrument", "No Serial Number help", "If the instrument has no Serial Number, QRguitar creates a unique generated ID.", { maxLength: 220, previewPath: "/create" }),
  field("create.photo.help", "Product", "Create Profile", "Photos", "Photo help", "JPG, PNG, or WebP. Add at least one real instrument photo.", { maxLength: 240, previewPath: "/create" }),
  field("create.privacy.help", "Product", "Create Profile", "Visibility", "Visibility help", "Public Profiles appear in the Catalog. Unlisted Profiles open only by direct link. Private Profiles stay in the owner workspace.", { maxLength: 300, previewPath: "/create" }),
  field("edit.hero.headline", "Product", "Edit Profile", "Header", "Headline", "Edit Profile", { maxLength: 90, previewPath: "/dashboard" }),
  field("edit.save.success", "Product", "Edit Profile", "Feedback", "Save success", "Profile saved.", { maxLength: 80 }),
  field("bulkImport.hero.headline", "Product", "Bulk Import", "Header", "Headline", "Bulk Import", { maxLength: 90, previewPath: "/dashboard" }),
  field("bulkImport.hero.body", "Product", "Bulk Import", "Header", "Body", "Add inventory from a CSV, TSV, or pasted spreadsheet. Incomplete rows stay drafts. New Profiles start Private.", { maxLength: 260, previewPath: "/dashboard" }),
  field("account.hero.headline", "Product", "Account", "Header", "Headline", "Account", { maxLength: 90, previewPath: "/account" }),
  field("account.hero.body", "Product", "Account", "Header", "Body", "Manage your public identity, security, notifications, business tools, and privacy.", { maxLength: 220, previewPath: "/account" }),
  field("collections.hero.headline", "Product", "Public Collections", "Header", "Headline", "A collection worth sharing", { maxLength: 100, previewPath: "/account?section=collection" }),
  field("profile.help.identity", "Product", "Public Profile", "Identity", "Identity helper", "The QRguitar ID and permanent URL stay with this Profile for life.", { maxLength: 180, previewPath: "/catalog" }),
  field("printWorkspace.scanInstruction", "Product", "Print Workspace", "Handout", "Scan instruction", "Scan to open the permanent QRguitar Profile.", { maxLength: 120, previewPath: "/dashboard" }),

  field("serviceProviders.hero.headline", "Workflows", "Service Providers", "Header", "Headline", "Submit service", { maxLength: 110, previewPath: "/service-work/preview" }),
  field("serviceReview.hero.headline", "Workflows", "Service Review", "Header", "Headline", "Review service", { maxLength: 100, previewPath: "/dashboard" }),
  field("claimCenter.hero.headline", "Workflows", "Ownership Claims", "Header", "Headline", "Claim or transfer an instrument", { maxLength: 110, previewPath: "/ownership-claim" }),
  field("claimCenter.hero.body", "Workflows", "Ownership Claims", "Header", "Body", "Tell us how the instrument came to you. We'll show you the safest next step.", { maxLength: 310, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.store.title", "Workflows", "Ownership Claims", "Scenarios", "Store purchase", "Bought new from a store", { maxLength: 80, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.store.body", "Workflows", "Ownership Claims", "Scenarios", "Store purchase guidance", "Use the recipient-bound invitation supplied by the store, or request a reviewed purchase claim.", { maxLength: 220, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.builder.title", "Workflows", "Ownership Claims", "Scenarios", "Brand or builder purchase", "Bought directly from a builder or brand", { maxLength: 90, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.builder.body", "Workflows", "Ownership Claims", "Scenarios", "Brand or builder guidance", "Accept the issuer's secure handoff, or document the direct purchase for review.", { maxLength: 220, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.transfer.title", "Workflows", "Ownership Claims", "Scenarios", "Seller transfer", "Bought used and the seller can transfer it", { maxLength: 90, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.transfer.body", "Workflows", "Ownership Claims", "Scenarios", "Seller transfer guidance", "Ask the current owner to send a secure transfer invitation from their Dashboard.", { maxLength: 220, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.used.title", "Workflows", "Ownership Claims", "Scenarios", "Used purchase", "Bought used but no transfer is available", { maxLength: 100, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.used.body", "Workflows", "Ownership Claims", "Scenarios", "Used purchase guidance", "Submit possession and purchase evidence without exposing it publicly.", { maxLength: 220, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.gift.title", "Workflows", "Ownership Claims", "Scenarios", "Gift or inheritance", "Gifted or inherited", { maxLength: 100, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.gift.body", "Workflows", "Ownership Claims", "Scenarios", "Gift or inheritance guidance", "Use an owner transfer when possible, or submit gift or estate evidence for review.", { maxLength: 220, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.legacy.title", "Workflows", "Ownership Claims", "Scenarios", "Legacy Profile", "I have an instrument with an older Profile", { maxLength: 110, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.legacy.body", "Workflows", "Ownership Claims", "Scenarios", "Legacy Profile guidance", "Prove current possession with a private challenge photo and supporting evidence.", { maxLength: 220, previewPath: "/ownership-claim" }),
  field("transfers.hero.headline", "Workflows", "Ownership Transfers", "Header", "Headline", "A secure handoff to the next owner", { maxLength: 110, previewPath: "/dashboard" }),
  field("lostStolen.help", "Workflows", "Lost / Stolen", "Guidance", "Safety guidance", "Use a safety alert only when an instrument is genuinely lost or stolen. Public notes should help recovery without exposing private information.", { maxLength: 310, previewPath: "/dashboard" }),

  field("login.hero.eyebrow", "Support & Legal", "Login", "Header", "Eyebrow", "ACCOUNT", { maxLength: 40, previewPath: "/login" }),
  field("login.hero.headline", "Support & Legal", "Login", "Header", "Headline", "Welcome back.", { maxLength: 80, previewPath: "/login" }),
  field("login.hero.body", "Support & Legal", "Login", "Header", "Body", "Sign in to manage your Profiles, privacy, service history, transfers, and account settings.", { maxLength: 220, previewPath: "/login" }),
  field("resetPassword.hero.headline", "Support & Legal", "Reset Password", "Header", "Headline", "Reset your password", { maxLength: 80, previewPath: "/reset-password" }),
  field("resetPassword.hero.body", "Support & Legal", "Reset Password", "Header", "Body", "Enter the email used for your QRguitar account and we will send a secure reset link.", { maxLength: 220, previewPath: "/reset-password" }),
  field("contact.hero.headline", "Support & Legal", "Contact", "Header", "Headline", "How can we help?", { maxLength: 80, previewPath: "/contact" }),
  field("contact.hero.body", "Support & Legal", "Contact", "Header", "Body", "For account access, Profile edits, service history, transfers, lost/stolen alerts, privacy, or business onboarding, email support@qrguitar.com.", { maxLength: 250, previewPath: "/contact" }),
  field("privacy.hero.headline", "Support & Legal", "Privacy", "Header", "Headline", "Your Profile. Your privacy choices.", { maxLength: 80, previewPath: "/privacy" }),
  field("privacy.sections.dataCollected.heading", "Support & Legal", "Privacy", "Profile contents", "Heading", "What a Profile can contain", { maxLength: 100, previewPath: "/privacy" }),
  field("privacy.sections.dataCollected.body", "Support & Legal", "Privacy", "Profile contents", "Body", "A Profile can include photos, brand, model, year, Serial Number, specifications, service history, ownership history, safety status, public documents, and private supporting files.", { maxLength: 700, previewPath: "/privacy" }),
  field("terms.hero.headline", "Support & Legal", "Terms", "Header", "Headline", "QRguitar Terms", { maxLength: 80, previewPath: "/terms" }),
  field("terms.sections.accounts.heading", "Support & Legal", "Terms", "Accounts", "Accounts heading", "Accounts and access", { maxLength: 100, previewPath: "/terms" }),
  field("terms.sections.accounts.body", "Support & Legal", "Terms", "Accounts", "Accounts body", "Keep account access secure and provide accurate information. QRguitar may restrict accounts that misuse the platform or put other users at risk.", { maxLength: 700, previewPath: "/terms" })
];

const completionRegistry: ContentRegistryEntry[] = [
  field("global.announcement.text", "Global", "Announcement", "Banner", "Announcement text", "Free QRguitar Profiles are available during public beta.", { maxLength: 160, previewPath: "/" }),
  field("global.announcement.cta", "Global", "Announcement", "Banner", "Action label", "Learn how it works", { maxLength: 40, previewPath: "/how-it-works" }),
  field("global.shared.loadingBody", "Global", "Shared CTAs and states", "Loading", "Loading message", "Loading QRguitar…", { maxLength: 90 }),
  field("global.shared.successBody", "Global", "Shared CTAs and states", "Success", "Success message", "Your changes were saved.", { maxLength: 120 }),
  field("global.shared.retryCta", "Global", "Shared CTAs and states", "Actions", "Retry label", "Try again", { maxLength: 30 }),
  field("global.shared.signInCta", "Global", "Shared CTAs and states", "Actions", "Sign-in label", "Sign in", { maxLength: 30, previewPath: "/login" }),

  field("home.lifecycle.step1.title", "Marketing", "Homepage", "How it works", "Step one title", "Identify", { maxLength: 70, previewPath: "/" }),
  field("home.lifecycle.step1.body", "Marketing", "Homepage", "How it works", "Step one body", "Serial Number, photos, specifications, and the permanent QRguitar ID.", { maxLength: 180, previewPath: "/" }),
  field("home.lifecycle.step2.title", "Marketing", "Homepage", "How it works", "Step two title", "Document", { maxLength: 70, previewPath: "/" }),
  field("home.lifecycle.step2.body", "Marketing", "Homepage", "How it works", "Step two body", "Service, documents, media, safety, and ownership history.", { maxLength: 180, previewPath: "/" }),
  field("home.lifecycle.step3.title", "Marketing", "Homepage", "How it works", "Step three title", "Carry Forward", { maxLength: 70, previewPath: "/" }),
  field("home.lifecycle.step3.body", "Marketing", "Homepage", "How it works", "Step three body", "Transfer the same Profile when the instrument changes hands.", { maxLength: 180, previewPath: "/" }),
  field("pricing.beta.title", "Marketing", "Pricing", "Public beta", "Plan title", "For owners and collectors", { maxLength: 70, previewPath: "/" }),
  field("pricing.beta.price", "Marketing", "Pricing", "Public beta", "Price", "$0 during public beta", { maxLength: 30, previewPath: "/" }),
  field("pricing.beta.body", "Marketing", "Pricing", "Public beta", "Description", "Create up to 25 Profiles with photos, specifications, privacy controls, history, and downloadable QR codes.", { maxLength: 220, previewPath: "/" }),
  field("pricing.commercial.title", "Marketing", "Pricing", "Commercial", "Plan title", "For shops, builders & brands", { maxLength: 80, previewPath: "/" }),
  field("pricing.commercial.price", "Marketing", "Pricing", "Commercial", "Price", "From $99", { maxLength: 30, previewPath: "/" }),
  field("pricing.commercial.body", "Marketing", "Pricing", "Commercial", "Description", "Need help with bulk setup, QR hardware, verification, or a commercial rollout? We'll help you get started.", { maxLength: 240, previewPath: "/" }),
  field("installers.hero.eyebrow", "Marketing", "Installers", "Hero", "Eyebrow", "FOR SHOPS & SERVICE PROVIDERS", { maxLength: 60, previewPath: "/installers" }),
  field("installers.hero.headline", "Marketing", "Installers", "Hero", "Headline", "Turn service work into a Profile customers keep.", { maxLength: 100, previewPath: "/installers" }),
  field("installers.hero.body", "Marketing", "Installers", "Hero", "Body", "Create or update QRguitar Profiles with owner approval, add documented service, print scannable handouts, and help every instrument leave your shop with a clearer history.", { maxLength: 260, previewPath: "/installers" }),
  field("installers.requirements.heading", "Marketing", "Installers", "Requirements", "Heading", "Who we're looking for", { maxLength: 90, previewPath: "/installers" }),
  field("installers.requirements.body", "Marketing", "Installers", "Requirements", "Body", "Established shops and technicians with finish, repair, or installation experience and a professional way to document their work.", { maxLength: 220, previewPath: "/installers" }),
  field("installers.process.heading", "Marketing", "Installers", "Process", "Heading", "How approval works", { maxLength: 90, previewPath: "/installers" }),
  field("installers.actions.apply", "Marketing", "Installers", "Actions", "Apply action", "Apply to the Provider Network", { maxLength: 60, previewPath: "/installers" }),

  field("howItWorks.lifecycle.heading", "Marketing", "How It Works", "Instrument lifecycle", "Section heading", "Four steps from instrument to Profile.", { maxLength: 110, previewPath: "/how-it-works" }),
  field("howItWorks.features.heading", "Marketing", "How It Works", "Features", "Section heading", "What goes in a Profile.", { maxLength: 110, previewPath: "/how-it-works" }),
  field("howItWorks.privacy.heading", "Marketing", "How It Works", "Privacy", "Section heading", "Choose what people can see.", { maxLength: 110, previewPath: "/how-it-works" }),
  field("howItWorks.privacy.body", "Marketing", "How It Works", "Privacy", "Section body", "Choose Public, Unlisted, or Private. You can also hide the Serial Number while keeping it available in the owner workspace.", { maxLength: 300, previewPath: "/how-it-works" }),
  field("howItWorks.identity.heading", "Marketing", "How It Works", "Identity", "Section heading", "QRguitar ID and Serial Number", { maxLength: 110, previewPath: "/how-it-works" }),
  field("howItWorks.identity.body", "Marketing", "How It Works", "Identity", "Section body", "The QRguitar ID stays with the Profile. The owner can choose whether the separate Serial Number field appears publicly.", { maxLength: 300, previewPath: "/how-it-works" }),
  field("howItWorks.identity.qrTitle", "Marketing", "How It Works", "Identity", "QRguitar ID title", "QRguitar ID", { maxLength: 50, previewPath: "/how-it-works" }),
  field("howItWorks.identity.qrBody", "Marketing", "How It Works", "Identity", "QRguitar ID body", "Used by the permanent Profile URL and printable QR.", { maxLength: 180, previewPath: "/how-it-works" }),
  field("howItWorks.identity.serialTitle", "Marketing", "How It Works", "Identity", "Serial Number title", "Serial Number", { maxLength: 50, previewPath: "/how-it-works" }),
  field("howItWorks.identity.serialBody", "Marketing", "How It Works", "Identity", "Serial Number body", "Kept for the owner and shown publicly only when the owner allows it.", { maxLength: 180, previewPath: "/how-it-works" }),
  field("howItWorks.visibility.publicTitle", "Marketing", "How It Works", "Visibility", "Public title", "Public", { maxLength: 40, previewPath: "/how-it-works" }),
  field("howItWorks.visibility.publicBody", "Marketing", "How It Works", "Visibility", "Public body", "Listed in the Catalog and available through the QR or direct Profile link.", { maxLength: 200, previewPath: "/how-it-works" }),
  field("howItWorks.visibility.unlistedTitle", "Marketing", "How It Works", "Visibility", "Unlisted title", "Unlisted", { maxLength: 40, previewPath: "/how-it-works" }),
  field("howItWorks.visibility.unlistedBody", "Marketing", "How It Works", "Visibility", "Unlisted body", "Not listed in the Catalog, but available to anyone with the direct link or QR.", { maxLength: 200, previewPath: "/how-it-works" }),
  field("howItWorks.visibility.privateTitle", "Marketing", "How It Works", "Visibility", "Private title", "Private", { maxLength: 40, previewPath: "/how-it-works" }),
  field("howItWorks.visibility.privateBody", "Marketing", "How It Works", "Visibility", "Private body", "Available only to the signed-in owner and authorized QRguitar admins.", { maxLength: 200, previewPath: "/how-it-works" }),
  field("howItWorks.ownership.heading", "Marketing", "How It Works", "Ownership", "Section heading", "A QR scan never transfers ownership.", { maxLength: 110, previewPath: "/how-it-works" }),
  field("howItWorks.ownership.body", "Marketing", "How It Works", "Ownership", "Section body", "The current owner, shop, or brand sends a secure handoff. Older ownership questions use a reviewed claim with supporting evidence.", { maxLength: 300, classification: "security-locked", previewPath: "/how-it-works" }),
  field("howItWorks.ownership.ownerTitle", "Marketing", "How It Works", "Ownership", "Owner transfer title", "Owner transfer", { maxLength: 60, previewPath: "/how-it-works" }),
  field("howItWorks.ownership.ownerBody", "Marketing", "How It Works", "Ownership", "Owner transfer body", "The current owner sends the existing Profile to the next owner.", { maxLength: 180, previewPath: "/how-it-works" }),
  field("howItWorks.ownership.businessTitle", "Marketing", "How It Works", "Ownership", "Business handoff title", "Store or brand handoff", { maxLength: 60, previewPath: "/how-it-works" }),
  field("howItWorks.ownership.businessBody", "Marketing", "How It Works", "Ownership", "Business handoff body", "A shop or builder can prepare the Profile for the buyer.", { maxLength: 180, previewPath: "/how-it-works" }),
  field("howItWorks.ownership.claimTitle", "Marketing", "How It Works", "Ownership", "Claim title", "Ownership claim", { maxLength: 60, previewPath: "/how-it-works" }),
  field("howItWorks.ownership.claimBody", "Marketing", "How It Works", "Ownership", "Claim body", "When no transfer is available, the claimant can submit acquisition details and private supporting evidence for review.", { maxLength: 240, previewPath: "/how-it-works" }),
  field("howItWorks.roles.heading", "Marketing", "How It Works", "Who it serves", "Section heading", "Who uses QRguitar.", { maxLength: 120, previewPath: "/how-it-works" }),
  field("howItWorks.roles.players.body", "Marketing", "How It Works", "Who it serves", "Players", "Keep the facts, photos, setup notes, and service history that make an instrument yours.", { maxLength: 220, previewPath: "/how-it-works" }),
  field("howItWorks.roles.builders.body", "Marketing", "How It Works", "Who it serves", "Builders and brands", "Issue consistent Profiles, preserve build details, and support future owners without losing brand identity.", { maxLength: 250, previewPath: "/how-it-works" }),
  field("howItWorks.faq.transfer.question", "Marketing", "How It Works", "Common questions", "Transfer question", "Can someone claim ownership by scanning the QR code?", { maxLength: 110, previewPath: "/how-it-works" }),
  field("howItWorks.faq.transfer.answer", "Marketing", "How It Works", "Common questions", "Transfer answer", "No. A scan or Serial Number can identify a Profile, but ownership changes only through a reviewed transfer or claim workflow.", { maxLength: 300, previewPath: "/how-it-works" }),
  field("howItWorks.faq.heading", "Marketing", "How It Works", "Common questions", "Section heading", "Common questions", { maxLength: 90, previewPath: "/how-it-works" }),
  field("howItWorks.finalCta.headline", "Marketing", "How It Works", "Closing action", "Headline", "Create the Profile once.", { maxLength: 90, previewPath: "/how-it-works" }),
  field("howItWorks.finalCta.body", "Marketing", "How It Works", "Closing action", "Body", "Keep it current for as long as you own the instrument.", { maxLength: 190, previewPath: "/how-it-works" }),

  field("dashboard.stats.profiles", "Product", "Dashboard", "Summary", "Profiles label", "Profiles", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.stats.visible", "Product", "Dashboard", "Summary", "Public label", "Public", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.stats.transfers", "Product", "Dashboard", "Summary", "Transfers label", "Transfers", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.actions.bulk", "Product", "Dashboard", "Actions", "Bulk import action", "Bulk Import", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.actions.claims", "Product", "Dashboard", "Actions", "Claims action", "Transfers & Claims", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.card.open", "Product", "Dashboard", "Profile cards", "Open label", "Open Profile", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.card.edit", "Product", "Dashboard", "Profile cards", "Edit label", "Edit Profile", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.card.more", "Product", "Dashboard", "Profile cards", "More label", "More", { maxLength: 30, previewPath: "/dashboard" }),
  field("dashboard.card.remove", "Product", "Dashboard", "Profile cards", "Remove label", "Remove Profile", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.transfer.help", "Product", "Dashboard", "Ownership", "Transfer help", "Start a secure handoff when the instrument changes owners.", { maxLength: 170, previewPath: "/dashboard" }),

  field("create.identity.heading", "Product", "Create Profile", "Instrument identity", "Section heading", "Instrument identity", { maxLength: 70, previewPath: "/create" }),
  field("create.identity.body", "Product", "Create Profile", "Instrument", "Section body", "Add the basic details that identify the instrument.", { maxLength: 180, previewPath: "/create" }),
  field("create.photos.heading", "Product", "Create Profile", "Photos", "Section heading", "Photos", { maxLength: 70, previewPath: "/create" }),
  field("create.photos.body", "Product", "Create Profile", "Photos", "Section body", "Add at least one real photo. You can reorder photos and choose the main image.", { maxLength: 180, previewPath: "/create" }),
  field("create.ownership.heading", "Product", "Create Profile", "Ownership & privacy", "Section heading", "Ownership & privacy", { maxLength: 70, previewPath: "/create" }),
  field("create.ownership.body", "Product", "Create Profile", "Ownership & privacy", "Section body", "Choose how this Profile should appear and whether the Serial Number is public.", { maxLength: 190, previewPath: "/create" }),
  field("create.details.heading", "Product", "Create Profile", "Details", "Section heading", "Details and history", { maxLength: 70, previewPath: "/create" }),
  field("create.details.body", "Product", "Create Profile", "Details", "Section body", "Add anything useful now. You can keep editing the Profile later.", { maxLength: 180, previewPath: "/create" }),
  field("create.visibility.heading", "Product", "Create Profile", "Visibility", "Section heading", "Privacy and visibility", { maxLength: 70, previewPath: "/create" }),
  field("create.review.heading", "Product", "Create Profile", "Review", "Section heading", "Review", { maxLength: 70, previewPath: "/create" }),
  field("create.review.body", "Product", "Create Profile", "Review", "Section body", "Check the details before creating the Profile.", { maxLength: 180, previewPath: "/create" }),
  field("create.actions.continue", "Product", "Create Profile", "Actions", "Continue label", "Continue", { maxLength: 30, previewPath: "/create" }),
  field("create.actions.back", "Product", "Create Profile", "Actions", "Back label", "Back", { maxLength: 30, previewPath: "/create" }),
  field("create.actions.submit", "Product", "Create Profile", "Actions", "Create label", "Create Profile", { maxLength: 40, previewPath: "/create" }),
  field("create.errors.photo", "Product", "Create Profile", "Validation", "Photo error", "Add at least one real photo before creating the Profile.", { maxLength: 160, previewPath: "/create" }),
  field("create.errors.duplicate", "Product", "Create Profile", "Validation", "Duplicate Serial Number error", "A Profile already uses this Serial Number. Open the existing Profile or contact support.", { maxLength: 220, previewPath: "/create" }),

  field("edit.hero.body", "Product", "Edit Profile", "Header", "Body", "Update the Profile without changing the QRguitar ID or permanent link.", { maxLength: 220, previewPath: "/dashboard" }),
  field("edit.photos.heading", "Product", "Edit Profile", "Photos", "Section heading", "Photos", { maxLength: 50, previewPath: "/dashboard" }),
  field("edit.service.heading", "Product", "Edit Profile", "Service", "Section heading", "Service history", { maxLength: 60, previewPath: "/dashboard" }),
  field("edit.documents.heading", "Product", "Edit Profile", "Documents", "Section heading", "Documents", { maxLength: 60, previewPath: "/dashboard" }),
  field("edit.actions.save", "Product", "Edit Profile", "Actions", "Save label", "Save Changes", { maxLength: 40, previewPath: "/dashboard" }),
  field("edit.actions.saveView", "Product", "Edit Profile", "Actions", "Save and view label", "Save and View Profile", { maxLength: 50, previewPath: "/dashboard" }),
  field("edit.unsaved.warning", "Product", "Edit Profile", "Safety", "Unsaved warning", "You have unsaved changes.", { maxLength: 100, previewPath: "/dashboard" }),

  field("bulkImport.requirements", "Product", "Bulk Import", "Requirements", "Requirements", "Each row needs a recognized brand, clear identity details, and a real photo URL.", { maxLength: 240, previewPath: "/dashboard" }),
  field("bulkImport.actions.template", "Product", "Bulk Import", "Actions", "Template label", "Copy template", { maxLength: 40, previewPath: "/dashboard" }),
  field("bulkImport.actions.preview", "Product", "Bulk Import", "Actions", "Preview label", "Preview rows", { maxLength: 40, previewPath: "/dashboard" }),
  field("bulkImport.actions.create", "Product", "Bulk Import", "Actions", "Create label", "Create valid Profiles", { maxLength: 50, previewPath: "/dashboard" }),
  field("bulkImport.empty", "Product", "Bulk Import", "States", "Empty message", "Paste tab- or comma-separated inventory to begin.", { maxLength: 150, previewPath: "/dashboard" }),

  field("account.profile.heading", "Product", "Account", "Profile", "Section heading", "Account profile", { maxLength: 70, previewPath: "/account" }),
  field("account.security.heading", "Product", "Account", "Security", "Section heading", "Security", { maxLength: 70, previewPath: "/account" }),
  field("account.collection.heading", "Product", "Account", "Collection", "Section heading", "Collection identity", { maxLength: 70, previewPath: "/account" }),
  field("account.notifications.heading", "Product", "Account", "Notifications", "Section heading", "Notifications", { maxLength: 70, previewPath: "/account" }),
  field("account.actions.save", "Product", "Account", "Actions", "Save label", "Save account", { maxLength: 40, previewPath: "/account" }),
  field("account.actions.reset", "Product", "Account", "Actions", "Reset label", "Send password reset", { maxLength: 50, previewPath: "/account" }),

  field("collections.hero.body", "Product", "Public Collections", "Header", "Body", "Share your Public Profiles through one collection page you control.", { maxLength: 220, previewPath: "/account?section=collection" }),
  field("collections.empty.title", "Product", "Public Collections", "Empty state", "Title", "No Profiles are visible in this collection yet.", { maxLength: 100, previewPath: "/account?section=collection" }),
  field("collections.empty.body", "Product", "Public Collections", "Empty state", "Body", "Choose which Public Profiles to feature from your account workspace.", { maxLength: 200, previewPath: "/account?section=collection" }),
  field("collections.results.count", "Product", "Public Collections", "Results", "Results count", "{count} Profiles", { allowedVariables: ["count"], maxLength: 60, previewPath: "/catalog" }),
  field("collections.empty.filteredTitle", "Product", "Public Collections", "Empty state", "Filtered empty title", "No Profiles match these filters.", { maxLength: 100, previewPath: "/catalog" }),
  field("collections.empty.filteredBody", "Product", "Public Collections", "Empty state", "Filtered empty body", "Try a broader search or filter.", { maxLength: 180, previewPath: "/catalog" }),
  field("collections.actions.save", "Product", "Public Collections", "Actions", "Save label", "Save collection", { maxLength: 40, previewPath: "/account?section=collection" }),
  field("profile.empty.service", "Product", "Public Profile", "Empty states", "Service empty state", "No service entries yet.", { maxLength: 130, previewPath: "/catalog" }),
  field("profile.empty.media", "Product", "Public Profile", "Empty states", "Media empty state", "No supplemental media yet.", { maxLength: 130, previewPath: "/catalog" }),
  field("profile.empty.documents", "Product", "Public Profile", "Empty states", "Documents empty state", "No public documents yet.", { maxLength: 130, previewPath: "/catalog" }),
  field("profile.empty.timeline", "Product", "Public Profile", "Empty states", "Timeline empty state", "No additional Timeline events yet.", { maxLength: 130, previewPath: "/catalog" }),
  field("gallery.heading", "Product", "Gallery", "Viewer", "Heading", "Instrument gallery", { maxLength: 70, previewPath: "/catalog" }),
  field("gallery.close", "Product", "Gallery", "Actions", "Close label", "Close gallery", { maxLength: 40, previewPath: "/catalog" }),
  field("media.heading", "Product", "Media", "Section", "Heading", "Media", { maxLength: 50, previewPath: "/catalog" }),
  field("documents.heading", "Product", "Documents", "Section", "Heading", "Documents", { maxLength: 50, previewPath: "/catalog" }),
  field("printWorkspace.title", "Product", "Print Workspace", "Header", "Title", "Print Suite", { maxLength: 80, previewPath: "/dashboard" }),
  field("printWorkspace.body", "Product", "Print Workspace", "Header", "Body", "Choose a format, control what appears, and print a QR that opens the permanent Profile.", { maxLength: 220, previewPath: "/dashboard" }),
  field("printWorkspace.handout", "Product", "Print Workspace", "Modes", "Profile sheet label", "Profile Sheet", { maxLength: 50, previewPath: "/dashboard" }),
  field("printWorkspace.label", "Product", "Print Workspace", "Modes", "QR label label", "QR Label", { maxLength: 40, previewPath: "/dashboard" }),
  field("printWorkspace.hangtag", "Product", "Print Workspace", "Modes", "Hang tag label", "Hang Tag", { maxLength: 40, previewPath: "/dashboard" }),
  field("printWorkspace.service", "Product", "Print Workspace", "Modes", "Service summary label", "Service Summary", { maxLength: 50, previewPath: "/dashboard" }),
  field("printWorkspace.print", "Product", "Print Workspace", "Actions", "Print label", "Print This Format", { maxLength: 40, previewPath: "/dashboard" }),
  field("printWorkspace.reset", "Product", "Print Workspace", "Actions", "Reset label", "Reset", { maxLength: 30, previewPath: "/dashboard" }),
  field("printWorkspace.publicCopy", "Product", "Print Workspace", "Copy type", "Public-safe copy", "Public-safe copy", { maxLength: 50, previewPath: "/dashboard" }),
  field("printWorkspace.ownerCopy", "Product", "Print Workspace", "Copy type", "Owner copy", "Owner copy", { maxLength: 50, previewPath: "/dashboard" }),

  field("serviceProviders.hero.body", "Workflows", "Service Providers", "Header", "Body", "Send completed work to the Profile owner for review. Nothing is added to the public Profile until the owner approves it.", { maxLength: 250, previewPath: "/service-work/preview" }),
  field("serviceProviders.privateNote.label", "Workflows", "Service Providers", "Owner review", "Private note label", "Private provider note", { maxLength: 70, previewPath: "/service-work/preview" }),
  field("serviceProviders.privateNote.help", "Workflows", "Service Providers", "Owner review", "Private note help", "Visible only to authorized participants and QRguitar admins.", { maxLength: 180, previewPath: "/service-work/preview" }),
  field("serviceProviders.evidence.label", "Workflows", "Service Providers", "Evidence", "Evidence label", "Private evidence", { maxLength: 70, previewPath: "/service-work/preview" }),
  field("serviceProviders.evidence.help", "Workflows", "Service Providers", "Evidence", "Evidence help", "Upload invoices, before/after photos, or other files that help document the work. Evidence is not public by default.", { maxLength: 240, previewPath: "/service-work/preview" }),
  field("serviceProviders.actions.draft", "Workflows", "Service Providers", "Actions", "Draft label", "Save Draft", { maxLength: 40, previewPath: "/service-work/preview" }),
  field("serviceProviders.actions.submit", "Workflows", "Service Providers", "Actions", "Submit label", "Submit for Owner Review", { maxLength: 50, previewPath: "/service-work/preview" }),
  field("serviceProviders.empty.title", "Workflows", "Service Providers", "States", "Empty title", "No service work is waiting.", { maxLength: 90, previewPath: "/service-work/preview" }),
  field("serviceReview.hero.body", "Workflows", "Service Review", "Header", "Body", "Check the provider, work performed, and private evidence before deciding what should be added to the Profile.", { maxLength: 250, previewPath: "/dashboard" }),
  field("serviceReview.actions.approve", "Workflows", "Service Review", "Actions", "Approve label", "Approve", { maxLength: 50, previewPath: "/dashboard" }),
  field("serviceReview.actions.revise", "Workflows", "Service Review", "Actions", "Revision label", "Request Changes", { maxLength: 40, previewPath: "/dashboard" }),
  field("serviceReview.actions.decline", "Workflows", "Service Review", "Actions", "Decline label", "Decline", { maxLength: 30, previewPath: "/dashboard" }),
  field("claimCenter.status.pending", "Workflows", "Ownership Claims", "Status guidance", "Pending", "A QRguitar administrator is reviewing the claim evidence.", { maxLength: 180, previewPath: "/ownership-claim" }),
  field("claimCenter.status.moreInfo", "Workflows", "Ownership Claims", "Status guidance", "More information", "More information is needed before the claim can be decided.", { maxLength: 180, previewPath: "/ownership-claim" }),
  field("claimCenter.security.warning", "Workflows", "Ownership Claims", "Security", "Locked warning", "A QR scan or Serial Number identifies a Profile. It never proves or transfers ownership by itself.", { maxLength: 240, classification: "security-locked", previewPath: "/ownership-claim" }),
  field("transfers.hero.body", "Workflows", "Ownership Transfers", "Header", "Body", "The current owner invites the recipient, who signs in and accepts before ownership changes.", { maxLength: 240, previewPath: "/dashboard" }),
  field("transfers.actions.start", "Workflows", "Ownership Transfers", "Actions", "Start label", "Start transfer", { maxLength: 40, previewPath: "/dashboard" }),
  field("transfers.actions.cancel", "Workflows", "Ownership Transfers", "Actions", "Cancel label", "Cancel transfer", { maxLength: 40, previewPath: "/dashboard" }),

  field("login.sessionExpired", "Support & Legal", "Login", "Session guidance", "Expired session message", "Your session expired. Please sign in again.", { maxLength: 140, classification: "security-locked", previewPath: "/login" }),
  field("login.actions.submit", "Support & Legal", "Login", "Actions", "Sign-in label", "Sign in", { maxLength: 30, previewPath: "/login" }),
  field("login.actions.create", "Support & Legal", "Login", "Actions", "Create-account label", "Create account", { maxLength: 40, previewPath: "/login" }),
  field("login.actions.createLong", "Support & Legal", "Login", "Actions", "Create-account link", "Create an account", { maxLength: 40, previewPath: "/login" }),
  field("login.actions.forgot", "Support & Legal", "Login", "Actions", "Forgot-password label", "Forgot password?", { maxLength: 40, previewPath: "/login" }),
  field("resetPassword.sent", "Support & Legal", "Reset Password", "States", "Sent message", "Check your email for a secure password reset link.", { maxLength: 160, previewPath: "/reset-password" }),
  field("resetPassword.actions.submit", "Support & Legal", "Reset Password", "Actions", "Send label", "Send reset link", { maxLength: 40, previewPath: "/reset-password" }),
  field("contact.hero.eyebrow", "Support & Legal", "Contact", "Header", "Eyebrow", "SUPPORT", { maxLength: 40, previewPath: "/contact" }),
  field("contact.support.heading", "Support & Legal", "Contact", "Support", "Heading", "What to include", { maxLength: 50, previewPath: "/contact" }),
  field("contact.support.body", "Support & Legal", "Contact", "Support", "Security note", "Never email passwords, payment-card numbers, reset links, or unrelated personal documents.", { maxLength: 220, previewPath: "/contact" }),
  field("contact.support.cta", "Support & Legal", "Contact", "Support", "Email action", "Email support", { maxLength: 40, previewPath: "/contact" }),
  field("privacy.hero.intro", "Support & Legal", "Privacy", "Header", "Introduction", "QRguitar lets you choose what stays public and what stays private. Public Profiles can appear in the Catalog. Unlisted Profiles work by direct link. Private Profiles are available only to the owner and authorized QRguitar admins.", { maxLength: 700, previewPath: "/privacy" }),
  field("privacy.sections.visibility.heading", "Support & Legal", "Privacy", "Visibility", "Heading", "Public, Unlisted, and Private", { maxLength: 100, previewPath: "/privacy" }),
  field("privacy.sections.visibility.body", "Support & Legal", "Privacy", "Visibility", "Body", "Public Profiles can appear in the Catalog. Unlisted Profiles stay out of the Catalog but work by direct link or QR. Private Profiles are available only to the owner and authorized QRguitar admins.", { maxLength: 700, previewPath: "/privacy" }),
  field("privacy.sections.serial.heading", "Support & Legal", "Privacy", "Serial Number", "Heading", "Serial Number and private files", { maxLength: 100, previewPath: "/privacy" }),
  field("privacy.sections.serial.body", "Support & Legal", "Privacy", "Serial Number", "Body", "You can hide the separate Serial Number field on a Public Profile without changing the QRguitar ID or permanent QR. Private notes, private documents, and private supporting files are not shown publicly.", { maxLength: 700, previewPath: "/privacy" }),
  field("privacy.sections.documents.heading", "Support & Legal", "Privacy", "Documents", "Heading", "Documents and safety", { maxLength: 100, previewPath: "/privacy" }),
  field("privacy.sections.documents.body", "Support & Legal", "Privacy", "Documents", "Body", "Files marked public can appear on the Profile. Private files remain restricted. Lost or stolen alerts appear publicly only when set through the authorized safety controls.", { maxLength: 700, previewPath: "/privacy" }),
  field("privacy.sections.security.heading", "Support & Legal", "Privacy", "Account data", "Heading", "Account data", { maxLength: 100, previewPath: "/privacy" }),
  field("privacy.sections.security.body", "Support & Legal", "Privacy", "Account data", "Body", "QRguitar uses account email, authentication data, and support messages to provide account access, ownership, service, transfers, safety tools, and support. QRguitar does not sell private user data.", { maxLength: 700, previewPath: "/privacy" }),
  field("privacy.finalNote", "Support & Legal", "Privacy", "Safety", "Final note", "Do not upload passwords, payment-card numbers, private reset links, unrelated personal documents, or files you do not have the right to store.", { maxLength: 360, previewPath: "/privacy" }),
  field("terms.hero.intro", "Support & Legal", "Terms", "Header", "Introduction", "QRguitar is currently in public beta. These terms explain the basic rules for creating, managing, sharing, and transferring QRguitar Profiles.", { maxLength: 500, previewPath: "/terms" }),
  field("terms.sections.content.heading", "Support & Legal", "Terms", "Content", "Heading", "Your content", { maxLength: 100, previewPath: "/terms" }),
  field("terms.sections.content.body", "Support & Legal", "Terms", "Content", "Body", "Keep account access secure and provide accurate Serial Number and instrument information. Upload only media and documents you are authorized to use. You keep responsibility for the content you add.", { maxLength: 700, previewPath: "/terms" }),
  field("terms.sections.ids.heading", "Support & Legal", "Terms", "Identity", "Heading", "QRguitar IDs and Profile URLs", { maxLength: 100, previewPath: "/terms" }),
  field("terms.sections.ids.body", "Support & Legal", "Terms", "Identity", "Body", "QRguitar IDs and Profile URLs are designed to remain associated with the instrument as Profile details change. Availability can still depend on third-party networks, browsers, storage, and hosting services.", { maxLength: 700, previewPath: "/terms" }),
  field("terms.sections.verification.heading", "Support & Legal", "Terms", "Verification", "Heading", "Verification and authenticity", { maxLength: 100, previewPath: "/terms" }),
  field("terms.sections.verification.body", "Support & Legal", "Terms", "Verification", "Body", "Verification and authenticity review reflect the evidence available at the time. They are not an appraisal, insurance guarantee, guarantee of condition, or guarantee against undisclosed changes.", { maxLength: 700, previewPath: "/terms" }),
  field("terms.sections.ownership.heading", "Support & Legal", "Terms", "Safety and ownership", "Heading", "Safety and ownership", { maxLength: 100, previewPath: "/terms" }),
  field("terms.sections.ownership.body", "Support & Legal", "Terms", "Safety and ownership", "Body", "Lost or stolen reports must be truthful. Ownership transfers and claims must be submitted by authorized people. QRguitar tools do not replace legal title, receipts, or independent due diligence. Abuse, fraud, impersonation, or infringing uploads may result in account restrictions.", { maxLength: 700, previewPath: "/terms" }),
  field("terms.sections.beta.heading", "Support & Legal", "Terms", "Beta", "Heading", "Beta and paid services", { maxLength: 100, previewPath: "/terms" }),
  field("terms.sections.beta.body", "Support & Legal", "Terms", "Beta", "Body", "QRguitar is in public beta. Features, limits, and paid services may change. No checkout or payment flow is live unless it is clearly presented inside the product when you use it.", { maxLength: 700, previewPath: "/terms" }),
  field("terms.sections.support.heading", "Support & Legal", "Terms", "Support", "Heading", "Support", { maxLength: 100, previewPath: "/terms" }),
  field("terms.sections.support.body", "Support & Legal", "Terms", "Support", "Body", "Questions about these terms can be sent to support@qrguitar.com.", { maxLength: 300, previewPath: "/terms" })
];

type EmailTemplateDefinition = {
  id: string;
  page: string;
  section: string;
  subject: string;
  heading: string;
  body: string;
  cta: string;
  variables: string[];
};

function emailTemplate(definition: EmailTemplateDefinition): ContentRegistryEntry[] {
  const options = { allowedVariables: definition.variables };
  return [
    field(`email.${definition.id}.subject`, "Emails", definition.page, definition.section, "Subject", definition.subject, { ...options, maxLength: 120 }),
    field(`email.${definition.id}.preheader`, "Emails", definition.page, definition.section, "Preheader", definition.body.slice(0, 150), { ...options, maxLength: 180 }),
    field(`email.${definition.id}.heading`, "Emails", definition.page, definition.section, "Heading", definition.heading, { ...options, maxLength: 110 }),
    field(`email.${definition.id}.body`, "Emails", definition.page, definition.section, "Body", definition.body, { ...options, maxLength: 700 }),
    field(`email.${definition.id}.cta`, "Emails", definition.page, definition.section, "Button label", definition.cta, { allowedVariables: [], maxLength: 60 }),
    field(`email.${definition.id}.footer`, "Emails", definition.page, definition.section, "Footer", "QRguitar · Permanent instrument identity and history", { allowedVariables: [], maxLength: 160 })
  ];
}

const emailRegistry = [
  { id: "service.submitted", page: "Service", section: "Submitted", subject: "Service work submitted for {{profile_title}}", heading: "Service work is ready for review", body: "{{provider_name}} submitted service work for {{profile_title}}. Review the details before they are added to the Profile.", cta: "Review service work", variables: ["profile_title", "profile_url", "provider_name", "review_url"] },
  { id: "service.revisionRequested", page: "Service", section: "Revision requested", subject: "A revision was requested for {{profile_title}}", heading: "Please revise the service entry", body: "The owner requested more information about the submitted service work for {{profile_title}}.", cta: "Revise service work", variables: ["profile_title", "profile_url", "provider_name", "review_url"] },
  { id: "service.resubmitted", page: "Service", section: "Resubmitted", subject: "Revised service work for {{profile_title}}", heading: "Revised service work is ready", body: "{{provider_name}} updated the service entry for {{profile_title}}. Review the revision before approving it.", cta: "Review revision", variables: ["profile_title", "profile_url", "provider_name", "review_url"] },
  { id: "service.approved", page: "Service", section: "Approved", subject: "Service work approved for {{profile_title}}", heading: "The service entry was approved", body: "The submitted service work is now part of the history for {{profile_title}}.", cta: "Open Profile", variables: ["profile_title", "profile_url", "provider_name"] },
  { id: "service.declined", page: "Service", section: "Declined", subject: "Service work was not approved for {{profile_title}}", heading: "The service entry was declined", body: "The submitted service work was not added to {{profile_title}}. Sign in to review the status.", cta: "View status", variables: ["profile_title", "profile_url", "provider_name", "review_url"] },
  { id: "service.cancelled", page: "Service", section: "Cancelled", subject: "Service submission cancelled for {{profile_title}}", heading: "The service submission was cancelled", body: "The pending service submission for {{profile_title}} is no longer active.", cta: "Open QRguitar", variables: ["profile_title", "profile_url", "provider_name"] },
  { id: "ownership.transferInvitation", page: "Ownership", section: "Transfer invitation", subject: "A QRguitar ownership transfer is waiting", heading: "Review the ownership handoff", body: "{{sender_name}} started a secure ownership handoff for {{profile_title}}. Sign in and review it before accepting.", cta: "Review transfer", variables: ["profile_title", "profile_url", "sender_name", "claim_url"] },
  { id: "ownership.transferAccepted", page: "Ownership", section: "Transfer accepted", subject: "Ownership transfer accepted for {{profile_title}}", heading: "The ownership handoff is complete", body: "The recipient accepted the transfer for {{profile_title}}. The permanent Profile and QRguitar ID did not change.", cta: "Open Profile", variables: ["profile_title", "profile_url", "sender_name"] },
  { id: "ownership.transferCancelled", page: "Ownership", section: "Transfer cancelled", subject: "Ownership transfer cancelled for {{profile_title}}", heading: "The ownership handoff was cancelled", body: "The pending transfer for {{profile_title}} is no longer active. Ownership did not change.", cta: "Open Profile", variables: ["profile_title", "profile_url", "sender_name"] },
  { id: "ownership.storeHandoff", page: "Ownership", section: "Store handoff", subject: "Claim your QRguitar Profile for {{profile_title}}", heading: "Your instrument Profile is ready", body: "A shop or builder prepared {{profile_title}} for you. Sign in to review the secure handoff.", cta: "Review handoff", variables: ["profile_title", "profile_url", "sender_name", "claim_url"] },
  { id: "claim.submitted", page: "Ownership Claims", section: "Claim submitted", subject: "Ownership claim received for {{profile_title}}", heading: "Your claim is under review", body: "QRguitar received your ownership claim for {{profile_title}}. We will notify you when the status changes.", cta: "View claim", variables: ["profile_title", "profile_url", "claim_url"] },
  { id: "claim.ownerReview", page: "Ownership Claims", section: "Current-owner review", subject: "Ownership claim needs your review", heading: "Review a claim for {{profile_title}}", body: "A user submitted an ownership claim for {{profile_title}}. Review the evidence from your account before responding.", cta: "Review claim", variables: ["profile_title", "profile_url", "claim_url"] },
  { id: "claim.moreInfo", page: "Ownership Claims", section: "More information", subject: "More information needed for {{profile_title}}", heading: "Please add claim information", body: "QRguitar needs more information before deciding the ownership claim for {{profile_title}}.", cta: "Update claim", variables: ["profile_title", "profile_url", "claim_url"] },
  { id: "claim.approved", page: "Ownership Claims", section: "Approved", subject: "Ownership claim approved for {{profile_title}}", heading: "Your ownership claim was approved", body: "The ownership record for {{profile_title}} has been updated through the reviewed claim process.", cta: "Open Profile", variables: ["profile_title", "profile_url", "claim_url"] },
  { id: "claim.declined", page: "Ownership Claims", section: "Declined", subject: "Ownership claim decision for {{profile_title}}", heading: "Your ownership claim was not approved", body: "The submitted evidence was not sufficient to update ownership for {{profile_title}}. Sign in to review the decision.", cta: "View claim", variables: ["profile_title", "profile_url", "claim_url"] },
  { id: "claim.expired", page: "Ownership Claims", section: "Expired or cancelled", subject: "Ownership claim closed for {{profile_title}}", heading: "The ownership claim is closed", body: "The claim for {{profile_title}} expired or was cancelled without changing ownership.", cta: "Open QRguitar", variables: ["profile_title", "profile_url", "claim_url"] },
  { id: "notification.lostStolen", page: "Safety", section: "Lost or stolen", subject: "Safety alert updated for {{profile_title}}", heading: "Instrument safety status updated", body: "The safety status for {{profile_title}} is now {{safety_status}}. Open the Profile for the public recovery details.", cta: "Open Profile", variables: ["profile_title", "profile_url", "safety_status"] },
  { id: "security.passwordReset", page: "Security", section: "Password reset", subject: "Reset your QRguitar password", heading: "Choose a new password", body: "Use the secure link below to choose a new password. If you did not request this, no action is required.", cta: "Reset password", variables: ["reset_url"] },
  { id: "security.accountNotice", page: "Security", section: "Account notice", subject: "QRguitar account security notice", heading: "Review your account activity", body: "A security-sensitive change occurred on your QRguitar account. Sign in directly at qrguitar.com to review it.", cta: "Open account", variables: ["account_url"] }
].flatMap(emailTemplate);

type SeoDefinition = { id: string; page: string; path: string; title: string; description: string; indexable?: boolean };

function seoPage(definition: SeoDefinition): ContentRegistryEntry[] {
  const classification: ContentClassification = definition.indexable === false ? "security-locked" : "editable-standard";
  return [
    field(`seo.${definition.id}.title`, "SEO", "Per-page SEO", definition.page, "Search title", definition.title, { maxLength: 70, previewPath: definition.path, classification }),
    field(`seo.${definition.id}.description`, "SEO", "Per-page SEO", definition.page, "Search description", definition.description, { maxLength: 180, previewPath: definition.path, classification }),
    field(`seo.${definition.id}.ogTitle`, "SEO", "Per-page SEO", definition.page, "Social title", definition.title, { maxLength: 90, previewPath: definition.path, classification }),
    field(`seo.${definition.id}.ogDescription`, "SEO", "Per-page SEO", definition.page, "Social description", definition.description, { maxLength: 220, previewPath: definition.path, classification }),
    field(`seo.${definition.id}.image`, "SEO", "Per-page SEO", definition.page, "Social image", "/seo/qrguitar-og-v2.png", { type: "url", maxLength: 500, previewPath: definition.path, classification }),
    field(`seo.${definition.id}.indexing`, "SEO", "Per-page SEO", definition.page, "Indexing state", definition.indexable === false ? "noindex, nofollow" : "index, follow", { maxLength: 40, previewPath: definition.path, classification: definition.indexable === false ? "security-locked" : "editable-advanced" })
  ];
}

const seoRegistry: ContentRegistryEntry[] = [
  field("seo.global.title", "SEO", "Global SEO", "Defaults", "Site title", "QRguitar | Permanent Instrument Profiles", { maxLength: 70, previewPath: "/" }),
  field("seo.global.description", "SEO", "Global SEO", "Defaults", "Description", "Permanent QRguitar Profiles for instruments, service history, ownership, provenance, and future owners.", { maxLength: 180, previewPath: "/" }),
  field("seo.global.image", "SEO", "Open Graph defaults", "Social cards", "Default image URL", "/seo/qrguitar-og-v2.png", { type: "url", maxLength: 500, previewPath: "/" }),
  ...[
    { id: "home", page: "Homepage", path: "/", title: "QRguitar | Permanent Instrument Profiles", description: "Create a permanent QRguitar Profile with photos, specifications, service history, ownership tools, and a QR code that stays with the instrument." },
    { id: "howItWorks", page: "How It Works", path: "/how-it-works", title: "How QRguitar Works | QRguitar", description: "Learn how QRguitar connects instrument identity, service history, documents, ownership, privacy controls, and permanent QR codes." },
    { id: "catalog", page: "Catalog", path: "/catalog", title: "Browse QRguitar Profiles | QRguitar", description: "Explore Public QRguitar Profiles by brand, type, availability, trust status, and instrument history." },
    { id: "installers", page: "Installers", path: "/installers", title: "QR Installation and Hardware | QRguitar", description: "Explore QR stickers, tags, plates, and installation support for instruments, shops, builders, and inventory." },
    { id: "contact", page: "Contact", path: "/contact", title: "QRguitar Support and Contact", description: "Get help with QRguitar accounts, Profiles, QR codes, ownership handoffs, verification, and service workflows." },
    { id: "privacy", page: "Privacy", path: "/privacy", title: "Privacy | QRguitar", description: "Understand QRguitar Profile visibility, Serial Number privacy, account data, documents, and public information controls." },
    { id: "terms", page: "Terms", path: "/terms", title: "Terms | QRguitar", description: "Review the terms for QRguitar accounts, Profile content, ownership tools, acceptable use, and platform access." },
    { id: "collections", page: "Public Collection defaults", path: "/collections", title: "Instrument Collection | QRguitar", description: "Explore a privacy-controlled public collection of QRguitar instrument Profiles." },
    { id: "dashboard", page: "Dashboard (protected)", path: "/dashboard", title: "Dashboard | QRguitar", description: "Private QRguitar owner workspace.", indexable: false },
    { id: "account", page: "Account (protected)", path: "/account", title: "Account | QRguitar", description: "Private QRguitar account workspace.", indexable: false },
    { id: "admin", page: "Admin (protected)", path: "/admin", title: "Admin | QRguitar", description: "Protected QRguitar administration.", indexable: false }
  ].flatMap(seoPage)
];

export const contentRegistry: ContentRegistryEntry[] = Array.from(
  new Map([...coreContentRegistry, ...completionRegistry, ...emailRegistry, ...seoRegistry].map((entry) => [entry.key, entry])).values()
);

export type ContentCoverageEntry = {
  source: string;
  classification: ContentClassification;
  reason: string;
};

export const contentCoverageManifest: ContentCoverageEntry[] = [
  { source: "contentRegistry", classification: "editable-standard", reason: "Marketing, product, workflow, support, legal, email, and SEO copy managed in Content Studio." },
  { source: "contentRegistry advanced fields", classification: "editable-advanced", reason: "System labels and indexing controls that require deliberate review." },
  { source: "authorization and ownership warnings", classification: "security-locked", reason: "Wording protects access, ownership, and privacy guarantees and cannot be weakened in Content Studio." },
  { source: "Profile titles, IDs, Serial Numbers, dates, status, counts, user content", classification: "data-derived", reason: "Rendered from the current record or account and never stored as site copy." },
  { source: "browser validation, password managers, print dialogs, native share sheets", classification: "browser-platform", reason: "Rendered by the browser or operating system outside application control." }
];

export const contentCoverageSummary = {
  totalKeys: contentRegistry.length,
  editableStandard: contentRegistry.filter((entry) => entry.classification === "editable-standard").length,
  editableAdvanced: contentRegistry.filter((entry) => entry.classification === "editable-advanced").length,
  securityLocked: contentRegistry.filter((entry) => entry.classification === "security-locked").length,
  dataDerived: contentRegistry.filter((entry) => entry.classification === "data-derived").length,
  browserPlatform: contentRegistry.filter((entry) => entry.classification === "browser-platform").length,
  unresolved: 0
};

export const contentRegistryByKey = new Map(contentRegistry.map((entry) => [entry.key, entry]));

export const defaultContentValues: Record<string, string> = Object.fromEntries(
  contentRegistry.map((entry) => [entry.key, entry.defaultValue])
);

const legacyContentDefaults: Record<string, string[]> = {
  "global.brand.tagline": ["Permanent QRguitar Profiles for instruments, builders, shops, collectors, and future owners."],
  "global.navigation.create": ["Create"],
  "global.footer.description": ["Permanent QRguitar Profiles for instruments, builders, shops, collectors, and future owners."],
  "home.hero.eyebrow": ["Permanent identity for instruments"],
  "home.hero.headline": ["Every instrument has a story. Keep it connected."],
  "home.hero.body": ["Create a permanent QRguitar Profile with photos, specifications, service history, ownership records, and a QR code that stays with the instrument."],
  "home.hero.primaryCta": ["Create Profile"],
  "home.hero.secondaryCta": ["Browse QRguitar Profiles"],
  "home.roles.body": ["Choose the view that matches how you work with instruments."],
  "home.lifecycle.headline": ["Start with the instrument. Build the history over time."],
  "home.lifecycle.body": ["Add the facts you know today, then keep photos, service, documents, and ownership connected as the instrument changes hands."],
  "home.pricing.headline": ["Free Profiles during public beta."],
  "home.pricing.body": [
    "Create and maintain QRguitar Profiles without a hard paywall while the registry grows. Paid help is available separately.",
    "Create Profiles during public beta, or ask QRguitar for hands-on commercial setup."
  ],
  "home.finalCta.headline": ["Give the next instrument a permanent place to live."],
  "home.finalCta.body": ["Create a Profile in minutes and keep improving it for years."],
  "home.finalCta.eyebrow": ["Ready when the instrument is", "READY TO BEGIN"],
  "home.finalCta.primaryCta": ["Create Profile"],
  "home.finalCta.secondaryCta": ["Browse Profiles"],
  "home.archive.eyebrow": ["The living archive"],
  "home.archive.heading": ["Explore the archive"],
  "home.continuity.eyebrow": ["History that stays useful"],
  "home.continuity.headline": ["One Profile, through the work and every handoff."],
  "home.continuity.body": ["QRguitar keeps the instrument's identity connected while owners decide which service, documents, and history become public."],
  "home.continuity.cta": ["See the full workflow"],
  "howItWorks.hero.eyebrow": ["How QRguitar works"],
  "howItWorks.hero.headline": ["One permanent Profile for every instrument."],
  "howItWorks.hero.body": ["Create or find a QRguitar Profile, add the instrument's identity and history, then keep it connected through every owner."],
  "howItWorks.lifecycle.heading": ["A Profile that grows with the instrument"],
  "howItWorks.features.heading": ["Keep the useful details together"],
  "howItWorks.privacy.heading": ["You control what the public can see"],
  "howItWorks.roles.heading": ["Built for players, collectors, shops, and builders"],
  "catalog.hero.eyebrow": ["The Catalog"],
  "catalog.hero.headline": ["Browse QRguitar Profiles"],
  "catalog.hero.body": ["Explore QRguitar Profiles by brand, category, trust status, availability, and history."],
  "catalog.empty.body": ["Clear a filter or search for another instrument."],
  "catalog.results.all": ["{count} Public Profiles"],
  "catalog.actions.reset": ["Reset filters"],
  "profile.tabs.specifications": ["Specifications"],
  "dashboard.hero.headline": ["Owner dashboard"],
  "dashboard.hero.body": [
    "Manage your Profiles, photos, documents, visibility, QR downloads, service, and ownership tools.",
    "Manage Profiles, photos, privacy, service, ownership, QR downloads, and print materials.",
    "Manage profiles, photos, documents, visibility, and QR downloads from your dashboard."
  ],
  "dashboard.actions.create": ["Create a Profile"],
  "dashboard.actions.claims": ["Claim Center"],
  "dashboard.collection.title": ["Your collection"],
  "account.hero.headline": ["Your QRguitar account"],
  "account.hero.body": ["Manage your profile, security, collection identity, and account preferences in one place."],
  "claimCenter.hero.headline": ["Claim an instrument Profile safely"],
  "claimCenter.hero.body": ["Choose the situation that matches how you received the instrument. QR scans and Serial Numbers identify Profiles; they never prove ownership by themselves."],
  "create.hero.headline": ["Create a QRguitar Profile"],
  "create.hero.body": ["Start with the instrument identity and at least one real photo. You can add service, documents, and ownership history later."],
  "create.serial.help": ["When provided, the Serial Number becomes the readable suffix of the QRguitar ID. Without one, QRguitar assigns a unique permanent ID."],
  "create.photo.help": ["Add at least one clear, real photo of the instrument. The first photo becomes the main image until you change it."],
  "bulkImport.hero.headline": ["Prepare multiple Profiles"],
  "bulkImport.hero.body": ["Paste or upload a reviewed inventory, preview validation, then create only the rows that pass every requirement."],
  "installers.hero.headline": ["Help instruments carry their Profile."],
  "installers.hero.body": ["QRguitar is assembling a small founding group of qualified shops for QR hardware, installation, and service-linked documentation."],
  "login.hero.headline": ["Sign in to QRguitar"],
  "login.hero.body": ["Manage your Profiles, collection, service history, documents, and ownership tools."],
  "contact.hero.body": ["Get help with an account, Profile, QR code, ownership handoff, verification review, or service workflow."],
  "privacy.hero.headline": ["Privacy at QRguitar"],
  "privacy.sections.dataCollected.heading": ["Information we collect"],
  "privacy.sections.dataCollected.body": ["We collect account information and the instrument details you choose to add so QRguitar can provide Profiles, ownership tools, service records, and support."],
  "privacy.sections.visibility.heading": ["Profile visibility"],
  "privacy.sections.visibility.body": ["Public Profiles can appear in the Catalog, Unlisted Profiles require a direct link, and Private Profiles remain in the owner workspace."],
  "privacy.sections.security.heading": ["Security and private data"],
  "privacy.sections.security.body": ["Private notes, private documents, transfer tokens, and account authentication data are not published in public Profile responses."],
  "terms.hero.headline": ["QRguitar terms"],
  "terms.sections.content.heading": ["Profile content"],
  "terms.sections.content.body": ["Add accurate instrument information and only upload media or documents you are authorized to use."],
  "terms.sections.ownership.heading": ["Ownership tools"],
  "terms.sections.ownership.body": ["QRguitar ownership tools organize platform records; they do not replace legal title, receipts, or independent due diligence."],
  "dashboard.card.open": ["View Profile"],
  "printWorkspace.title": ["QRguitar Print Kit"],
  "printWorkspace.handout": ["Customer Handout"],
  "printWorkspace.print": ["Print"]
};

export const contentAreas: ContentArea[] = [
  "Global",
  "Marketing",
  "Product",
  "Workflows",
  "Support & Legal",
  "Emails",
  "SEO"
];

export function mergeContentValues(value?: Record<string, unknown> | null) {
  const merged = { ...defaultContentValues };
  for (const entry of contentRegistry) {
    const candidate = value?.[entry.key];
    if (typeof candidate !== "string") continue;
    const clean = candidate.replace(/\u0000/g, "").slice(0, entry.maxLength);
    if (entry.required && !clean.trim()) continue;
    merged[entry.key] = legacyContentDefaults[entry.key]?.includes(clean) ? entry.defaultValue : clean;
  }
  return merged;
}

export function isSafeUrl(value: string) {
  return /^(https:\/\/|\/)/i.test(value.trim());
}

export function validateVariables(value: string, allowedVariables: string[] = []) {
  const variables = Array.from(value.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g), (match) => match[1]);
  return variables.find((name) => !allowedVariables.includes(name));
}

export function validateContentValues(value: Record<string, string>) {
  const errors: Record<string, string> = {};
  for (const entry of contentRegistry) {
    const candidate = String(value[entry.key] ?? "");
    if (entry.required && !candidate.trim()) {
      errors[entry.key] = "This field is required.";
      continue;
    }
    if (entry.minLength && candidate.trim().length < entry.minLength) {
      errors[entry.key] = `Use at least ${entry.minLength} characters.`;
      continue;
    }
    if (candidate.length > entry.maxLength) {
      errors[entry.key] = `Use no more than ${entry.maxLength} characters.`;
      continue;
    }
    if (entry.type === "email" && candidate && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
      errors[entry.key] = "Enter a valid email address.";
    }
    if (entry.type === "url" && candidate && !isSafeUrl(candidate)) {
      errors[entry.key] = "Use an absolute https URL or a site-relative path.";
    }
    if (entry.allowedVariables) {
      const invalid = validateVariables(candidate, entry.allowedVariables);
      if (invalid) errors[entry.key] = `Variable {{${invalid}}} is not allowed in this template.`;
    }
  }
  return errors;
}

export function getContentValue(values: Record<string, string> | undefined, key: string) {
  const entry = contentRegistryByKey.get(key);
  const value = values?.[key];
  if (typeof value !== "string") return entry?.defaultValue ?? "";

  const clean = value.replace(/\u0000/g, "").slice(0, entry?.maxLength || value.length);
  return legacyContentDefaults[key]?.includes(clean.trim()) ? entry?.defaultValue ?? clean : clean;
}

export function contentPagesForArea(area: ContentArea) {
  return Array.from(new Set(contentRegistry.filter((entry) => entry.area === area).map((entry) => entry.page)));
}
