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
  field("global.brand.tagline", "Global", "Brand", "Identity", "Tagline", "Permanent QRguitar Profiles for instruments, builders, shops, collectors, and future owners.", { maxLength: 180, previewPath: "/" }),
  field("global.navigation.dashboard", "Global", "Header & Navigation", "Primary navigation", "Dashboard label", "Dashboard", { maxLength: 30, previewPath: "/" }),
  field("global.navigation.catalog", "Global", "Header & Navigation", "Primary navigation", "Catalog label", "Catalog", { maxLength: 30, previewPath: "/" }),
  field("global.navigation.create", "Global", "Header & Navigation", "Primary navigation", "Create label", "Create", { maxLength: 30, previewPath: "/" }),
  field("global.navigation.howItWorks", "Global", "Header & Navigation", "Primary navigation", "How It Works label", "How It Works", { maxLength: 40, previewPath: "/" }),
  field("global.footer.description", "Global", "Footer", "Brand", "Footer description", "Permanent QRguitar Profiles for instruments, builders, shops, collectors, and future owners.", { maxLength: 220, previewPath: "/" }),
  field("global.footer.supportLabel", "Global", "Footer", "Support", "Support link label", "Support", { maxLength: 40, previewPath: "/contact" }),
  field("global.shared.emptyTitle", "Global", "Shared CTAs and states", "Empty states", "Default empty-state title", "Nothing here yet.", { maxLength: 80 }),
  field("global.shared.errorBody", "Global", "Shared CTAs and states", "Errors", "Default error message", "We could not complete that request. Please try again.", { maxLength: 180 }),

  field("home.hero.eyebrow", "Marketing", "Homepage", "Hero", "Eyebrow", "Permanent identity for instruments", { maxLength: 80, previewPath: "/" }),
  field("home.hero.headline", "Marketing", "Homepage", "Hero", "Headline", "Every instrument has a story. Keep it connected.", { maxLength: 110, previewPath: "/" }),
  field("home.hero.body", "Marketing", "Homepage", "Hero", "Body", "Create a permanent QRguitar Profile with photos, specifications, service history, ownership records, and a QR code that stays with the instrument.", { maxLength: 320, previewPath: "/" }),
  field("home.hero.primaryCta", "Marketing", "Homepage", "Hero", "Primary action", "Create Profile", { maxLength: 40, previewPath: "/" }),
  field("home.hero.secondaryCta", "Marketing", "Homepage", "Hero", "Secondary action", "Browse QRguitar Profiles", { maxLength: 50, previewPath: "/" }),
  field("home.lifecycle.headline", "Marketing", "Homepage", "How it works", "Section headline", "Start with the instrument. Build the history over time.", { maxLength: 130, previewPath: "/" }),
  field("home.lifecycle.body", "Marketing", "Homepage", "How it works", "Section body", "Add the facts you know today, then keep photos, service, documents, and ownership connected as the instrument changes hands.", { maxLength: 320, previewPath: "/" }),
  field("home.pricing.headline", "Marketing", "Homepage", "Public beta", "Pricing headline", "Free Profiles during public beta.", { maxLength: 100, previewPath: "/" }),
  field("home.pricing.body", "Marketing", "Homepage", "Public beta", "Pricing body", "Create and maintain QRguitar Profiles without a hard paywall while the registry grows. Paid help is available separately.", { maxLength: 260, previewPath: "/" }),
  field("home.finalCta.headline", "Marketing", "Homepage", "Closing action", "Headline", "Give the next instrument a permanent place to live.", { maxLength: 120, previewPath: "/" }),
  field("home.finalCta.body", "Marketing", "Homepage", "Closing action", "Body", "Create a Profile in minutes and keep improving it for years.", { maxLength: 180, previewPath: "/" }),
  field("home.archive.eyebrow", "Marketing", "Homepage", "Archive rail", "Eyebrow", "The living archive", { maxLength: 60, previewPath: "/" }),
  field("home.archive.heading", "Marketing", "Homepage", "Archive rail", "Heading", "Explore the archive", { maxLength: 100, previewPath: "/" }),

  field("howItWorks.hero.eyebrow", "Marketing", "How It Works", "Hero", "Eyebrow", "How QRguitar works", { maxLength: 70, previewPath: "/how-it-works" }),
  field("howItWorks.hero.headline", "Marketing", "How It Works", "Hero", "Headline", "One permanent Profile for every instrument.", { maxLength: 110, previewPath: "/how-it-works" }),
  field("howItWorks.hero.body", "Marketing", "How It Works", "Hero", "Body", "Create or find a QRguitar Profile, add the instrument's identity and history, then keep it connected through every owner.", { maxLength: 280, previewPath: "/how-it-works" }),
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

  field("catalog.hero.eyebrow", "Marketing", "Catalog", "Introduction", "Eyebrow", "The Catalog", { maxLength: 50, previewPath: "/catalog" }),
  field("catalog.hero.headline", "Marketing", "Catalog", "Introduction", "Headline", "Browse QRguitar Profiles", { maxLength: 90, previewPath: "/catalog" }),
  field("catalog.hero.body", "Marketing", "Catalog", "Introduction", "Body", "Explore Public Profiles by brand, type, status, availability, and history.", { maxLength: 220, previewPath: "/catalog" }),
  field("catalog.empty.title", "Marketing", "Catalog", "Empty state", "Title", "No Profiles match these filters.", { maxLength: 90, previewPath: "/catalog" }),
  field("catalog.empty.body", "Marketing", "Catalog", "Empty state", "Body", "Clear a filter or search for another instrument.", { maxLength: 150, previewPath: "/catalog" }),
  field("catalog.results.all", "Marketing", "Catalog", "Results", "All results label", "{count} Public Profiles", { allowedVariables: ["count"], maxLength: 70, previewPath: "/catalog" }),
  field("catalog.results.filtered", "Marketing", "Catalog", "Results", "Filtered results label", "{count} Results", { allowedVariables: ["count"], maxLength: 70, previewPath: "/catalog" }),
  field("catalog.actions.reset", "Marketing", "Catalog", "Actions", "Reset filters label", "Reset filters", { maxLength: 40, previewPath: "/catalog" }),
  field("cards.attribution.collection", "Marketing", "Shared CTAs and states", "Profile cards", "Collection attribution", "From the collection of", { maxLength: 60, previewPath: "/catalog" }),
  field("profile.attribution.collection", "Product", "Public Profile", "Attribution", "Collection attribution", "From the collection of", { maxLength: 60, previewPath: "/catalog" }),
  field("profile.gallery.label", "Product", "Public Profile", "Gallery", "Gallery label", "Instrument photo gallery", { maxLength: 70, previewPath: "/catalog" }),
  field("profile.gallery.previous", "Product", "Public Profile", "Gallery", "Previous photo label", "Previous photo", { maxLength: 40, previewPath: "/catalog" }),
  field("profile.gallery.next", "Product", "Public Profile", "Gallery", "Next photo label", "Next photo", { maxLength: 40, previewPath: "/catalog" }),
  field("profile.tabs.overview", "Product", "Public Profile", "Navigation", "Overview tab", "Overview", { maxLength: 30, previewPath: "/catalog" }),
  field("profile.tabs.specifications", "Product", "Public Profile", "Navigation", "Specifications tab", "Specifications", { maxLength: 30, previewPath: "/catalog" }),
  field("profile.tabs.timeline", "Product", "Public Profile", "Navigation", "Timeline tab", "Timeline", { maxLength: 30, previewPath: "/catalog" }),
  field("profile.tabs.media", "Product", "Public Profile", "Navigation", "Media tab", "Media", { maxLength: 30, previewPath: "/catalog" }),
  field("profile.tabs.documents", "Product", "Public Profile", "Navigation", "Documents tab", "Documents", { maxLength: 30, previewPath: "/catalog" }),
  field("home.anatomy.fallback", "Marketing", "Homepage", "Profile anatomy", "Fallback label", "A permanent identity for every instrument", { maxLength: 100, previewPath: "/" }),

  field("dashboard.hero.headline", "Product", "Dashboard", "Header", "Page title", "Owner dashboard", { maxLength: 90, previewPath: "/dashboard" }),
  field("dashboard.hero.body", "Product", "Dashboard", "Header", "Subtitle", "Manage your Profiles, photos, documents, visibility, QR downloads, service, and ownership tools.", { maxLength: 240, previewPath: "/dashboard" }),
  field("dashboard.collection.title", "Product", "Dashboard", "Collection", "Collection title", "Your collection", { maxLength: 70, previewPath: "/dashboard" }),
  field("dashboard.empty.title", "Product", "Dashboard", "Empty state", "Title", "Your first instrument starts here.", { maxLength: 90, previewPath: "/dashboard" }),
  field("dashboard.empty.body", "Product", "Dashboard", "Empty state", "Body", "Add one instrument and one real photo to create its permanent QRguitar Profile.", { maxLength: 200, previewPath: "/dashboard" }),
  field("dashboard.bulkImport.help", "Product", "Dashboard", "Bulk import", "Bulk import help", "Enrolled shops and brands can prepare up to 50 Profiles at a time from a reviewed inventory sheet.", { maxLength: 260, previewPath: "/dashboard" }),
  field("dashboard.actions.create", "Product", "Dashboard", "Actions", "Create action", "Create Profile", { maxLength: 40, previewPath: "/dashboard" }),

  field("create.hero.headline", "Product", "Create Profile", "Header", "Headline", "Create a QRguitar Profile", { maxLength: 100, previewPath: "/create" }),
  field("create.hero.body", "Product", "Create Profile", "Header", "Body", "Start with the instrument identity and at least one real photo. You can add service, documents, and ownership history later.", { maxLength: 280, previewPath: "/create" }),
  field("create.serial.help", "Product", "Create Profile", "Instrument identity", "Serial Number help", "When provided, the Serial Number becomes the readable suffix of the QRguitar ID. Without one, QRguitar assigns a unique permanent ID.", { maxLength: 310, previewPath: "/create" }),
  field("create.photo.help", "Product", "Create Profile", "Photos", "Photo help", "Add at least one clear, real photo of the instrument. The first photo becomes the main image until you change it.", { maxLength: 240, previewPath: "/create" }),
  field("create.privacy.help", "Product", "Create Profile", "Visibility", "Visibility help", "Public Profiles appear in the Catalog. Unlisted Profiles open only by direct link. Private Profiles stay in the owner workspace.", { maxLength: 300, previewPath: "/create" }),
  field("edit.hero.headline", "Product", "Edit Profile", "Header", "Headline", "Instrument workbench", { maxLength: 90, previewPath: "/dashboard" }),
  field("edit.save.success", "Product", "Edit Profile", "Feedback", "Save success", "Profile saved.", { maxLength: 80 }),
  field("bulkImport.hero.headline", "Product", "Bulk Import", "Header", "Headline", "Prepare multiple Profiles", { maxLength: 90, previewPath: "/dashboard" }),
  field("bulkImport.hero.body", "Product", "Bulk Import", "Header", "Body", "Paste or upload a reviewed inventory, preview validation, then create only the rows that pass every requirement.", { maxLength: 260, previewPath: "/dashboard" }),
  field("account.hero.headline", "Product", "Account", "Header", "Headline", "Your QRguitar account", { maxLength: 90, previewPath: "/account" }),
  field("account.hero.body", "Product", "Account", "Header", "Body", "Manage your profile, security, collection identity, and account preferences in one place.", { maxLength: 220, previewPath: "/account" }),
  field("collections.hero.headline", "Product", "Public Collections", "Header", "Headline", "A collection worth sharing", { maxLength: 100, previewPath: "/account?section=collection" }),
  field("profile.help.identity", "Product", "Public Profile", "Identity", "Identity helper", "The QRguitar ID and permanent URL stay with this Profile for life.", { maxLength: 180, previewPath: "/catalog" }),
  field("printWorkspace.scanInstruction", "Product", "Print Workspace", "Handout", "Scan instruction", "Scan to open the permanent QRguitar Profile.", { maxLength: 120, previewPath: "/dashboard" }),

  field("serviceProviders.hero.headline", "Workflows", "Service Providers", "Header", "Headline", "Service work that stays with the instrument", { maxLength: 110, previewPath: "/service-work/preview" }),
  field("serviceReview.hero.headline", "Workflows", "Service Review", "Header", "Headline", "Review submitted service history", { maxLength: 100, previewPath: "/dashboard" }),
  field("claimCenter.hero.headline", "Workflows", "Ownership Claims", "Header", "Headline", "Claim an instrument Profile safely", { maxLength: 110, previewPath: "/ownership-claim" }),
  field("claimCenter.hero.body", "Workflows", "Ownership Claims", "Header", "Body", "Choose the situation that matches how you received the instrument. QR scans and Serial Numbers identify Profiles; they never prove ownership by themselves.", { maxLength: 310, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.store.title", "Workflows", "Ownership Claims", "Scenarios", "Store purchase", "Purchased from a store", { maxLength: 80, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.store.body", "Workflows", "Ownership Claims", "Scenarios", "Store purchase guidance", "Use the recipient-bound invitation supplied by the store, or request a reviewed purchase claim.", { maxLength: 220, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.builder.title", "Workflows", "Ownership Claims", "Scenarios", "Brand or builder purchase", "Purchased from a brand or builder", { maxLength: 90, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.builder.body", "Workflows", "Ownership Claims", "Scenarios", "Brand or builder guidance", "Accept the issuer's secure handoff, or document the direct purchase for review.", { maxLength: 220, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.transfer.title", "Workflows", "Ownership Claims", "Scenarios", "Seller transfer", "The seller sent a transfer", { maxLength: 90, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.transfer.body", "Workflows", "Ownership Claims", "Scenarios", "Seller transfer guidance", "Ask the current owner to send a secure transfer invitation from their Dashboard.", { maxLength: 220, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.used.title", "Workflows", "Ownership Claims", "Scenarios", "Used purchase", "Purchased used without a transfer", { maxLength: 100, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.used.body", "Workflows", "Ownership Claims", "Scenarios", "Used purchase guidance", "Submit possession and purchase evidence without exposing it publicly.", { maxLength: 220, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.gift.title", "Workflows", "Ownership Claims", "Scenarios", "Gift or inheritance", "Received as a gift or inheritance", { maxLength: 100, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.gift.body", "Workflows", "Ownership Claims", "Scenarios", "Gift or inheritance guidance", "Use an owner transfer when possible, or submit gift or estate evidence for review.", { maxLength: 220, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.legacy.title", "Workflows", "Ownership Claims", "Scenarios", "Legacy Profile", "Claim an abandoned or legacy Profile", { maxLength: 110, previewPath: "/ownership-claim" }),
  field("claimCenter.scenarios.legacy.body", "Workflows", "Ownership Claims", "Scenarios", "Legacy Profile guidance", "Prove current possession with a private challenge photo and supporting evidence.", { maxLength: 220, previewPath: "/ownership-claim" }),
  field("transfers.hero.headline", "Workflows", "Ownership Transfers", "Header", "Headline", "A secure handoff to the next owner", { maxLength: 110, previewPath: "/dashboard" }),
  field("lostStolen.help", "Workflows", "Lost / Stolen", "Guidance", "Safety guidance", "Use a safety alert only when an instrument is genuinely lost or stolen. Public notes should help recovery without exposing private information.", { maxLength: 310, previewPath: "/dashboard" }),

  field("login.hero.headline", "Support & Legal", "Login", "Header", "Headline", "Sign in to QRguitar", { maxLength: 80, previewPath: "/login" }),
  field("login.hero.body", "Support & Legal", "Login", "Header", "Body", "Manage your Profiles, collection, service history, documents, and ownership tools.", { maxLength: 220, previewPath: "/login" }),
  field("resetPassword.hero.headline", "Support & Legal", "Reset Password", "Header", "Headline", "Reset your password", { maxLength: 80, previewPath: "/reset-password" }),
  field("resetPassword.hero.body", "Support & Legal", "Reset Password", "Header", "Body", "Enter the email used for your QRguitar account and we will send a secure reset link.", { maxLength: 220, previewPath: "/reset-password" }),
  field("contact.hero.headline", "Support & Legal", "Contact", "Header", "Headline", "How can we help?", { maxLength: 80, previewPath: "/contact" }),
  field("contact.hero.body", "Support & Legal", "Contact", "Header", "Body", "Get help with an account, Profile, QR code, ownership handoff, verification review, or service workflow.", { maxLength: 250, previewPath: "/contact" }),
  field("privacy.hero.headline", "Support & Legal", "Privacy", "Header", "Headline", "Privacy at QRguitar", { maxLength: 80, previewPath: "/privacy" }),
  field("privacy.sections.dataCollected.heading", "Support & Legal", "Privacy", "Information", "Information we collect heading", "Information we collect", { maxLength: 100, previewPath: "/privacy" }),
  field("privacy.sections.dataCollected.body", "Support & Legal", "Privacy", "Information", "Information we collect body", "We collect account information and the instrument details you choose to add so QRguitar can provide Profiles, ownership tools, service records, and support.", { maxLength: 700, previewPath: "/privacy" }),
  field("terms.hero.headline", "Support & Legal", "Terms", "Header", "Headline", "QRguitar terms", { maxLength: 80, previewPath: "/terms" }),
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

  field("home.lifecycle.step1.title", "Marketing", "Homepage", "How it works", "Step one title", "Create the identity", { maxLength: 70, previewPath: "/" }),
  field("home.lifecycle.step1.body", "Marketing", "Homepage", "How it works", "Step one body", "Add one real photo and the instrument details you know.", { maxLength: 180, previewPath: "/" }),
  field("home.lifecycle.step2.title", "Marketing", "Homepage", "How it works", "Step two title", "Build the history", { maxLength: 70, previewPath: "/" }),
  field("home.lifecycle.step2.body", "Marketing", "Homepage", "How it works", "Step two body", "Keep service, documents, photos, and ownership connected.", { maxLength: 180, previewPath: "/" }),
  field("home.lifecycle.step3.title", "Marketing", "Homepage", "How it works", "Step three title", "Scan and share", { maxLength: 70, previewPath: "/" }),
  field("home.lifecycle.step3.body", "Marketing", "Homepage", "How it works", "Step three body", "Use the permanent QR code wherever the instrument goes.", { maxLength: 180, previewPath: "/" }),
  field("pricing.beta.title", "Marketing", "Pricing", "Public beta", "Plan title", "Free Public Beta", { maxLength: 70, previewPath: "/" }),
  field("pricing.beta.price", "Marketing", "Pricing", "Public beta", "Price", "$0", { maxLength: 30, previewPath: "/" }),
  field("pricing.beta.body", "Marketing", "Pricing", "Public beta", "Description", "Create up to 25 Profiles during public beta without a hard paywall.", { maxLength: 220, previewPath: "/" }),
  field("pricing.commercial.title", "Marketing", "Pricing", "Commercial", "Plan title", "Commercial and brand setup", { maxLength: 80, previewPath: "/" }),
  field("pricing.commercial.price", "Marketing", "Pricing", "Commercial", "Price", "From $99", { maxLength: 30, previewPath: "/" }),
  field("pricing.commercial.body", "Marketing", "Pricing", "Commercial", "Description", "Onboarding, bulk setup, QR hardware, and rollout support for shops, builders, and brands.", { maxLength: 240, previewPath: "/" }),
  field("installers.hero.eyebrow", "Marketing", "Installers", "Hero", "Eyebrow", "QR installs", { maxLength: 60, previewPath: "/installers" }),
  field("installers.hero.headline", "Marketing", "Installers", "Hero", "Headline", "Put the Profile where people can use it.", { maxLength: 100, previewPath: "/installers" }),
  field("installers.hero.body", "Marketing", "Installers", "Hero", "Body", "Explore QR stickers, tags, plates, and hands-on installation support for instruments and inventory.", { maxLength: 260, previewPath: "/installers" }),
  field("installers.empty.title", "Marketing", "Installers", "Directory", "Empty-state title", "Installer directory coming soon", { maxLength: 90, previewPath: "/installers" }),
  field("installers.empty.body", "Marketing", "Installers", "Directory", "Empty-state body", "Contact QRguitar for current installation and hardware options.", { maxLength: 180, previewPath: "/installers" }),

  field("howItWorks.lifecycle.heading", "Marketing", "How It Works", "Instrument lifecycle", "Section heading", "A Profile that grows with the instrument", { maxLength: 110, previewPath: "/how-it-works" }),
  field("howItWorks.features.heading", "Marketing", "How It Works", "Features", "Section heading", "Keep the useful details together", { maxLength: 110, previewPath: "/how-it-works" }),
  field("howItWorks.privacy.heading", "Marketing", "How It Works", "Privacy", "Section heading", "You control what the public can see", { maxLength: 110, previewPath: "/how-it-works" }),
  field("howItWorks.privacy.body", "Marketing", "How It Works", "Privacy", "Section body", "Choose Public, Unlisted, or Private. You can also hide the Serial Number while keeping it available in the owner workspace.", { maxLength: 300, previewPath: "/how-it-works" }),
  field("howItWorks.roles.heading", "Marketing", "How It Works", "Who it serves", "Section heading", "Built for players, collectors, shops, and builders", { maxLength: 120, previewPath: "/how-it-works" }),
  field("howItWorks.roles.players.body", "Marketing", "How It Works", "Who it serves", "Players", "Keep the facts, photos, setup notes, and service history that make an instrument yours.", { maxLength: 220, previewPath: "/how-it-works" }),
  field("howItWorks.roles.builders.body", "Marketing", "How It Works", "Who it serves", "Builders and brands", "Issue consistent Profiles, preserve build details, and support future owners without losing brand identity.", { maxLength: 250, previewPath: "/how-it-works" }),
  field("howItWorks.faq.transfer.question", "Marketing", "How It Works", "Common questions", "Transfer question", "Can someone claim ownership by scanning the QR code?", { maxLength: 110, previewPath: "/how-it-works" }),
  field("howItWorks.faq.transfer.answer", "Marketing", "How It Works", "Common questions", "Transfer answer", "No. A scan or Serial Number can identify a Profile, but ownership changes only through a reviewed transfer or claim workflow.", { maxLength: 300, previewPath: "/how-it-works" }),
  field("howItWorks.finalCta.headline", "Marketing", "How It Works", "Closing action", "Headline", "Start with one instrument.", { maxLength: 90, previewPath: "/how-it-works" }),
  field("howItWorks.finalCta.body", "Marketing", "How It Works", "Closing action", "Body", "Add the details you know today and keep improving the Profile over time.", { maxLength: 190, previewPath: "/how-it-works" }),

  field("dashboard.stats.profiles", "Product", "Dashboard", "Summary", "Profiles label", "Profiles", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.stats.visible", "Product", "Dashboard", "Summary", "Public label", "Public", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.stats.transfers", "Product", "Dashboard", "Summary", "Transfers label", "Transfers", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.actions.bulk", "Product", "Dashboard", "Actions", "Bulk import action", "Bulk Import", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.actions.claims", "Product", "Dashboard", "Actions", "Claims action", "Claim Center", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.card.open", "Product", "Dashboard", "Profile cards", "Open label", "View Profile", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.card.edit", "Product", "Dashboard", "Profile cards", "Edit label", "Edit Profile", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.card.more", "Product", "Dashboard", "Profile cards", "More label", "More", { maxLength: 30, previewPath: "/dashboard" }),
  field("dashboard.card.remove", "Product", "Dashboard", "Profile cards", "Remove label", "Remove Profile", { maxLength: 40, previewPath: "/dashboard" }),
  field("dashboard.transfer.help", "Product", "Dashboard", "Ownership", "Transfer help", "Start a secure handoff when the instrument changes owners.", { maxLength: 170, previewPath: "/dashboard" }),

  field("create.identity.heading", "Product", "Create Profile", "Instrument identity", "Section heading", "Instrument identity", { maxLength: 70, previewPath: "/create" }),
  field("create.details.heading", "Product", "Create Profile", "Details", "Section heading", "Details and history", { maxLength: 70, previewPath: "/create" }),
  field("create.visibility.heading", "Product", "Create Profile", "Visibility", "Section heading", "Privacy and visibility", { maxLength: 70, previewPath: "/create" }),
  field("create.review.heading", "Product", "Create Profile", "Review", "Section heading", "Review your Profile", { maxLength: 70, previewPath: "/create" }),
  field("create.actions.continue", "Product", "Create Profile", "Actions", "Continue label", "Continue", { maxLength: 30, previewPath: "/create" }),
  field("create.actions.back", "Product", "Create Profile", "Actions", "Back label", "Back", { maxLength: 30, previewPath: "/create" }),
  field("create.actions.submit", "Product", "Create Profile", "Actions", "Create label", "Create Profile", { maxLength: 40, previewPath: "/create" }),
  field("create.errors.photo", "Product", "Create Profile", "Validation", "Photo error", "Add at least one real photo before creating the Profile.", { maxLength: 160, previewPath: "/create" }),
  field("create.errors.duplicate", "Product", "Create Profile", "Validation", "Duplicate Serial Number error", "A Profile already uses this Serial Number. Open the existing Profile or contact support.", { maxLength: 220, previewPath: "/create" }),

  field("edit.hero.body", "Product", "Edit Profile", "Header", "Body", "Update the current instrument details without changing its permanent QRguitar ID or URL.", { maxLength: 220, previewPath: "/dashboard" }),
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
  field("profile.empty.media", "Product", "Public Profile", "Empty states", "Media empty state", "No additional media has been shared.", { maxLength: 130, previewPath: "/catalog" }),
  field("profile.empty.documents", "Product", "Public Profile", "Empty states", "Documents empty state", "No public documents have been shared.", { maxLength: 130, previewPath: "/catalog" }),
  field("profile.empty.timeline", "Product", "Public Profile", "Empty states", "Timeline empty state", "No public history has been added yet.", { maxLength: 130, previewPath: "/catalog" }),
  field("gallery.heading", "Product", "Gallery", "Viewer", "Heading", "Instrument gallery", { maxLength: 70, previewPath: "/catalog" }),
  field("gallery.close", "Product", "Gallery", "Actions", "Close label", "Close gallery", { maxLength: 40, previewPath: "/catalog" }),
  field("media.heading", "Product", "Media", "Section", "Heading", "Media", { maxLength: 50, previewPath: "/catalog" }),
  field("documents.heading", "Product", "Documents", "Section", "Heading", "Documents", { maxLength: 50, previewPath: "/catalog" }),
  field("printWorkspace.title", "Product", "Print Workspace", "Header", "Title", "QRguitar Print Kit", { maxLength: 80, previewPath: "/dashboard" }),
  field("printWorkspace.handout", "Product", "Print Workspace", "Modes", "Profile sheet label", "Profile Sheet", { maxLength: 50, previewPath: "/dashboard" }),
  field("printWorkspace.label", "Product", "Print Workspace", "Modes", "QR label label", "QR Label", { maxLength: 40, previewPath: "/dashboard" }),
  field("printWorkspace.hangtag", "Product", "Print Workspace", "Modes", "Hang tag label", "Hang Tag", { maxLength: 40, previewPath: "/dashboard" }),
  field("printWorkspace.service", "Product", "Print Workspace", "Modes", "Service summary label", "Service Summary", { maxLength: 50, previewPath: "/dashboard" }),
  field("printWorkspace.print", "Product", "Print Workspace", "Actions", "Print label", "Print", { maxLength: 30, previewPath: "/dashboard" }),

  field("serviceProviders.hero.body", "Workflows", "Service Providers", "Header", "Body", "Submit professional service details to the owner for review without taking ownership of the Profile.", { maxLength: 250, previewPath: "/service-work/preview" }),
  field("serviceProviders.empty.title", "Workflows", "Service Providers", "States", "Empty title", "No service work is waiting.", { maxLength: 90, previewPath: "/service-work/preview" }),
  field("serviceReview.hero.body", "Workflows", "Service Review", "Header", "Body", "Approve accurate service history, request a revision, or decline it without changing ownership.", { maxLength: 250, previewPath: "/dashboard" }),
  field("serviceReview.actions.approve", "Workflows", "Service Review", "Actions", "Approve label", "Approve service history", { maxLength: 50, previewPath: "/dashboard" }),
  field("serviceReview.actions.revise", "Workflows", "Service Review", "Actions", "Revision label", "Request revision", { maxLength: 40, previewPath: "/dashboard" }),
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
  field("login.actions.forgot", "Support & Legal", "Login", "Actions", "Forgot-password label", "Forgot password?", { maxLength: 40, previewPath: "/login" }),
  field("resetPassword.sent", "Support & Legal", "Reset Password", "States", "Sent message", "Check your email for a secure password reset link.", { maxLength: 160, previewPath: "/reset-password" }),
  field("resetPassword.actions.submit", "Support & Legal", "Reset Password", "Actions", "Send label", "Send reset link", { maxLength: 40, previewPath: "/reset-password" }),
  field("contact.support.heading", "Support & Legal", "Contact", "Support", "Heading", "Support", { maxLength: 50, previewPath: "/contact" }),
  field("contact.support.body", "Support & Legal", "Contact", "Support", "Body", "Tell us what happened, which Profile is involved, and what outcome you need.", { maxLength: 220, previewPath: "/contact" }),
  field("contact.support.cta", "Support & Legal", "Contact", "Support", "Email action", "Email support", { maxLength: 40, previewPath: "/contact" }),
  field("privacy.sections.visibility.heading", "Support & Legal", "Privacy", "Visibility", "Heading", "Profile visibility", { maxLength: 100, previewPath: "/privacy" }),
  field("privacy.sections.visibility.body", "Support & Legal", "Privacy", "Visibility", "Body", "Public Profiles can appear in the Catalog, Unlisted Profiles require a direct link, and Private Profiles remain in the owner workspace.", { maxLength: 700, previewPath: "/privacy" }),
  field("privacy.sections.security.heading", "Support & Legal", "Privacy", "Security", "Heading", "Security and private data", { maxLength: 100, previewPath: "/privacy" }),
  field("privacy.sections.security.body", "Support & Legal", "Privacy", "Security", "Body", "Private notes, private documents, transfer tokens, and account authentication data are not published in public Profile responses.", { maxLength: 700, previewPath: "/privacy" }),
  field("terms.sections.content.heading", "Support & Legal", "Terms", "Content", "Heading", "Profile content", { maxLength: 100, previewPath: "/terms" }),
  field("terms.sections.content.body", "Support & Legal", "Terms", "Content", "Body", "Add accurate instrument information and only upload media or documents you are authorized to use.", { maxLength: 700, previewPath: "/terms" }),
  field("terms.sections.ownership.heading", "Support & Legal", "Terms", "Ownership", "Heading", "Ownership tools", { maxLength: 100, previewPath: "/terms" }),
  field("terms.sections.ownership.body", "Support & Legal", "Terms", "Ownership", "Body", "QRguitar ownership tools organize platform records; they do not replace legal title, receipts, or independent due diligence.", { maxLength: 700, previewPath: "/terms" })
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

export const contentRegistry: ContentRegistryEntry[] = [...coreContentRegistry, ...completionRegistry, ...emailRegistry, ...seoRegistry];

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
    merged[entry.key] = clean;
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
  return values?.[key] ?? contentRegistryByKey.get(key)?.defaultValue ?? "";
}

export function contentPagesForArea(area: ContentArea) {
  return Array.from(new Set(contentRegistry.filter((entry) => entry.area === area).map((entry) => entry.page)));
}
