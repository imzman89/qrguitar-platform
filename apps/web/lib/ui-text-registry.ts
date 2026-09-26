// Stable site-authored presentation entries. Existing CMS keys remain unchanged.
export const uiTextEntries: Array<{ key: string; scope: string; text: string; area: string; page: string; section: string; source: string }> = [
  { key: "ui.components.Nav.checkingSignIn", scope: "components.Nav", text: "Checking sign-in...", area: "Product", page: "Shared Navigation", section: "Session status", source: "components/Nav.tsx" },
  { key: "ui.components.Nav.retrySignIn", scope: "components.Nav", text: "Retry sign-in check", area: "Product", page: "Shared Navigation", section: "Session status", source: "components/Nav.tsx" },
  { key: "ui.components.Nav.signInCheckFailure", scope: "components.Nav", text: "Your sign-in could not be checked. Retry without signing in again.", area: "Product", page: "Shared Navigation", section: "Session status", source: "components/Nav.tsx" },
  { key: "ui.components.Footer.checkingSignIn", scope: "components.Footer", text: "Checking sign-in...", area: "Product", page: "Shared Footer", section: "Session status", source: "components/Footer.tsx" },
  { key: "ui.components.Footer.retrySignIn", scope: "components.Footer", text: "Retry sign-in check", area: "Product", page: "Shared Footer", section: "Session status", source: "components/Footer.tsx" },
  { key: "ui.components.Footer.signInCheckFailure", scope: "components.Footer", text: "Your sign-in could not be checked. Retry without signing in again.", area: "Product", page: "Shared Footer", section: "Session status", source: "components/Footer.tsx" },
  { key: "ui.app.dashboard.page.managePublicCollection", scope: "app.dashboard.page", text: "Manage public collection", area: "Product", page: "Dashboard", section: "Page text", source: "app/dashboard/page.tsx" },
  { key: "ui.app.site.editor.page.previewUnavailableForSelection", scope: "app.site.editor.page", text: "This selection needs a real permitted record or does not have a standalone page to preview.", area: "Product", page: "Site Composition Editor", section: "Preview", source: "app/site-editor/page.tsx" },
  { key: "ui.app.site.editor.page.previewRouteUnavailable", scope: "app.site.editor.page", text: "Not available for this selection", area: "Product", page: "Site Composition Editor", section: "Preview", source: "app/site-editor/page.tsx" },
  { key: "ui.app.site.editor.page.emailDeliveryBoundary", scope: "app.site.editor.page", text: "Service-submission templates are used by configured application delivery. Other templates are preview/test only; authentication-provider templates are configured separately.", area: "Product", page: "Site Composition Editor", section: "Emails", source: "app/site-editor/page.tsx" },
  { key: "ui.app.ownership.claim.page.withdrawRequest", scope: "app.ownership.claim.page", text: "Withdraw request", area: "Product", page: "Ownership Claims", section: "Request withdrawal", source: "app/ownership-claim/page.tsx" },
  { key: "ui.app.ownership.claim.page.withdrawConfirmTitle", scope: "app.ownership.claim.page", text: "Withdraw this ownership request?", area: "Product", page: "Ownership Claims", section: "Request withdrawal", source: "app/ownership-claim/page.tsx" },
  { key: "ui.app.ownership.claim.page.withdrawConfirmBody", scope: "app.ownership.claim.page", text: "This closes the pending request. Ownership and submitted evidence stay unchanged. A withdrawn request cannot be reopened.", area: "Product", page: "Ownership Claims", section: "Request withdrawal", source: "app/ownership-claim/page.tsx" },
  { key: "ui.app.ownership.claim.page.withdrawConfirmAction", scope: "app.ownership.claim.page", text: "Yes, withdraw request", area: "Product", page: "Ownership Claims", section: "Request withdrawal", source: "app/ownership-claim/page.tsx" },
  { key: "ui.app.ownership.claim.page.keepRequest", scope: "app.ownership.claim.page", text: "Keep request", area: "Product", page: "Ownership Claims", section: "Request withdrawal", source: "app/ownership-claim/page.tsx" },
  { key: "ui.app.ownership.claim.page.withdrawingRequest", scope: "app.ownership.claim.page", text: "Withdrawing request...", area: "Product", page: "Ownership Claims", section: "Request withdrawal", source: "app/ownership-claim/page.tsx" },
  { key: "ui.app.ownership.claim.page.withdrawSuccess", scope: "app.ownership.claim.page", text: "Ownership request withdrawn.", area: "Product", page: "Ownership Claims", section: "Request withdrawal", source: "app/ownership-claim/page.tsx" },
  { key: "ui.app.ownership.claim.page.withdrawConflict", scope: "app.ownership.claim.page", text: "This request changed before it could be withdrawn. Refresh the latest status and try again.", area: "Product", page: "Ownership Claims", section: "Request withdrawal", source: "app/ownership-claim/page.tsx" },
  { key: "ui.app.ownership.claim.page.withdrawFailure", scope: "app.ownership.claim.page", text: "Could not withdraw this request. Refresh its status and try again.", area: "Product", page: "Ownership Claims", section: "Request withdrawal", source: "app/ownership-claim/page.tsx" },
  { key: "ui.app.ownership.claim.page.withdrawRefreshFailure", scope: "app.ownership.claim.page", text: "The saved request status could not be loaded. Refresh before taking another action.", area: "Product", page: "Ownership Claims", section: "Request withdrawal", source: "app/ownership-claim/page.tsx" },
  {"key":"ui.app.dashboard.page.98d395c5face","scope":"app.dashboard.page","text":"Workspace tools","page":"Dashboard","area":"Product","section":"Page text","source":"app/dashboard/page.tsx"},
  {"key":"ui.app.dashboard.page.d6d8303655f5","scope":"app.dashboard.page","text":"Print Suite","page":"Dashboard","area":"Product","section":"Page text","source":"app/dashboard/page.tsx"},
  {"key":"ui.app.dashboard.page.11de928b330a","scope":"app.dashboard.page","text":"Needs your attention","page":"Dashboard","area":"Product","section":"Page text","source":"app/dashboard/page.tsx"},
  {"key":"ui.app.dashboard.page.1127784eea0a","scope":"app.dashboard.page","text":"Ownership transfers could not be checked. Reload your collection first.","page":"Dashboard","area":"Product","section":"Page text","source":"app/dashboard/page.tsx"},
  {"key":"ui.app.dashboard.page.f3ccb68e0839","scope":"app.dashboard.page","text":"No ownership transfers need your attention.","page":"Dashboard","area":"Product","section":"Page text","source":"app/dashboard/page.tsx"},
  {"key":"ui.app.dashboard.page.ab405a433d94","scope":"app.dashboard.page","text":"waiting on recipient","page":"Dashboard","area":"Product","section":"Page text","source":"app/dashboard/page.tsx"},
  { key: "ui.app.i.code.ProfileClient.shopItem", scope: "app.i.code.ProfileClient", text: "Shop this item", area: "Product", page: "Public Profile", section: "Seller actions", source: "app/i/[code]/ProfileClient.tsx" },
  { key: "ui.app.i.code.ProfileClient.lifetimeProfile", scope: "app.i.code.ProfileClient", text: "One Profile, for its whole life.", area: "Product", page: "Public Profile", section: "Ownership", source: "app/i/[code]/ProfileClient.tsx" },
  { key: "ui.app.i.code.ProfileClient.afterPurchase", scope: "app.i.code.ProfileClient", text: "After you buy it, ask the seller to transfer this Profile to you for free. Its photos, specifications and history stay together.", area: "Product", page: "Public Profile", section: "Ownership", source: "app/i/[code]/ProfileClient.tsx" },
  { key: "ui.app.i.code.ProfileClient.alreadyOwn", scope: "app.i.code.ProfileClient", text: "Already own it?", area: "Product", page: "Public Profile", section: "Ownership", source: "app/i/[code]/ProfileClient.tsx" },
  {"key":"ui.app.create.page.choosePhotos","scope":"app.create.page","text":"Choose photos","area":"Product","page":"Create Profile","section":"Photos and details","source":"app/create/page.tsx"},
  {"key":"ui.app.create.page.photoReadFailed","scope":"app.create.page","text":"Could not open: {{files}}. Choose those photos again or try another JPG, PNG, or WebP. Your other photos and details are still here.","area":"Product","page":"Create Profile","section":"Photos and details","source":"app/create/page.tsx"},
  {"key":"ui.app.create.page.duplicatePhotos","scope":"app.create.page","text":"Photos already selected were skipped.","area":"Product","page":"Create Profile","section":"Photos and details","source":"app/create/page.tsx"},
  {"key":"ui.app.create.page.documentsSkipped","scope":"app.create.page","text":"{{count}} not added. Choose readable PDF, JPG, PNG, or WebP files up to 12MB each, with up to 10 documents per Profile. Your other files and details are still here.","area":"Product","page":"Create Profile","section":"Photos and details","source":"app/create/page.tsx"},
  {"key":"ui.app.create.page.uploadRetry","scope":"app.create.page","text":"Some files could not be uploaded. Choose Retry safely below. Your details and successful uploads are kept.","area":"Product","page":"Create Profile","section":"Photos and details","source":"app/create/page.tsx"},
  {"key":"ui.app.create.page.preparingFiles","scope":"app.create.page","text":"Preparing your files…","area":"Product","page":"Create Profile","section":"Photos and details","source":"app/create/page.tsx"},
  {"key":"ui.app.create.page.ownerDetailsOptional","scope":"app.create.page","text":"Owner and purchase details (optional)","area":"Product","page":"Create Profile","section":"Photos and details","source":"app/create/page.tsx"},
  {"key":"ui.app.create.page.optionalDetails","scope":"app.create.page","text":"More instrument details (optional)","area":"Product","page":"Create Profile","section":"Photos and details","source":"app/create/page.tsx"},
  { key: "ui.app.handout.code.PrintDocument.buyerRequest", scope: "app.handout.code.PrintDocument", text: "New owner? Scan, then choose Start ownership request on the Profile.", area: "Product", page: "Print Workspace", section: "Page text", source: "app/handout/[code]/PrintDocument.tsx" },
  { key: "ui.app.dashboard.page.noHandoff", scope: "app.dashboard.page", text: "No handoff started. Choose a method below when you are ready.", area: "Product", page: "Dashboard", section: "Page text", source: "app/dashboard/page.tsx" },
  { key: "ui.app.dashboard.page.handoffCompleted", scope: "app.dashboard.page", text: "Handoff completed. The next owner accepted the Profile.", area: "Product", page: "Dashboard", section: "Page text", source: "app/dashboard/page.tsx" },
  { key: "ui.app.dashboard.page.handoffCancelled", scope: "app.dashboard.page", text: "Handoff cancelled. Start a new transfer if needed.", area: "Product", page: "Dashboard", section: "Page text", source: "app/dashboard/page.tsx" },
  { key: "ui.app.dashboard.page.buyerActionRequired", scope: "app.dashboard.page", text: "Give the private buyer code to the recipient. You remain the owner until they accept.", area: "Product", page: "Dashboard", section: "Page text", source: "app/dashboard/page.tsx" },
  { key: "ui.app.dashboard.page.recipientActionRequired", scope: "app.dashboard.page", text: "Recipient action required. The next owner must sign in and accept the Profile. You remain the owner until then.", area: "Product", page: "Dashboard", section: "Page text", source: "app/dashboard/page.tsx" },
  {
    "key": "ui.workspace.faae0c421967",
    "scope": "workspace",
    "text": "Player / owner",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.9d0081a4f3d6",
    "scope": "workspace",
    "text": "Collector",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.679ab74fd398",
    "scope": "workspace",
    "text": "Store / retailer",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.106bdb72abe8",
    "scope": "workspace",
    "text": "Builder / brand",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.ea10259a47b1",
    "scope": "workspace",
    "text": "Luthier / repair shop / technician",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.f97e9da0e3b8",
    "scope": "workspace",
    "text": "Other",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.a5777b0f3289",
    "scope": "workspace",
    "text": "Share your collection",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.26aad0019e12",
    "scope": "workspace",
    "text": "Publish your public Profiles together under one link.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.0d37e112bf12",
    "scope": "workspace",
    "text": "Connect your website",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.9f43ad820b48",
    "scope": "workspace",
    "text": "Send visitors from your public collection and instrument Profiles to your own website.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.3f9b5c09e0a6",
    "scope": "workspace",
    "text": "Service workbench",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.596f15ac8441",
    "scope": "workspace",
    "text": "Resume saved work, respond to requested changes, and check owner review status.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.d66a01126f70",
    "scope": "workspace",
    "text": "Claim an instrument",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.6faf1a23e1e6",
    "scope": "workspace",
    "text": "Claim an instrument you acquired and check your submitted ownership claims.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.cb786dc79eda",
    "scope": "workspace",
    "text": "Transfer an instrument",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.29dcf61286d4",
    "scope": "workspace",
    "text": "Choose one of your saved Profiles, then open Transfer to prepare its buyer handoff.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.ac29024c4ca2",
    "scope": "workspace",
    "text": "Player workspace",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.28d82d75f61b",
    "scope": "workspace",
    "text": "Your instruments, in order.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.11c503369f69",
    "scope": "workspace",
    "text": "Keep photos, documents, service history, and ownership together for every instrument.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.a9d6689acf2c",
    "scope": "workspace",
    "text": "Collector workspace",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.5c78caa4b190",
    "scope": "workspace",
    "text": "Keep the story with the instrument.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.b5efa61cb710",
    "scope": "workspace",
    "text": "Organize your collection, preserve its history, and prepare a clear ownership handoff.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.3d13b890ca59",
    "scope": "workspace",
    "text": "Store workspace",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.8aa1276d62e7",
    "scope": "workspace",
    "text": "Make every instrument buyer-ready.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.15aa16da501a",
    "scope": "workspace",
    "text": "Manage inventory Profiles, share your shop website, and handle ownership transfers from one place.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.a1e4fd437a50",
    "scope": "workspace",
    "text": "Import inventory",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.b59faa1dfe22",
    "scope": "workspace",
    "text": "Prepare multiple instrument Profiles from a spreadsheet.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.ee0dff790ddf",
    "scope": "workspace",
    "text": "Builder / brand workspace",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.ecdd24d6daca",
    "scope": "workspace",
    "text": "Give every build its own record.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.c110fe1e6af2",
    "scope": "workspace",
    "text": "Document new instruments, connect buyers to your website, and keep the record ready for its next owner.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.da4ee2a6e6ca",
    "scope": "workspace",
    "text": "Import your builds",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.e3fa8a500176",
    "scope": "workspace",
    "text": "Start Profiles for a batch of instruments from a spreadsheet.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.2f5a5daaecd3",
    "scope": "workspace",
    "text": "Service provider workspace",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.9bd7ecf60866",
    "scope": "workspace",
    "text": "Keep customer work moving.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.93363fe59878",
    "scope": "workspace",
    "text": "Pick up saved drafts, respond to owner feedback, and document completed work without taking ownership.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.e84ab388534a",
    "scope": "workspace",
    "text": "Provider network",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.ddf0016f044b",
    "scope": "workspace",
    "text": "Learn about applying to the manually reviewed provider network.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.5b8d6999d0e7",
    "scope": "workspace",
    "text": "Instrument workspace",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.workspace.23160d470c3a",
    "scope": "workspace",
    "text": "Manage your instrument Profiles, public collection, and ownership handoffs.",
    "area": "Product",
    "page": "Workspace guidance",
    "section": "Roles and navigation",
    "source": "lib/workspace-tools.ts"
  },
  {
    "key": "ui.app.account.page.7e1b0d5641f2",
    "scope": "app.account.page",
    "text": "Account",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.3e76d93749b3",
    "scope": "app.account.page",
    "text": "Your account could not be loaded.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.d8b8392e2c54",
    "scope": "app.account.page",
    "text": "Try again",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.ebdc08b7dca0",
    "scope": "app.account.page",
    "text": "Sign in to manage your account.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.fd2eec9f1a8b",
    "scope": "app.account.page",
    "text": "Update your display name, password access, and account details from one place.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.bfd402b2f6f3",
    "scope": "app.account.page",
    "text": "Sign in",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.798ca2ce18bf",
    "scope": "app.account.page",
    "text": "Create account",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.settingsSection",
    "scope": "app.account.page",
    "text": "Settings section",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.d4b1ea5708dd",
    "scope": "app.account.page",
    "text": "Overview",
    "page": "Account",
    "area": "Product",
    "section": "Navigation and choices",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.81d7c837c3e8",
    "scope": "app.account.page",
    "text": "Collection page",
    "page": "Account",
    "area": "Product",
    "section": "Navigation and choices",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.999fcfbc4384",
    "scope": "app.account.page",
    "text": "Profile & Identity",
    "page": "Account",
    "area": "Product",
    "section": "Navigation and choices",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.8f6fb4eb7f42",
    "scope": "app.account.page",
    "text": "Security",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.788011833a5a",
    "scope": "app.account.page",
    "text": "Notifications",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.963dc63cbd9f",
    "scope": "app.account.page",
    "text": "Provider / Business",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.ade3e28bc653",
    "scope": "app.account.page",
    "text": "Privacy & Data",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.baa77cb99154",
    "scope": "app.account.page",
    "text": "Account sections",
    "page": "Account",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.dbb5f6371b6a",
    "scope": "app.account.page",
    "text": "Your account",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.96879611650f",
    "scope": "app.account.page",
    "text": "active",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.ad95d5fa651b",
    "scope": "app.account.page",
    "text": "free",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.04f8996da763",
    "scope": "app.account.page",
    "text": "user",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.c8c1af060b0c",
    "scope": "app.account.page",
    "text": "Collection summary",
    "page": "Account",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.535e52e4a261",
    "scope": "app.account.page",
    "text": "Profiles",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.591935b15b1c",
    "scope": "app.account.page",
    "text": "Public",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.658ed7b26eff",
    "scope": "app.account.page",
    "text": "Private or unlisted",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.73949bb1bdba",
    "scope": "app.account.page",
    "text": "Profile details",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.53babca0609e",
    "scope": "app.account.page",
    "text": "Your name and the tools you use.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.fd9c61ac500e",
    "scope": "app.account.page",
    "text": "Edit details",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.8ca6da5bcd1b",
    "scope": "app.account.page",
    "text": "Public collection",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.a5b70b30efb9",
    "scope": "app.account.page",
    "text": "Your saved collection is ready to share.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.e7a081e4c5a2",
    "scope": "app.account.page",
    "text": "Bring your public Profiles together on one page.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.b751505accb1",
    "scope": "app.account.page",
    "text": "Manage collection",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.67aa727721b2",
    "scope": "app.account.page",
    "text": "Set up collection",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.3386f588f0c2",
    "scope": "app.account.page",
    "text": "Account access",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.9880be836d93",
    "scope": "app.account.page",
    "text": "Manage your password and active sign-in.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.a1464d30c916",
    "scope": "app.account.page",
    "text": "Open your collection",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.d696a35bdd18",
    "scope": "app.account.page",
    "text": "Profile",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.9934aa3adf5c",
    "scope": "app.account.page",
    "text": "Login email",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.5f91dc127d12",
    "scope": "app.account.page",
    "text": "This email receives password reset and ownership-transfer messages.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.2b7f6a84de91",
    "scope": "app.account.page",
    "text": "Display name",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.b4412569c09e",
    "scope": "app.account.page",
    "text": "Owner, shop, or builder name",
    "page": "Account",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.d034a5030b9c",
    "scope": "app.account.page",
    "text": "Shown on private tools and used as your default owner/shop label.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.6fb83029b2c0",
    "scope": "app.account.page",
    "text": "How you use QRguitar",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.17c18130884e",
    "scope": "app.account.page",
    "text": "Choose the daily tools shown on your dashboard. You can save this preference with your public collection turned off. Provider verification is reviewed separately.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.dc85af8f2b1d",
    "scope": "app.account.page",
    "text": "Saving...",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.bfc93ccce3d7",
    "scope": "app.account.page",
    "text": "Your collection page",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.d5e138183dc3",
    "scope": "app.account.page",
    "text": "Give people one link to your instruments, with your name and a short introduction.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.390ed0ea84e0",
    "scope": "app.account.page",
    "text": "Enable my collection page",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.collectionVisibilityHelp",
    "scope": "app.account.page",
    "text": "Only Public Profiles appear here. Your page joins Member Collections once it has a Public Profile. Turning this off hides the collection page, without changing any Profile’s visibility.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.8bb1664e67fa",
    "scope": "app.account.page",
    "text": "Page name",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.178b790b1cb2",
    "scope": "app.account.page",
    "text": "Custom link",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.6f61c615337a",
    "scope": "app.account.page",
    "text": "my-collection",
    "page": "Account",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.9dc1bb315851",
    "scope": "app.account.page",
    "text": "Location (optional)",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.fef8ce3a04b7",
    "scope": "app.account.page",
    "text": "City, region, country",
    "page": "Account",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.81aa4ccb029d",
    "scope": "app.account.page",
    "text": "About you or your collection",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.42e359637e9e",
    "scope": "app.account.page",
    "text": "What you collect, build, repair, or sell.",
    "page": "Account",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.5fec9267ba07",
    "scope": "app.account.page",
    "text": "Your website (optional)",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.2a5191a8ca1b",
    "scope": "app.account.page",
    "text": "Use the full HTTPS address. When your public collection is enabled, visitors can open this website from the collection and its instrument Profiles. Purchases and bookings take place on your website.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.ea3c6074a51b",
    "scope": "app.account.page",
    "text": "Profile photo link (optional)",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.27f7d9074b31",
    "scope": "app.account.page",
    "text": "Allow search engines to list my collection page",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.collectionSearchHelp",
    "scope": "app.account.page",
    "text": "Controls Google and other search engines. Turning this off does not hide your page from visitors.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.bf5f93866b44",
    "scope": "app.account.page",
    "text": "Allow signed-in members to message you in QRguitar",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.a9fc610e616e",
    "scope": "app.account.page",
    "text": "Your email stays private. Conversations stay inside QRguitar and can include up to four photos or short videos per message.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.a7f1e189ad7b",
    "scope": "app.account.page",
    "text": "Save collection settings",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.693b86cbac84",
    "scope": "app.account.page",
    "text": "View collection page",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.1fbba5113528",
    "scope": "app.account.page",
    "text": "Browse member collections",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.9fb466124379",
    "scope": "app.account.page",
    "text": "Save to apply these changes. View collection page opens the version you last saved.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.13399ccf0950",
    "scope": "app.account.page",
    "text": "Password access",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.9b5781f988de",
    "scope": "app.account.page",
    "text": "Send yourself a secure reset link any time. QRguitar never shows or stores your password in this dashboard.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.48f0d3d397d4",
    "scope": "app.account.page",
    "text": "Sign out",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.ff52142d2401",
    "scope": "app.account.page",
    "text": "Account notices",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.b7d24faecb5a",
    "scope": "app.account.page",
    "text": "Security, transfer, claim, and service-review notices are sent to your account email when action is required.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.1efeceaedae0",
    "scope": "app.account.page",
    "text": "Delivery email",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.c9aae06952ae",
    "scope": "app.account.page",
    "text": "Required notices",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.92c1cdfdf4cb",
    "scope": "app.account.page",
    "text": "Enabled",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.e16273f1c0f6",
    "scope": "app.account.page",
    "text": "Required account and ownership notices stay visible.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.6ba0be9a0111",
    "scope": "app.account.page",
    "text": "Business tools",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.920e413c7d41",
    "scope": "app.account.page",
    "text": "Status",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.fa8ed0bdabdd",
    "scope": "app.account.page",
    "text": "Plan",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.14736a2eb9f4",
    "scope": "app.account.page",
    "text": "Role",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.61669a91a83b",
    "scope": "app.account.page",
    "text": "Open service workbench",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.7150f79bc954",
    "scope": "app.account.page",
    "text": "Open Bulk Import",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.78a5a284fa46",
    "scope": "app.account.page",
    "text": "Service Provider Network",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.a4f145526932",
    "scope": "app.account.page",
    "text": "Profile controls",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.ff8634e1b9dd",
    "scope": "app.account.page",
    "text": "Each Profile controls visibility, private documents, service history, Serial Number display, and QR downloads from its editor.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.98f4a6a50399",
    "scope": "app.account.page",
    "text": "Manage Profiles",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.eb39d7ae9ff5",
    "scope": "app.account.page",
    "text": "Get support",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.bddc85940d45",
    "scope": "app.account.page",
    "text": "Reload the saved settings before editing again; reloading replaces the form with the server version.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.d848587486e8",
    "scope": "app.account.page",
    "text": "Reload saved account",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.a851f033716c",
    "scope": "app.account.page",
    "text": "Loading your account...",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.account.page.67f2c270991d",
    "scope": "app.account.page",
    "text": "Checking your QRguitar session and owner workspace.",
    "page": "Account",
    "area": "Product",
    "section": "Page text",
    "source": "app/account/page.tsx"
  },
  {
    "key": "ui.app.admin.page.82ffb5c6aa67",
    "scope": "app.admin.page",
    "text": "Sign in with an authorized admin account.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d09f6c5202ed",
    "scope": "app.admin.page",
    "text": "Could not refresh admin data: {{value1}}",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.378a81a9249b",
    "scope": "app.admin.page",
    "text": "Could not refresh admin data. Check your connection and try again.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.8ea6a38fb82d",
    "scope": "app.admin.page",
    "text": "A previous brand logo save needs confirmation. Use Save again to retry that exact change before making another.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.cbf9b4297bc4",
    "scope": "app.admin.page",
    "text": "Could not load brand logo settings.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.5c1eee64f638",
    "scope": "app.admin.page",
    "text": "Refreshing admin access for this account.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.4dcdc5cc4c51",
    "scope": "app.admin.page",
    "text": "Reload the admin page before changing brand logos.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.b2d6ba20f6e1",
    "scope": "app.admin.page",
    "text": "A shared draft exists. Manage brand logos in the Site Editor to preserve it.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.4b053c659546",
    "scope": "app.admin.page",
    "text": "The previous save succeeded; later edits exist. Reload before making another change.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.eb5b7ebcc799",
    "scope": "app.admin.page",
    "text": "Brand logos published.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.7c35bff3970c",
    "scope": "app.admin.page",
    "text": "Enter a valid brand name.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.aaba32ffca62",
    "scope": "app.admin.page",
    "text": "Use an HTTPS URL or a site-relative path beginning with one slash.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.2fcab2f0dff4",
    "scope": "app.admin.page",
    "text": "The admin action could not be completed. Try again.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e7fda97ddda3",
    "scope": "app.admin.page",
    "text": "The Profile action could not be completed. Try again.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.db59d7513303",
    "scope": "app.admin.page",
    "text": "The transfer action could not be completed. Try again.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e7a30c4fa57d",
    "scope": "app.admin.page",
    "text": "The ownership request could not be updated. Try again.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.1ae6e044a6b1",
    "scope": "app.admin.page",
    "text": "No active claim link is available for this transfer.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.162b1b3c26ed",
    "scope": "app.admin.page",
    "text": "Transfer claim link copied.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.27ad9cd9e280",
    "scope": "app.admin.page",
    "text": "Could not copy the transfer claim link.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.3dd513825201",
    "scope": "app.admin.page",
    "text": "Choose the account role that should remain after admin access is removed.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.43988bdf8cff",
    "scope": "app.admin.page",
    "text": "Search this section",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.005abd0bb982",
    "scope": "app.admin.page",
    "text": "Search {{value1}}",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.79df1b685bf6",
    "scope": "app.admin.page",
    "text": "Filter users",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.f7898130e557",
    "scope": "app.admin.page",
    "text": "All users",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.92340695899b",
    "scope": "app.admin.page",
    "text": "Active",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.a424e33d9093",
    "scope": "app.admin.page",
    "text": "Locked",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.05eb210744d1",
    "scope": "app.admin.page",
    "text": "Banned",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.4118fb4fed0e",
    "scope": "app.admin.page",
    "text": "Removed",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.8273a67b55a7",
    "scope": "app.admin.page",
    "text": "Admins",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e1c372d0ffd5",
    "scope": "app.admin.page",
    "text": "Normal users",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.20aff3de82e7",
    "scope": "app.admin.page",
    "text": "Empty users",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.48cae46b66a5",
    "scope": "app.admin.page",
    "text": "Users with Profiles",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.1bde91535884",
    "scope": "app.admin.page",
    "text": "Filter transfers",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.19ec8ce8a18b",
    "scope": "app.admin.page",
    "text": "All transfers",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.331551b0de41",
    "scope": "app.admin.page",
    "text": "Pending",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.a00fb0c50741",
    "scope": "app.admin.page",
    "text": "Accepted",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d353a99eb455",
    "scope": "app.admin.page",
    "text": "Cancelled",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.424a2551d356",
    "scope": "app.admin.page",
    "text": "Expired",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.b5d04c525368",
    "scope": "app.admin.page",
    "text": "Filter Profiles",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.4dba739a02ba",
    "scope": "app.admin.page",
    "text": "Active records",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.bdb86505f806",
    "scope": "app.admin.page",
    "text": "Archived",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.981ac585f7ed",
    "scope": "app.admin.page",
    "text": "Owner Removed",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.7c4806d5f245",
    "scope": "app.admin.page",
    "text": "Orphaned / No owner",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.591935b15b1c",
    "scope": "app.admin.page",
    "text": "Public",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c63eb6720c6e",
    "scope": "app.admin.page",
    "text": "Private",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.bc96567e77ca",
    "scope": "app.admin.page",
    "text": "Unlisted",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.4f7838402f37",
    "scope": "app.admin.page",
    "text": "Verified",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.33c8e8de41c3",
    "scope": "app.admin.page",
    "text": "Unverified",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.eb95c24a9590",
    "scope": "app.admin.page",
    "text": "Authenticity Confirmed",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.a54f9b625886",
    "scope": "app.admin.page",
    "text": "Authenticity Unconfirmed",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.3b1c46e7fb2b",
    "scope": "app.admin.page",
    "text": "No Alert",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.299f098db192",
    "scope": "app.admin.page",
    "text": "Reported Lost",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.44d0eeb2a64d",
    "scope": "app.admin.page",
    "text": "Reported Stolen",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.37ce0a91ee27",
    "scope": "app.admin.page",
    "text": "Recovered",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.987c9e86d9fa",
    "scope": "app.admin.page",
    "text": "Has evidence documents",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c1abdb6eb2ad",
    "scope": "app.admin.page",
    "text": "Has service history",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.0811f50b0a96",
    "scope": "app.admin.page",
    "text": "Sort audit events",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d15efa178cf6",
    "scope": "app.admin.page",
    "text": "Newest",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.505dc450753e",
    "scope": "app.admin.page",
    "text": "Oldest",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.449995c4fe8f",
    "scope": "app.admin.page",
    "text": "Actor",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.64cff1319d2f",
    "scope": "app.admin.page",
    "text": "Action",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.069bd3726909",
    "scope": "app.admin.page",
    "text": "Sort {{value1}}",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.969ccbd3cf63",
    "scope": "app.admin.page",
    "text": "Email",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.920e413c7d41",
    "scope": "app.admin.page",
    "text": "Status",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.14736a2eb9f4",
    "scope": "app.admin.page",
    "text": "Role",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e51415d4d0a7",
    "scope": "app.admin.page",
    "text": "Profile count",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.0b70af7a2636",
    "scope": "app.admin.page",
    "text": "Last sign-in",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.7e8cd2056da7",
    "scope": "app.admin.page",
    "text": "Title",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.4b1b8aa3608a",
    "scope": "app.admin.page",
    "text": "Owner",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.7448611d5f93",
    "scope": "app.admin.page",
    "text": "Visibility",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.7140f4f19dec",
    "scope": "app.admin.page",
    "text": "Verification",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.4f531ef9e6ae",
    "scope": "app.admin.page",
    "text": "Authenticity",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.726d11bd5b23",
    "scope": "app.admin.page",
    "text": "Safety",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.ad21c90e48a4",
    "scope": "app.admin.page",
    "text": "Service count",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.6fe451952efe",
    "scope": "app.admin.page",
    "text": "Evidence count",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.380b3582fdcc",
    "scope": "app.admin.page",
    "text": "Document name",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.cdb70ebd5845",
    "scope": "app.admin.page",
    "text": "Service date",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e54c593a4afc",
    "scope": "app.admin.page",
    "text": "Entry title",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.6fdf3c9bc618",
    "scope": "app.admin.page",
    "text": "Instrument",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.cba53d956892",
    "scope": "app.admin.page",
    "text": " - Archived",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.488773139a60",
    "scope": "app.admin.page",
    "text": " - Deleted by owner",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.2f44d9d0a44f",
    "scope": "app.admin.page",
    "text": "No email",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.6eb1d007b2d1",
    "scope": "app.admin.page",
    "text": "- Evidence",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.aca2d2394162",
    "scope": "app.admin.page",
    "text": "- Service",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.92b4b2b3640b",
    "scope": "app.admin.page",
    "text": "- Transfers",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.f9d77f6cb2f2",
    "scope": "app.admin.page",
    "text": "Open Profile",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.3bec71468ff8",
    "scope": "app.admin.page",
    "text": "No records match this view.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.01e8e2fadec6",
    "scope": "app.admin.page",
    "text": "Loading admin panel.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.f2d94682ea94",
    "scope": "app.admin.page",
    "text": "Checking account access and platform records.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d006c3740e41",
    "scope": "app.admin.page",
    "text": "Admin access",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.bfd402b2f6f3",
    "scope": "app.admin.page",
    "text": "Sign in",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.aff0766a5290",
    "scope": "app.admin.page",
    "text": "Review",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.111ec5778725",
    "scope": "app.admin.page",
    "text": "Platform overview",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.54715e57dfbe",
    "scope": "app.admin.page",
    "text": "All platform metrics",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.8da6a8b868d1",
    "scope": "app.admin.page",
    "text": "Platform workspaces",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.06c85ff37596",
    "scope": "app.admin.page",
    "text": "Content Studio",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.48a3e0bb4219",
    "scope": "app.admin.page",
    "text": "Website content and publishing",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.632e1c583941",
    "scope": "app.admin.page",
    "text": "Payments",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.66c851a84664",
    "scope": "app.admin.page",
    "text": "Orders, receipts, and review",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.f485e1e084b2",
    "scope": "app.admin.page",
    "text": "Service operations",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.bcc977a304a3",
    "scope": "app.admin.page",
    "text": "Submissions and evidence",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c1ebc7817870",
    "scope": "app.admin.page",
    "text": "Needs attention",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.008b427f44ee",
    "scope": "app.admin.page",
    "text": "Recent admin actions",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.6b0cc904d081",
    "scope": "app.admin.page",
    "text": "Users",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d7e59444b45a",
    "scope": "app.admin.page",
    "text": "Search accounts, remove access safely, hide public content, and manage admin roles.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.3164af6836ca",
    "scope": "app.admin.page",
    "text": "records (",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.1cb989db0120",
    "scope": "app.admin.page",
    "text": "public /",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.2be78b34bb86",
    "scope": "app.admin.page",
    "text": "private)",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d70b9e24bca2",
    "scope": "app.admin.page",
    "text": "Created",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.75f39b1dac8a",
    "scope": "app.admin.page",
    "text": "- Last sign-in",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d18c25d082b5",
    "scope": "app.admin.page",
    "text": "Public content hidden by admin.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.dd2800d0bbb6",
    "scope": "app.admin.page",
    "text": "Admin note saved.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.f3509b8f0fb6",
    "scope": "app.admin.page",
    "text": "Open User",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.17a55a6c7ad2",
    "scope": "app.admin.page",
    "text": "No users match this view.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.535e52e4a261",
    "scope": "app.admin.page",
    "text": "Profiles",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.745a9d7a5e16",
    "scope": "app.admin.page",
    "text": "Open, edit, archive, restore, and filter QRguitar Profiles without changing permanent QR URLs.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.ade9248e0132",
    "scope": "app.admin.page",
    "text": "Trust",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.5b6a644bd4fb",
    "scope": "app.admin.page",
    "text": "Binary trust controls only: Verified / Unverified and Authenticity Confirmed / Authenticity Unconfirmed.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.da0417f9d15b",
    "scope": "app.admin.page",
    "text": "Verification badge",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e564b4081d7a",
    "scope": "app.admin.page",
    "text": "hidden",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.baaf53622a51",
    "scope": "app.admin.page",
    "text": "shown",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.62342d1b22d0",
    "scope": "app.admin.page",
    "text": "- Authenticity badge",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.b7bd692adff7",
    "scope": "app.admin.page",
    "text": "Full Editor",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.8f85aa39faec",
    "scope": "app.admin.page",
    "text": "Set Unverified",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.41027c82a143",
    "scope": "app.admin.page",
    "text": "Set Verified",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.f9121dc0ecba",
    "scope": "app.admin.page",
    "text": "Set Unconfirmed",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.047e47196b66",
    "scope": "app.admin.page",
    "text": "Set Confirmed",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.835e583fbfed",
    "scope": "app.admin.page",
    "text": "Show Verified Badge",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.91d97bb55b4e",
    "scope": "app.admin.page",
    "text": "Hide Verified Badge",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.28eb47f029a8",
    "scope": "app.admin.page",
    "text": "Show Auth Badge",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.326e149ea3d3",
    "scope": "app.admin.page",
    "text": "Hide Auth Badge",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.bcfe582914e4",
    "scope": "app.admin.page",
    "text": "Edit Notes",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.75597e2cf553",
    "scope": "app.admin.page",
    "text": "No Profiles match this trust view.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.df31ef411c65",
    "scope": "app.admin.page",
    "text": "Lost and stolen status controls. Private safety notes never appear here.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.fef2952cf974",
    "scope": "app.admin.page",
    "text": "No public safety note.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.51e1357de85b",
    "scope": "app.admin.page",
    "text": "Lost",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.802f1e73e901",
    "scope": "app.admin.page",
    "text": "Stolen",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.df2d620da826",
    "scope": "app.admin.page",
    "text": "No Profiles match this safety view.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c417cb88e3fd",
    "scope": "app.admin.page",
    "text": "Transfers",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.7732bf269ab9",
    "scope": "app.admin.page",
    "text": "Track ownership handoffs, review transfer status, and jump back to the related record or account.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.4538b821a0d6",
    "scope": "app.admin.page",
    "text": "QRguitar Profile",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.b23a6a8439c0",
    "scope": "app.admin.page",
    "text": "unknown",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c5adcca45065",
    "scope": "app.admin.page",
    "text": "no public page",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.218197693424",
    "scope": "app.admin.page",
    "text": "From",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.f8aa976cd0da",
    "scope": "app.admin.page",
    "text": "unknown owner",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.9c3b0b991fe3",
    "scope": "app.admin.page",
    "text": "- To",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.ca1844969742",
    "scope": "app.admin.page",
    "text": "Unavailable",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c69597d150a6",
    "scope": "app.admin.page",
    "text": "- Accepted",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.1ecbb542e647",
    "scope": "app.admin.page",
    "text": "Claim link is active until the transfer is accepted or cancelled.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.fec2ac0f4cf1",
    "scope": "app.admin.page",
    "text": "Edit Profile",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.5696fccbb87e",
    "scope": "app.admin.page",
    "text": "Open Public Page",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.546a08b7b367",
    "scope": "app.admin.page",
    "text": "Private, archived, or removed transfer records do not have an active public page.",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.f4050b85b9bc",
    "scope": "app.admin.page",
    "text": "No public page",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.75a5de478ca7",
    "scope": "app.admin.page",
    "text": "View From User",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.f694c0211d70",
    "scope": "app.admin.page",
    "text": "View Recipient",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.222e0344a18c",
    "scope": "app.admin.page",
    "text": "Copy Claim Link",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.dc5324346ff0",
    "scope": "app.admin.page",
    "text": "Cancel Transfer",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.ae6d6f366b4d",
    "scope": "app.admin.page",
    "text": "No transfers match this view.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.b8a312c027f5",
    "scope": "app.admin.page",
    "text": "Ownership Claims",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.8d8feaed8889",
    "scope": "app.admin.page",
    "text": "Review ownership requests and their private supporting evidence. Serial matches never transfer ownership automatically.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.46cd37b5b3b5",
    "scope": "app.admin.page",
    "text": "Protected Profile",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.f7711d1542c0",
    "scope": "app.admin.page",
    "text": "private evidence",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.3b9c358f36f0",
    "scope": "app.admin.page",
    "text": "file",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.3d7db37d08f9",
    "scope": "app.admin.page",
    "text": "files",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.25ab4e4d0a89",
    "scope": "app.admin.page",
    "text": "Declaration:",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.64900440a8c9",
    "scope": "app.admin.page",
    "text": "Submitted",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.1a3ca5ca1b90",
    "scope": "app.admin.page",
    "text": "Review Profile",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.6007acbe30b2",
    "scope": "app.admin.page",
    "text": "Approve",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c70ac5da44ee",
    "scope": "app.admin.page",
    "text": "Request evidence",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.05a2d7332eb9",
    "scope": "app.admin.page",
    "text": "Deny",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.1c29efccf85b",
    "scope": "app.admin.page",
    "text": "Expire",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.21e5d1dcec19",
    "scope": "app.admin.page",
    "text": "No ownership claims require review.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.03867aea70ac",
    "scope": "app.admin.page",
    "text": "Evidence",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.359a3d77ce0c",
    "scope": "app.admin.page",
    "text": "Document metadata only. Raw private storage paths are never shown.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d6bd8c0aeee8",
    "scope": "app.admin.page",
    "text": "Document",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.71c5fa64dc2c",
    "scope": "app.admin.page",
    "text": "- Created",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.3883a4f48ffc",
    "scope": "app.admin.page",
    "text": "Open Editor",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c08650fea299",
    "scope": "app.admin.page",
    "text": "No evidence documents match this view.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.8b0adc9c9815",
    "scope": "app.admin.page",
    "text": "Service History",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.b8666cc8c526",
    "scope": "app.admin.page",
    "text": "Service-entry metadata. Private notes are not shown in this admin list.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.ef49d7a68372",
    "scope": "app.admin.page",
    "text": "Service entry",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d677190e0a99",
    "scope": "app.admin.page",
    "text": "Service",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.6299dec2fd7d",
    "scope": "app.admin.page",
    "text": "No service date",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.f0a53c8652d6",
    "scope": "app.admin.page",
    "text": "No shop listed",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.1ee8786a79c8",
    "scope": "app.admin.page",
    "text": "No location listed",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.403501789107",
    "scope": "app.admin.page",
    "text": "No service entries match this view.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.aa89f2bd41f2",
    "scope": "app.admin.page",
    "text": "Brand Logos",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.f7e70a928a09",
    "scope": "app.admin.page",
    "text": "Manage official brand logos with an HTTPS URL or a site-relative path beginning with one slash. User uploads never become brand logos.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.090ed4316f1d",
    "scope": "app.admin.page",
    "text": "Brand",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d71410ead047",
    "scope": "app.admin.page",
    "text": "Choose a brand",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.0b680d3f2da3",
    "scope": "app.admin.page",
    "text": "Transparent logo URL or site path",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.8cad814a1a4b",
    "scope": "app.admin.page",
    "text": "/logos/brand.svg or https://example.com/logo.png",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.dc85af8f2b1d",
    "scope": "app.admin.page",
    "text": "Saving...",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c69542744db9",
    "scope": "app.admin.page",
    "text": "Save Logo",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.324b134f57c7",
    "scope": "app.admin.page",
    "text": "Preview",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.464c4ffd019e",
    "scope": "app.admin.page",
    "text": "Edit",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.325cd61c86dc",
    "scope": "app.admin.page",
    "text": "Remove Logo",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.11129d9d4997",
    "scope": "app.admin.page",
    "text": "No official logos yet",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.3ddebd272cca",
    "scope": "app.admin.page",
    "text": "Profiles will use clean brand text until an administrator assigns an approved transparent logo.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.abc50e334be4",
    "scope": "app.admin.page",
    "text": "Signed in as",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e6e28beb50f8",
    "scope": "app.admin.page",
    "text": "authorized admin",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.44dd5f163cba",
    "scope": "app.admin.page",
    "text": "Role:",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.4895f73177ab",
    "scope": "app.admin.page",
    "text": "Not set",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e4465dd3dcd0",
    "scope": "app.admin.page",
    "text": "- Source:",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.567b78ef3aa9",
    "scope": "app.admin.page",
    "text": "- Status:",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.96879611650f",
    "scope": "app.admin.page",
    "text": "active",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e943fccff1ac",
    "scope": "app.admin.page",
    "text": "Admin access is controlled by profile role or server environment allowlists. Environment-managed access cannot be removed from this UI.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.6cf2ac95a947",
    "scope": "app.admin.page",
    "text": "User email for admin access",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.85e15e9342ac",
    "scope": "app.admin.page",
    "text": "Add Admin",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.3bcf2e8dca06",
    "scope": "app.admin.page",
    "text": "Managed by environment",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.8d16ea8f7bbf",
    "scope": "app.admin.page",
    "text": "Remove Admin",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c0cf6cfaa199",
    "scope": "app.admin.page",
    "text": "Database admin",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.5169ed4a9a67",
    "scope": "app.admin.page",
    "text": "No database admin users listed.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.db62ef5c8164",
    "scope": "app.admin.page",
    "text": "Current access is managed by environment.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c3d66242c591",
    "scope": "app.admin.page",
    "text": "System Health",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e3fde139154b",
    "scope": "app.admin.page",
    "text": "Production services, release identity, integrations, and operational status.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.36d93c489ad7",
    "scope": "app.admin.page",
    "text": "Run checks",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.7f1e323b6272",
    "scope": "app.admin.page",
    "text": "Healthy",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e981ddae45d8",
    "scope": "app.admin.page",
    "text": "Warning",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.b764cdc0eab7",
    "scope": "app.admin.page",
    "text": "Unknown",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.567e6d18e458",
    "scope": "app.admin.page",
    "text": "Release identity",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.9e471951a1b4",
    "scope": "app.admin.page",
    "text": "Environment",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.8481c59531c6",
    "scope": "app.admin.page",
    "text": "Local QA",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.574737f4b500",
    "scope": "app.admin.page",
    "text": "Build SHA",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.870a8ffd98f4",
    "scope": "app.admin.page",
    "text": "Deployment",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.918c893908aa",
    "scope": "app.admin.page",
    "text": "Git state",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.7c6d009716c5",
    "scope": "app.admin.page",
    "text": "Dirty review candidate",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.7516a9f3a65c",
    "scope": "app.admin.page",
    "text": "Reported clean",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.7b368d657608",
    "scope": "app.admin.page",
    "text": "Canonical local origin",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.358cc201f87d",
    "scope": "app.admin.page",
    "text": "Operations",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.25be9dd9f53a",
    "scope": "app.admin.page",
    "text": "Profiles loaded",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.61d81254336e",
    "scope": "app.admin.page",
    "text": "Recent audit events",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.9639382ac623",
    "scope": "app.admin.page",
    "text": "Content publishing",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.35194ad54b90",
    "scope": "app.admin.page",
    "text": "Shared server-backed source",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.96f34bd1021a",
    "scope": "app.admin.page",
    "text": "Required migrations",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.5fa7aac5375c",
    "scope": "app.admin.page",
    "text": "Ready",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c982b23dfadd",
    "scope": "app.admin.page",
    "text": "Last check",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.ca566c8968e7",
    "scope": "app.admin.page",
    "text": "Signed in",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.abe20ea47cc7",
    "scope": "app.admin.page",
    "text": "Authorized admin",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.3b4ed4a764ca",
    "scope": "app.admin.page",
    "text": "Access source",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.47751f88edff",
    "scope": "app.admin.page",
    "text": "Audit Log",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.a6984f1868ef",
    "scope": "app.admin.page",
    "text": "Human-readable admin action history. Metadata is summarized behind details controls.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.10ed84df24ae",
    "scope": "app.admin.page",
    "text": "Export safe JSON",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.cd560284860f",
    "scope": "app.admin.page",
    "text": "Admin operator -",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.34a04005bcaf",
    "scope": "app.admin.page",
    "text": "target",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.789bc6410570",
    "scope": "app.admin.page",
    "text": "No reason listed",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.45989de49fb7",
    "scope": "app.admin.page",
    "text": "Details",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d51efa005048",
    "scope": "app.admin.page",
    "text": "No audit events match this view.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c3328e05169f",
    "scope": "app.admin.page",
    "text": "Close user details",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.66ac4249df2e",
    "scope": "app.admin.page",
    "text": "User details for {{value1}}",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.78388698fe5e",
    "scope": "app.admin.page",
    "text": "User account",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.7d9eb7acb13e",
    "scope": "app.admin.page",
    "text": "Close",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e696100c1a43",
    "scope": "app.admin.page",
    "text": "Public / private",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.3386f588f0c2",
    "scope": "app.admin.page",
    "text": "Account access",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.a7104c2c90ad",
    "scope": "app.admin.page",
    "text": "Unlock account",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.18a702c5399d",
    "scope": "app.admin.page",
    "text": "Lock account",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.543e2f94847c",
    "scope": "app.admin.page",
    "text": "Unban user",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.29b589a60a8a",
    "scope": "app.admin.page",
    "text": "Ban user",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.88ae7f79b8c0",
    "scope": "app.admin.page",
    "text": "Restore user",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.84a18f0e0474",
    "scope": "app.admin.page",
    "text": "Remove user",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.26b14d7dca4a",
    "scope": "app.admin.page",
    "text": "Public presence",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.1c0af42d56c5",
    "scope": "app.admin.page",
    "text": "Restore public content",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e5db012228a6",
    "scope": "app.admin.page",
    "text": "Hide public content",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.4b42c6690ebe",
    "scope": "app.admin.page",
    "text": "Administration",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e987caf5e975",
    "scope": "app.admin.page",
    "text": "Remove admin",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.606c13cb01b1",
    "scope": "app.admin.page",
    "text": "Add admin",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.f4377182ae81",
    "scope": "app.admin.page",
    "text": "Internal note",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.583317a2bfb3",
    "scope": "app.admin.page",
    "text": "Permanent action",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.b530d24457c5",
    "scope": "app.admin.page",
    "text": "Permanent account deletion unavailable",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.5306887e2f26",
    "scope": "app.admin.page",
    "text": "Close Profile details",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.bc68de5dbe4f",
    "scope": "app.admin.page",
    "text": "Profile details for {{value1}}",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.4339bb439318",
    "scope": "app.admin.page",
    "text": "No owner",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d4262f628982",
    "scope": "app.admin.page",
    "text": "Service / evidence",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.ed077f3d8125",
    "scope": "app.admin.page",
    "text": "Open",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.aa189cf874d6",
    "scope": "app.admin.page",
    "text": "Full editor",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.6f3c838c26c3",
    "scope": "app.admin.page",
    "text": "Public Profile",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.81f879eaea93",
    "scope": "app.admin.page",
    "text": "Make public",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e83dbc0a3f6b",
    "scope": "app.admin.page",
    "text": "Make private",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.ed8638486b8f",
    "scope": "app.admin.page",
    "text": "Trust and safety",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.5baf6cf2d6d3",
    "scope": "app.admin.page",
    "text": "Set unverified",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.844d96004955",
    "scope": "app.admin.page",
    "text": "Set verified",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.10ddf273c018",
    "scope": "app.admin.page",
    "text": "Set unconfirmed",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.8d2419b8fa92",
    "scope": "app.admin.page",
    "text": "Confirm authenticity",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.aca51557b8b3",
    "scope": "app.admin.page",
    "text": "Safety details",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.66f4804ee23d",
    "scope": "app.admin.page",
    "text": "Archive",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c4c38cb94355",
    "scope": "app.admin.page",
    "text": "Archiving removes the Profile from active public surfaces without changing its permanent QRguitar ID.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.7f610fde72d0",
    "scope": "app.admin.page",
    "text": "Restore Profile",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.38cdb6bf032e",
    "scope": "app.admin.page",
    "text": "Archive Profile",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.ab4aa617a9a8",
    "scope": "app.admin.page",
    "text": "Open admin navigation",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.2b06d01c3eba",
    "scope": "app.admin.page",
    "text": "QRguitar / Admin",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.5cbd26b5d984",
    "scope": "app.admin.page",
    "text": "Search users, Profiles, or IDs",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.3c86be3eae40",
    "scope": "app.admin.page",
    "text": "Temporarily unavailable",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.0dfe1d63c9d8",
    "scope": "app.admin.page",
    "text": "Checking",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.255346f25669",
    "scope": "app.admin.page",
    "text": "Sign in required",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.3e761ea14625",
    "scope": "app.admin.page",
    "text": "Admin navigation",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e145db962517",
    "scope": "app.admin.page",
    "text": "QRguitar Admin",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.084a671688b6",
    "scope": "app.admin.page",
    "text": "Close admin navigation",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.e636d7cdcb63",
    "scope": "app.admin.page",
    "text": "{{value1}} sections",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d4b1ea5708dd",
    "scope": "app.admin.page",
    "text": "Overview",
    "page": "Admin",
    "area": "Product",
    "section": "Navigation and choices",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.1c85c12229a4",
    "scope": "app.admin.page",
    "text": "Claims",
    "page": "Admin",
    "area": "Product",
    "section": "Navigation and choices",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.5bdba306d978",
    "scope": "app.admin.page",
    "text": "Brand Registry",
    "page": "Admin",
    "area": "Product",
    "section": "Navigation and choices",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.aa6578c24cd0",
    "scope": "app.admin.page",
    "text": "Admin Access",
    "page": "Admin",
    "area": "Product",
    "section": "Navigation and choices",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.69012983f67d",
    "scope": "app.admin.page",
    "text": "Admin workspaces",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.1377264ba3b0",
    "scope": "app.admin.page",
    "text": "Workspaces",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.9ab150d3af8e",
    "scope": "app.admin.page",
    "text": "Promo codes",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.70d603a1a8ef",
    "scope": "app.admin.page",
    "text": "Deletion requests",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d76960a17040",
    "scope": "app.admin.page",
    "text": "Checking admin access.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.12565e67c555",
    "scope": "app.admin.page",
    "text": "Admin is temporarily unavailable.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c53c5be7e3a2",
    "scope": "app.admin.page",
    "text": "Confirming your session before admin tools load.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.f7ce008a3276",
    "scope": "app.admin.page",
    "text": "Your session exists, but QRguitar could not verify admin access or load the admin service.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.ea4603af6095",
    "scope": "app.admin.page",
    "text": "Admin tools stay hidden until an authorized admin account is signed in.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.a16c8b1c9595",
    "scope": "app.admin.page",
    "text": "Retrying…",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.a080dac3297a",
    "scope": "app.admin.page",
    "text": "Retry admin access",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.4b9ba740f352",
    "scope": "app.admin.page",
    "text": "Admin data is temporarily unavailable.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.c1265c4bbbf8",
    "scope": "app.admin.page",
    "text": "QRguitar could not load all required admin data.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.343aad82ce4d",
    "scope": "app.admin.page",
    "text": "Retry admin data",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.7792c9b3f23d",
    "scope": "app.admin.page",
    "text": "Confirm admin action",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.19766ed6ccb2",
    "scope": "app.admin.page",
    "text": "Cancel",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d1f23f0d1361",
    "scope": "app.admin.page",
    "text": "Impact",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.115dbbb6039f",
    "scope": "app.admin.page",
    "text": "This changes operational data immediately. The action is recorded in the audit trail and the affected view is refreshed.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.9c5a83b1b171",
    "scope": "app.admin.page",
    "text": "Reversible where the corresponding restore action is available",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.5013bf64080b",
    "scope": "app.admin.page",
    "text": "Role after removing admin access",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.a49c49b04c4d",
    "scope": "app.admin.page",
    "text": "Choose a role",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.090940e73258",
    "scope": "app.admin.page",
    "text": "Builder",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.90f5e27cca2a",
    "scope": "app.admin.page",
    "text": "Service Shop",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.85a5eb20c15e",
    "scope": "app.admin.page",
    "text": "Operator reason",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.d5bc853f6cc7",
    "scope": "app.admin.page",
    "text": "Required for the audit trail",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.0ae690f1b1e9",
    "scope": "app.admin.page",
    "text": "Internal admin note",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.118e1524b882",
    "scope": "app.admin.page",
    "text": "Public verification note",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.f4a130abf8de",
    "scope": "app.admin.page",
    "text": "Internal verification note",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.42af0e4ee0c2",
    "scope": "app.admin.page",
    "text": "Public authenticity note",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.010edcad212d",
    "scope": "app.admin.page",
    "text": "Internal authenticity note",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.804f3c9e9556",
    "scope": "app.admin.page",
    "text": "Public safety note",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.3bbf81ca7df1",
    "scope": "app.admin.page",
    "text": "Private/internal safety note",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.23e39291d613",
    "scope": "app.admin.page",
    "text": "Saving…",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.page.eebdd24a77d9",
    "scope": "app.admin.page",
    "text": "Confirm",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/page.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.34278a6f294f",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Admin / Commerce / Payment review",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.a1710ccfc2f5",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Payment operations",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.33b4b75252aa",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Review payments and holds.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.8c2fe50e2f61",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Automatic PayPal exceptions use provider-verified evidence. Manage checkout offers in",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.9ab150d3af8e",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Promo codes",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.2f2709d238dd",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": ". Older manual-payment tools remain available in the collapsed archive below.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.fe0ddad713cf",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Legacy manual-payment archive",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.33fff3f90748",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": " · {{value1}} visible order{{value2}}",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.d921c5b4d03d",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Use this queue only for a manual order that already exists. New QRguitar checkout uses automatic PayPal verification.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.d16a8d2544ff",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Legacy manual payments",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.37bd723bb8f7",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Verify received funds",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.ec963ffc911b",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Checking…",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.9b197d377e95",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Refresh archive",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.cef8da128343",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Checking admin access and loading payments…",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.ac2e14a6d819",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Sign in with an admin account.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.bfd402b2f6f3",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Sign in",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.de72cfdbc99b",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Payment review is unavailable.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.d8b8392e2c54",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Try again",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.54fae98910f3",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Test ledger",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.fa20b4120827",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Do not request real transfers for test orders. Grants here belong to the test environment.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.8ba7d4d17873",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Find an order by its full reference",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.4514f9577700",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "QRG-… or order UUID",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.a0c2216c0147",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Find order",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.8252ee086327",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Back to queue",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.3dbedbbba681",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "A review decision needs confirmation.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.d5d91b91700b",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "The previous response was interrupted. Refresh the queue or retry the saved decision with its original reference before making another decision.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.fe14a2454005",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Retry saved decision",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.cc9261f8f6d9",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Payment orders",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.72668279b4bd",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "No matching order.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.f1f04fc706ec",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "No payments in the queue.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.3f5447844e53",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Check the full order reference and the current environment.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.12ad15a04c13",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Orders appear here when a customer prepares a payment.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.d696a35bdd18",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Profile",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.ecc4873a1694",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "credit",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.be379a30f1aa",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "credits",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.7e1b0d5641f2",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Account",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.e645cb0065f8",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "This queue shows a limited set of orders. Use the full order reference above to find an older payment.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.1a928afebcde",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Selected payment",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.daddf278b48a",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Choose an order to review.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.ab93468e634b",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Confirm the recipient, amount, currency and order reference in the payment provider’s own transaction record.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.ca99b7f1b14e",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Expected",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.179cfdb33651",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "USD ·",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.b948ac04b854",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Payment method",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.d373ff340f2b",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Receiving account",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.6b8d54126b89",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Customer account",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.c7649fcefd0c",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Customer’s reference",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.8b427d8a72e0",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Not supplied",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.d70b9e24bca2",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Created",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.f899de9d4ced",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "This request is closed. A late payment can still be recorded after checking the actual transaction; its credits are held for review.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.64cff1319d2f",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Action",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.4d114cc8ac19",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Verify late payment and record held credits",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.12e7892a9480",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Verify received payment and add credits",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.92262d7ba6f0",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Close an unpaid request",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.09b221c26d46",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Record a refund or dispute and hold credits",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.df2d077235a5",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Close only after confirming that no payment was received or is in progress. Closing adds no credits and does not refund money.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.3f9ccbc08b0a",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "I checked the receiving account and confirmed there is no received or in-progress payment for this order.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.046bf9bffb47",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Review reason",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.6b37bd35081f",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Refund",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.3a8931a9b2f6",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Dispute",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.c50c6f28cff9",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Completed payment amount before provider fees (USD)",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.627720781bcd",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Use the gross transaction amount, not the net payout after fees. It must match",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.04be8f338087",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Original incoming payment transaction ID",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.662bf26a2b5d",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Provider transaction ID",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.bfa97e581140",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Enter the original payment ID recorded when this order was verified. Put the refund or dispute reference in the audit reason below.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.c5941f5db620",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Use the provider’s unique transaction reference, not the customer’s screenshot or QRguitar order number.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.52d573d90aa5",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "I checked QRguitar’s receiving account and confirmed this completed payment belongs to this order, in the exact amount and currency above.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.05ec1534a2d5",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "I checked the provider’s record and confirmed this refund or dispute. I understand this places paid credits on hold; it does not issue a refund.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.8b7149d3bc93",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Reason for the audit trail",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.9222188df271",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "At least 10 characters. Include the matching facts or provider review reference.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.23e39291d613",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Saving…",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.decd9379c596",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Record late payment and hold {{value1}} credits",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.1635f386208c",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Verify receipt and add {{value1}} credits",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.408ff9eae255",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Close unpaid request",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.AdminPaymentsPage.9628653e05e7",
    "scope": "app.admin.payments.AdminPaymentsPage",
    "text": "Record review and hold paid credits",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/AdminPaymentsPage.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.3de6b4aace7b",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Automatic PayPal exceptions",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.dd82d114dfb6",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Resolve verified payment holds",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.ec963ffc911b",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Checking…",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.9b6ac0bb92b0",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Refresh holds",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.7b7a25b992ba",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "PayPal’s verified refund, dispute, reversal, and late-capture evidence appears here. Decisions only keep or release an existing credit hold. They cannot create a payment, grant credits, or send a refund.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.2f17062702dd",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Loading verified PayPal holds…",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.3c11457acff5",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Automatic payment review is unavailable.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.54fae98910f3",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Test ledger",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.86ca17c81267",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "These decisions affect only the isolated test billing ledger.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.d0fe264a967c",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "A payment operation needs confirmation.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.7d3f5a212283",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "The response was interrupted. Retry the exact saved operation before choosing another.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.2a7368352ee1",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Retry saved operation",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.e144af1d6903",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Webhook delivery health",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.a47306c43346",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Recover interrupted PayPal events",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.059cb822132b",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "This queue contains nonterminal or quarantined PayPal deliveries. A continuation is audited and advances one bounded delivery step with at most one financial effect; it does not bypass PayPal verification or grant credits by itself.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.5c3878c771b9",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "PayPal webhook deliveries",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.4eb90626332b",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "No interrupted deliveries.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.bf9123b4fb85",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "PayPal’s durable delivery queue has no pending or quarantined items.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.bb132e07e0f3",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Quarantined",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.5b6d7aa6820c",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Retry scheduled",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.8b856f7ac093",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Processing pending",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.e7b85f94ce9c",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Unverified event",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.4664827f8e89",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Progress",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.b5b927b44b84",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "· attempt",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.7869b54640f8",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Error {{value1}}",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.0041fafff42a",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Updated {{value1}}",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.a53ce07fa503",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Selected PayPal delivery",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.2198e94dc4e6",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Choose a delivery to inspect.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.fdbe640cefad",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Continue a queued delivery, retry a failed delivery, or acknowledge an irrecoverable alert after investigation.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.0dbe17366cfa",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Credit safety",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.007f184f2249",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Active PayPal holds",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.aec6e81fe48a",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Automatic PayPal holds",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.297828dd1779",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "No active PayPal holds.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.4e5b0ed8e55c",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Verified payment exceptions will appear here until an administrator releases the corresponding hold.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.d696a35bdd18",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Profile",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.ecc4873a1694",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "credit",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.be379a30f1aa",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "credits",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.7e1b0d5641f2",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Account",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.673b7a226b63",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "More active holds exist. Resolve the visible cases, then refresh the queue.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.e968a1d1b3bf",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Selected automatic PayPal hold",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.2017b02ce236",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Choose a verified hold.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.f6d008c4de41",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Compare the allowlisted provider event, resource, status, and amount with the case in PayPal before deciding.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.c7320091c81a",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Unverified PayPal event",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.52bfe584a5fc",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Delivery",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.1d10bcb2277d",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Provider event",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.0f32872bb6d9",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Not verified yet",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.28391d3bc64e",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "of",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.b23a6a8439c0",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "unknown",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.8726418e59e7",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "items ·",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.1ac7d61d1d29",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "attempts",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.5488d837f5f6",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Last error",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.aab6c5e60535",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "None recorded",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.94158821ee38",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Next attempt",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.a789e9e05ec6",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Lease",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.35947ea186fd",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Processing lease until {{value1}}",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.8b3c74d85f65",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "No active processor lease",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.49f19beeecf4",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Received",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.3a5ecca188c0",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Updated",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.e95aab8d1b57",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Recovery material",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.37accfb28ef1",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Signed payload available to the server",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.a488fdcd1450",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Verified frozen plan available",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.40b2d645e8ce",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Expired or unavailable",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.76249636420d",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "This audited action makes the delivery eligible now and runs one bounded processing step with at most one financial effect. Provider verification and ledger idempotency still apply.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.ec7daef3f929",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "The short-term verification payload has expired. Acknowledging removes this delivery alert after investigation. It does not resolve or release any financial hold, grant credits, create a payment, or invent a replacement event.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.2e2d4fb6c11d",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "I reviewed this delivery’s status and want to run one audited continuation step.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.1de73c5f6723",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "I investigated this irrecoverable delivery alert and understand that its financial holds remain separate.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.60bf1a60ab92",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Reason for continuation",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.f234502545f0",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Investigation outcome",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.9a3c970787ac",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "At least 10 characters.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.5dfea02a5bae",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Record why another processing step is appropriate.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.14fb10590703",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Record the provider and ledger checks completed before acknowledging.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.23e39291d613",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Saving…",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.9b315e36be4b",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Continue one delivery step",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.fe4f47a7644c",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Acknowledge delivery alert",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.60c977ad6754",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "This delivery has an active processor lease. Refresh after the lease ends; no operator reset is available while another process owns it.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.a59577ea660d",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Expected purchase",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.179cfdb33651",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "USD ·",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.8b427d8a72e0",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Not supplied",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.25b1fe3f0719",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": " · {{value1}}",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.45bcaf31e667",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": " · item {{value1}}",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.9dcadbf3f343",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Provider resource",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.9223e5c6b800",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Provider case",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.48dfa22dab2a",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "PayPal order",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.1900b478a586",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Capture",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.231b7f031691",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Provider status",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.b7fbf33bb9f5",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Verified event amount",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.6b8d54126b89",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Customer account",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.b5cb70e4f149",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Hold created",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.1bd11616c883",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Hold retained after review",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.640ae4baf960",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Decision",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.80c2c5c410ea",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Keep paid credits on hold",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.db9941468bfe",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Release this hold",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.577d423818b2",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Release only after PayPal shows the case is resolved and the remaining paid credits are safe to use. Other active holds can still keep the account paused.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.0d0e6da87b42",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Retaining records an audited review and leaves the account’s paid credits unavailable.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.209d335b7cae",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "I verified the provider case is resolved and this specific hold can be released.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.b2f4ec565c90",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "I reviewed the provider evidence and this hold must remain active.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.8b7149d3bc93",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Reason for the audit trail",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.354a2610954a",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "At least 10 characters. Include the PayPal case outcome or the facts that require continued review.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.payments.PayPalReviewQueue.c0ffc0c91415",
    "scope": "app.admin.payments.PayPalReviewQueue",
    "text": "Record review and keep hold",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/payments/PayPalReviewQueue.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.0da533822a1b",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Promo settings saved.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.4265decbed26",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Redemptions could not be loaded.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.16e881b44db3",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Admin / Commerce / Promo codes",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.8a40e6aeedf2",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Commerce",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.9ab150d3af8e",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Promo codes",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.e0da29dd7196",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Create and control checkout discounts without changing your Profile pack prices.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.0e9161011702",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Refresh",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.16c698d4c765",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "New promo code",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.6b31d25095ab",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Loading promo codes…",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.34ce755e229e",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Admin sign-in required",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.bfd402b2f6f3",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Sign in",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.cf81b9789278",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Promo codes are unavailable.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.d8b8392e2c54",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Try again",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.dc3652f3b0e9",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Promotion summary",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.96879611650f",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "active",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.e5a4a69c8e5f",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "paid orders",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.a9bb42e53a0e",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "gross captured",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.1df19ab2c46a",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Gross captured is the checkout amount before PayPal fees and does not subtract refunds or disputes. Orders with a refund or dispute are flagged separately.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.9e06032de5e4",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "test pricing is active",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.bb428c470878",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Admin-only $0.30 checkout for PayPal, card, and Venmo acceptance tests.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.b2d76fe0c72d",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Admin-only $1.00 checkout for Apple Pay acceptance tests.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.858e4ba7a29f",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Pause",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.e0d1d308a679",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Codes",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.b7564a98dd3f",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Show deleted codes",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.706db2ffdc22",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "No promo codes yet.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.fa86ce302e53",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Create one when you need a launch offer, private test total, or customer recovery credit.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.eb9b3c6514e2",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Internal only",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.07fc74f1706c",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "No internal description.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.27c545b1467d",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Profile packs",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.9e6151acb057",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Uses",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.4ad4a6d71382",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "paid ·",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.2b6b853c9e59",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "in progress",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.e577694152af",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": " · {{value1}} refund/dispute flagged",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.9fbe03ec90ed",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": " · {{value1}} max",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.f4830a1dae29",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Schedule",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.0fe556b25edd",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Immediately",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.6c43e8399a11",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "No end date",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.2793293fdc77",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Gross captured",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.464c4ffd019e",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Edit",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.d640c7421da0",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Resume",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.e2d0a54968ea",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Delete",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.26339839165e",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "View activity for {{value1}}",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.38da1505ca83",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Activity",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.c1873f8b0102",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Recent uses",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.ba3bbbe10d8b",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Loading…",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.54a8b4a2444c",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "No checkout has used this code.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.99c40ab40592",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Date",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.7e1b0d5641f2",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Account",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.80dc21673e55",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Pack",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.c9b3c38247f7",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Total",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.920e413c7d41",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Status",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.535e52e4a261",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Profiles",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.964de7c92efe",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Change history",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.9fe2d22de32e",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "No changes have been recorded.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.c0bf75bd78bf",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Change",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.c1c224b03cd9",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Admin",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.f81ab834de5f",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Reason",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.c281c642339e",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "· revision",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.8a95a224a545",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Deleted admin",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.7d9eb7acb13e",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Close",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.6473b3f196fa",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Delete promo code",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.f16060698598",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "It will stop working immediately. Payment, redemption, and change history will remain available for your records.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.19766ed6ccb2",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Cancel",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.43b5894c3e4e",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Deleting…",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.b783180f921b",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Delete code",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.e8fa111dcaf5",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Edit promo",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.b8c98da932bc",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "New promo",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.c24a413eec4a",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Create a promo code",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.340f463033e0",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Code",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.e1261692acf2",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "3–32 letters, numbers, dashes, or underscores. A code cannot be renamed.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.dcd1d5223f73",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Name",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.a1499b095201",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Internal description",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.1bf0c98cbb3d",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Start status",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.e159b06187d3",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Paused",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.92340695899b",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Active",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.b551416a997c",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Audience, test total, minimum, and eligible packs are protected. You can still change the description, schedule, limits, or pause this code.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.82d9af69e1a1",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Who can use it",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.b962e22b63e3",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "All signed-in customers",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.01ad8a325b57",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Admins only · internal testing",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.5fc1bee6f576",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Discount type",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.3ef91808fe1d",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Percent off",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.4d7bd8c702da",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Dollar amount off",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.dcd6970e8aea",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Set final checkout total",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.716d633b125a",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Percent",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.4f7e2973451c",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Final total (USD)",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.5885859950ca",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Amount off (USD)",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.36c84f77ee41",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Minimum pack price (USD)",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.75d0a7642fe8",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "No minimum",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.f4efe4b320a8",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "The regular pack price required before this code can apply.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.8ccfba6d3739",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Eligible Profile packs",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.3eda8b62d6a9",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "1 Profile",
    "page": "Admin",
    "area": "Product",
    "section": "Navigation and choices",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.ebd500dd81fb",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "10 Profiles",
    "page": "Admin",
    "area": "Product",
    "section": "Navigation and choices",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.329f23c525ce",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "25 Profiles",
    "page": "Admin",
    "area": "Product",
    "section": "Navigation and choices",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.96dbedeca7df",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Starts",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.e98982c9f2ba",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Ends",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.27293bf74e83",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Total use limit",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.f7fcff0d8fea",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "No limit",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.4d794e051d35",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Uses per account",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.23e39291d613",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Saving…",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.dd0ae7a5cbcf",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Save changes",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.promotions.PromoCodesPage.97f9a49317f5",
    "scope": "app.admin.promotions.PromoCodesPage",
    "text": "Create promo code",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/promotions/PromoCodesPage.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.82ffb5c6aa67",
    "scope": "app.admin.service.workflow.page",
    "text": "Sign in with an authorized admin account.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.8a5ac97eda6c",
    "scope": "app.admin.service.workflow.page",
    "text": "Service workflow could not be loaded.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.e526f190f685",
    "scope": "app.admin.service.workflow.page",
    "text": "Service workflow could not be loaded: {{value1}}",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.e93c28a5bbd2",
    "scope": "app.admin.service.workflow.page",
    "text": "Service workflow could not be loaded. Check your connection and retry.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.9daf320342e3",
    "scope": "app.admin.service.workflow.page",
    "text": "Refreshing service operations for this account.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.2fcab2f0dff4",
    "scope": "app.admin.service.workflow.page",
    "text": "The admin action could not be completed. Try again.",
    "page": "Admin",
    "area": "Product",
    "section": "Feedback",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.345c74235673",
    "scope": "app.admin.service.workflow.page",
    "text": "Back to Admin",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.1370cd33efbe",
    "scope": "app.admin.service.workflow.page",
    "text": "Admin service operations",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.02bcf9461972",
    "scope": "app.admin.service.workflow.page",
    "text": "Providers and submissions.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.b91be765af15",
    "scope": "app.admin.service.workflow.page",
    "text": "Review provider status, private evidence metadata, notification state, and the audit trail without approving on an owner's behalf.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.5c4c1964340a",
    "scope": "app.admin.service.workflow.page",
    "text": "provider",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.1e19bab29bc6",
    "scope": "app.admin.service.workflow.page",
    "text": "providers",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.293f1d2ee206",
    "scope": "app.admin.service.workflow.page",
    "text": "submission",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.21e945ad5e3b",
    "scope": "app.admin.service.workflow.page",
    "text": "submissions",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.960ed4ae09e0",
    "scope": "app.admin.service.workflow.page",
    "text": "Search providers and submissions",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.cfcdf881d979",
    "scope": "app.admin.service.workflow.page",
    "text": "Search provider, Profile, or work",
    "page": "Admin",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.eeb12e9125ef",
    "scope": "app.admin.service.workflow.page",
    "text": "Submission status",
    "page": "Admin",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.8ee57323a6f2",
    "scope": "app.admin.service.workflow.page",
    "text": "All statuses",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.ebf12ef47cf5",
    "scope": "app.admin.service.workflow.page",
    "text": "Draft",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.64900440a8c9",
    "scope": "app.admin.service.workflow.page",
    "text": "Submitted",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.10a92a8ad3ee",
    "scope": "app.admin.service.workflow.page",
    "text": "Changes requested",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.87b42e40c2a2",
    "scope": "app.admin.service.workflow.page",
    "text": "Approved",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.dce083a2c47f",
    "scope": "app.admin.service.workflow.page",
    "text": "Declined",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.d353a99eb455",
    "scope": "app.admin.service.workflow.page",
    "text": "Cancelled",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.424a2551d356",
    "scope": "app.admin.service.workflow.page",
    "text": "Expired",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.0e9161011702",
    "scope": "app.admin.service.workflow.page",
    "text": "Refresh",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.36579725bbe7",
    "scope": "app.admin.service.workflow.page",
    "text": "Loading service operations.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.6755e16dc239",
    "scope": "app.admin.service.workflow.page",
    "text": "Admin sign-in required.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.d92c603b66e1",
    "scope": "app.admin.service.workflow.page",
    "text": "Admin access required.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.a9beddcfffc7",
    "scope": "app.admin.service.workflow.page",
    "text": "Use an authorized admin account to open Service Operations.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.bfd402b2f6f3",
    "scope": "app.admin.service.workflow.page",
    "text": "Sign in",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.e5222230e095",
    "scope": "app.admin.service.workflow.page",
    "text": "Retry access",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.2235d7becad3",
    "scope": "app.admin.service.workflow.page",
    "text": "Service Operations is temporarily unavailable.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.2b8eba2e5b40",
    "scope": "app.admin.service.workflow.page",
    "text": "Service operations could not be loaded.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.d8b8392e2c54",
    "scope": "app.admin.service.workflow.page",
    "text": "Try again",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.1f2a406ada3d",
    "scope": "app.admin.service.workflow.page",
    "text": "Service providers",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.a701acdcc02f",
    "scope": "app.admin.service.workflow.page",
    "text": "Provider accounts",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.f3ad7b9b7092",
    "scope": "app.admin.service.workflow.page",
    "text": "Verification applies to the account. It does not verify every service entry.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.1b0036566348",
    "scope": "app.admin.service.workflow.page",
    "text": "Unnamed provider",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.f697e89a6c6c",
    "scope": "app.admin.service.workflow.page",
    "text": "No business name",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.972fd71db140",
    "scope": "app.admin.service.workflow.page",
    "text": " - {{value1}}",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.5e7e4ec8ad13",
    "scope": "app.admin.service.workflow.page",
    "text": "No service categories",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.0ff0bd8902a3",
    "scope": "app.admin.service.workflow.page",
    "text": "Verified Service Provider",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.bd9dee5cd80d",
    "scope": "app.admin.service.workflow.page",
    "text": "Unverified provider",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.5e1a943d8a23",
    "scope": "app.admin.service.workflow.page",
    "text": "Internal note:",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.23e39291d613",
    "scope": "app.admin.service.workflow.page",
    "text": "Saving…",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.1a07ce7e56f2",
    "scope": "app.admin.service.workflow.page",
    "text": "Verify provider",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.4c4fb45e1d74",
    "scope": "app.admin.service.workflow.page",
    "text": "Revoke verification",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.57415e9e8362",
    "scope": "app.admin.service.workflow.page",
    "text": "No provider accounts match this view.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.175504a994a1",
    "scope": "app.admin.service.workflow.page",
    "text": "Service submissions",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.469f0138e28e",
    "scope": "app.admin.service.workflow.page",
    "text": "Private review queue",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.dd120f3a6ac6",
    "scope": "app.admin.service.workflow.page",
    "text": "Owner approval remains required before canonical service history is created.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.11d2535b20b8",
    "scope": "app.admin.service.workflow.page",
    "text": "Date not provided",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.f9d77f6cb2f2",
    "scope": "app.admin.service.workflow.page",
    "text": "Open Profile",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.472590ae974d",
    "scope": "app.admin.service.workflow.page",
    "text": "Provider",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.20e8bb9ff8ed",
    "scope": "app.admin.service.workflow.page",
    "text": "Provider account",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.03867aea70ac",
    "scope": "app.admin.service.workflow.page",
    "text": "Evidence",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.d55950afe026",
    "scope": "app.admin.service.workflow.page",
    "text": "private file",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.043a718774c5",
    "scope": "app.admin.service.workflow.page",
    "text": "s",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.969ccbd3cf63",
    "scope": "app.admin.service.workflow.page",
    "text": "Email",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.3a5ecca188c0",
    "scope": "app.admin.service.workflow.page",
    "text": "Updated",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.16e5c67bfe15",
    "scope": "app.admin.service.workflow.page",
    "text": "Notification:",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.d9f533ca8b8b",
    "scope": "app.admin.service.workflow.page",
    "text": "Private evidence",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.59281a6b2935",
    "scope": "app.admin.service.workflow.page",
    "text": "KB",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.c1ada08ce138",
    "scope": "app.admin.service.workflow.page",
    "text": "Audit trail",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.605434491c73",
    "scope": "app.admin.service.workflow.page",
    "text": "Cancel submission",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.66787aa28f19",
    "scope": "app.admin.service.workflow.page",
    "text": "Expire submission",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.1f41ae28a484",
    "scope": "app.admin.service.workflow.page",
    "text": "Mark evidence reviewed",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.admin.service.workflow.page.a666413ee9fb",
    "scope": "app.admin.service.workflow.page",
    "text": "No service submissions match this view.",
    "page": "Admin",
    "area": "Product",
    "section": "Page text",
    "source": "app/admin/service-workflow/page.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.96bc5cd7d154",
    "scope": "app.billing.BillingPage",
    "text": "Profile credits",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.878c83f68e7a",
    "scope": "app.billing.BillingPage",
    "text": "Room for what comes next.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.40f102a08e28",
    "scope": "app.billing.BillingPage",
    "text": "Loading your credit balance…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.f0d11b38c9f0",
    "scope": "app.billing.BillingPage",
    "text": "Account / Profile credits",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.ee8722b091ed",
    "scope": "app.billing.BillingPage",
    "text": "Yours to keep",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.358f7f34e6f7",
    "scope": "app.billing.BillingPage",
    "text": "Room for what",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.ff0d3c96d27d",
    "scope": "app.billing.BillingPage",
    "text": "comes next.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.838cbded16d1",
    "scope": "app.billing.BillingPage",
    "text": "Your first 5 Profiles are free. Add permanent Profile credits when your collection grows. Ownership transfers stay free.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.415e394dec58",
    "scope": "app.billing.BillingPage",
    "text": "One purchase. Permanent credits.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.e2a089242fcd",
    "scope": "app.billing.BillingPage",
    "text": "No subscription. No expiry.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.ec990fa498f2",
    "scope": "app.billing.BillingPage",
    "text": "Each credit creates one additional Profile when your free allowance is full.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.d52f04fe6cb2",
    "scope": "app.billing.BillingPage",
    "text": "Your collection starts with 5 free Profiles.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.19179c32af83",
    "scope": "app.billing.BillingPage",
    "text": "Sign in to see your balance and available credit packs.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.bfd402b2f6f3",
    "scope": "app.billing.BillingPage",
    "text": "Sign in",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.46417b70a1e7",
    "scope": "app.billing.BillingPage",
    "text": "Billing could not be loaded.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.ec963ffc911b",
    "scope": "app.billing.BillingPage",
    "text": "Checking…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.d8b8392e2c54",
    "scope": "app.billing.BillingPage",
    "text": "Try again",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.44ecebbc45af",
    "scope": "app.billing.BillingPage",
    "text": "Test environment",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.6ea984d6b9b4",
    "scope": "app.billing.BillingPage",
    "text": "These balances and checkout sessions belong to the test environment.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.7d156f07be3d",
    "scope": "app.billing.BillingPage",
    "text": "Credits received. Billing review is pending.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.2825592476eb",
    "scope": "app.billing.BillingPage",
    "text": "Your Profile credits have been added.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.43fa94718cd4",
    "scope": "app.billing.BillingPage",
    "text": "This checkout has expired.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.5aa891336d25",
    "scope": "app.billing.BillingPage",
    "text": "You’re back from checkout.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.3353e356b6f1",
    "scope": "app.billing.BillingPage",
    "text": "Checking your purchase.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.47989e4c8448",
    "scope": "app.billing.BillingPage",
    "text": "{{value1}} permanent Profile {{value2}} recorded for this order. {{value3}}",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.47c35718aeb4",
    "scope": "app.billing.BillingPage",
    "text": "The server confirmed that this checkout expired. You can choose a pack below when you’re ready.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.198c3fcd8696",
    "scope": "app.billing.BillingPage",
    "text": "Returning here does not cancel or confirm a payment. We have checked the server for the latest order status. You can resume a pending checkout below.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.554759c28702",
    "scope": "app.billing.BillingPage",
    "text": "Credits appear after the server verifies payment and records the grant. If confirmation is still pending, refresh the status or return later.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.50ecb3c0b904",
    "scope": "app.billing.BillingPage",
    "text": "Checking automatically for a short time…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.dbb5f6371b6a",
    "scope": "app.billing.BillingPage",
    "text": "Your account",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.39784a890ee8",
    "scope": "app.billing.BillingPage",
    "text": "Profile balance",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.1c0def7be060",
    "scope": "app.billing.BillingPage",
    "text": "Refreshing…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.442c4b893915",
    "scope": "app.billing.BillingPage",
    "text": "Refresh status",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.512adbf9b91c",
    "scope": "app.billing.BillingPage",
    "text": "Free Profiles remaining",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.34b9d6cac6a7",
    "scope": "app.billing.BillingPage",
    "text": "Paid credits available",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.4e0a43d55354",
    "scope": "app.billing.BillingPage",
    "text": "Profiles on your account",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.bfe0f29469a1",
    "scope": "app.billing.BillingPage",
    "text": "Includes Profiles removed from your active collection. Your dashboard shows active Profiles.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.5ed880e39ee6",
    "scope": "app.billing.BillingPage",
    "text": "paid credits received ·",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.f83916135509",
    "scope": "app.billing.BillingPage",
    "text": "used",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.3de539d9e79c",
    "scope": "app.billing.BillingPage",
    "text": " · {{value1}} held",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.8088497eb587",
    "scope": "app.billing.BillingPage",
    "text": "Create a Profile",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.7d579bfca9e3",
    "scope": "app.billing.BillingPage",
    "text": "Your account already has expanded Profile access.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.d4f4474836f8",
    "scope": "app.billing.BillingPage",
    "text": "You do not need to purchase credits under your current approved plan.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.1c68f4361b13",
    "scope": "app.billing.BillingPage",
    "text": "Your billing account is under review.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.ea7e8a7ea43e",
    "scope": "app.billing.BillingPage",
    "text": "Paid credits and new purchases are unavailable during this review. Your remaining free allowance and existing Profiles are preserved.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.814f4ed2d5bd",
    "scope": "app.billing.BillingPage",
    "text": "Contact support",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.6f28471f9ce2",
    "scope": "app.billing.BillingPage",
    "text": "Continue your existing checkout",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.1e99c55450dd",
    "scope": "app.billing.BillingPage",
    "text": "The previous checkout request could not be confirmed. We have kept its reference so you can safely retry the same request.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.d70baa00ad70",
    "scope": "app.billing.BillingPage",
    "text": "A checkout is already in progress for your account. Resume it or refresh the status before choosing another pack.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.9e2b60866e8b",
    "scope": "app.billing.BillingPage",
    "text": "Checking checkout…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.bc9c9f8750e0",
    "scope": "app.billing.BillingPage",
    "text": "Retry same checkout",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.d9ab6b061f3d",
    "scope": "app.billing.BillingPage",
    "text": "Resume checkout",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.d4bb67bc23af",
    "scope": "app.billing.BillingPage",
    "text": "Grow at your pace",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.293f1f0839f8",
    "scope": "app.billing.BillingPage",
    "text": "Permanent Profile packs",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.06914400f7de",
    "scope": "app.billing.BillingPage",
    "text": "One-time purchases · USD",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.1ae12ac82728",
    "scope": "app.billing.BillingPage",
    "text": "Credit packs are currently unavailable.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.3dd692acce64",
    "scope": "app.billing.BillingPage",
    "text": "Purchases will appear here when checkout is available. Your current balance is shown above.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.132dbca3f4b1",
    "scope": "app.billing.BillingPage",
    "text": "One more keeper",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.2c515891422b",
    "scope": "app.billing.BillingPage",
    "text": "The growing collection",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.3f74106383b8",
    "scope": "app.billing.BillingPage",
    "text": "Room to build",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.9db837420f5f",
    "scope": "app.billing.BillingPage",
    "text": "Lowest per Profile",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.d696a35bdd18",
    "scope": "app.billing.BillingPage",
    "text": "Profile",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.ecc4873a1694",
    "scope": "app.billing.BillingPage",
    "text": "credit",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.be379a30f1aa",
    "scope": "app.billing.BillingPage",
    "text": "credits",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.c4f4fbd12ff3",
    "scope": "app.billing.BillingPage",
    "text": "one time",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.4d1e38084e0d",
    "scope": "app.billing.BillingPage",
    "text": "For the next instrument with a story to tell.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.aecce341cf34",
    "scope": "app.billing.BillingPage",
    "text": "Keep your next chapter of instruments together.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.d23a058d63a9",
    "scope": "app.billing.BillingPage",
    "text": "A reserve for a collection that keeps growing.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.5cd4effac742",
    "scope": "app.billing.BillingPage",
    "text": "Permanent credits, no expiry",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.211e8db1d51e",
    "scope": "app.billing.BillingPage",
    "text": "Used after your free allowance",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.de737261cd03",
    "scope": "app.billing.BillingPage",
    "text": "Free ownership transfers",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.887a53cc33d6",
    "scope": "app.billing.BillingPage",
    "text": "Buy {{value1}} Profile {{value2}} for {{value3}}",
    "page": "Profile credits",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.1574841e9cfc",
    "scope": "app.billing.BillingPage",
    "text": "Preparing checkout…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.5c010f20b797",
    "scope": "app.billing.BillingPage",
    "text": "Choose {{value1}} {{value2}}",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.0f1c9584d5fd",
    "scope": "app.billing.BillingPage",
    "text": "Payment opens in Stripe’s secure checkout. Credits are confirmed by your account’s payment record.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.2238a23e6326",
    "scope": "app.billing.BillingPage",
    "text": "How Profile credits work",
    "page": "Profile credits",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.35831154f8d7",
    "scope": "app.billing.BillingPage",
    "text": "Built around your instruments.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.206753069e4d",
    "scope": "app.billing.BillingPage",
    "text": "Profiles hold the identity and history of instruments you own. Buy capacity when you need it, and keep using the tools you already have.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.803c99172989",
    "scope": "app.billing.BillingPage",
    "text": "What happens when I transfer an instrument?",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.fe876cc8e500",
    "scope": "app.billing.BillingPage",
    "text": "Ownership transfers are free. A transfer does not refund a previously used paid credit.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.f377fbf5336c",
    "scope": "app.billing.BillingPage",
    "text": "Do unused credits expire?",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.BillingPage.70ab8f138745",
    "scope": "app.billing.BillingPage",
    "text": "No. Purchased credits stay on your account until used. Each additional Profile consumes one credit after your free allowance is full.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/BillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.ad79df91d1a6",
    "scope": "app.billing.DirectBillingPage",
    "text": "Your Profile credits",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.9b66cd2b928e",
    "scope": "app.billing.DirectBillingPage",
    "text": "Loading your balance…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.f0d11b38c9f0",
    "scope": "app.billing.DirectBillingPage",
    "text": "Account / Profile credits",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.b7103a97b9be",
    "scope": "app.billing.DirectBillingPage",
    "text": "More instruments. More stories.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.edeffa14c606",
    "scope": "app.billing.DirectBillingPage",
    "text": "Start with 25.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.0dd197633780",
    "scope": "app.billing.DirectBillingPage",
    "text": "Grow when you’re ready.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.49f78ed770a3",
    "scope": "app.billing.DirectBillingPage",
    "text": "Your first 5 Profiles are free.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.f231fb516aad",
    "scope": "app.billing.DirectBillingPage",
    "text": "Each one gives an instrument a lasting home for its identity, ownership and history.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.b207fa36d4e7",
    "scope": "app.billing.DirectBillingPage",
    "text": "Pay once · No expiry · Free transfers",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.5ec6376ac773",
    "scope": "app.billing.DirectBillingPage",
    "text": "Pay once. Keep your credits.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.42aa98ddb04a",
    "scope": "app.billing.DirectBillingPage",
    "text": "No subscription. Unused paid credits never expire.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.ba7b7d5d18e5",
    "scope": "app.billing.DirectBillingPage",
    "text": "Ownership transfers are always free.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.3201f58f2661",
    "scope": "app.billing.DirectBillingPage",
    "text": "Loading your Profile balance…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.90d34fccfab3",
    "scope": "app.billing.DirectBillingPage",
    "text": "Start with your 5 free Profiles.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.48fea2e29b1d",
    "scope": "app.billing.DirectBillingPage",
    "text": "Sign in to see the room in your account. You only need a pack when you want more.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.bfd402b2f6f3",
    "scope": "app.billing.DirectBillingPage",
    "text": "Sign in",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.dbb6449ac5f1",
    "scope": "app.billing.DirectBillingPage",
    "text": "We couldn’t check your account.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.d8b8392e2c54",
    "scope": "app.billing.DirectBillingPage",
    "text": "Try again",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.44ecebbc45af",
    "scope": "app.billing.DirectBillingPage",
    "text": "Test environment",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.8960a5bca42c",
    "scope": "app.billing.DirectBillingPage",
    "text": "Payment apps send real money. Do not send a real payment while testing this flow.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.dbb5f6371b6a",
    "scope": "app.billing.DirectBillingPage",
    "text": "Your account",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.b91497e1bd0e",
    "scope": "app.billing.DirectBillingPage",
    "text": "Your expanded access is active.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.473b66a7ca38",
    "scope": "app.billing.DirectBillingPage",
    "text": "You have room to keep creating.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.7c3ea06534b3",
    "scope": "app.billing.DirectBillingPage",
    "text": "Ready for your next Profile?",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.ec963ffc911b",
    "scope": "app.billing.DirectBillingPage",
    "text": "Checking…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.0e9161011702",
    "scope": "app.billing.DirectBillingPage",
    "text": "Refresh",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.512adbf9b91c",
    "scope": "app.billing.DirectBillingPage",
    "text": "Free Profiles remaining",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.34b9d6cac6a7",
    "scope": "app.billing.DirectBillingPage",
    "text": "Paid credits available",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.4e0a43d55354",
    "scope": "app.billing.DirectBillingPage",
    "text": "Profiles on your account",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.5ed880e39ee6",
    "scope": "app.billing.DirectBillingPage",
    "text": "paid credits received ·",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.f83916135509",
    "scope": "app.billing.DirectBillingPage",
    "text": "used",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.aadb46849b90",
    "scope": "app.billing.DirectBillingPage",
    "text": " · {{value1}} held for review",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.8088497eb587",
    "scope": "app.billing.DirectBillingPage",
    "text": "Create a Profile",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.c8ffdf6541ad",
    "scope": "app.billing.DirectBillingPage",
    "text": "You can continue without buying a pack.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.77c7cf463560",
    "scope": "app.billing.DirectBillingPage",
    "text": " Your account already has expanded Profile access.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.dc569c773165",
    "scope": "app.billing.DirectBillingPage",
    "text": " Your free allowance is used first.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.62dcf21a0d7c",
    "scope": "app.billing.DirectBillingPage",
    "text": "Your paid credits are under review.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.f6cc10e26f35",
    "scope": "app.billing.DirectBillingPage",
    "text": "Your existing Profiles and remaining free allowance are available. Paid credits and new purchases are paused during the review.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.33f385f227c2",
    "scope": "app.billing.DirectBillingPage",
    "text": "Contact QRguitar",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.e23d47623de2",
    "scope": "app.billing.DirectBillingPage",
    "text": "Your payment request is saved.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.533e66b1a675",
    "scope": "app.billing.DirectBillingPage",
    "text": "We couldn’t confirm the last response. Check its status or retry the same request before sending money.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.22f03e194b07",
    "scope": "app.billing.DirectBillingPage",
    "text": "Resume saved request",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.442c4b893915",
    "scope": "app.billing.DirectBillingPage",
    "text": "Refresh status",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.876ea05c9691",
    "scope": "app.billing.DirectBillingPage",
    "text": "No earlier payment is waiting.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.e20e764322b1",
    "scope": "app.billing.DirectBillingPage",
    "text": "Back to Profile credits",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.7606fcdc9ac5",
    "scope": "app.billing.DirectBillingPage",
    "text": "Add credits for later",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.88e2e3e863bf",
    "scope": "app.billing.DirectBillingPage",
    "text": "Choose a one-time Profile pack",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.752c381b7fb1",
    "scope": "app.billing.DirectBillingPage",
    "text": "Unused credits never expire",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.7aec6478d9c1",
    "scope": "app.billing.DirectBillingPage",
    "text": "A little more room",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.8866d3862349",
    "scope": "app.billing.DirectBillingPage",
    "text": "Buy only what you need.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.84ca71260d5b",
    "scope": "app.billing.DirectBillingPage",
    "text": "One-time total · USD",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.90f270f1199a",
    "scope": "app.billing.DirectBillingPage",
    "text": "New payments aren’t open yet.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.018f392d03ee",
    "scope": "app.billing.DirectBillingPage",
    "text": "QRguitar is setting up its receiving accounts. Your free Profiles and existing credits are still available.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.7b7a7b1054b0",
    "scope": "app.billing.DirectBillingPage",
    "text": "Profile packs will appear here when they are available.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.19694dd5e30f",
    "scope": "app.billing.DirectBillingPage",
    "text": "One more instrument",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.4fc21929291c",
    "scope": "app.billing.DirectBillingPage",
    "text": "For a growing collection",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.102a94b5da2f",
    "scope": "app.billing.DirectBillingPage",
    "text": "Room for the long run",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.ea5d88b968b6",
    "scope": "app.billing.DirectBillingPage",
    "text": "Suggested for collectors",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.9db837420f5f",
    "scope": "app.billing.DirectBillingPage",
    "text": "Lowest per Profile",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.d696a35bdd18",
    "scope": "app.billing.DirectBillingPage",
    "text": "Profile",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.ecc4873a1694",
    "scope": "app.billing.DirectBillingPage",
    "text": "credit",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.be379a30f1aa",
    "scope": "app.billing.DirectBillingPage",
    "text": "credits",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.4634e3410919",
    "scope": "app.billing.DirectBillingPage",
    "text": "one-time total ·",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.b7161295ba23",
    "scope": "app.billing.DirectBillingPage",
    "text": "per Profile",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.987addec65f7",
    "scope": "app.billing.DirectBillingPage",
    "text": "Just the extra Profile you need today.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.eed8b68a06c4",
    "scope": "app.billing.DirectBillingPage",
    "text": "A lower price per Profile, without the larger commitment of 25.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.a1d22fb88f77",
    "scope": "app.billing.DirectBillingPage",
    "text": "The lowest unit price when you know you’ll use more Profiles.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.6ce0038fbf0a",
    "scope": "app.billing.DirectBillingPage",
    "text": "No recurring charge",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.de737261cd03",
    "scope": "app.billing.DirectBillingPage",
    "text": "Free ownership transfers",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.2ea8fd1d7905",
    "scope": "app.billing.DirectBillingPage",
    "text": "Choose {{value1}} Profile {{value2}} for {{value3}} total",
    "page": "Profile credits",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.57fd7a0cf33f",
    "scope": "app.billing.DirectBillingPage",
    "text": "Selected",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.456fcd95e038",
    "scope": "app.billing.DirectBillingPage",
    "text": "Choose {{value1}}",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.efadf3732e55",
    "scope": "app.billing.DirectBillingPage",
    "text": "Continue to payment",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.4d84eb613979",
    "scope": "app.billing.DirectBillingPage",
    "text": "How would you like to pay?",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.d57c8617860d",
    "scope": "app.billing.DirectBillingPage",
    "text": "total, once.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.0f5239e1ecbd",
    "scope": "app.billing.DirectBillingPage",
    "text": "Choose your payment app to get QRguitar’s verified receiving details.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.d2b79489c9e6",
    "scope": "app.billing.DirectBillingPage",
    "text": "Continue with",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.b92bd645ae67",
    "scope": "app.billing.DirectBillingPage",
    "text": "Cards, Apple Pay, Venmo and PayPal; availability varies by device.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.964deb70ffd9",
    "scope": "app.billing.DirectBillingPage",
    "text": "Credits become available after QRguitar checks the received payment.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.c9445617fe1a",
    "scope": "app.billing.DirectBillingPage",
    "text": "One Profile. An instrument’s story.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.b67cda841f76",
    "scope": "app.billing.DirectBillingPage",
    "text": "Keep its identity, photos, service history and ownership together. A paid credit creates one additional Profile after your free allowance is full.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.7f60e7f537d5",
    "scope": "app.billing.DirectBillingPage",
    "text": "Keep your Profile form open.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.30b6bfd27217",
    "scope": "app.billing.DirectBillingPage",
    "text": "If you opened this page from a Profile you’re creating, keep that tab open. After your credits are confirmed, return to the form and create your Profile.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.b220cfe1192d",
    "scope": "app.billing.DirectBillingPage",
    "text": "Transfers stay free.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.04cf7778d229",
    "scope": "app.billing.DirectBillingPage",
    "text": "Passing an instrument to its next owner is free. A transfer does not return a paid credit already used.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.06d791026d5d",
    "scope": "app.billing.DirectBillingPage",
    "text": "{{value1}} copied",
    "page": "Profile credits",
    "area": "Product",
    "section": "Feedback",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.2cfee5a3c8f7",
    "scope": "app.billing.DirectBillingPage",
    "text": "Couldn’t copy. Select the {{value1}} shown above.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Feedback",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.9776bafbaa83",
    "scope": "app.billing.DirectBillingPage",
    "text": "Copy {{value1}}",
    "page": "Profile credits",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.e21f935f11d7",
    "scope": "app.billing.DirectBillingPage",
    "text": "Copy",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.3450b635b99a",
    "scope": "app.billing.DirectBillingPage",
    "text": "Payment confirmed",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.7290ab7758f0",
    "scope": "app.billing.DirectBillingPage",
    "text": "Credits received. Account review is pending.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.556bc117a8d5",
    "scope": "app.billing.DirectBillingPage",
    "text": "Your next chapter is ready.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.f632a1f108a6",
    "scope": "app.billing.DirectBillingPage",
    "text": "credit has",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.02cb4ae9bfe0",
    "scope": "app.billing.DirectBillingPage",
    "text": "credits have",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.d4b3329715e2",
    "scope": "app.billing.DirectBillingPage",
    "text": "been recorded for order",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.eea04f7571b4",
    "scope": "app.billing.DirectBillingPage",
    "text": " Paid credits remain on hold during the review.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.2be9799aa72e",
    "scope": "app.billing.DirectBillingPage",
    "text": " Your available balance is shown above.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.20099a1d9793",
    "scope": "app.billing.DirectBillingPage",
    "text": "This payment request is closed.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.e9f17aecf7c6",
    "scope": "app.billing.DirectBillingPage",
    "text": "No credits were added for",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.521ad6cd9a68",
    "scope": "app.billing.DirectBillingPage",
    "text": ". If you already sent money, contact QRguitar with this reference before sending another payment.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.078b36aa5330",
    "scope": "app.billing.DirectBillingPage",
    "text": "Legacy payment recovery",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.c276302f7449",
    "scope": "app.billing.DirectBillingPage",
    "text": "QRguitar is checking this earlier payment.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.73657c07d5eb",
    "scope": "app.billing.DirectBillingPage",
    "text": "This earlier payment needs support.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.6be090825c99",
    "scope": "app.billing.DirectBillingPage",
    "text": "Order",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.ce363e8f9490",
    "scope": "app.billing.DirectBillingPage",
    "text": ". Don’t send another payment or submit payment details here.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.69cd3590300a",
    "scope": "app.billing.DirectBillingPage",
    "text": "Check status",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.52becb2d7fc9",
    "scope": "app.billing.DirectBillingPage",
    "text": "Payment reported",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.b9bae8ff3cdd",
    "scope": "app.billing.DirectBillingPage",
    "text": "We’re checking your payment.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.57e669e137a2",
    "scope": "app.billing.DirectBillingPage",
    "text": "Reporting a payment does not add credits; they appear after QRguitar verifies receipt. Please don’t send the payment again.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.04db5ae332e5",
    "scope": "app.billing.DirectBillingPage",
    "text": "Order reference",
    "page": "Profile credits",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.ae1b6f51f5f5",
    "scope": "app.billing.DirectBillingPage",
    "text": "Check payment status",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.748d7812fc7f",
    "scope": "app.billing.DirectBillingPage",
    "text": "You can leave this page and return to Profile credits to check the same order.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.4b169dfad280",
    "scope": "app.billing.DirectBillingPage",
    "text": "Your payment is ready",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.f6f4688ff23d",
    "scope": "app.billing.DirectBillingPage",
    "text": "Send",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.0695b563acde",
    "scope": "app.billing.DirectBillingPage",
    "text": "with",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.96487ccec823",
    "scope": "app.billing.DirectBillingPage",
    "text": "permanent Profile",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.1a4e90f8e6bb",
    "scope": "app.billing.DirectBillingPage",
    "text": "· One-time total · No subscription",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.f082bb097128",
    "scope": "app.billing.DirectBillingPage",
    "text": "Copy your reference, then open checkout.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.1d67db454e74",
    "scope": "app.billing.DirectBillingPage",
    "text": "Pay QRguitar in {{value1}}.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.9d9313a5f708",
    "scope": "app.billing.DirectBillingPage",
    "text": "Confirm the recipient is",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.53d82da9678d",
    "scope": "app.billing.DirectBillingPage",
    "text": "Your pack price is already set in checkout.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.811f92f14142",
    "scope": "app.billing.DirectBillingPage",
    "text": "Check the amount and any fee in your payment app before sending.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.f6769ff83f75",
    "scope": "app.billing.DirectBillingPage",
    "text": "Amount in USD",
    "page": "Profile credits",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.33695a77ff89",
    "scope": "app.billing.DirectBillingPage",
    "text": "Paste this into the Order reference field in checkout.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.0d1db2459761",
    "scope": "app.billing.DirectBillingPage",
    "text": "Include the order reference in your payment note so we can match it to your account.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.3d149cfc9b49",
    "scope": "app.billing.DirectBillingPage",
    "text": "Open secure checkout",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.839d6deea6a7",
    "scope": "app.billing.DirectBillingPage",
    "text": "Open {{value1}}",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.a58c0b1b8e87",
    "scope": "app.billing.DirectBillingPage",
    "text": "Payment instructions are unavailable.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.4321bba6e8cd",
    "scope": "app.billing.DirectBillingPage",
    "text": "before sending.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.fa4f4fc67206",
    "scope": "app.billing.DirectBillingPage",
    "text": "Come back and tell us you sent it.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.d7f2e383dcf4",
    "scope": "app.billing.DirectBillingPage",
    "text": "QRguitar checks its receiving account before adding credits.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.36ead86810ae",
    "scope": "app.billing.DirectBillingPage",
    "text": "Name or reference shown in your payment app",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.0059798b7f70",
    "scope": "app.billing.DirectBillingPage",
    "text": "(optional)",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.f90c54b9bef8",
    "scope": "app.billing.DirectBillingPage",
    "text": "Helps us match your payment",
    "page": "Profile credits",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.85163f6ef4b1",
    "scope": "app.billing.DirectBillingPage",
    "text": "Retry payment report",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.3976510d7b80",
    "scope": "app.billing.DirectBillingPage",
    "text": "I sent the payment",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.7e78ad1b344a",
    "scope": "app.billing.DirectBillingPage",
    "text": "Only choose this after sending the payment. Credits remain pending until receipt is verified.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.b9b2b263bb1b",
    "scope": "app.billing.DirectBillingPage",
    "text": "Your order is saved as",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.DirectBillingPage.bd750648e7c9",
    "scope": "app.billing.DirectBillingPage",
    "text": ". Need a different payment method?",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/DirectBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.96bc5cd7d154",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Profile credits",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.8fa5b7ff1572",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Loading your account…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.f0d11b38c9f0",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Account / Profile credits",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.055638c77c07",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Your instruments. Their stories.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.a73f44aace23",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Room for your next instrument.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.8d419aec5796",
    "scope": "app.billing.PayPalBillingPage",
    "text": "5 free Profiles. More when you need them.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.c3e79710e32a",
    "scope": "app.billing.PayPalBillingPage",
    "text": "No subscription · Credits never expire · Free transfers",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.3201f58f2661",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Loading your Profile balance…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.49f78ed770a3",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Your first 5 Profiles are free.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.6f48f1936e50",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Sign in to see your balance and add more when you need them.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.bfd402b2f6f3",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Sign in",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.dbb6449ac5f1",
    "scope": "app.billing.PayPalBillingPage",
    "text": "We couldn’t check your account.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.d8b8392e2c54",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Try again",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.33f385f227c2",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Contact QRguitar",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.a4f08ee4e926",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Sandbox checkout · Test payments only",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.081136fa4e99",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Your Profile balance",
    "page": "Profile credits",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.836a367ebc36",
    "scope": "app.billing.PayPalBillingPage",
    "text": "free remaining",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.0866534075ad",
    "scope": "app.billing.PayPalBillingPage",
    "text": "paid credits",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.8088497eb587",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Create a Profile",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.12553b6f6a14",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Refresh Profile balance",
    "page": "Profile credits",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.0e9161011702",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Refresh",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.ec25278f40fd",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Your account already has expanded access.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.de7b61f56733",
    "scope": "app.billing.PayPalBillingPage",
    "text": "You have room to keep creating. No purchase needed.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.62dcf21a0d7c",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Your paid credits are under review.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.40f0dbe67eec",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Existing Profiles and your remaining free allowance are still available.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.28a8a7d04092",
    "scope": "app.billing.PayPalBillingPage",
    "text": "You have an earlier payment in progress.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.a989b92a00ce",
    "scope": "app.billing.PayPalBillingPage",
    "text": "QRguitar support can check this legacy payment. Please don’t send it again.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.2d3fbba90216",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Check that payment before starting another.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.6899715a3267",
    "scope": "app.billing.PayPalBillingPage",
    "text": "View earlier payment",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.a2b1b32004c9",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Payment received. Credits are under review.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.3bd7fc827f76",
    "scope": "app.billing.PayPalBillingPage",
    "text": "You’re ready to create.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.d696a35bdd18",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Profile",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.f632a1f108a6",
    "scope": "app.billing.PayPalBillingPage",
    "text": "credit has",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.02cb4ae9bfe0",
    "scope": "app.billing.PayPalBillingPage",
    "text": "credits have",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.e4bde1b202ac",
    "scope": "app.billing.PayPalBillingPage",
    "text": "been added to your account.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.92814f69ea0c",
    "scope": "app.billing.PayPalBillingPage",
    "text": " Paid credits remain unavailable during the review.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.7d9cf5fa27ce",
    "scope": "app.billing.PayPalBillingPage",
    "text": " No extra steps.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.485b9daa4f66",
    "scope": "app.billing.PayPalBillingPage",
    "text": "This payment needs a review.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.b8777856d70d",
    "scope": "app.billing.PayPalBillingPage",
    "text": "We couldn’t finish adding credits automatically. Please contact QRguitar before trying another payment.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.b2dbd2125453",
    "scope": "app.billing.PayPalBillingPage",
    "text": "This checkout is closed.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.e7ca5c7fc611",
    "scope": "app.billing.PayPalBillingPage",
    "text": "You can choose a pack when you’re ready.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.a29081aa8c17",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Confirming your payment…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.6483b00c4fcd",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Your credits appear as soon as payment is verified. You can leave this page and return later.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.034fd5bb0b9d",
    "scope": "app.billing.PayPalBillingPage",
    "text": "You’re back from checkout. Your saved payment is still available to resume; returning here does not confirm or cancel a charge.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.ec963ffc911b",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Checking…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.fbd6ae5ad3c5",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Check saved payment",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.36065a14b2bd",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Checking automatically…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.5359c45c4e88",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Add another Profile pack",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.7606fcdc9ac5",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Add credits for later",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.8d4c88b9dbf3",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Choose a Profile pack",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.84ca71260d5b",
    "scope": "app.billing.PayPalBillingPage",
    "text": "One-time total · USD",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.b08ba473a836",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Checkout is being connected.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.7fc165e69dac",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Your free Profiles and existing credits are ready to use.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.23789875affc",
    "scope": "app.billing.PayPalBillingPage",
    "text": "{{value1}} Profile {{value2}} for {{value3}} total",
    "page": "Profile credits",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.535e52e4a261",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Profiles",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.b7161295ba23",
    "scope": "app.billing.PayPalBillingPage",
    "text": "per Profile",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.c189277245c0",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Just one more",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.4fc21929291c",
    "scope": "app.billing.PayPalBillingPage",
    "text": "For a growing collection",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.b87fa42885f1",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Lowest price per Profile",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.ecc4873a1694",
    "scope": "app.billing.PayPalBillingPage",
    "text": "credit",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.be379a30f1aa",
    "scope": "app.billing.PayPalBillingPage",
    "text": "credits",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.c4f4fbd12ff3",
    "scope": "app.billing.PayPalBillingPage",
    "text": "one time",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.8814fae87ce5",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Have a promo code?",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.ec0c21885e3f",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Promo code",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.3329a9bb48b9",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Applying…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.31e392d1c037",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Apply",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.c3812fc4acb8",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Remove",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.e48c3a03b736",
    "scope": "app.billing.PayPalBillingPage",
    "text": "saves",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.c1ec68ecc7fd",
    "scope": "app.billing.PayPalBillingPage",
    "text": "applied ·",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.d81c55f49c5b",
    "scope": "app.billing.PayPalBillingPage",
    "text": "saved",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.16f1d95b660e",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Pay securely. Your credits are added automatically after confirmation.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.55cdb9f634b2",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Payment information is processed by PayPal under its",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.25f4fe8cd149",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Privacy Statement",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.fcf8710aef5c",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Each credit creates one additional Profile after your 5 free Profiles. Unused paid credits never expire.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.65e3a5bbcc5b",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Checkout could not load. Please try again.",
    "page": "Profile credits",
    "area": "Product",
    "section": "Feedback",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.4734eebc5978",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Loading secure payment options…",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.billing.PayPalBillingPage.333a63683e1a",
    "scope": "app.billing.PayPalBillingPage",
    "text": "Reload payment options",
    "page": "Profile credits",
    "area": "Product",
    "section": "Page text",
    "source": "app/billing/PayPalBillingPage.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.1fbba5113528",
    "scope": "app.catalog.CatalogClient",
    "text": "Browse member collections",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.10d44ee84f0d",
    "scope": "app.catalog.CatalogClient",
    "text": "Catalog filters",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Accessibility",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.49c266baaaa7",
    "scope": "app.catalog.CatalogClient",
    "text": "Search",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.0e626c38e0fe",
    "scope": "app.catalog.CatalogClient",
    "text": "Find exact serial",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Accessibility",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.090ed4316f1d",
    "scope": "app.catalog.CatalogClient",
    "text": "Brand",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.bec69036aa27",
    "scope": "app.catalog.CatalogClient",
    "text": "Sort",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.d15efa178cf6",
    "scope": "app.catalog.CatalogClient",
    "text": "Newest",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.505dc450753e",
    "scope": "app.catalog.CatalogClient",
    "text": "Oldest",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.7e8cd2056da7",
    "scope": "app.catalog.CatalogClient",
    "text": "Title",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.89f6832560de",
    "scope": "app.catalog.CatalogClient",
    "text": "Year",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.546ebb8eb993",
    "scope": "app.catalog.CatalogClient",
    "text": "Filters",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.12f67f8539c4",
    "scope": "app.catalog.CatalogClient",
    "text": "Availability",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.2ac0f50706fa",
    "scope": "app.catalog.CatalogClient",
    "text": "All availability",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.1a83dec1476e",
    "scope": "app.catalog.CatalogClient",
    "text": "For Sale",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.e063cbea64ad",
    "scope": "app.catalog.CatalogClient",
    "text": "Not for Sale",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.39b36d38d6eb",
    "scope": "app.catalog.CatalogClient",
    "text": "Condition",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.7c403b64e552",
    "scope": "app.catalog.CatalogClient",
    "text": "All conditions",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.18fdd549b2ed",
    "scope": "app.catalog.CatalogClient",
    "text": "New",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.ae7d8dfac9ff",
    "scope": "app.catalog.CatalogClient",
    "text": "Used",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.ade9248e0132",
    "scope": "app.catalog.CatalogClient",
    "text": "Trust",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.27667eed8c6f",
    "scope": "app.catalog.CatalogClient",
    "text": "All trust statuses",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.4f7838402f37",
    "scope": "app.catalog.CatalogClient",
    "text": "Verified",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.33c8e8de41c3",
    "scope": "app.catalog.CatalogClient",
    "text": "Unverified",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.4f531ef9e6ae",
    "scope": "app.catalog.CatalogClient",
    "text": "Authenticity",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.868c29e856d3",
    "scope": "app.catalog.CatalogClient",
    "text": "All authenticity statuses",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.eb95c24a9590",
    "scope": "app.catalog.CatalogClient",
    "text": "Authenticity Confirmed",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.a54f9b625886",
    "scope": "app.catalog.CatalogClient",
    "text": "Authenticity Unconfirmed",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.faafda16cc4c",
    "scope": "app.catalog.CatalogClient",
    "text": "Originality",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.ad110c7da01e",
    "scope": "app.catalog.CatalogClient",
    "text": "All originality statuses",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.8894d64075bf",
    "scope": "app.catalog.CatalogClient",
    "text": "All Original",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.e8ce5dcaf408",
    "scope": "app.catalog.CatalogClient",
    "text": "Modified",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.726d11bd5b23",
    "scope": "app.catalog.CatalogClient",
    "text": "Safety",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.47303c7f8431",
    "scope": "app.catalog.CatalogClient",
    "text": "All safety statuses",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.ebcc11e6a438",
    "scope": "app.catalog.CatalogClient",
    "text": "Safety Alert",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.8b0adc9c9815",
    "scope": "app.catalog.CatalogClient",
    "text": "Service History",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.30a6538fc556",
    "scope": "app.catalog.CatalogClient",
    "text": "All service histories",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.021890177ff6",
    "scope": "app.catalog.CatalogClient",
    "text": "Has Service History",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.213a9822c38a",
    "scope": "app.catalog.CatalogClient",
    "text": "Active filters",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Accessibility",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.b6b852bd01cc",
    "scope": "app.catalog.CatalogClient",
    "text": "Remove {{value1}} filter: {{value2}}",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Labels and help",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.ac3e01b95dc6",
    "scope": "app.catalog.CatalogClient",
    "text": "Start ownership claim",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.435a56a2ed07",
    "scope": "app.catalog.CatalogClient",
    "text": "Catalog discovery highlights",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Accessibility",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.8ecdd04d045f",
    "scope": "app.catalog.CatalogClient",
    "text": "QRguitar Profiles",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Accessibility",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.92e7dcc9f7b7",
    "scope": "app.catalog.CatalogClient",
    "text": "Loading QRguitar Profiles",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.46d89b1c639e",
    "scope": "app.catalog.CatalogClient",
    "text": "Opening the catalog.",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.9235ded50850",
    "scope": "app.catalog.CatalogClient",
    "text": "Fetching the latest QRguitar Profiles now.",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.CatalogClient.5aeec66681b7",
    "scope": "app.catalog.CatalogClient",
    "text": "No profiles found",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/CatalogClient.tsx"
  },
  {
    "key": "ui.app.catalog.error.1ab7aa5950e4",
    "scope": "app.catalog.error",
    "text": "The catalog is temporarily unavailable.",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/error.tsx"
  },
  {
    "key": "ui.app.catalog.error.41f6cfb6e43a",
    "scope": "app.catalog.error",
    "text": "We couldn’t load the public Profiles. Please try again in a moment.",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/error.tsx"
  },
  {
    "key": "ui.app.catalog.error.d8b8392e2c54",
    "scope": "app.catalog.error",
    "text": "Try again",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/error.tsx"
  },
  {
    "key": "ui.app.catalog.error.723e1c99cb42",
    "scope": "app.catalog.error",
    "text": "Back to QRguitar",
    "page": "Catalog",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/catalog/error.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.8bf60f64c1e2",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "The first public collection starts with you.",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.639391c50bae",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "Turn on your public collection and make at least one instrument Profile public to appear here. Private and unlisted Profiles stay hidden.",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.82a7887fd1d5",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "Set up your collection",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.f507fb6c23a7",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "Browse instrument Profiles",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.76e4997eae2f",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "Find a member or business",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.a274dd64efe8",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "Public name, collection handle, or role",
    "page": "Public Collections",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.0311fcdf5ef9",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "Collection type",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.3d6fe3e703f6",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "All members",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.a48c498b8725",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "{{value1}} of {{value2}}",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.efa1f375d761",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "public",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.fa7496e4ae84",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "collection",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.00699f600cf5",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "collections",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.7179ea0035fc",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "Clear filters",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.d696a35bdd18",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "Profile",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.535e52e4a261",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "Profiles",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.2a2a60fc79fd",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "View collection",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.0baf1df98cbe",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "No collections match these filters.",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.436430aa14d8",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "Try another public name or collection type.",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.CollectionsDirectoryClient.a73e9c9ae150",
    "scope": "app.collections.CollectionsDirectoryClient",
    "text": "Show all collections",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/CollectionsDirectoryClient.tsx"
  },
  {
    "key": "ui.app.collections.error.eb1041a620a1",
    "scope": "app.collections.error",
    "text": "Collections are temporarily unavailable.",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/error.tsx"
  },
  {
    "key": "ui.app.collections.error.927f9bad2531",
    "scope": "app.collections.error",
    "text": "We couldn’t load the public collections. Please try again in a moment.",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/error.tsx"
  },
  {
    "key": "ui.app.collections.error.d8b8392e2c54",
    "scope": "app.collections.error",
    "text": "Try again",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/error.tsx"
  },
  {
    "key": "ui.app.collections.error.f507fb6c23a7",
    "scope": "app.collections.error",
    "text": "Browse instrument Profiles",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/error.tsx"
  },
  {
    "key": "ui.app.collections.not.found.e7222eacd9d8",
    "scope": "app.collections.not.found",
    "text": "This collection is unavailable.",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/not-found.tsx"
  },
  {
    "key": "ui.app.collections.not.found.5ea4d5b19d17",
    "scope": "app.collections.not.found",
    "text": "Its public link may have changed, or the member may no longer be sharing it.",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/not-found.tsx"
  },
  {
    "key": "ui.app.collections.not.found.6b2f6b98c835",
    "scope": "app.collections.not.found",
    "text": "Explore member collections",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/not-found.tsx"
  },
  {
    "key": "ui.app.collections.not.found.f507fb6c23a7",
    "scope": "app.collections.not.found",
    "text": "Browse instrument Profiles",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/not-found.tsx"
  },
  {
    "key": "ui.app.collections.page.2595f0c366bf",
    "scope": "app.collections.page",
    "text": "Member collections",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/page.tsx"
  },
  {
    "key": "ui.app.collections.page.9fa7b03bfc1e",
    "scope": "app.collections.page",
    "text": "Meet the people behind the instruments.",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/page.tsx"
  },
  {
    "key": "ui.app.collections.page.f34365151941",
    "scope": "app.collections.page",
    "text": "Explore public collections from players, collectors, stores, builders, brands, and repair shops. Open a collection to view that member’s public instrument Profiles.",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/page.tsx"
  },
  {
    "key": "ui.app.collections.page.82a7887fd1d5",
    "scope": "app.collections.page",
    "text": "Set up your collection",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/page.tsx"
  },
  {
    "key": "ui.app.collections.page.aa8729a8a143",
    "scope": "app.collections.page",
    "text": "Explore QRguitar",
    "page": "Public Collections",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/collections/page.tsx"
  },
  {
    "key": "ui.app.collections.page.f507fb6c23a7",
    "scope": "app.collections.page",
    "text": "Browse instrument Profiles",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/page.tsx"
  },
  {
    "key": "ui.app.collections.page.5ca6750bbc16",
    "scope": "app.collections.page",
    "text": "Your collection settings",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/page.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.ac53f9376264",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "No public instrument Profiles yet.",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.af746895fcef",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "This member hasn’t added any instruments to their public collection yet.",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.2cbb876d08c4",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Explore other collections",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.06981cabadd7",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Collection filters",
    "page": "Public Collections",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.49c266baaaa7",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Search",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.a2723ce46a9a",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Title, brand, year, location...",
    "page": "Public Collections",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.090ed4316f1d",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Brand",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.bec69036aa27",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Sort",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.d15efa178cf6",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Newest",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.505dc450753e",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Oldest",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.7e8cd2056da7",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Title",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.b1ab49a6fedc",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "More filters",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.75d3a0a839f9",
    "scope": "app.collections.handle.CollectionsClient",
    "text": " · Active",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.39b36d38d6eb",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Condition",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.7c403b64e552",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "All conditions",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.18fdd549b2ed",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "New",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.ae7d8dfac9ff",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Used",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.12f67f8539c4",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Availability",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.2ac0f50706fa",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "All availability",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.aedf56fc02b4",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "For sale",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.323d22588945",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Not for sale",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.baaddf70fb5d",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Type",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.7179ea0035fc",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Clear filters",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.CollectionsClient.a3da4386e1c1",
    "scope": "app.collections.handle.CollectionsClient",
    "text": "Show all public Profiles",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/CollectionsClient.tsx"
  },
  {
    "key": "ui.app.collections.handle.page.66439497b045",
    "scope": "app.collections.handle.page",
    "text": "Collection navigation",
    "page": "Public Collections",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/collections/[handle]/page.tsx"
  },
  {
    "key": "ui.app.collections.handle.page.16a2d21226eb",
    "scope": "app.collections.handle.page",
    "text": "All collections",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/page.tsx"
  },
  {
    "key": "ui.app.collections.handle.page.3877d14889a9",
    "scope": "app.collections.handle.page",
    "text": "Catalog",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/page.tsx"
  },
  {
    "key": "ui.app.collections.handle.page.9524ba4375b5",
    "scope": "app.collections.handle.page",
    "text": "{{value1}} avatar",
    "page": "Public Collections",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/collections/[handle]/page.tsx"
  },
  {
    "key": "ui.app.collections.handle.page.f28aefd26929",
    "scope": "app.collections.handle.page",
    "text": "QRguitar member",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/page.tsx"
  },
  {
    "key": "ui.app.collections.handle.page.799272298625",
    "scope": "app.collections.handle.page",
    "text": " / {{value1}}",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/page.tsx"
  },
  {
    "key": "ui.app.collections.handle.page.bb23eaeeafa6",
    "scope": "app.collections.handle.page",
    "text": "Explore this member's public QRguitar Profiles.",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/page.tsx"
  },
  {
    "key": "ui.app.collections.handle.page.591935b15b1c",
    "scope": "app.collections.handle.page",
    "text": "Public",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/page.tsx"
  },
  {
    "key": "ui.app.collections.handle.page.d696a35bdd18",
    "scope": "app.collections.handle.page",
    "text": "Profile",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/page.tsx"
  },
  {
    "key": "ui.app.collections.handle.page.535e52e4a261",
    "scope": "app.collections.handle.page",
    "text": "Profiles",
    "page": "Public Collections",
    "area": "Product",
    "section": "Page text",
    "source": "app/collections/[handle]/page.tsx"
  },
  {
    "key": "ui.app.collections.handle.page.577c10d6f210",
    "scope": "app.collections.handle.page",
    "text": "Message {{value1}}",
    "page": "Public Collections",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/collections/[handle]/page.tsx"
  },
  {
    "key": "ui.app.contact.page.86700824f25e",
    "scope": "app.contact.page",
    "text": "Support email",
    "page": "Contact",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/contact/page.tsx"
  },
  {
    "key": "ui.app.contact.page.ca07ed3aeab0",
    "scope": "app.contact.page",
    "text": "Use the email on your QRguitar account and include the QRguitar ID when your question is about a specific Profile.",
    "page": "Contact",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/contact/page.tsx"
  },
  {
    "key": "ui.app.contact.page.033917c675c9",
    "scope": "app.contact.page",
    "text": "QRguitar ID or Profile link, if applicable",
    "page": "Contact",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/contact/page.tsx"
  },
  {
    "key": "ui.app.contact.page.13cf847c78fe",
    "scope": "app.contact.page",
    "text": "The email on your QRguitar account",
    "page": "Contact",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/contact/page.tsx"
  },
  {
    "key": "ui.app.contact.page.b326afdcfd83",
    "scope": "app.contact.page",
    "text": "Relevant photos, documents, or service information",
    "page": "Contact",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/contact/page.tsx"
  },
  {
    "key": "ui.app.contact.page.a1a5b42347d6",
    "scope": "app.contact.page",
    "text": "A short description of what you need",
    "page": "Contact",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/contact/page.tsx"
  },
  {
    "key": "ui.app.create.page.08c41bf0de08",
    "scope": "app.create.page",
    "text": "{{value1}} photo{{value2}} added. Choose any photo as the main image.{{value3}}{{value4}}",
    "page": "Create Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.7e22ae7ac922",
    "scope": "app.create.page",
    "text": "{{value1}} document{{value2}} added.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.998db4cfad8a",
    "scope": "app.create.page",
    "text": "Review the highlighted fields before creating this Profile.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.2be1862301b7",
    "scope": "app.create.page",
    "text": "Sign in required to create QRguitar Profiles.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.c4bdda3b6f0c",
    "scope": "app.create.page",
    "text": "Your free Profile allowance is full. Check Profile credits in your account, or contact QRguitar for help.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.87e4b9e285f0",
    "scope": "app.create.page",
    "text": "Your session expired. Sign in again, then return to this page. Your form and selected files are still here.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.f873682ea460",
    "scope": "app.create.page",
    "text": "The server returned {{value1}}. Your form and selected files are preserved.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.8063b8ce1a81",
    "scope": "app.create.page",
    "text": "QRguitar Profile created.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.7becb15765b7",
    "scope": "app.create.page",
    "text": "The network request failed. Your form and selected files are preserved; try again.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.9bb4a8d57a82",
    "scope": "app.create.page",
    "text": "Profile created",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.5e16a39b804d",
    "scope": "app.create.page",
    "text": "Your permanent QRguitar Profile is ready.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.de62112c6b17",
    "scope": "app.create.page",
    "text": "The Profile can keep growing with history, media, documents, service, and ownership while its QRguitar ID and URL stay the same.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.a6c8f92c19f4",
    "scope": "app.create.page",
    "text": "QRguitar ID",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.41a634bed373",
    "scope": "app.create.page",
    "text": "View Profile",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.moreAfterCreate",
    "scope": "app.create.page",
    "text": "Add more to this Profile",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.c36438fa50cf",
    "scope": "app.create.page",
    "text": "Add History",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.a078fb55c65a",
    "scope": "app.create.page",
    "text": "Add Media",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.764f7a87c4b2",
    "scope": "app.create.page",
    "text": "Add Documents",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.5ee3796350c7",
    "scope": "app.create.page",
    "text": "Open Print Suite",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.97ba1d394fab",
    "scope": "app.create.page",
    "text": "Back to Dashboard",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.bb758aff6f87",
    "scope": "app.create.page",
    "text": "Create Profile",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.6fdf3c9bc618",
    "scope": "app.create.page",
    "text": "Instrument",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.c7d3acc826a8",
    "scope": "app.create.page",
    "text": "Ownership",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.45989de49fb7",
    "scope": "app.create.page",
    "text": "Details",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.f48393f8afb1",
    "scope": "app.create.page",
    "text": "Brand / Make",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.dbb3572478eb",
    "scope": "app.create.page",
    "text": "Start typing a brand",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.5e2c614c23f0",
    "scope": "app.create.page",
    "text": "Model",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.14b1b3c5b151",
    "scope": "app.create.page",
    "text": "Serial Number",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.fe94933d7dde",
    "scope": "app.create.page",
    "text": "Manufacturer or builder serial",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.246c90b63eac",
    "scope": "app.create.page",
    "text": "Year (optional)",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.862e62134ba9",
    "scope": "app.create.page",
    "text": "Leave blank if unknown",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.29df4f02b24a",
    "scope": "app.create.page",
    "text": "Instrument type",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.eb8fe6031206",
    "scope": "app.create.page",
    "text": "This instrument has no Serial Number",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.d9b8971b5432",
    "scope": "app.create.page",
    "text": "Verification without a Serial Number requires prior QRguitar approval.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.b20d74653b53",
    "scope": "app.create.page",
    "text": "Choose photos from your device or use your phone camera. Files can be up to 12MB each.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.aaf826b59e24",
    "scope": "app.create.page",
    "text": "Relationship (optional)",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.dc12bec5d71f",
    "scope": "app.create.page",
    "text": "Not specified",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.f031d5439d81",
    "scope": "app.create.page",
    "text": "Original owner",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.0abf1fda3294",
    "scope": "app.create.page",
    "text": "Current owner",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.d6b9af527351",
    "scope": "app.create.page",
    "text": "Store inventory",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.27dae2bdfc65",
    "scope": "app.create.page",
    "text": "Builder / Brand",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.f97e9da0e3b8",
    "scope": "app.create.page",
    "text": "Other",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.a896221d5946",
    "scope": "app.create.page",
    "text": "Owner display",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.1db2451eea93",
    "scope": "app.create.page",
    "text": "Name or collection",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.0b0489074742",
    "scope": "app.create.page",
    "text": "Acquisition date",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.5e553fd3aa01",
    "scope": "app.create.page",
    "text": "Seller / store (optional)",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.15b61974b270",
    "scope": "app.create.page",
    "text": "Location",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.fef8ce3a04b7",
    "scope": "app.create.page",
    "text": "City, region, country",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.1c47f10cc99e",
    "scope": "app.create.page",
    "text": "Profile visibility",
    "page": "Create Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.591935b15b1c",
    "scope": "app.create.page",
    "text": "Public",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.bc96567e77ca",
    "scope": "app.create.page",
    "text": "Unlisted",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.c63eb6720c6e",
    "scope": "app.create.page",
    "text": "Private",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.f88c0d40c301",
    "scope": "app.create.page",
    "text": "Listed in the Catalog and available by QR or direct link.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.3d1d2fd4f39f",
    "scope": "app.create.page",
    "text": "Hidden from the Catalog but available by QR or direct link.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.f0d2868fe175",
    "scope": "app.create.page",
    "text": "Available only to the signed-in owner and authorized admin.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.7448611d5f93",
    "scope": "app.create.page",
    "text": "Visibility",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.ee21436940da",
    "scope": "app.create.page",
    "text": "Show Serial Number publicly",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.dba16601d30d",
    "scope": "app.create.page",
    "text": "This hides only the Serial Number field. The permanent QR ID and URL may still include the serial. Choose a private Profile to restrict access to the signed-in owner and authorized admin.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.e69702d5925c",
    "scope": "app.create.page",
    "text": "Display title / nickname",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.1c2552da9e8f",
    "scope": "app.create.page",
    "text": "Defaults to Brand + Model",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.39b36d38d6eb",
    "scope": "app.create.page",
    "text": "Condition",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.18fdd549b2ed",
    "scope": "app.create.page",
    "text": "New",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.ae7d8dfac9ff",
    "scope": "app.create.page",
    "text": "Used",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.12f67f8539c4",
    "scope": "app.create.page",
    "text": "Availability",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.e063cbea64ad",
    "scope": "app.create.page",
    "text": "Not for Sale",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.1a83dec1476e",
    "scope": "app.create.page",
    "text": "For Sale",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.faafda16cc4c",
    "scope": "app.create.page",
    "text": "Originality",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.2604d337dc13",
    "scope": "app.create.page",
    "text": "Not Specified",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.8894d64075bf",
    "scope": "app.create.page",
    "text": "All Original",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.e8ce5dcaf408",
    "scope": "app.create.page",
    "text": "Modified",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.cf846c3fbd33",
    "scope": "app.create.page",
    "text": "Builder (optional)",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.a6c7a84baa67",
    "scope": "app.create.page",
    "text": "Finish",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.81d27ef6d503",
    "scope": "app.create.page",
    "text": "Weight",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.14287aa826e9",
    "scope": "app.create.page",
    "text": "Neck profile",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.b170628a88a7",
    "scope": "app.create.page",
    "text": "Pickups / electronics",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.ca6f44db47d0",
    "scope": "app.create.page",
    "text": "Profile story",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.0619a067e490",
    "scope": "app.create.page",
    "text": "What makes this instrument useful, interesting, or important?",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.70c12f95c8df",
    "scope": "app.create.page",
    "text": "Advanced specifications and notes",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.0a0d88394619",
    "scope": "app.create.page",
    "text": "Specification notes",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.49036df3fcb1",
    "scope": "app.create.page",
    "text": "Hardware, wiring, neck carve, fretwire, case details, or other specifications.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.1c65310c2efa",
    "scope": "app.create.page",
    "text": "Specification label",
    "page": "Create Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.397324160ebb",
    "scope": "app.create.page",
    "text": "Specification",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.b29700bd3dc8",
    "scope": "app.create.page",
    "text": "Specification value",
    "page": "Create Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.8e37953d23da",
    "scope": "app.create.page",
    "text": "Value",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.c3812fc4acb8",
    "scope": "app.create.page",
    "text": "Remove",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.66a793b2bedd",
    "scope": "app.create.page",
    "text": "Add specification",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.66e2ee1daefc",
    "scope": "app.create.page",
    "text": "Add known service work",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.e83ee74ec617",
    "scope": "app.create.page",
    "text": "This creates a real Timeline service entry, not a loose specification.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.cdb70ebd5845",
    "scope": "app.create.page",
    "text": "Service date",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.5844e6bad41d",
    "scope": "app.create.page",
    "text": "Service type",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.7013af4c42fe",
    "scope": "app.create.page",
    "text": "Setup",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.1196b6c538ec",
    "scope": "app.create.page",
    "text": "Repair",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.6e4fa13da486",
    "scope": "app.create.page",
    "text": "Inspection",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.6a3c6c77892d",
    "scope": "app.create.page",
    "text": "Restoration",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.7ae9c23d6592",
    "scope": "app.create.page",
    "text": "Electronics",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.8e5078530b61",
    "scope": "app.create.page",
    "text": "Fretwork",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.e54c593a4afc",
    "scope": "app.create.page",
    "text": "Entry title",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.c3fdfbe623ce",
    "scope": "app.create.page",
    "text": "Example: Full setup and inspection",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.7b004f180b64",
    "scope": "app.create.page",
    "text": "Service description",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.d05a6c62da13",
    "scope": "app.create.page",
    "text": "Private owner notes",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.782df1fdfe64",
    "scope": "app.create.page",
    "text": "Show this service entry on the public Timeline",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.f9397a00eca8",
    "scope": "app.create.page",
    "text": "Links and supporting documents",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.acaa9ea6688f",
    "scope": "app.create.page",
    "text": "Link label",
    "page": "Create Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.9dfd0b9f8f42",
    "scope": "app.create.page",
    "text": "Link URL",
    "page": "Create Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.dfe9ca4d0f96",
    "scope": "app.create.page",
    "text": "Add link",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.37b809b43319",
    "scope": "app.create.page",
    "text": "Add documents (optional)",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.1dd25576bcdc",
    "scope": "app.create.page",
    "text": "Receipts, appraisals, invoices, build sheets, or service slips. New documents stay private by default.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.d60bb2d3cfea",
    "scope": "app.create.page",
    "text": "Public document",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.899485baa668",
    "scope": "app.create.page",
    "text": "Private document",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.a4382f496011",
    "scope": "app.create.page",
    "text": "{{value1}} visibility",
    "page": "Create Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.03dc3eccc380",
    "scope": "app.create.page",
    "text": "Originality describes disclosed modification status. It does not mean QRguitar verification or authenticity confirmation.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.f06c99a84731",
    "scope": "app.create.page",
    "text": "Preview your Profile",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.8ca6af960b9f",
    "scope": "app.create.page",
    "text": "No serial number",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.fec85e780f9d",
    "scope": "app.create.page",
    "text": "This QRguitar ID and Profile URL remain permanent. Customize the downloadable QR later from your Dashboard.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.24ccf710b746",
    "scope": "app.create.page",
    "text": "View existing Profile",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.b819c86a0d98",
    "scope": "app.create.page",
    "text": "Request ownership",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.8090fdcc6209",
    "scope": "app.create.page",
    "text": "Check Profile credits in a new tab",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.19e972d95676",
    "scope": "app.create.page",
    "text": "Keep this form open, then return to create your Profile.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.aea7359da3eb",
    "scope": "app.create.page",
    "text": "Retry safely",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.19766ed6ccb2",
    "scope": "app.create.page",
    "text": "Cancel",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.aeb7e60a2efa",
    "scope": "app.create.page",
    "text": "Creating Profile...",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.de02ab7a9a50",
    "scope": "app.create.page",
    "text": "Create instrument",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.d7f3b884c97a",
    "scope": "app.create.page",
    "text": "Give your instrument a permanent home.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.325a8c093318",
    "scope": "app.create.page",
    "text": "Create QRguitar Profiles from your account so the QR, photos, documents, and ownership stay tied to the right owner.",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.bfd402b2f6f3",
    "scope": "app.create.page",
    "text": "Sign in",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.798ca2ce18bf",
    "scope": "app.create.page",
    "text": "Create account",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.4d05dc6da837",
    "scope": "app.create.page",
    "text": "Browse catalog",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.create.page.e26788c57413",
    "scope": "app.create.page",
    "text": "Select category",
    "page": "Create Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/create/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.a439fba430a3",
    "scope": "app.dashboard.page",
    "text": "QR",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.9b28be3dc6ed",
    "scope": "app.dashboard.page",
    "text": "Your collection",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.8dcf9115336c",
    "scope": "app.dashboard.page",
    "text": "Opening your dashboard…",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.daf79b219dc5",
    "scope": "app.dashboard.page",
    "text": "Checking your account.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.67b696468610",
    "scope": "app.dashboard.page",
    "text": "Dashboard",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.16b87f28c419",
    "scope": "app.dashboard.page",
    "text": "Sign in to manage your QRguitar Profiles.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.81321b8462a6",
    "scope": "app.dashboard.page",
    "text": "Private inventory",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.f0f8d70e904e",
    "scope": "app.dashboard.page",
    "text": "QR downloads",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.eba6da9f51a2",
    "scope": "app.dashboard.page",
    "text": "Photos and documents",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.bfd402b2f6f3",
    "scope": "app.dashboard.page",
    "text": "Sign in",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.798ca2ce18bf",
    "scope": "app.dashboard.page",
    "text": "Create account",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.4d05dc6da837",
    "scope": "app.dashboard.page",
    "text": "Browse catalog",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.61669a91a83b",
    "scope": "app.dashboard.page",
    "text": "Open service workbench",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.3880eee7e45c",
    "scope": "app.dashboard.page",
    "text": "Add your own instrument",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.e4ecedd588e1",
    "scope": "app.dashboard.page",
    "text": "Set up public collection",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.6fe48008e091",
    "scope": "app.dashboard.page",
    "text": "Previously loaded Profiles are shown below.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.65dc6018f43f",
    "scope": "app.dashboard.page",
    "text": "Your collection is not yet loaded.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.d8b8392e2c54",
    "scope": "app.dashboard.page",
    "text": "Try again",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.c4e6f5e2cc0b",
    "scope": "app.dashboard.page",
    "text": "Collection overview",
    "page": "Dashboard",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.61d5a3e9beca",
    "scope": "app.dashboard.page",
    "text": "Search your collection",
    "page": "Dashboard",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.139a32beaa54",
    "scope": "app.dashboard.page",
    "text": "Loading your Profiles...",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.b4694d08f7e0",
    "scope": "app.dashboard.page",
    "text": "Pulling your saved Profiles now.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.1561734f82a6",
    "scope": "app.dashboard.page",
    "text": "Collection unavailable",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.5d4de079afd4",
    "scope": "app.dashboard.page",
    "text": "Use Try again above to reload your Profiles.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.c9a11cf01443",
    "scope": "app.dashboard.page",
    "text": "Collection profile {{value1}}: {{value2}}",
    "page": "Dashboard",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.ca7577d56ebc",
    "scope": "app.dashboard.page",
    "text": "{{value1}}: {{value2}}",
    "page": "Dashboard",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.55c64d0fcd6f",
    "scope": "app.dashboard.page",
    "text": "photo",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.84a6dae49cf0",
    "scope": "app.dashboard.page",
    "text": "photos",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.9df6b026a8c6",
    "scope": "app.dashboard.page",
    "text": "service",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.923fe53966c6",
    "scope": "app.dashboard.page",
    "text": "entry",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.87d05cd08817",
    "scope": "app.dashboard.page",
    "text": "entries",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.efa1f375d761",
    "scope": "app.dashboard.page",
    "text": "public",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.43cc23fa52b8",
    "scope": "app.dashboard.page",
    "text": "document",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.9b16b44d0e0a",
    "scope": "app.dashboard.page",
    "text": "documents",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.1bef30db15b5",
    "scope": "app.dashboard.page",
    "text": ", {{value1}} private",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.c63eb6720c6e",
    "scope": "app.dashboard.page",
    "text": "Private",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.bc96567e77ca",
    "scope": "app.dashboard.page",
    "text": "Unlisted",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.591935b15b1c",
    "scope": "app.dashboard.page",
    "text": "Public",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.9b7e3e571ecb",
    "scope": "app.dashboard.page",
    "text": "Profile identity",
    "page": "Dashboard",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.a6c8f92c19f4",
    "scope": "app.dashboard.page",
    "text": "QRguitar ID",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.14b1b3c5b151",
    "scope": "app.dashboard.page",
    "text": "Serial Number",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.8ca6af960b9f",
    "scope": "app.dashboard.page",
    "text": "No serial number",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.34e14d665e15",
    "scope": "app.dashboard.page",
    "text": "Actions for {{value1}}",
    "page": "Dashboard",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.d4e63f569f33",
    "scope": "app.dashboard.page",
    "text": "Quick Edit",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.53e5110624dd",
    "scope": "app.dashboard.page",
    "text": "{{value1}} for {{value2}}",
    "page": "Dashboard",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.197f9e60605d",
    "scope": "app.dashboard.page",
    "text": "No matching Profiles.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.9f7551ac4715",
    "scope": "app.dashboard.page",
    "text": "Try a different search or visibility filter.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.8157452810db",
    "scope": "app.dashboard.page",
    "text": "Show All Profiles",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.4dc38afcfa8e",
    "scope": "app.dashboard.page",
    "text": "Ownership and workspace tools",
    "page": "Dashboard",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.832fd327544b",
    "scope": "app.dashboard.page",
    "text": "Owner tools",
    "page": "Dashboard",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.aefc059cfcc0",
    "scope": "app.dashboard.page",
    "text": "Service review",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.1d5aee2be8a0",
    "scope": "app.dashboard.page",
    "text": "Ownership claims",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.48920b5ab551",
    "scope": "app.dashboard.page",
    "text": "Ownership transfers",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.073f22d50013",
    "scope": "app.dashboard.page",
    "text": "Publish your public Profiles together and control member inquiries",
    "page": "Dashboard",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.2c8274b24de5",
    "scope": "app.dashboard.page",
    "text": "Collection & inquiries",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.b64ac05f17e6",
    "scope": "app.dashboard.page",
    "text": "Live",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.4da10f1fbb17",
    "scope": "app.dashboard.page",
    "text": "Set up",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.9aab2ecb991d",
    "scope": "app.dashboard.page",
    "text": "Trust summary",
    "page": "Dashboard",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.4f7838402f37",
    "scope": "app.dashboard.page",
    "text": "Verified",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.eb95c24a9590",
    "scope": "app.dashboard.page",
    "text": "Authenticity Confirmed",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.ba59e2d4a5e3",
    "scope": "app.dashboard.page",
    "text": "Clear filter",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.d677190e0a99",
    "scope": "app.dashboard.page",
    "text": "Service",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.f97efc02c5d2",
    "scope": "app.dashboard.page",
    "text": "Service requests",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.b2df16574d8f",
    "scope": "app.dashboard.page",
    "text": "Review provider-submitted work before it is added to the Profile.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.0f503c13fb6a",
    "scope": "app.dashboard.page",
    "text": "awaiting review",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.25b1fe3f0719",
    "scope": "app.dashboard.page",
    "text": " · {{value1}}",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.af263b67ec8c",
    "scope": "app.dashboard.page",
    "text": "private evidence file",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.043a718774c5",
    "scope": "app.dashboard.page",
    "text": "s",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.f3bfa948a110",
    "scope": "app.dashboard.page",
    "text": "Review service",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.62a2fed3d6e0",
    "scope": "app.dashboard.page",
    "text": "pending",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.29f32c3200b7",
    "scope": "app.dashboard.page",
    "text": "To send an instrument to a new owner, open its More menu below and choose Transfer Ownership. The instrument keeps its QRguitar ID, QR link, and history.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.80751a738167",
    "scope": "app.dashboard.page",
    "text": "Manage transfer",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.78b42b116d41",
    "scope": "app.dashboard.page",
    "text": "Serial Number {{value1}}",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.0006179f0706",
    "scope": "app.dashboard.page",
    "text": "No Serial Number",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.9af3e044122c",
    "scope": "app.dashboard.page",
    "text": "QR, print & sharing",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.5ee3796350c7",
    "scope": "app.dashboard.page",
    "text": "Open Print Suite",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.de8413ab464c",
    "scope": "app.dashboard.page",
    "text": "History & files",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.b4d8cb7570b7",
    "scope": "app.dashboard.page",
    "text": "Timeline event",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.ef49d7a68372",
    "scope": "app.dashboard.page",
    "text": "Service entry",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.f8e0207ec66e",
    "scope": "app.dashboard.page",
    "text": "Photos & media",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.b4e929d8bcfe",
    "scope": "app.dashboard.page",
    "text": "Documents",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.3538d701131e",
    "scope": "app.dashboard.page",
    "text": "Privacy & safety",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.e5d3af1efed5",
    "scope": "app.dashboard.page",
    "text": "Hiding the serial field does not change the permanent QR ID or URL, which may contain the serial. Use private visibility to restrict access.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.c43c36e3acf6",
    "scope": "app.dashboard.page",
    "text": "Hide Serial Number",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.7e8e1732f6a0",
    "scope": "app.dashboard.page",
    "text": "Show Serial Number",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.91d623e6ce72",
    "scope": "app.dashboard.page",
    "text": "Visibility & safety",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.fd8b8dae4421",
    "scope": "app.dashboard.page",
    "text": "Danger zone",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.f49cda3a003c",
    "scope": "app.dashboard.page",
    "text": "Transfer Ownership",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.169f2da401df",
    "scope": "app.dashboard.page",
    "text": "Start a secure handoff to the next owner.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.5f74589ff706",
    "scope": "app.dashboard.page",
    "text": "Ownership handoff",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.5989eea16b52",
    "scope": "app.dashboard.page",
    "text": "Prepare a private code for an in-person buyer.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.a55829ebe2f6",
    "scope": "app.dashboard.page",
    "text": "Email a claim link to the next owner.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.605c3c2813aa",
    "scope": "app.dashboard.page",
    "text": "Use this at checkout or pickup. The code expires, works once, and can be bound to the buyer's email.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.4060ac58871b",
    "scope": "app.dashboard.page",
    "text": "The recipient signs in with the email below, opens the claim link, and accepts the same permanent QRguitar Profile.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.84650f6c3f73",
    "scope": "app.dashboard.page",
    "text": "Handoff method",
    "page": "Dashboard",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.91c5b0010aa1",
    "scope": "app.dashboard.page",
    "text": "Email invitation",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.c0bba41e5ae5",
    "scope": "app.dashboard.page",
    "text": "Private buyer code",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.db2f662af00b",
    "scope": "app.dashboard.page",
    "text": "New owner name",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.f15b921cee8c",
    "scope": "app.dashboard.page",
    "text": "Buyer email (optional, recommended)",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.1a188a2a4288",
    "scope": "app.dashboard.page",
    "text": "New owner email",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.4680d9cb3265",
    "scope": "app.dashboard.page",
    "text": "new-owner@example.com",
    "page": "Dashboard",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.7a388472fdd9",
    "scope": "app.dashboard.page",
    "text": "Order or receipt reference (optional)",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.db963ae6d517",
    "scope": "app.dashboard.page",
    "text": "Order 1048 or receipt 6812",
    "page": "Dashboard",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.0907f3c17b11",
    "scope": "app.dashboard.page",
    "text": "If entered, the buyer must match it. QRguitar stores only a one-way check.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.40a35cf6c6bf",
    "scope": "app.dashboard.page",
    "text": "Code expires",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.f64edb0fb007",
    "scope": "app.dashboard.page",
    "text": "After 24 hours",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.21b6268b43ba",
    "scope": "app.dashboard.page",
    "text": "After 3 days",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.a166017f5868",
    "scope": "app.dashboard.page",
    "text": "After 7 days",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.646cf904ed78",
    "scope": "app.dashboard.page",
    "text": "After 14 days",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.16e515568d66",
    "scope": "app.dashboard.page",
    "text": "After 30 days",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.222e0344a18c",
    "scope": "app.dashboard.page",
    "text": "Copy Claim Link",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.1e11da231ca3",
    "scope": "app.dashboard.page",
    "text": "Resend Sign-in Email",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.dc5324346ff0",
    "scope": "app.dashboard.page",
    "text": "Cancel Transfer",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.74a6b5348c06",
    "scope": "app.dashboard.page",
    "text": "Preparing...",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.a94ebe414853",
    "scope": "app.dashboard.page",
    "text": "Send Transfer Email",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.fc3fb992308f",
    "scope": "app.dashboard.page",
    "text": "Prepare for Buyer",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.7cb698b4afcc",
    "scope": "app.dashboard.page",
    "text": "Copy this code now",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.a2502e17f908",
    "scope": "app.dashboard.page",
    "text": "It is shown once.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.417ce1bcc824",
    "scope": "app.dashboard.page",
    "text": "Give the buyer the matching order or receipt reference too. ",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.b9b0a3e8738f",
    "scope": "app.dashboard.page",
    "text": "Cancelling the handoff revokes it.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.7e554bec7cf4",
    "scope": "app.dashboard.page",
    "text": "Copy Buyer Code",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.e393c52d89bf",
    "scope": "app.dashboard.page",
    "text": "Claim received",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.b6321ee9a4a7",
    "scope": "app.dashboard.page",
    "text": "Transfer cancelled",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.17b626d63a07",
    "scope": "app.dashboard.page",
    "text": "Private buyer handoff prepared",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.5d2356016d09",
    "scope": "app.dashboard.page",
    "text": "Claim link created",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.b90f83fb529f",
    "scope": "app.dashboard.page",
    "text": "Recipient not email-bound",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.c6d4108974a1",
    "scope": "app.dashboard.page",
    "text": "Expires {{value1}}. ",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.53f58d61b305",
    "scope": "app.dashboard.page",
    "text": "The private code is never stored in readable form. Revoke and prepare a new handoff if it was not copied.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.page.18ed36f2100f",
    "scope": "app.dashboard.page",
    "text": "Pending transfer",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/page.tsx"
  },
  {
    "key": "ui.app.dashboard.profile.code.OwnerProfileClient.9b28be3dc6ed",
    "scope": "app.dashboard.profile.code.OwnerProfileClient",
    "text": "Your collection",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/profile/[code]/OwnerProfileClient.tsx"
  },
  {
    "key": "ui.app.dashboard.profile.code.OwnerProfileClient.ffad3e64048f",
    "scope": "app.dashboard.profile.code.OwnerProfileClient",
    "text": "Opening your Profile…",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/profile/[code]/OwnerProfileClient.tsx"
  },
  {
    "key": "ui.app.dashboard.profile.code.OwnerProfileClient.46820bbeca47",
    "scope": "app.dashboard.profile.code.OwnerProfileClient",
    "text": "Sign in to view your Profile",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/profile/[code]/OwnerProfileClient.tsx"
  },
  {
    "key": "ui.app.dashboard.profile.code.OwnerProfileClient.158e5a22a48c",
    "scope": "app.dashboard.profile.code.OwnerProfileClient",
    "text": "Profile unavailable",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/profile/[code]/OwnerProfileClient.tsx"
  },
  {
    "key": "ui.app.dashboard.profile.code.OwnerProfileClient.cd563df66e7c",
    "scope": "app.dashboard.profile.code.OwnerProfileClient",
    "text": "We could not load your Profile",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/profile/[code]/OwnerProfileClient.tsx"
  },
  {
    "key": "ui.app.dashboard.profile.code.OwnerProfileClient.f6b6e188e29b",
    "scope": "app.dashboard.profile.code.OwnerProfileClient",
    "text": "Checking your account and loading the instrument.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/profile/[code]/OwnerProfileClient.tsx"
  },
  {
    "key": "ui.app.dashboard.profile.code.OwnerProfileClient.4537aa12687c",
    "scope": "app.dashboard.profile.code.OwnerProfileClient",
    "text": "Private Profiles are available only to their owner.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/profile/[code]/OwnerProfileClient.tsx"
  },
  {
    "key": "ui.app.dashboard.profile.code.OwnerProfileClient.820aa22dc0e6",
    "scope": "app.dashboard.profile.code.OwnerProfileClient",
    "text": "This Profile is not available to this account. Check that you are signed in to the account that owns it.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/profile/[code]/OwnerProfileClient.tsx"
  },
  {
    "key": "ui.app.dashboard.profile.code.OwnerProfileClient.f16a60aa884d",
    "scope": "app.dashboard.profile.code.OwnerProfileClient",
    "text": "Your Profile has not changed. Check your connection and try again.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/profile/[code]/OwnerProfileClient.tsx"
  },
  {
    "key": "ui.app.dashboard.profile.code.OwnerProfileClient.bfd402b2f6f3",
    "scope": "app.dashboard.profile.code.OwnerProfileClient",
    "text": "Sign in",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/profile/[code]/OwnerProfileClient.tsx"
  },
  {
    "key": "ui.app.dashboard.profile.code.OwnerProfileClient.d8b8392e2c54",
    "scope": "app.dashboard.profile.code.OwnerProfileClient",
    "text": "Try again",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/profile/[code]/OwnerProfileClient.tsx"
  },
  {
    "key": "ui.app.dashboard.profile.code.OwnerProfileClient.4466f3a00b0b",
    "scope": "app.dashboard.profile.code.OwnerProfileClient",
    "text": "Back to collection",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/profile/[code]/OwnerProfileClient.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.aa14a3ce2771",
    "scope": "app.dashboard.service.page",
    "text": "Loading your service work took too long. Try again.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Feedback",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.19d09c5fcaff",
    "scope": "app.dashboard.service.page",
    "text": "Your service work could not be loaded. Try again.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Feedback",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.67b696468610",
    "scope": "app.dashboard.service.page",
    "text": "Dashboard",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.5e2ab5d6c101",
    "scope": "app.dashboard.service.page",
    "text": "For luthiers & repair shops",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.3f9b5c09e0a6",
    "scope": "app.dashboard.service.page",
    "text": "Service workbench",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.3ab05f868d78",
    "scope": "app.dashboard.service.page",
    "text": "Pick up a draft, track owner review, and keep the work you performed connected to the instrument.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.6ba0be9a0111",
    "scope": "app.dashboard.service.page",
    "text": "Business tools",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.d677c4c20422",
    "scope": "app.dashboard.service.page",
    "text": "Checking your sign-in…",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.1baa4ff16741",
    "scope": "app.dashboard.service.page",
    "text": "Your private service work will appear here.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.0591283e2c7f",
    "scope": "app.dashboard.service.page",
    "text": "Sign-in check unavailable",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.d8b8392e2c54",
    "scope": "app.dashboard.service.page",
    "text": "Try again",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.5acef34720ff",
    "scope": "app.dashboard.service.page",
    "text": "Sign in to your workbench",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.af0469e0e44e",
    "scope": "app.dashboard.service.page",
    "text": "Use the provider account that performed the work to see its requests and drafts.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.bfd402b2f6f3",
    "scope": "app.dashboard.service.page",
    "text": "Sign in",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.8a366259b6c3",
    "scope": "app.dashboard.service.page",
    "text": "Start a service record",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.1956b220efa1",
    "scope": "app.dashboard.service.page",
    "text": "Enter the instrument’s QRguitar ID. Private Profiles require the owner to grant your provider account access.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.a6c8f92c19f4",
    "scope": "app.dashboard.service.page",
    "text": "QRguitar ID",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.9746a68d757f",
    "scope": "app.dashboard.service.page",
    "text": "QRG-123456",
    "page": "Dashboard",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.31fbef162594",
    "scope": "app.dashboard.service.page",
    "text": "Continue",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.7f5463de2f50",
    "scope": "app.dashboard.service.page",
    "text": "Find the ID on the Profile or its QR label.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.6ef59b6a264d",
    "scope": "app.dashboard.service.page",
    "text": "Counts in the loaded requests",
    "page": "Dashboard",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.0640eff79a67",
    "scope": "app.dashboard.service.page",
    "text": "Requests loaded",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.61b848363968",
    "scope": "app.dashboard.service.page",
    "text": "Drafts & revisions",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.6f97ecb34e76",
    "scope": "app.dashboard.service.page",
    "text": "Awaiting owner review",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.1b0ecbc5aba3",
    "scope": "app.dashboard.service.page",
    "text": "Your service requests",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.a47c545d96bd",
    "scope": "app.dashboard.service.page",
    "text": "Up to 100 most recently updated requests for this provider account.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.ba3bbbe10d8b",
    "scope": "app.dashboard.service.page",
    "text": "Loading…",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.0e9161011702",
    "scope": "app.dashboard.service.page",
    "text": "Refresh",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.ce5c412d6488",
    "scope": "app.dashboard.service.page",
    "text": "Service work could not be refreshed",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.dce6611fee94",
    "scope": "app.dashboard.service.page",
    "text": "The requests below are the last successfully loaded snapshot.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.5d37aeb39fed",
    "scope": "app.dashboard.service.page",
    "text": "Loading your requests…",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.45cff2c7c744",
    "scope": "app.dashboard.service.page",
    "text": "Checking drafts, owner reviews, and completed work.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.06e51c1a6440",
    "scope": "app.dashboard.service.page",
    "text": "Your first service record starts here",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.b90ff6b8cd21",
    "scope": "app.dashboard.service.page",
    "text": "Enter a QRguitar ID above to document completed work. Save a private draft, attach evidence, then send it to the owner for review.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.abb835ab195b",
    "scope": "app.dashboard.service.page",
    "text": "Approval and visibility are decided by the Profile owner.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.d188ca78be54",
    "scope": "app.dashboard.service.page",
    "text": "Search requests",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.1b157f484a02",
    "scope": "app.dashboard.service.page",
    "text": "Work order, instrument, title, or QR ID",
    "page": "Dashboard",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.920e413c7d41",
    "scope": "app.dashboard.service.page",
    "text": "Status",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.8ee57323a6f2",
    "scope": "app.dashboard.service.page",
    "text": "All statuses",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.d604310a789a",
    "scope": "app.dashboard.service.page",
    "text": "Showing",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.28391d3bc64e",
    "scope": "app.dashboard.service.page",
    "text": "of",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.edadbc16b1be",
    "scope": "app.dashboard.service.page",
    "text": "loaded requests",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.4fc37818e165",
    "scope": "app.dashboard.service.page",
    "text": "No requests match these filters",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.5d1743ecee4f",
    "scope": "app.dashboard.service.page",
    "text": "Try another work-order reference, instrument, or status.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.7179ea0035fc",
    "scope": "app.dashboard.service.page",
    "text": "Clear filters",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.9850ac72a395",
    "scope": "app.dashboard.service.page",
    "text": "Untitled service draft",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.158e5a22a48c",
    "scope": "app.dashboard.service.page",
    "text": "Profile unavailable",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.d677190e0a99",
    "scope": "app.dashboard.service.page",
    "text": "Service",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.fe01fc93d1ae",
    "scope": "app.dashboard.service.page",
    "text": "· Work order",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.d9f533ca8b8b",
    "scope": "app.dashboard.service.page",
    "text": "Private evidence",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.3b9c358f36f0",
    "scope": "app.dashboard.service.page",
    "text": "file",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.3d7db37d08f9",
    "scope": "app.dashboard.service.page",
    "text": "files",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.b2bde187af4f",
    "scope": "app.dashboard.service.page",
    "text": "Review email",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.c16bc82bf1f0",
    "scope": "app.dashboard.service.page",
    "text": "Sent",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.b486522010d5",
    "scope": "app.dashboard.service.page",
    "text": "Delivery failed",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.a16cb9bd9d66",
    "scope": "app.dashboard.service.page",
    "text": "Not attempted",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.3a5ecca188c0",
    "scope": "app.dashboard.service.page",
    "text": "Updated",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.9fc42bd9c76b",
    "scope": "app.dashboard.service.page",
    "text": "{{value1}} {{value2}} for {{value3}}",
    "page": "Dashboard",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.d640c7421da0",
    "scope": "app.dashboard.service.page",
    "text": "Resume",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.dcc839a4015c",
    "scope": "app.dashboard.service.page",
    "text": "View",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.dashboard.service.page.1c4cb6f2a379",
    "scope": "app.dashboard.service.page",
    "text": "Evidence remains private. A sent email does not mean the owner has approved the work.",
    "page": "Dashboard",
    "area": "Product",
    "section": "Page text",
    "source": "app/dashboard/service/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.2f0a4b105931",
    "scope": "app.edit.code.page",
    "text": "This Profile was not found for your account.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.e58b3c4b0eeb",
    "scope": "app.edit.code.page",
    "text": "Could not load this Profile. Check your connection and try again.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.8c23311d31e4",
    "scope": "app.edit.code.page",
    "text": "Media URL and title are required.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.a60687ec3498",
    "scope": "app.edit.code.page",
    "text": "Could not add media.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.39e3cbd0722a",
    "scope": "app.edit.code.page",
    "text": "Media added.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.d09487f73f3b",
    "scope": "app.edit.code.page",
    "text": "Could not remove media.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.90fb34ab44a1",
    "scope": "app.edit.code.page",
    "text": "Media removed.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.94de5baedf39",
    "scope": "app.edit.code.page",
    "text": "Could not update media.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.50e60486b114",
    "scope": "app.edit.code.page",
    "text": "Media updated.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.89cd6d97aa20",
    "scope": "app.edit.code.page",
    "text": "Service entry title is required.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.5f2daa5a67f7",
    "scope": "app.edit.code.page",
    "text": "Could not save service entry.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.6cb9aa0fcb13",
    "scope": "app.edit.code.page",
    "text": "Service entry saved. The permanent QRguitar URL stayed the same.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.a858c19c2e1d",
    "scope": "app.edit.code.page",
    "text": "Could not delete service entry.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.fef49344ff0b",
    "scope": "app.edit.code.page",
    "text": "Service entry deleted.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.004308492583",
    "scope": "app.edit.code.page",
    "text": "{{value1}} photo{{value2}} added. Choose any photo as the main image.{{value3}}",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.fb7a2f840893",
    "scope": "app.edit.code.page",
    "text": "{{value1}} document{{value2}} added.{{value3}}",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.49e43361459d",
    "scope": "app.edit.code.page",
    "text": "That looks like a repeated submission. Wait a few seconds and try again.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.02131b53c6b7",
    "scope": "app.edit.code.page",
    "text": "This guitar cannot be edited because it was not found.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.cd1a49c2c343",
    "scope": "app.edit.code.page",
    "text": "Every QRguitar Profile needs at least one photo.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.d0c04254acb6",
    "scope": "app.edit.code.page",
    "text": "Profile details failed: {{value1}}",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.b60a79b1ba9d",
    "scope": "app.edit.code.page",
    "text": "Trust settings failed: {{value1}}",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.dd99fa7bf17d",
    "scope": "app.edit.code.page",
    "text": "Safety status failed: {{value1}}",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.7dbbf757ae78",
    "scope": "app.edit.code.page",
    "text": "Saved as {{value1}}. Previous QR links still open this profile.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.fca046ccd586",
    "scope": "app.edit.code.page",
    "text": "Saved.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.fec2ac0f4cf1",
    "scope": "app.edit.code.page",
    "text": "Edit Profile",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.44a43c5ad757",
    "scope": "app.edit.code.page",
    "text": "This Profile has an active safety alert.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.48d5a8281410",
    "scope": "app.edit.code.page",
    "text": "Review safety status",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.a6c8f92c19f4",
    "scope": "app.edit.code.page",
    "text": "QRguitar ID",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.379e7e78d21e",
    "scope": "app.edit.code.page",
    "text": "When a Serial Number exists, the QRguitar ID uses the format QRG-SERIAL. Previous QR links remain active after approved corrections.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.1c47f10cc99e",
    "scope": "app.edit.code.page",
    "text": "Profile visibility",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.c6e88acaaf6f",
    "scope": "app.edit.code.page",
    "text": "Public catalog",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.b94392a1943c",
    "scope": "app.edit.code.page",
    "text": "Unlisted direct link",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.d666dd40b98c",
    "scope": "app.edit.code.page",
    "text": "Private owner only",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.c1acbedb643a",
    "scope": "app.edit.code.page",
    "text": "Shows on the live homepage feed and catalog.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.2bfd63b89729",
    "scope": "app.edit.code.page",
    "text": "Hidden from browsing, but anyone with the permanent link can view it.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.44692a3804f6",
    "scope": "app.edit.code.page",
    "text": "Hidden from public browsing and direct public access.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.7448611d5f93",
    "scope": "app.edit.code.page",
    "text": "Visibility",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.591935b15b1c",
    "scope": "app.edit.code.page",
    "text": "Public",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.c63eb6720c6e",
    "scope": "app.edit.code.page",
    "text": "Private",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.bc96567e77ca",
    "scope": "app.edit.code.page",
    "text": "Unlisted",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.bf60214d782d",
    "scope": "app.edit.code.page",
    "text": "Edit Profile sections",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.999f23fcd7be",
    "scope": "app.edit.code.page",
    "text": "Identity",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.5e3147ab51e0",
    "scope": "app.edit.code.page",
    "text": "Photos",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.45989de49fb7",
    "scope": "app.edit.code.page",
    "text": "Details",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.23099ed0a502",
    "scope": "app.edit.code.page",
    "text": "Timeline & Ownership",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.d677190e0a99",
    "scope": "app.edit.code.page",
    "text": "Service",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.d357175cfe89",
    "scope": "app.edit.code.page",
    "text": "Media",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.b4e929d8bcfe",
    "scope": "app.edit.code.page",
    "text": "Documents",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.ade9248e0132",
    "scope": "app.edit.code.page",
    "text": "Trust",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.f096950eacff",
    "scope": "app.edit.code.page",
    "text": "Privacy & Safety",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.347d28dfa602",
    "scope": "app.edit.code.page",
    "text": "QR & Print",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.b9920fd79715",
    "scope": "app.edit.code.page",
    "text": "Current section",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.c5a754da6b5d",
    "scope": "app.edit.code.page",
    "text": "Edit Profile section",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.7708c49ad0e2",
    "scope": "app.edit.code.page",
    "text": "Core identity",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.ff958113cf77",
    "scope": "app.edit.code.page",
    "text": "Make/model/serial are the main identity. Add anything else only when it helps the profile.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.df417ce45d01",
    "scope": "app.edit.code.page",
    "text": "Make / brand",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.dbb3572478eb",
    "scope": "app.edit.code.page",
    "text": "Start typing a brand",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.5e2c614c23f0",
    "scope": "app.edit.code.page",
    "text": "Model",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.14b1b3c5b151",
    "scope": "app.edit.code.page",
    "text": "Serial Number",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.89f6832560de",
    "scope": "app.edit.code.page",
    "text": "Year",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.d974d8298159",
    "scope": "app.edit.code.page",
    "text": "Type / category",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.9228c34bf053",
    "scope": "app.edit.code.page",
    "text": "Condition / status",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.18fdd549b2ed",
    "scope": "app.edit.code.page",
    "text": "New",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.ae7d8dfac9ff",
    "scope": "app.edit.code.page",
    "text": "Used",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.12f67f8539c4",
    "scope": "app.edit.code.page",
    "text": "Availability",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.e063cbea64ad",
    "scope": "app.edit.code.page",
    "text": "Not for Sale",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.1a83dec1476e",
    "scope": "app.edit.code.page",
    "text": "For Sale",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.faafda16cc4c",
    "scope": "app.edit.code.page",
    "text": "Originality",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.2604d337dc13",
    "scope": "app.edit.code.page",
    "text": "Not Specified",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.8894d64075bf",
    "scope": "app.edit.code.page",
    "text": "All Original",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.e8ce5dcaf408",
    "scope": "app.edit.code.page",
    "text": "Modified",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.bc2663d3963d",
    "scope": "app.edit.code.page",
    "text": "This instrument does not use a Serial Number",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.6456778444bd",
    "scope": "app.edit.code.page",
    "text": "Show Serial Number on public Profile",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.a8782c988bf8",
    "scope": "app.edit.code.page",
    "text": "This hides only the Serial Number field. The permanent QR ID and URL may still include the serial. Choose a private Profile to restrict access. No-serial records require QRguitar approval before verification or authenticity confirmation.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.50cccc48b0dc",
    "scope": "app.edit.code.page",
    "text": "Originality is an owner-stated modification status for search and disclosure. It is not QRguitar authentication or verification.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.7c2e45c2972e",
    "scope": "app.edit.code.page",
    "text": "Add Profile Basics",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.e69702d5925c",
    "scope": "app.edit.code.page",
    "text": "Display title / nickname",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.cf846c3fbd33",
    "scope": "app.edit.code.page",
    "text": "Builder (optional)",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.a6c7a84baa67",
    "scope": "app.edit.code.page",
    "text": "Finish",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.81d27ef6d503",
    "scope": "app.edit.code.page",
    "text": "Weight",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.a896221d5946",
    "scope": "app.edit.code.page",
    "text": "Owner display",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.74d91b61ae60",
    "scope": "app.edit.code.page",
    "text": "Owner status",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.15b61974b270",
    "scope": "app.edit.code.page",
    "text": "Location",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.7b364544e11f",
    "scope": "app.edit.code.page",
    "text": "Public story",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.9dea0cff2a8f",
    "scope": "app.edit.code.page",
    "text": "Specs notes",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.3929e139c666",
    "scope": "app.edit.code.page",
    "text": "Service notes",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.814602d348e0",
    "scope": "app.edit.code.page",
    "text": "Add Any Details",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.8f5e3a6a7a8a",
    "scope": "app.edit.code.page",
    "text": "Field label",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.c401f87933bd",
    "scope": "app.edit.code.page",
    "text": "Field label, e.g. Builder",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.ca3653fa9b78",
    "scope": "app.edit.code.page",
    "text": "Field value",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.8e37953d23da",
    "scope": "app.edit.code.page",
    "text": "Value",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.c3812fc4acb8",
    "scope": "app.edit.code.page",
    "text": "Remove",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.d9e3cfc7246e",
    "scope": "app.edit.code.page",
    "text": "Add Detail",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.5482252391a3",
    "scope": "app.edit.code.page",
    "text": "Add Website or Social Links",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.acaa9ea6688f",
    "scope": "app.edit.code.page",
    "text": "Link label",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.02234b0f736c",
    "scope": "app.edit.code.page",
    "text": "Label, e.g. Instagram",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.9dfd0b9f8f42",
    "scope": "app.edit.code.page",
    "text": "Link URL",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.b8c42654c8ce",
    "scope": "app.edit.code.page",
    "text": "Add Link",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.215ed206acf2",
    "scope": "app.edit.code.page",
    "text": "Profile photos",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.d7aea5f0f7db",
    "scope": "app.edit.code.page",
    "text": "Upload up to 20 photos, 12MB each. Pick one as the main image for dashboard cards, catalog listings, and the public profile hero.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.aaa80d91c45c",
    "scope": "app.edit.code.page",
    "text": "Store receipts, invoices, build sheets, service slips, appraisal notes, and authenticity evidence with the QRguitar Profile. Up to 10 files, 12MB each.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.fe07a483e3c2",
    "scope": "app.edit.code.page",
    "text": "Proof Vault document manager",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.61008da8ad24",
    "scope": "app.edit.code.page",
    "text": "/10 files. Private documents can support QRguitar verification and authenticity review.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.9f6d7cb28b64",
    "scope": "app.edit.code.page",
    "text": "Untitled document",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.8b898ca34ce7",
    "scope": "app.edit.code.page",
    "text": "Uploading",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.6efc5d27f30b",
    "scope": "app.edit.code.page",
    "text": "Upload failed",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.7e8cd2056da7",
    "scope": "app.edit.code.page",
    "text": "Title",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.5b81f70d59bd",
    "scope": "app.edit.code.page",
    "text": "Document type",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.1d0e10a4efff",
    "scope": "app.edit.code.page",
    "text": "Issuer or source",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.de02d7e9d9ed",
    "scope": "app.edit.code.page",
    "text": "Dealer, shop, builder, or owner",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.331b273e05e4",
    "scope": "app.edit.code.page",
    "text": "Document date",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.526e0087cc3f",
    "scope": "app.edit.code.page",
    "text": "Description",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.fe239cf0a2cf",
    "scope": "app.edit.code.page",
    "text": "What this document establishes or contains.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.2a750061dd1a",
    "scope": "app.edit.code.page",
    "text": "Related Timeline entry",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.1e31d9596d67",
    "scope": "app.edit.code.page",
    "text": "Not linked",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.05a15f069975",
    "scope": "app.edit.code.page",
    "text": "Public description",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.75652484cfdf",
    "scope": "app.edit.code.page",
    "text": "Optional public context if this document is shared.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.72ff78fb2fd5",
    "scope": "app.edit.code.page",
    "text": "Private notes",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.7f4f8adde79a",
    "scope": "app.edit.code.page",
    "text": "Owner-only document notes. Never shown on the public Profile.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.ffab73178509",
    "scope": "app.edit.code.page",
    "text": "Make Private",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.24139936d627",
    "scope": "app.edit.code.page",
    "text": "Make Public",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.ed077f3d8125",
    "scope": "app.edit.code.page",
    "text": "Open",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.3e3ac8296196",
    "scope": "app.edit.code.page",
    "text": "External media",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.dc600f6490d8",
    "scope": "app.edit.code.page",
    "text": "Media links",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.55444bb1a4b8",
    "scope": "app.edit.code.page",
    "text": "Add Video or Audio",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.b2620027b28f",
    "scope": "app.edit.code.page",
    "text": "Add a YouTube, Vimeo, SoundCloud, Bandcamp, or other safe HTTPS media link. QRguitar never accepts custom embed code.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.a56a654b3cce",
    "scope": "app.edit.code.page",
    "text": "Media URL",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.b72cc3763093",
    "scope": "app.edit.code.page",
    "text": "Clean demo",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.87d296ec9489",
    "scope": "app.edit.code.page",
    "text": "Caption",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.1b163a070bcb",
    "scope": "app.edit.code.page",
    "text": "Show this media on the QRguitar Profile",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.dc85af8f2b1d",
    "scope": "app.edit.code.page",
    "text": "Saving...",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.a078fb55c65a",
    "scope": "app.edit.code.page",
    "text": "Add Media",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.50f38c2c40b0",
    "scope": "app.edit.code.page",
    "text": "Preview link",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.7bcb38b3067a",
    "scope": "app.edit.code.page",
    "text": "Show Publicly",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.740ebe32a73f",
    "scope": "app.edit.code.page",
    "text": "Move {{value1}} up",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.1359626e7b69",
    "scope": "app.edit.code.page",
    "text": "Move Up",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.a1ae739bcef6",
    "scope": "app.edit.code.page",
    "text": "Move {{value1}} down",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.b58330ac2505",
    "scope": "app.edit.code.page",
    "text": "Move Down",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.92777e2212a7",
    "scope": "app.edit.code.page",
    "text": "Timeline and service history",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.08e02c90e8fa",
    "scope": "app.edit.code.page",
    "text": "Instrument history",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.480686c56fb4",
    "scope": "app.edit.code.page",
    "text": "Timeline & Service History",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.bb53b6bbcc71",
    "scope": "app.edit.code.page",
    "text": "Add the history you know - purchases, ownership, service, modifications, restoration, and important milestones.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.1ac020fb3ee0",
    "scope": "app.edit.code.page",
    "text": "Date precision",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.0bbaffa5aa37",
    "scope": "app.edit.code.page",
    "text": "Exact day",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.6d6c35d44e7c",
    "scope": "app.edit.code.page",
    "text": "Month and year",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.676258d2226f",
    "scope": "app.edit.code.page",
    "text": "Year only",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.ad224bb89c8a",
    "scope": "app.edit.code.page",
    "text": "Unknown date",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.99c40ab40592",
    "scope": "app.edit.code.page",
    "text": "Date",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.292c06f0045a",
    "scope": "app.edit.code.page",
    "text": "Category",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.b7019e901e94",
    "scope": "app.edit.code.page",
    "text": "Setup, repair, inspection...",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.b77903e21e3a",
    "scope": "app.edit.code.page",
    "text": "Shop/tech/business name",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.3baa01e20a22",
    "scope": "app.edit.code.page",
    "text": "Who performed this work?",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.dc12bec5d71f",
    "scope": "app.edit.code.page",
    "text": "Not specified",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.118de3932441",
    "scope": "app.edit.code.page",
    "text": "Owner / self",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.1fbc3028ac4f",
    "scope": "app.edit.code.page",
    "text": "Shop or technician",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.6995609bcfca",
    "scope": "app.edit.code.page",
    "text": "Owner-entered history is labeled Owner-reported. Provider verification is controlled separately.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.1c784546c251",
    "scope": "app.edit.code.page",
    "text": "Work-order reference",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.023fdc1bf85e",
    "scope": "app.edit.code.page",
    "text": "Parts installed",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.4821049b4d8b",
    "scope": "app.edit.code.page",
    "text": "Setup measurements",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.0b8658a6a0c1",
    "scope": "app.edit.code.page",
    "text": "Show this service entry on the QRguitar Profile",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.c1fa1a200083",
    "scope": "app.edit.code.page",
    "text": "Update Timeline Entry",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.d9cf5b8885ab",
    "scope": "app.edit.code.page",
    "text": "Add Timeline Entry",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.fddcfdf8d5f4",
    "scope": "app.edit.code.page",
    "text": "Cancel Edit",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.e4c12bc75682",
    "scope": "app.edit.code.page",
    "text": "No timeline entries yet",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.e3fe0f1dad4c",
    "scope": "app.edit.code.page",
    "text": "Add known ownership, purchases, service, repairs, modifications, restoration, and milestones.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.5604505e7254",
    "scope": "app.edit.code.page",
    "text": "QR code customization",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.29ea42609e75",
    "scope": "app.edit.code.page",
    "text": "QR appearance",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.1863981d2631",
    "scope": "app.edit.code.page",
    "text": "Customize QR Appearance",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.6a3fe397be58",
    "scope": "app.edit.code.page",
    "text": "Customize the code customers download.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.639563ea399f",
    "scope": "app.edit.code.page",
    "text": "Keep strong contrast so the QR remains scannable on stickers, hang tags, plates, and certificates.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.7c1b8917efdc",
    "scope": "app.edit.code.page",
    "text": "QR color",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.ea2b8a878841",
    "scope": "app.edit.code.page",
    "text": "Background",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.0e66373f45dc",
    "scope": "app.edit.code.page",
    "text": "Label",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.7e744141b40e",
    "scope": "app.edit.code.page",
    "text": "Style",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.3e9c8175439b",
    "scope": "app.edit.code.page",
    "text": "Classic print",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.e6296a9d0a3b",
    "scope": "app.edit.code.page",
    "text": "Soft premium",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.affe6276c345",
    "scope": "app.edit.code.page",
    "text": "Include label on downloaded QR",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.3dc74ca2612b",
    "scope": "app.edit.code.page",
    "text": "Trust and verification",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.5f500bb66024",
    "scope": "app.edit.code.page",
    "text": "Trust & Verification",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.d8d9a98cd0e8",
    "scope": "app.edit.code.page",
    "text": "Verified by QRguitar",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.33c8e8de41c3",
    "scope": "app.edit.code.page",
    "text": "Unverified",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.df6ad347b1a1",
    "scope": "app.edit.code.page",
    "text": "This Profile is verified by QRguitar.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.d7b92d4468d9",
    "scope": "app.edit.code.page",
    "text": "After you add a Profile, QRguitar may verify its details at no charge when the information is sufficient. Verification does not confirm authenticity.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.ec2f3a7e401c",
    "scope": "app.edit.code.page",
    "text": "Authenticity confirmed by QRguitar from available evidence.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.9572b2a7a2c2",
    "scope": "app.edit.code.page",
    "text": "Authenticity confirmation is a separate paid review handled by QRguitar staff. A free Profile is not automatically authenticity confirmed.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.b58c42dbfcd4",
    "scope": "app.edit.code.page",
    "text": "Admin Trust Controls",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.fff509a567cd",
    "scope": "app.edit.code.page",
    "text": "Set binary trust badges and notes. These changes save through the main Save Changes button.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.d949c0cb61f0",
    "scope": "app.edit.code.page",
    "text": "Admin verification status",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.4f7838402f37",
    "scope": "app.edit.code.page",
    "text": "Verified",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.75e0ca128662",
    "scope": "app.edit.code.page",
    "text": "Admin authenticity status",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.a54f9b625886",
    "scope": "app.edit.code.page",
    "text": "Authenticity Unconfirmed",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.eb95c24a9590",
    "scope": "app.edit.code.page",
    "text": "Authenticity Confirmed",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.cfac951791e6",
    "scope": "app.edit.code.page",
    "text": "Approve verification/authenticity exception for a no-serial brand, retailer, or build",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.f4a130abf8de",
    "scope": "app.edit.code.page",
    "text": "Internal verification note",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.118e1524b882",
    "scope": "app.edit.code.page",
    "text": "Public verification note",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.010edcad212d",
    "scope": "app.edit.code.page",
    "text": "Internal authenticity note",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.42af0e4ee0c2",
    "scope": "app.edit.code.page",
    "text": "Public authenticity note",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.ebb5eff4953a",
    "scope": "app.edit.code.page",
    "text": "Show verification badge publicly",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.a678af9b1c0a",
    "scope": "app.edit.code.page",
    "text": "Show authenticity status publicly",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.51e39f20046d",
    "scope": "app.edit.code.page",
    "text": "Authenticity is confirmed, but the public badge is currently hidden. Turn this on and use Save Changes to publish it.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.852068b96459",
    "scope": "app.edit.code.page",
    "text": "Lost or stolen alert",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.d4607c4f0b10",
    "scope": "app.edit.code.page",
    "text": "Lost / Stolen Alert",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.cd3177a2e0e4",
    "scope": "app.edit.code.page",
    "text": "Mark a record lost or stolen so anyone who scans the QR can see the alert.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.2f5d50add626",
    "scope": "app.edit.code.page",
    "text": "Current status",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.3b1c46e7fb2b",
    "scope": "app.edit.code.page",
    "text": "No Alert",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.299f098db192",
    "scope": "app.edit.code.page",
    "text": "Reported Lost",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.44d0eeb2a64d",
    "scope": "app.edit.code.page",
    "text": "Reported Stolen",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.37ce0a91ee27",
    "scope": "app.edit.code.page",
    "text": "Recovered",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.2f02e4974dd6",
    "scope": "app.edit.code.page",
    "text": "No public safety alert",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.44c111b254e9",
    "scope": "app.edit.code.page",
    "text": "No public safety alert is shown while status is No Alert.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.804f3c9e9556",
    "scope": "app.edit.code.page",
    "text": "Public safety note",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.3b9415ed93f2",
    "scope": "app.edit.code.page",
    "text": "Reported Lost: This instrument has been marked lost by the current owner.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.893a5b5361ad",
    "scope": "app.edit.code.page",
    "text": "Reported Stolen: This instrument has been marked stolen by the current owner.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.e9aac867db4e",
    "scope": "app.edit.code.page",
    "text": "Recovered status note.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.5816362f2633",
    "scope": "app.edit.code.page",
    "text": "Private/internal note",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.86c6e0d74cc9",
    "scope": "app.edit.code.page",
    "text": "Saving changes...",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.caae18bd705d",
    "scope": "app.edit.code.page",
    "text": "Saving and opening...",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.4a87047e033b",
    "scope": "app.edit.code.page",
    "text": "Saving and returning...",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.3c53caf4d68d",
    "scope": "app.edit.code.page",
    "text": "Save and Return to Dashboard",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.97ba1d394fab",
    "scope": "app.edit.code.page",
    "text": "Back to Dashboard",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.3cbc146d86cb",
    "scope": "app.edit.code.page",
    "text": "Edit instrument",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.4e0d5600059d",
    "scope": "app.edit.code.page",
    "text": "Checking account...",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.3d8a710de98a",
    "scope": "app.edit.code.page",
    "text": "Owner access required.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.b2a4948798a5",
    "scope": "app.edit.code.page",
    "text": "Sign in to edit this Profile.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.4e2bce183e1c",
    "scope": "app.edit.code.page",
    "text": "Checking your Supabase session now.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.c2321cba55d7",
    "scope": "app.edit.code.page",
    "text": "Only the profile owner can edit this profile.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.4bfdf5db3c0d",
    "scope": "app.edit.code.page",
    "text": "Sign in with the account that owns this QRguitar Profile.",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.bfd402b2f6f3",
    "scope": "app.edit.code.page",
    "text": "Sign in",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.14a999b1f8b0",
    "scope": "app.edit.code.page",
    "text": "{{value1}} hex value",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.edit.code.page.e26788c57413",
    "scope": "app.edit.code.page",
    "text": "Select category",
    "page": "Edit Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/edit/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.5cf97593870f",
    "scope": "app.handout.code.page",
    "text": "This Profile could not be loaded. Please try again.",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.d8d9a98cd0e8",
    "scope": "app.handout.code.page",
    "text": "Verified by QRguitar",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.33c8e8de41c3",
    "scope": "app.handout.code.page",
    "text": "Unverified",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.eb95c24a9590",
    "scope": "app.handout.code.page",
    "text": "Authenticity Confirmed",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.a54f9b625886",
    "scope": "app.handout.code.page",
    "text": "Authenticity Unconfirmed",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.299f098db192",
    "scope": "app.handout.code.page",
    "text": "Reported Lost",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.44d0eeb2a64d",
    "scope": "app.handout.code.page",
    "text": "Reported Stolen",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.37ce0a91ee27",
    "scope": "app.handout.code.page",
    "text": "Recovered",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.edca82c0915c",
    "scope": "app.handout.code.page",
    "text": "@media print { @page { size: {{value1}}; margin: {{value2}}in; } }",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.67b696468610",
    "scope": "app.handout.code.page",
    "text": "Dashboard",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.3eed152bf351",
    "scope": "app.handout.code.page",
    "text": "QR and print",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.f9d77f6cb2f2",
    "scope": "app.handout.code.page",
    "text": "Open Profile",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.ab31856edf15",
    "scope": "app.handout.code.page",
    "text": "Opening print...",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.f14f3c9238ed",
    "scope": "app.handout.code.page",
    "text": "Close print options",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.45e209da028e",
    "scope": "app.handout.code.page",
    "text": "Print options",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.16ac699a5f21",
    "scope": "app.handout.code.page",
    "text": "Print Suite controls",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.2f343666aaa8",
    "scope": "app.handout.code.page",
    "text": "Format",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.2b60a18bae15",
    "scope": "app.handout.code.page",
    "text": "Print format",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.35045eff549e",
    "scope": "app.handout.code.page",
    "text": "Paper",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.e3d11242200f",
    "scope": "app.handout.code.page",
    "text": "Orientation",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.f71094c30160",
    "scope": "app.handout.code.page",
    "text": "Portrait",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.e658d3ae034a",
    "scope": "app.handout.code.page",
    "text": "Landscape",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.2b4946ae1386",
    "scope": "app.handout.code.page",
    "text": "Copy type",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.ef50a2af62ff",
    "scope": "app.handout.code.page",
    "text": "Public-safe copy",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.51a370754ef7",
    "scope": "app.handout.code.page",
    "text": "Includes only information allowed on the public Profile.",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.9732ac52e538",
    "scope": "app.handout.code.page",
    "text": "Owner copy",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.5c027d45a7ce",
    "scope": "app.handout.code.page",
    "text": "May include a hidden Serial Number. Do not share this copy if it contains private information.",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.cd06117a4a90",
    "scope": "app.handout.code.page",
    "text": "Service Entry",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.616f48c1db19",
    "scope": "app.handout.code.page",
    "text": "Fields",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.d707dc2f1936",
    "scope": "app.handout.code.page",
    "text": "Logo",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.bb1de9720797",
    "scope": "app.handout.code.page",
    "text": "Photograph",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.14b1b3c5b151",
    "scope": "app.handout.code.page",
    "text": "Serial Number",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.12f67f8539c4",
    "scope": "app.handout.code.page",
    "text": "Availability",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.a902dcce0886",
    "scope": "app.handout.code.page",
    "text": "Attribution",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.015b4e0a76e5",
    "scope": "app.handout.code.page",
    "text": "Specifications",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.a7a952cb15e6",
    "scope": "app.handout.code.page",
    "text": "Timeline summary",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.7cbea1608d56",
    "scope": "app.handout.code.page",
    "text": "Main photograph",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.db641bc07db6",
    "scope": "app.handout.code.page",
    "text": "Photograph {{value1}}",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.a27757d6372e",
    "scope": "app.handout.code.page",
    "text": "Photo framing",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.732c51dcff54",
    "scope": "app.handout.code.page",
    "text": "Show whole photo",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.33d0dc3a81a2",
    "scope": "app.handout.code.page",
    "text": "Fill photo area",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.b7a17f6da566",
    "scope": "app.handout.code.page",
    "text": "Full service details",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.eaea51b2ef4f",
    "scope": "app.handout.code.page",
    "text": "Title on this printout",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.e100b01df2b6",
    "scope": "app.handout.code.page",
    "text": "Note on this printout",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.2faf4e50e727",
    "scope": "app.handout.code.page",
    "text": "Care advice, collection details or a message for the recipient",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.a439fba430a3",
    "scope": "app.handout.code.page",
    "text": "QR",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.b36c5aceb02f",
    "scope": "app.handout.code.page",
    "text": "URL label",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.eaf0a0e32cc3",
    "scope": "app.handout.code.page",
    "text": "Scan instruction",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.11a6767d5674",
    "scope": "app.handout.code.page",
    "text": "Done",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.d0f8e8312681",
    "scope": "app.handout.code.page",
    "text": "Print preview stage",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.3fb0090fff7a",
    "scope": "app.handout.code.page",
    "text": " / 1 page",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.317ab210624d",
    "scope": "app.handout.code.page",
    "text": "Preview zoom",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.bc7b631a689b",
    "scope": "app.handout.code.page",
    "text": "Zoom out",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.3626161a4685",
    "scope": "app.handout.code.page",
    "text": "Fit page",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.aeffe78362f7",
    "scope": "app.handout.code.page",
    "text": "Preview scale",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.0e47f09a748f",
    "scope": "app.handout.code.page",
    "text": "Zoom in",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.9db2256ef43c",
    "scope": "app.handout.code.page",
    "text": "This Profile is private. The printed QR will not open for customers until you change its visibility.",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.35e225fbf65f",
    "scope": "app.handout.code.page",
    "text": "Owner copy: may contain information hidden from the public Profile.",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.d1e2cf07f226",
    "scope": "app.handout.code.page",
    "text": "Preparing Print Suite...",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.a8e29add002d",
    "scope": "app.handout.code.page",
    "text": "Print Suite unavailable.",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.2ce160648f07",
    "scope": "app.handout.code.page",
    "text": "Loading the selected Profile.",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.d8b8392e2c54",
    "scope": "app.handout.code.page",
    "text": "Try again",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.page.2b25a25a833f",
    "scope": "app.handout.code.page",
    "text": "Print unavailable. Return to QRguitar and resolve the print readiness message before printing.",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/page.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.94272b2b86d2",
    "scope": "app.handout.code.PrintDocument",
    "text": "QR code linking to {{value1}}",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.1081dbe09b14",
    "scope": "app.handout.code.PrintDocument",
    "text": "Permanent QRguitar Profile",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.bddbc8638f57",
    "scope": "app.handout.code.PrintDocument",
    "text": "View Profile details, photographs, specifications and history.",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.7232f916051f",
    "scope": "app.handout.code.PrintDocument",
    "text": "Permanent service history",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.0498504da58e",
    "scope": "app.handout.code.PrintDocument",
    "text": "Open the complete QRguitar Profile",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.1236999f1bfb",
    "scope": "app.handout.code.PrintDocument",
    "text": "Review photographs, specifications and approved service history.",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.ebda169628a4",
    "scope": "app.handout.code.PrintDocument",
    "text": "Printable {{value1}} for {{value2}}",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.8db3ef5c5d2f",
    "scope": "app.handout.code.PrintDocument",
    "text": "Scan Profile",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.1631e4a6b7d7",
    "scope": "app.handout.code.PrintDocument",
    "text": "Serial Number:",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.4538b821a0d6",
    "scope": "app.handout.code.PrintDocument",
    "text": "QRguitar Profile",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.1a719f6a72dd",
    "scope": "app.handout.code.PrintDocument",
    "text": "qrguitar.com",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.a734981c99b6",
    "scope": "app.handout.code.PrintDocument",
    "text": "Service history",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.ce86d91e272a",
    "scope": "app.handout.code.PrintDocument",
    "text": "Service Summary",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.3ec29e5e7860",
    "scope": "app.handout.code.PrintDocument",
    "text": "Registered Profile",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.d696a35bdd18",
    "scope": "app.handout.code.PrintDocument",
    "text": "Profile",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.9b7e3e571ecb",
    "scope": "app.handout.code.PrintDocument",
    "text": "Profile identity",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.a6c8f92c19f4",
    "scope": "app.handout.code.PrintDocument",
    "text": "QRguitar ID",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.14b1b3c5b151",
    "scope": "app.handout.code.PrintDocument",
    "text": "Serial Number",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.73949bb1bdba",
    "scope": "app.handout.code.PrintDocument",
    "text": "Profile details",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.b70ec7c6b4ce",
    "scope": "app.handout.code.PrintDocument",
    "text": "Profile specifications",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.015b4e0a76e5",
    "scope": "app.handout.code.PrintDocument",
    "text": "Specifications",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.a303b38a9485",
    "scope": "app.handout.code.PrintDocument",
    "text": "Work performed",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.f29bf8bd83f2",
    "scope": "app.handout.code.PrintDocument",
    "text": "Recorded service event.",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.3929e139c666",
    "scope": "app.handout.code.PrintDocument",
    "text": "Service notes",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.19a60e95bdbe",
    "scope": "app.handout.code.PrintDocument",
    "text": "Technician / shop notes",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.6a0e15d298c4",
    "scope": "app.handout.code.PrintDocument",
    "text": "Record provenance",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.aba8db7131dc",
    "scope": "app.handout.code.PrintDocument",
    "text": "Recent history",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.abd1353daca2",
    "scope": "app.handout.code.PrintDocument",
    "text": "Private evidence and internal notes are not included.",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.handout.code.PrintDocument.6af5e1108227",
    "scope": "app.handout.code.PrintDocument",
    "text": "Keep this sheet with the gear.",
    "page": "Print Workspace",
    "area": "Product",
    "section": "Page text",
    "source": "app/handout/[code]/PrintDocument.tsx"
  },
  {
    "key": "ui.app.how.it.works.HowItWorksClient.8088497eb587",
    "scope": "app.how.it.works.HowItWorksClient",
    "text": "Create a Profile",
    "page": "How It Works",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/how-it-works/HowItWorksClient.tsx"
  },
  {
    "key": "ui.app.how.it.works.HowItWorksClient.004ca2d8b070",
    "scope": "app.how.it.works.HowItWorksClient",
    "text": "Explore the Catalog",
    "page": "How It Works",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/how-it-works/HowItWorksClient.tsx"
  },
  {
    "key": "ui.app.how.it.works.HowItWorksClient.6a4cc4c27d2f",
    "scope": "app.how.it.works.HowItWorksClient",
    "text": "HOW IT WORKS",
    "page": "How It Works",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/how-it-works/HowItWorksClient.tsx"
  },
  {
    "key": "ui.app.how.it.works.HowItWorksClient.9238fe0c58c9",
    "scope": "app.how.it.works.HowItWorksClient",
    "text": "A real QRguitar Profile",
    "page": "How It Works",
    "area": "Marketing",
    "section": "Accessibility",
    "source": "app/how-it-works/HowItWorksClient.tsx"
  },
  {
    "key": "ui.app.how.it.works.HowItWorksClient.b11d90f41a06",
    "scope": "app.how.it.works.HowItWorksClient",
    "text": "PROFILE CONTENT",
    "page": "How It Works",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/how-it-works/HowItWorksClient.tsx"
  },
  {
    "key": "ui.app.how.it.works.HowItWorksClient.eb8d26a4476d",
    "scope": "app.how.it.works.HowItWorksClient",
    "text": "IDENTITY & PRIVACY",
    "page": "How It Works",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/how-it-works/HowItWorksClient.tsx"
  },
  {
    "key": "ui.app.how.it.works.HowItWorksClient.ab496be499d5",
    "scope": "app.how.it.works.HowItWorksClient",
    "text": "The QRguitar ID and URL may still include this number even when the field is hidden.",
    "page": "How It Works",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/how-it-works/HowItWorksClient.tsx"
  },
  {
    "key": "ui.app.how.it.works.HowItWorksClient.378ea29c1ca1",
    "scope": "app.how.it.works.HowItWorksClient",
    "text": "Choose a Private Profile when access must be restricted.",
    "page": "How It Works",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/how-it-works/HowItWorksClient.tsx"
  },
  {
    "key": "ui.app.how.it.works.HowItWorksClient.d843ddab8d76",
    "scope": "app.how.it.works.HowItWorksClient",
    "text": "Profile visibility options",
    "page": "How It Works",
    "area": "Marketing",
    "section": "Accessibility",
    "source": "app/how-it-works/HowItWorksClient.tsx"
  },
  {
    "key": "ui.app.how.it.works.HowItWorksClient.4acc8a696c56",
    "scope": "app.how.it.works.HowItWorksClient",
    "text": "OWNERSHIP",
    "page": "How It Works",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/how-it-works/HowItWorksClient.tsx"
  },
  {
    "key": "ui.app.how.it.works.HowItWorksClient.c682490365e0",
    "scope": "app.how.it.works.HowItWorksClient",
    "text": "Open Claim Center",
    "page": "How It Works",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/how-it-works/HowItWorksClient.tsx"
  },
  {
    "key": "ui.app.how.it.works.HowItWorksClient.10f89fbc4f6e",
    "scope": "app.how.it.works.HowItWorksClient",
    "text": "FOR THE INSTRUMENT COMMUNITY",
    "page": "How It Works",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/how-it-works/HowItWorksClient.tsx"
  },
  {
    "key": "ui.app.how.it.works.HowItWorksClient.6cda88bdf5a8",
    "scope": "app.how.it.works.HowItWorksClient",
    "text": "Choose your role",
    "page": "How It Works",
    "area": "Marketing",
    "section": "Accessibility",
    "source": "app/how-it-works/HowItWorksClient.tsx"
  },
  {
    "key": "ui.app.how.it.works.HowItWorksClient.0e7f56b89a7f",
    "scope": "app.how.it.works.HowItWorksClient",
    "text": "BEFORE YOU START",
    "page": "How It Works",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/how-it-works/HowItWorksClient.tsx"
  },
  {
    "key": "ui.app.how.it.works.HowItWorksClient.2d735641fa51",
    "scope": "app.how.it.works.HowItWorksClient",
    "text": "START WITH ONE INSTRUMENT",
    "page": "How It Works",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/how-it-works/HowItWorksClient.tsx"
  },
  {
    "key": "ui.app.i.code.error.38d1e200dd2a",
    "scope": "app.i.code.error",
    "text": "This Profile is temporarily unavailable.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/error.tsx"
  },
  {
    "key": "ui.app.i.code.error.42fcc94b6c14",
    "scope": "app.i.code.error",
    "text": "We couldn’t load this Profile. Please try again in a moment.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/error.tsx"
  },
  {
    "key": "ui.app.i.code.error.d8b8392e2c54",
    "scope": "app.i.code.error",
    "text": "Try again",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/error.tsx"
  },
  {
    "key": "ui.app.i.code.error.723e1c99cb42",
    "scope": "app.i.code.error",
    "text": "Back to QRguitar",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/error.tsx"
  },
  {
    "key": "ui.app.i.code.not.found.67617b20be43",
    "scope": "app.i.code.not.found",
    "text": "This Profile isn’t available.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/not-found.tsx"
  },
  {
    "key": "ui.app.i.code.not.found.10fc05c346e8",
    "scope": "app.i.code.not.found",
    "text": "Check the link, or explore other instrument Profiles in the Catalog.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/not-found.tsx"
  },
  {
    "key": "ui.app.i.code.not.found.004ca2d8b070",
    "scope": "app.i.code.not.found",
    "text": "Explore the Catalog",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/not-found.tsx"
  },
  {
    "key": "ui.app.i.code.not.found.76c5505ff2e2",
    "scope": "app.i.code.not.found",
    "text": "Back to home",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/not-found.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileBreadcrumbs.2bd873d6c734",
    "scope": "app.i.code.ProfileBreadcrumbs",
    "text": "Breadcrumb",
    "page": "Public Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/i/[code]/ProfileBreadcrumbs.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileBreadcrumbs.3a78695388b3",
    "scope": "app.i.code.ProfileBreadcrumbs",
    "text": "Home",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileBreadcrumbs.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileBreadcrumbs.3877d14889a9",
    "scope": "app.i.code.ProfileBreadcrumbs",
    "text": "Catalog",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileBreadcrumbs.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.3535ababfaeb",
    "scope": "app.i.code.ProfileClient",
    "text": "Loading profile",
    "page": "Public Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.d7e30b9a3297",
    "scope": "app.i.code.ProfileClient",
    "text": "Loading instrument profile",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.dca536847bc1",
    "scope": "app.i.code.ProfileClient",
    "text": "Checking the Profile now.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.158e5a22a48c",
    "scope": "app.i.code.ProfileClient",
    "text": "Profile unavailable",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.999930725d06",
    "scope": "app.i.code.ProfileClient",
    "text": "Profile not found",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.6dc65e966b93",
    "scope": "app.i.code.ProfileClient",
    "text": "Profile temporarily unavailable",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.6cbb97fa27b9",
    "scope": "app.i.code.ProfileClient",
    "text": "Instrument profile not found",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.7014d09f16ad",
    "scope": "app.i.code.ProfileClient",
    "text": "We could not load this Profile. Please try again.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.752375372cfd",
    "scope": "app.i.code.ProfileClient",
    "text": "This QRguitar Profile has not been published.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.d8b8392e2c54",
    "scope": "app.i.code.ProfileClient",
    "text": "Try again",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.c022da0f1a15",
    "scope": "app.i.code.ProfileClient",
    "text": "Go to homepage",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.4d05dc6da837",
    "scope": "app.i.code.ProfileClient",
    "text": "Browse catalog",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.cca6a9866dcc",
    "scope": "app.i.code.ProfileClient",
    "text": "Owner preview.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.b1eaa5bd6fae",
    "scope": "app.i.code.ProfileClient",
    "text": "This Profile is private. Visitors cannot open its QR link.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.43c30bfc7680",
    "scope": "app.i.code.ProfileClient",
    "text": "You are viewing this Profile from your account.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.fec2ac0f4cf1",
    "scope": "app.i.code.ProfileClient",
    "text": "Edit Profile",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.4466f3a00b0b",
    "scope": "app.i.code.ProfileClient",
    "text": "Back to collection",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.6e8c3c83d96f",
    "scope": "app.i.code.ProfileClient",
    "text": "This is the last loaded Profile. We could not check for updates.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.cb35f7332137",
    "scope": "app.i.code.ProfileClient",
    "text": "Back to homepage",
    "page": "Public Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.577c10d6f210",
    "scope": "app.i.code.ProfileClient",
    "text": "Message {{value1}}",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.88e9f0875799",
    "scope": "app.i.code.ProfileClient",
    "text": "Reported {{value1}}",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.299f098db192",
    "scope": "app.i.code.ProfileClient",
    "text": "Reported Lost",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.44d0eeb2a64d",
    "scope": "app.i.code.ProfileClient",
    "text": "Reported Stolen",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.911804584a25",
    "scope": "app.i.code.ProfileClient",
    "text": "This instrument has been marked lost by the current owner.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.f724a4ca52d7",
    "scope": "app.i.code.ProfileClient",
    "text": "This instrument has been marked stolen by the current owner.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.816663403268",
    "scope": "app.i.code.ProfileClient",
    "text": "Open {{value1}} photo {{value2}} in fullscreen",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.c6bd3192c759",
    "scope": "app.i.code.ProfileClient",
    "text": "{{value1}} photo {{value2}} of {{value3}}",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.44cebddc8ad6",
    "scope": "app.i.code.ProfileClient",
    "text": "Photos are currently unavailable",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.c58a02ccbadd",
    "scope": "app.i.code.ProfileClient",
    "text": "No main photo yet",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.29afaa1f472b",
    "scope": "app.i.code.ProfileClient",
    "text": "Choose a photograph",
    "page": "Public Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.06b590801f02",
    "scope": "app.i.code.ProfileClient",
    "text": "Show photo {{value1}} of {{value2}}",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.66e1c9549fde",
    "scope": "app.i.code.ProfileClient",
    "text": "Trust review",
    "page": "Public Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.5139e0f92e71",
    "scope": "app.i.code.ProfileClient",
    "text": "Scan to view",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.58a595439cb9",
    "scope": "app.i.code.ProfileClient",
    "text": "qrguitar.com/i/{{value1}}",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.8d525e5f158b",
    "scope": "app.i.code.ProfileClient",
    "text": "Copied",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.b26d1037f1c2",
    "scope": "app.i.code.ProfileClient",
    "text": "Copy URL",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.0854b0c9c202",
    "scope": "app.i.code.ProfileClient",
    "text": "Copy failed. You can copy the URL from your browser bar.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.bfeb7617d7e2",
    "scope": "app.i.code.ProfileClient",
    "text": "Owner profile actions",
    "page": "Public Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.7812959f873a",
    "scope": "app.i.code.ProfileClient",
    "text": "Ownership Tools",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.302d0d418ff4",
    "scope": "app.i.code.ProfileClient",
    "text": "Service provider actions",
    "page": "Public Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.5686ec9fdd1b",
    "scope": "app.i.code.ProfileClient",
    "text": "Submit service record",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.2fb69e84e91b",
    "scope": "app.i.code.ProfileClient",
    "text": "Ownership tools",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.498bfd464638",
    "scope": "app.i.code.ProfileClient",
    "text": "Contact support@qrguitar.com if you need help with an ownership change.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.b4e929d8bcfe",
    "scope": "app.i.code.ProfileClient",
    "text": "Documents",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.4e3f0c54b7af",
    "scope": "app.i.code.ProfileClient",
    "text": "Public files appear here for buyers and shops. The owner controls which files stay private and which are public.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.dff577c32828",
    "scope": "app.i.code.ProfileClient",
    "text": "Owner/admin access required",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.953a22d40e63",
    "scope": "app.i.code.ProfileClient",
    "text": "Only the owner or admin can edit this profile. Sign in as the profile owner to make changes.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.7d9eb7acb13e",
    "scope": "app.i.code.ProfileClient",
    "text": "Close",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.4d2046641397",
    "scope": "app.i.code.ProfileClient",
    "text": "Instrument profile sections",
    "page": "Public Profile",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.b5c3490dde3a",
    "scope": "app.i.code.ProfileClient",
    "text": "Scanning this QR code opens the Profile. It never changes ownership. Ask the current owner for a transfer, or start a private request if they cannot send one.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.21f95b4c7342",
    "scope": "app.i.code.ProfileClient",
    "text": "Start ownership request",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.73949bb1bdba",
    "scope": "app.i.code.ProfileClient",
    "text": "Profile details",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.9dcff98e275f",
    "scope": "app.i.code.ProfileClient",
    "text": "Timeline",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.1d88855f0d95",
    "scope": "app.i.code.ProfileClient",
    "text": "Events recorded for this instrument.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.15f1e13d5beb",
    "scope": "app.i.code.ProfileClient",
    "text": "Ownership transfer started",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.4f060ab480e4",
    "scope": "app.i.code.ProfileClient",
    "text": "Ownership was accepted by {{value1}}.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.047c40a15875",
    "scope": "app.i.code.ProfileClient",
    "text": "An ownership-change claim was started for {{value1}}.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.e4db7ca95800",
    "scope": "app.i.code.ProfileClient",
    "text": "{{value1}} ownership transfer{{value2}} recorded",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.514cf9382473",
    "scope": "app.i.code.ProfileClient",
    "text": "QRguitar keeps the permanent profile with the instrument while prior-owner details stay private.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.9bb4a8d57a82",
    "scope": "app.i.code.ProfileClient",
    "text": "Profile created",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.d677190e0a99",
    "scope": "app.i.code.ProfileClient",
    "text": "Service",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.0da8a8f6f90b",
    "scope": "app.i.code.ProfileClient",
    "text": "Owner-approved work connected to this instrument.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.c7d3acc826a8",
    "scope": "app.i.code.ProfileClient",
    "text": "Ownership",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.db60bbe2c7c2",
    "scope": "app.i.code.ProfileClient",
    "text": "Brand, retailer, owner, and future buyer stay connected around the same instrument.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.0abf1fda3294",
    "scope": "app.i.code.ProfileClient",
    "text": "Current owner",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.f59c5e15fc31",
    "scope": "app.i.code.ProfileClient",
    "text": "Unclaimed",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.090940e73258",
    "scope": "app.i.code.ProfileClient",
    "text": "Builder",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.8dc96386f9b0",
    "scope": "app.i.code.ProfileClient",
    "text": "Recorded transfers",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.adb85cf22bfc",
    "scope": "app.i.code.ProfileClient",
    "text": "None yet",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.7448611d5f93",
    "scope": "app.i.code.ProfileClient",
    "text": "Visibility",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.5a024309a381",
    "scope": "app.i.code.ProfileClient",
    "text": "Private profile",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.81c09a46b1f6",
    "scope": "app.i.code.ProfileClient",
    "text": "Unlisted profile",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.eaad68e1f8c0",
    "scope": "app.i.code.ProfileClient",
    "text": "Public profile",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.cbfa6a5b513b",
    "scope": "app.i.code.ProfileClient",
    "text": "Ownership transfer",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.d357175cfe89",
    "scope": "app.i.code.ProfileClient",
    "text": "Media",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.4a0da7d0535d",
    "scope": "app.i.code.ProfileClient",
    "text": "Public video, audio, and external media connected to this instrument.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.de81e912dbeb",
    "scope": "app.i.code.ProfileClient",
    "text": "Open media",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.1c007c29d3af",
    "scope": "app.i.code.ProfileClient",
    "text": "Repairs",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.001451c63c8c",
    "scope": "app.i.code.ProfileClient",
    "text": "A repair bench can see what happened before and add what happened today.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.566ade929299",
    "scope": "app.i.code.ProfileClient",
    "text": "No repair history posted yet.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.5c36266ae13b",
    "scope": "app.i.code.ProfileClient",
    "text": "Setup work, repairs, fretwork, electronics changes, and inspection notes can be added here as the instrument is serviced.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Feedback",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.38e61654fdf9",
    "scope": "app.i.code.ProfileClient",
    "text": "The important paperwork follows the instrument.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.01b015444dd4",
    "scope": "app.i.code.ProfileClient",
    "text": "No documents uploaded yet.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.9fd08e514569",
    "scope": "app.i.code.ProfileClient",
    "text": "Private listings keep paperwork with the owner until it is shared.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.8b6dfe7e7f62",
    "scope": "app.i.code.ProfileClient",
    "text": "No public documents yet.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.8f8758e7e505",
    "scope": "app.i.code.ProfileClient",
    "text": "Owners can mark certificates, receipts, or spec sheets as public later.",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.191c6a87f0f4",
    "scope": "app.i.code.ProfileClient",
    "text": "About this",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.5e3a5d0c73e9",
    "scope": "app.i.code.ProfileClient",
    "text": "{{value1}} official logo",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.090ed4316f1d",
    "scope": "app.i.code.ProfileClient",
    "text": "Brand",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.c5a2adb04f18",
    "scope": "app.i.code.ProfileClient",
    "text": "Profile note",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.817fa9875e3c",
    "scope": "app.i.code.ProfileClient",
    "text": "QR code for {{value1}}",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.20f8b80ba07c",
    "scope": "app.i.code.ProfileClient",
    "text": "{{value1}} is owner/admin only",
    "page": "Public Profile",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.dcc839a4015c",
    "scope": "app.i.code.ProfileClient",
    "text": "View",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.i.code.ProfileClient.ca1844969742",
    "scope": "app.i.code.ProfileClient",
    "text": "Unavailable",
    "page": "Public Profile",
    "area": "Product",
    "section": "Page text",
    "source": "app/i/[code]/ProfileClient.tsx"
  },
  {
    "key": "ui.app.installers.page.f6d3c70532d2",
    "scope": "app.installers.page",
    "text": "Applications are reviewed manually. QRguitar connects approved shops and owners manually, and applying never publishes your business automatically.",
    "page": "Installers",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/installers/page.tsx"
  },
  {
    "key": "ui.app.installers.page.213ee4bccc52",
    "scope": "app.installers.page",
    "text": "For working professionals",
    "page": "Installers",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/installers/page.tsx"
  },
  {
    "key": "ui.app.installers.page.5ac60128dbd5",
    "scope": "app.installers.page",
    "text": "Document work without taking ownership.",
    "page": "Installers",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/installers/page.tsx"
  },
  {
    "key": "ui.app.installers.page.64327c61d93a",
    "scope": "app.installers.page",
    "text": "Approved providers can submit service dates, notes, photos, and evidence to an existing QRguitar Profile. The owner reviews the submission before it becomes part of the instrument history.",
    "page": "Installers",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/installers/page.tsx"
  },
  {
    "key": "ui.app.installers.page.b6967ae53bf4",
    "scope": "app.installers.page",
    "text": "Provider application",
    "page": "Installers",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/installers/page.tsx"
  },
  {
    "key": "ui.app.installers.page.fb719a28dd43",
    "scope": "app.installers.page",
    "text": "Show us your business and the work you do.",
    "page": "Installers",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/installers/page.tsx"
  },
  {
    "key": "ui.app.installers.page.a8de0366bbf0",
    "scope": "app.installers.page",
    "text": "Repair shops, luthiers, builders, retailers, and technicians can apply to add owner-approved service records and prepare customer-ready QR handouts.",
    "page": "Installers",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/installers/page.tsx"
  },
  {
    "key": "ui.app.installers.page.d9094d538a44",
    "scope": "app.installers.page",
    "text": "Application details",
    "page": "Installers",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/installers/page.tsx"
  },
  {
    "key": "ui.app.installers.page.0b2520fca0ea",
    "scope": "app.installers.page",
    "text": "Provider review",
    "page": "Installers",
    "area": "Marketing",
    "section": "Page text",
    "source": "app/installers/page.tsx"
  },
  {
    "key": "ui.app.login.page.ff66ee6c3c61",
    "scope": "app.login.page",
    "text": "Account ready",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.dfdbca16342f",
    "scope": "app.login.page",
    "text": "Welcome back.",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.9e373b49e769",
    "scope": "app.login.page",
    "text": "Create your QRguitar account.",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.132b49a565d6",
    "scope": "app.login.page",
    "text": "Reset your QRguitar password.",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.a97312811b00",
    "scope": "app.login.page",
    "text": "Your Profiles and owner tools are ready in the dashboard.",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.67f8e71ebeaa",
    "scope": "app.login.page",
    "text": "Create an account so your Profiles, QR links, photos, documents, and ownership tools stay tied to you.",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.2fc495cd0ae7",
    "scope": "app.login.page",
    "text": "Enter your account email and QRguitar will send a secure password reset link.",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.803f2313cdf4",
    "scope": "app.login.page",
    "text": "Open dashboard",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.a587aa1f4ffc",
    "scope": "app.login.page",
    "text": "Account settings",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.48f0d3d397d4",
    "scope": "app.login.page",
    "text": "Sign out",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.3386f588f0c2",
    "scope": "app.login.page",
    "text": "Account access",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Accessibility",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.bfd402b2f6f3",
    "scope": "app.login.page",
    "text": "Sign in",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.798ca2ce18bf",
    "scope": "app.login.page",
    "text": "Create account",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.2b7f6a84de91",
    "scope": "app.login.page",
    "text": "Display name",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.d4b8227dbd30",
    "scope": "app.login.page",
    "text": "Owner, builder, or shop name",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Labels and help",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.969ccbd3cf63",
    "scope": "app.login.page",
    "text": "Email",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.53e6cdc30765",
    "scope": "app.login.page",
    "text": "you@example.com",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Labels and help",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.e7cf3ef4f17c",
    "scope": "app.login.page",
    "text": "Password",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.4defceba0862",
    "scope": "app.login.page",
    "text": "Create a password",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Labels and help",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.c06bf9670174",
    "scope": "app.login.page",
    "text": "Enter your password",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Labels and help",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.9b15ce9e25e9",
    "scope": "app.login.page",
    "text": "Use at least 8 characters.",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.1f96f5d016bd",
    "scope": "app.login.page",
    "text": "Signing in...",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.7dd3701aa3f1",
    "scope": "app.login.page",
    "text": "Creating account...",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.286a3af7348e",
    "scope": "app.login.page",
    "text": "Sending...",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.708c5d67ba8e",
    "scope": "app.login.page",
    "text": "Send reset link",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.71fe31ccd37c",
    "scope": "app.login.page",
    "text": "Back to sign in",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.login.page.cb35f7332137",
    "scope": "app.login.page",
    "text": "Back to homepage",
    "page": "Login",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/login/page.tsx"
  },
  {
    "key": "ui.app.messages.new.page.258150cb3ee4",
    "scope": "app.messages.new.page",
    "text": "Start a conversation",
    "page": "Messages",
    "area": "Product",
    "section": "Page text",
    "source": "app/messages/new/page.tsx"
  },
  {
    "key": "ui.app.messages.new.page.67127f31e1ba",
    "scope": "app.messages.new.page",
    "text": "Choose a member to start a private conversation.",
    "page": "Messages",
    "area": "Product",
    "section": "Page text",
    "source": "app/messages/new/page.tsx"
  },
  {
    "key": "ui.app.messages.new.page.1fbba5113528",
    "scope": "app.messages.new.page",
    "text": "Browse member collections",
    "page": "Messages",
    "area": "Product",
    "section": "Page text",
    "source": "app/messages/new/page.tsx"
  },
  {
    "key": "ui.app.not.found.baf03b1c0830",
    "scope": "app.not.found",
    "text": "This page isn’t available.",
    "page": "Shared CTAs and states",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/not-found.tsx"
  },
  {
    "key": "ui.app.not.found.82d8e08c8d46",
    "scope": "app.not.found",
    "text": "Check the address, or explore the instruments and collections on QRguitar.",
    "page": "Shared CTAs and states",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/not-found.tsx"
  },
  {
    "key": "ui.app.not.found.004ca2d8b070",
    "scope": "app.not.found",
    "text": "Explore the Catalog",
    "page": "Shared CTAs and states",
    "area": "Product",
    "section": "Page text",
    "source": "app/not-found.tsx"
  },
  {
    "key": "ui.app.not.found.76c5505ff2e2",
    "scope": "app.not.found",
    "text": "Back to home",
    "page": "Shared CTAs and states",
    "area": "Product",
    "section": "Page text",
    "source": "app/not-found.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.40c5fdba5671",
    "scope": "app.ownership.claim.page",
    "text": "Choose no more than three evidence files in total.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Feedback",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.b389685c17bd",
    "scope": "app.ownership.claim.page",
    "text": "The current secure upload supports up to 3 MB of evidence combined. Choose smaller files and try again.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Feedback",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.c0650627f361",
    "scope": "app.ownership.claim.page",
    "text": "Could not read the evidence.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Feedback",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.85595a4753c6",
    "scope": "app.ownership.claim.page",
    "text": "Ownership accepted.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Feedback",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.65f71b1451b4",
    "scope": "app.ownership.claim.page",
    "text": "Evidence submitted.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Feedback",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.7562713c29a5",
    "scope": "app.ownership.claim.page",
    "text": "Ownership request submitted.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Feedback",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.7eef482a4cd9",
    "scope": "app.ownership.claim.page",
    "text": "{{value1}} The last request may already be saved. Check your request status or collection before retrying.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Feedback",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.2a833d45816f",
    "scope": "app.ownership.claim.page",
    "text": "Could not complete the request.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Feedback",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.3915d9578717",
    "scope": "app.ownership.claim.page",
    "text": "Ownership Claim Center",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.15a28c155c61",
    "scope": "app.ownership.claim.page",
    "text": "Evidence stays private",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.2d6b2b891a03",
    "scope": "app.ownership.claim.page",
    "text": "Only the current owner and authorized QRguitar reviewers can access submitted files.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.b97f2f9cee97",
    "scope": "app.ownership.claim.page",
    "text": "Checking your sign-in session...",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.b72989690e0a",
    "scope": "app.ownership.claim.page",
    "text": "Retry sign-in check",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.73c27c81d398",
    "scope": "app.ownership.claim.page",
    "text": "Sign in to continue.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.26845d88e5fb",
    "scope": "app.ownership.claim.page",
    "text": "Your account keeps the request, evidence, and decision attached to the correct person.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.bfd402b2f6f3",
    "scope": "app.ownership.claim.page",
    "text": "Sign in",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.ae324303eaa6",
    "scope": "app.ownership.claim.page",
    "text": "Loading your ownership requests...",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.6bc7c88e3f4e",
    "scope": "app.ownership.claim.page",
    "text": "Refresh request status",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.4c17f2a2ba0a",
    "scope": "app.ownership.claim.page",
    "text": "Ownership situations",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.b25283ffda7c",
    "scope": "app.ownership.claim.page",
    "text": "Change situation",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.dade74c3fc37",
    "scope": "app.ownership.claim.page",
    "text": "Selected path",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.ec53472eb9b9",
    "scope": "app.ownership.claim.page",
    "text": "The safest path is a seller transfer.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.b63a29a66da9",
    "scope": "app.ownership.claim.page",
    "text": "The current owner opens the Profile in their Dashboard, chooses",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.f49cda3a003c",
    "scope": "app.ownership.claim.page",
    "text": "Transfer Ownership",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.f9590f451be6",
    "scope": "app.ownership.claim.page",
    "text": ", and sends a recipient-bound invitation to your account email. The permanent QRguitar ID and history stay unchanged.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.fead057ffd73",
    "scope": "app.ownership.claim.page",
    "text": "The public QR code never contains a transfer token and cannot transfer ownership.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.ec2d3e1e3a9e",
    "scope": "app.ownership.claim.page",
    "text": "Seller cannot transfer it",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.2508ed4a8444",
    "scope": "app.ownership.claim.page",
    "text": "Request received.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.16ec0c9189e8",
    "scope": "app.ownership.claim.page",
    "text": "Return to Dashboard",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.7bce049647c6",
    "scope": "app.ownership.claim.page",
    "text": "Private buyer handoff",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.26fa15b6bbdb",
    "scope": "app.ownership.claim.page",
    "text": "Have a code from the shop or builder?",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.ec01e30de3c4",
    "scope": "app.ownership.claim.page",
    "text": "Sign in with the assigned buyer email if one was specified, then enter the one-time code supplied at checkout or pickup.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.ece21dc27db5",
    "scope": "app.ownership.claim.page",
    "text": "Private buyer handoff code",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.12cafdd53605",
    "scope": "app.ownership.claim.page",
    "text": "XXXX-XXXX-XXXX",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.a53acddde434",
    "scope": "app.ownership.claim.page",
    "text": "Order reference supplied by the seller",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.eb7a7dd8a26a",
    "scope": "app.ownership.claim.page",
    "text": "Order/reference if supplied",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.2e5f79bb94a8",
    "scope": "app.ownership.claim.page",
    "text": "Checking...",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.13e3dc2abccf",
    "scope": "app.ownership.claim.page",
    "text": "Accept handoff",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.e58632ca07e5",
    "scope": "app.ownership.claim.page",
    "text": "A code expires, can be revoked, works once, and never appears in the public QR code or Profile.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.d8c8569cfb01",
    "scope": "app.ownership.claim.page",
    "text": "QRguitar ID or exact Serial Number",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.963c85e412dd",
    "scope": "app.ownership.claim.page",
    "text": "QRG-... or manufacturer serial",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.48809e2e7600",
    "scope": "app.ownership.claim.page",
    "text": "This identifies a Profile only. It does not prove or transfer ownership.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.d4b4b295ee14",
    "scope": "app.ownership.claim.page",
    "text": "Private possession challenge",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.5e5f3a9509ad",
    "scope": "app.ownership.claim.page",
    "text": "Write this code on paper and include it in the first current photo of the instrument. Do not edit it into an old image.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.c36a3c33bac5",
    "scope": "app.ownership.claim.page",
    "text": "How and when did you acquire it?",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.66029f39ee81",
    "scope": "app.ownership.claim.page",
    "text": "Approximate date, seller/shop, order reference, and circumstances.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.9cf11b231a0a",
    "scope": "app.ownership.claim.page",
    "text": "Ownership declaration",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.edbab83e946f",
    "scope": "app.ownership.claim.page",
    "text": "Confirm that you possess the instrument and that your information is truthful.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.cabb6cb580cc",
    "scope": "app.ownership.claim.page",
    "text": "Private evidence (1-3 files)",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.88342316aa22",
    "scope": "app.ownership.claim.page",
    "text": "First: current challenge photo. Then add a Serial Number photo, receipt, bill of sale, marketplace record, or estate/gift document. Up to three files, 3 MB combined.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.29cc371cad01",
    "scope": "app.ownership.claim.page",
    "text": "Add a receipt, invoice, identifying photo, or other purchase evidence. Up to three files, 3 MB combined.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.c3812fc4acb8",
    "scope": "app.ownership.claim.page",
    "text": "Remove",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.09e3fad17544",
    "scope": "app.ownership.claim.page",
    "text": "Submitting securely...",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.40447e4493fb",
    "scope": "app.ownership.claim.page",
    "text": "Submit for review",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.8f9b77e6e0b4",
    "scope": "app.ownership.claim.page",
    "text": "What happens next",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.64900440a8c9",
    "scope": "app.ownership.claim.page",
    "text": "Submitted",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.3584f595aa34",
    "scope": "app.ownership.claim.page",
    "text": "Your files remain private.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.9b5d252d528e",
    "scope": "app.ownership.claim.page",
    "text": "Owner response",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.0cbc7ff0a4e3",
    "scope": "app.ownership.claim.page",
    "text": "The current owner may approve or dispute.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.23e8381bc011",
    "scope": "app.ownership.claim.page",
    "text": "QRguitar review",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.60789e933c1d",
    "scope": "app.ownership.claim.page",
    "text": "Unresolved claims require administrator review.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.640ae4baf960",
    "scope": "app.ownership.claim.page",
    "text": "Decision",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.24f68feae8fe",
    "scope": "app.ownership.claim.page",
    "text": "Approval preserves the same Profile ID, URL, and protected history.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.4c64a2a1c581",
    "scope": "app.ownership.claim.page",
    "text": "Your requests",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.54403cae6653",
    "scope": "app.ownership.claim.page",
    "text": "Claim status",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.0e2a9633188b",
    "scope": "app.ownership.claim.page",
    "text": "Private Profile",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.21ea0f42e3ae",
    "scope": "app.ownership.claim.page",
    "text": "evidence file",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.043a718774c5",
    "scope": "app.ownership.claim.page",
    "text": "s",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.e9672027cf43",
    "scope": "app.ownership.claim.page",
    "text": "QRguitar needs more information.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.7130515d99f1",
    "scope": "app.ownership.claim.page",
    "text": " {{value1}}",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.aa618133af62",
    "scope": "app.ownership.claim.page",
    "text": " Add the requested private evidence below.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.339a31e91a30",
    "scope": "app.ownership.claim.page",
    "text": "Requested evidence (up to three files, 3 MB combined)",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.3b9c358f36f0",
    "scope": "app.ownership.claim.page",
    "text": "file",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.b24d6d33736e",
    "scope": "app.ownership.claim.page",
    "text": "ready",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.64115d5b9c79",
    "scope": "app.ownership.claim.page",
    "text": "Submitting...",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.91e287e5015e",
    "scope": "app.ownership.claim.page",
    "text": "Submit evidence",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.19766ed6ccb2",
    "scope": "app.ownership.claim.page",
    "text": "Cancel",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.ee26147672a3",
    "scope": "app.ownership.claim.page",
    "text": "Add requested evidence",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.6109a1ebd28d",
    "scope": "app.ownership.claim.page",
    "text": "Opening Ownership Claim Center.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.ownership.claim.page.9f66e1c15c7c",
    "scope": "app.ownership.claim.page",
    "text": "Loading your secure ownership options.",
    "page": "Ownership Claims",
    "area": "Product",
    "section": "Page text",
    "source": "app/ownership-claim/page.tsx"
  },
  {
    "key": "ui.app.privacy.page.54a57c3147c4",
    "scope": "app.privacy.page",
    "text": "Privacy",
    "page": "Privacy",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/privacy/page.tsx"
  },
  {
    "key": "ui.app.privacy.page.38458ed6b62e",
    "scope": "app.privacy.page",
    "text": "Cookies and browser storage",
    "page": "Privacy",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/privacy/page.tsx"
  },
  {
    "key": "ui.app.privacy.page.4cf444b26662",
    "scope": "app.privacy.page",
    "text": "QRguitar uses essential cookies and browser storage for sign-in, session security, authorized previews, app preferences, and drafts or pending work you choose to save. These product features remain available if you deny optional tracking.",
    "page": "Privacy",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/privacy/page.tsx"
  },
  {
    "key": "ui.app.privacy.page.084629fdbfbd",
    "scope": "app.privacy.page",
    "text": "Configured optional analytics or advertising measurement stays off until you choose Accept. Deny keeps it off. A compact Privacy choices control remains available so you can turn optional tracking off at any time. QRguitar stores your consent choice and, after acceptance, up to 128 pseudonymous conversion markers made with a one-way hash in local browser storage to reduce duplicate counts for recent successes across visits and tabs. Denying clears those markers. A marker does not contain the raw account, Profile, transfer, or payment identifier, but it is not anonymous and may be linkable by a party that already knows the source identifier.",
    "page": "Privacy",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/privacy/page.tsx"
  },
  {
    "key": "ui.app.privacy.page.9b5ddedc6008",
    "scope": "app.privacy.page",
    "text": "Optional analytics and advertising are not currently configured. If either is added later, it will stay off until you choose Accept. Deny will keep it off, and QRguitar will store only your consent choice in your browser.",
    "page": "Privacy",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/privacy/page.tsx"
  },
  {
    "key": "ui.app.privacy.page.26f0c9c46640",
    "scope": "app.privacy.page",
    "text": "Optional analytics: events, identifiers and provider details",
    "page": "Privacy",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/privacy/page.tsx"
  },
  {
    "key": "ui.app.privacy.page.602456163092",
    "scope": "app.privacy.page",
    "text": "When optional analytics is enabled and accepted, QRguitar can measure successful public Profile views, registrations, Profile creation, checkout starts, completed credit purchases, and completed ownership transfers using fixed event properties that exclude direct identifiers. Business conversion events also include a stable pseudonymous idempotency token. The Google Analytics adapter sends it as",
    "page": "Privacy",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/privacy/page.tsx"
  },
  {
    "key": "ui.app.privacy.page.57c7c8267db4",
    "scope": "app.privacy.page",
    "text": "event_id",
    "page": "Privacy",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/privacy/page.tsx"
  },
  {
    "key": "ui.app.privacy.page.15857cf6a632",
    "scope": "app.privacy.page",
    "text": ", and also as",
    "page": "Privacy",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/privacy/page.tsx"
  },
  {
    "key": "ui.app.privacy.page.4b481c9c4cd2",
    "scope": "app.privacy.page",
    "text": "transaction_id",
    "page": "Privacy",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/privacy/page.tsx"
  },
  {
    "key": "ui.app.privacy.page.da973ba86fbc",
    "scope": "app.privacy.page",
    "text": "for completed purchases. Google Analytics documents transaction ID deduplication for purchases; its other web events do not provide the same cross-device deduplication guarantee; ordinary Profile page views remain repeatable and carry no such token. QRguitar does not label an ordinary Profile visit as a QR scan. Names, email addresses, serial numbers, raw QRguitar IDs, Profile URLs, transfer tokens, and raw payment IDs are excluded from optional event details.",
    "page": "Privacy",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/privacy/page.tsx"
  },
  {
    "key": "ui.app.privacy.page.f3661ca7e824",
    "scope": "app.privacy.page",
    "text": "After acceptance, QRguitar loads Google Analytics 4 and may set its _ga cookies. QRguitar sends manual page views using coarse categories such as catalog, public Profile, or billing instead of dynamic URLs, query values, page titles, or referrer URLs. Advertising storage, Google signals, and ad personalization remain disabled. Turning tracking off stops new QRguitar dispatch, tells the tag that analytics storage is denied, removes the loaded script, and attempts to remove its first-party cookies. It cannot erase information Google already received.",
    "page": "Privacy",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/privacy/page.tsx"
  },
  {
    "key": "ui.app.privacy.page.1a093b1f9e20",
    "scope": "app.privacy.page",
    "text": "Google Analytics 4 is not currently configured. Adding it requires both an approved Measurement ID and the analytics purpose; until then it does not load, expand the browser security policy, or create a Google Analytics consent prompt by itself.",
    "page": "Privacy",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/privacy/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.2b291cd5cd2f",
    "scope": "app.reset.password.page",
    "text": "Account recovery",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.359f68acb9b4",
    "scope": "app.reset.password.page",
    "text": "Password reset",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.efbe5ce1a727",
    "scope": "app.reset.password.page",
    "text": "Checking reset link.",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.60a5fa2747a0",
    "scope": "app.reset.password.page",
    "text": "Sign-in check unavailable.",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.df01ff0dd6ed",
    "scope": "app.reset.password.page",
    "text": "Password updated.",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.7aa2cb96c3c9",
    "scope": "app.reset.password.page",
    "text": "Enter a new password.",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.25747699557d",
    "scope": "app.reset.password.page",
    "text": "Reset link invalid or expired.",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.4f057eac4b08",
    "scope": "app.reset.password.page",
    "text": "Reset link required.",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.302e28e1e830",
    "scope": "app.reset.password.page",
    "text": "Validating your secure link.",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.d8b8392e2c54",
    "scope": "app.reset.password.page",
    "text": "Try again",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.a1d84018af6f",
    "scope": "app.reset.password.page",
    "text": "Your new password is saved. Taking you back to QRguitar.",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.31fbef162594",
    "scope": "app.reset.password.page",
    "text": "Continue",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.d070b9194f76",
    "scope": "app.reset.password.page",
    "text": "This reset link is no longer valid. Request a fresh password reset email.",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.58b2c6c10c7f",
    "scope": "app.reset.password.page",
    "text": "Open the password reset link from your email to continue.",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.6ff84c62212a",
    "scope": "app.reset.password.page",
    "text": "Request a new reset link",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.3dd9df4441fb",
    "scope": "app.reset.password.page",
    "text": "New password",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.977f3b2676a9",
    "scope": "app.reset.password.page",
    "text": "At least 8 characters",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Labels and help",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.5ac265f396a2",
    "scope": "app.reset.password.page",
    "text": "Confirm password",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.6bf1430d8550",
    "scope": "app.reset.password.page",
    "text": "Re-enter new password",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Labels and help",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.dc85af8f2b1d",
    "scope": "app.reset.password.page",
    "text": "Saving...",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.1a145dd7125d",
    "scope": "app.reset.password.page",
    "text": "Save new password",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.reset.password.page.71fe31ccd37c",
    "scope": "app.reset.password.page",
    "text": "Back to sign in",
    "page": "Reset Password",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/reset-password/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.5300b43afac1",
    "scope": "app.service.review.id.page",
    "text": "Could not load this owner review.",
    "page": "Service Review",
    "area": "Product",
    "section": "Feedback",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.33c5da90a70d",
    "scope": "app.service.review.id.page",
    "text": "Review action failed.",
    "page": "Service Review",
    "area": "Product",
    "section": "Feedback",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.97ba1d394fab",
    "scope": "app.service.review.id.page",
    "text": "Back to Dashboard",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.0d05a9185174",
    "scope": "app.service.review.id.page",
    "text": "Owner sign-in required.",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.c73c1d43bb78",
    "scope": "app.service.review.id.page",
    "text": "This review is private and opens only for the current Profile owner.",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.bfd402b2f6f3",
    "scope": "app.service.review.id.page",
    "text": "Sign in",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.aefc059cfcc0",
    "scope": "app.service.review.id.page",
    "text": "Service review",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.91615589fd8d",
    "scope": "app.service.review.id.page",
    "text": "Loading private submission...",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.59bef136e388",
    "scope": "app.service.review.id.page",
    "text": "Owner service review",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.62fcc8c91a9e",
    "scope": "app.service.review.id.page",
    "text": "private evidence file(s)",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.1c84cbb4698b",
    "scope": "app.service.review.id.page",
    "text": "Submitted by",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.b9a083114c72",
    "scope": "app.service.review.id.page",
    "text": "Verified Service Provider account",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.9b66c02633ca",
    "scope": "app.service.review.id.page",
    "text": "Provider account not verified by QRguitar",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.972fd71db140",
    "scope": "app.service.review.id.page",
    "text": " - {{value1}}",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.cdb70ebd5845",
    "scope": "app.service.review.id.page",
    "text": "Service date",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.d83b9ff3c07a",
    "scope": "app.service.review.id.page",
    "text": "Not provided",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.baaddf70fb5d",
    "scope": "app.service.review.id.page",
    "text": "Type",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.ce02285cc14e",
    "scope": "app.service.review.id.page",
    "text": "Work order",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.14064be012d6",
    "scope": "app.service.review.id.page",
    "text": "Requested visibility",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.a303b38a9485",
    "scope": "app.service.review.id.page",
    "text": "Work performed",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.023fdc1bf85e",
    "scope": "app.service.review.id.page",
    "text": "Parts installed",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.4821049b4d8b",
    "scope": "app.service.review.id.page",
    "text": "Setup measurements",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.5de4e74d2337",
    "scope": "app.service.review.id.page",
    "text": "Private note to owner",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.d9f533ca8b8b",
    "scope": "app.service.review.id.page",
    "text": "Private evidence",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.79f2364fa7bc",
    "scope": "app.service.review.id.page",
    "text": "Evidence is never public automatically.",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.59281a6b2935",
    "scope": "app.service.review.id.page",
    "text": "KB",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.33d7d67febd9",
    "scope": "app.service.review.id.page",
    "text": "No private evidence uploaded.",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.82be8fb0e713",
    "scope": "app.service.review.id.page",
    "text": "Choose what happens next.",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.9ed1aca5fa71",
    "scope": "app.service.review.id.page",
    "text": "Approving attaches one canonical service entry to this QRguitar Profile. It confirms that you authorize the entry to appear; it is not an independent guarantee by QRguitar.",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.521b694737f0",
    "scope": "app.service.review.id.page",
    "text": "Visibility after approval",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.db994c5da409",
    "scope": "app.service.review.id.page",
    "text": "Private service history",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.1c7c4d4247f6",
    "scope": "app.service.review.id.page",
    "text": "Public service history",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.863302c01fba",
    "scope": "app.service.review.id.page",
    "text": "Owner note",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.892f746118d8",
    "scope": "app.service.review.id.page",
    "text": "Required when requesting changes",
    "page": "Service Review",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.cee0e61bdf8c",
    "scope": "app.service.review.id.page",
    "text": "Approving...",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.286a3af7348e",
    "scope": "app.service.review.id.page",
    "text": "Sending...",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.4b1846c7199c",
    "scope": "app.service.review.id.page",
    "text": "Declining...",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.review.id.page.4c1775dd782f",
    "scope": "app.service.review.id.page",
    "text": "Approved service history is now attached to the Profile.",
    "page": "Service Review",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-review/[id]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.af8ac9a88c4c",
    "scope": "app.service.work.code.page",
    "text": "Loading service work...",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.351f14c77161",
    "scope": "app.service.work.code.page",
    "text": "Back to Profile",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.c90563b70285",
    "scope": "app.service.work.code.page",
    "text": "Recent service work",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.2f5a5daaecd3",
    "scope": "app.service.work.code.page",
    "text": "Service provider workspace",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.d8e474288ebf",
    "scope": "app.service.work.code.page",
    "text": "Loading your provider account and saved service work...",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.b2e871df303b",
    "scope": "app.service.work.code.page",
    "text": "Service work could not be loaded",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.b3de94fe0bf6",
    "scope": "app.service.work.code.page",
    "text": "Please retry loading before editing this request.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.a0f859bc4db2",
    "scope": "app.service.work.code.page",
    "text": "Retry loading",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.255346f25669",
    "scope": "app.service.work.code.page",
    "text": "Sign in required",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.52b77bc36501",
    "scope": "app.service.work.code.page",
    "text": "Use the provider account that performed the work.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.bfd402b2f6f3",
    "scope": "app.service.work.code.page",
    "text": "Sign in",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.f03121878d3b",
    "scope": "app.service.work.code.page",
    "text": "Opening the existing work order replaces the form below with its saved contents.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.63d82262033d",
    "scope": "app.service.work.code.page",
    "text": "Resume existing work order",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.647dec83704a",
    "scope": "app.service.work.code.page",
    "text": "Reloading replaces this form with the saved server version. Check its status before sending or uploading again.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.3c845b491776",
    "scope": "app.service.work.code.page",
    "text": "Reload saved version",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.f031a55c8dec",
    "scope": "app.service.work.code.page",
    "text": "Check recent service work",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.af263b67ec8c",
    "scope": "app.service.work.code.page",
    "text": "private evidence file",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.043a718774c5",
    "scope": "app.service.work.code.page",
    "text": "s",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.ee98de4be087",
    "scope": "app.service.work.code.page",
    "text": "Saved request link",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.ece7f6e77050",
    "scope": "app.service.work.code.page",
    "text": "Owner review note",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.b9ef7c86dae4",
    "scope": "app.service.work.code.page",
    "text": "This request is",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.805e0758681e",
    "scope": "app.service.work.code.page",
    "text": ". Its work and evidence are read-only.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.656eefd90b92",
    "scope": "app.service.work.code.page",
    "text": "Provider identity",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.61253b8818ee",
    "scope": "app.service.work.code.page",
    "text": "This public business identity appears with approved work. Verification can only be assigned by QRguitar admin.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.843868d5fda4",
    "scope": "app.service.work.code.page",
    "text": "Provider or business name",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.8a7723e9a0e9",
    "scope": "app.service.work.code.page",
    "text": "Legal/business name (optional)",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.0682140845c0",
    "scope": "app.service.work.code.page",
    "text": "Website (optional)",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.9dc1bb315851",
    "scope": "app.service.work.code.page",
    "text": "Location (optional)",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.3830f017faf4",
    "scope": "app.service.work.code.page",
    "text": "Completed work",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.171edb766e79",
    "scope": "app.service.work.code.page",
    "text": "Use the language you would put on a clear service invoice.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.cdb70ebd5845",
    "scope": "app.service.work.code.page",
    "text": "Service date",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.5844e6bad41d",
    "scope": "app.service.work.code.page",
    "text": "Service type",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.e3052fa34d51",
    "scope": "app.service.work.code.page",
    "text": "Work-order or invoice reference (optional)",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.0d142aa8971a",
    "scope": "app.service.work.code.page",
    "text": "Short title",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.ac529d44701c",
    "scope": "app.service.work.code.page",
    "text": "Full setup and fret dress",
    "page": "Service Providers",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.a303b38a9485",
    "scope": "app.service.work.code.page",
    "text": "Work performed",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.ab43f9b4bbad",
    "scope": "app.service.work.code.page",
    "text": "Parts installed (optional)",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.92af936ad363",
    "scope": "app.service.work.code.page",
    "text": "Setup measurements (optional)",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.78286bf630f4",
    "scope": "app.service.work.code.page",
    "text": "Owner review",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.88019ac51add",
    "scope": "app.service.work.code.page",
    "text": "Recommend what may appear publicly. The owner makes the final visibility choice.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.503de46da32e",
    "scope": "app.service.work.code.page",
    "text": "Recommended public description",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.14064be012d6",
    "scope": "app.service.work.code.page",
    "text": "Requested visibility",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.db994c5da409",
    "scope": "app.service.work.code.page",
    "text": "Private service history",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.1c7c4d4247f6",
    "scope": "app.service.work.code.page",
    "text": "Public service history",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.0059798b7f70",
    "scope": "app.service.work.code.page",
    "text": "(optional)",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.d2b7fa09d500",
    "scope": "app.service.work.code.page",
    "text": "Upload recovery",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.a89c75376072",
    "scope": "app.service.work.code.page",
    "text": "Checking upload status…",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.102806ce5a89",
    "scope": "app.service.work.code.page",
    "text": "Check upload status",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.b37b4aa78557",
    "scope": "app.service.work.code.page",
    "text": "Checking and reloading only read saved information. They never upload or attach a file.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.c14f20525b7c",
    "scope": "app.service.work.code.page",
    "text": "Checking for an unfinished upload…",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.72ff78047875",
    "scope": "app.service.work.code.page",
    "text": "No unfinished upload was found.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.59281a6b2935",
    "scope": "app.service.work.code.page",
    "text": "KB",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.d6461ace970b",
    "scope": "app.service.work.code.page",
    "text": "unfinished uploads need review. Resolve this attempt to see the next one.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.fc5811d6512e",
    "scope": "app.service.work.code.page",
    "text": "This account cannot change this unfinished upload right now. Check upload status after account access is restored.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.228571deb201",
    "scope": "app.service.work.code.page",
    "text": "The file arrived, but this request is closed. You can discard the unfinished upload; it has not been attached.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.5e39ab87601b",
    "scope": "app.service.work.code.page",
    "text": "The file arrived and is waiting to be attached. Finish this upload or discard it before choosing another file.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.d241c6ace0a6",
    "scope": "app.service.work.code.page",
    "text": "The file has not arrived. Check again if an upload may still be running, or discard this attempt before choosing a file again.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.021cc0ab0131",
    "scope": "app.service.work.code.page",
    "text": "The saved file does not match this upload. Discard this unfinished attempt before choosing another file.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.0e606559fafc",
    "scope": "app.service.work.code.page",
    "text": "The result of this upload is not yet confirmed. Check its saved status before continuing.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.47e171283955",
    "scope": "app.service.work.code.page",
    "text": "Finishing…",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.d229d277ee62",
    "scope": "app.service.work.code.page",
    "text": "Finish existing upload",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.4bcdf27fbb3b",
    "scope": "app.service.work.code.page",
    "text": "Discard this unfinished attempt? It will not attach a file. Already attached evidence is kept.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.9694c1461a09",
    "scope": "app.service.work.code.page",
    "text": "Confirm discard",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.48d1780a0dd9",
    "scope": "app.service.work.code.page",
    "text": "Keep attempt",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.32447065ae76",
    "scope": "app.service.work.code.page",
    "text": "Discard unfinished attempt",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.21656a8049a3",
    "scope": "app.service.work.code.page",
    "text": "Evidence type",
    "page": "Service Providers",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.ce02285cc14e",
    "scope": "app.service.work.code.page",
    "text": "Work order",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.b832002da297",
    "scope": "app.service.work.code.page",
    "text": "Invoice",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.4d5e6b5d893b",
    "scope": "app.service.work.code.page",
    "text": "Service slip",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.de5a18e39fd7",
    "scope": "app.service.work.code.page",
    "text": "Before photo",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.c1de40f77781",
    "scope": "app.service.work.code.page",
    "text": "After photo",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.d62ceba55a6b",
    "scope": "app.service.work.code.page",
    "text": "Measurement sheet",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.dad5a9692313",
    "scope": "app.service.work.code.page",
    "text": "Receipt",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.ce43a37b502e",
    "scope": "app.service.work.code.page",
    "text": "Other evidence",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.72cb29c90ccd",
    "scope": "app.service.work.code.page",
    "text": "Uploading...",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.935c93c2d07d",
    "scope": "app.service.work.code.page",
    "text": "Upload evidence",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.1e9d76010c32",
    "scope": "app.service.work.code.page",
    "text": "Private evidence file",
    "page": "Service Providers",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.4db1655483ed",
    "scope": "app.service.work.code.page",
    "text": "file(s)",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.9d30cfd321ce",
    "scope": "app.service.work.code.page",
    "text": "JPG, PNG, WebP, or PDF, up to 15 MB per file. Save a draft before attaching files.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.69ffb2c8933d",
    "scope": "app.service.work.code.page",
    "text": "Attached evidence",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.4aed40d2ff15",
    "scope": "app.service.work.code.page",
    "text": "Loading files…",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.c0e24d416c0a",
    "scope": "app.service.work.code.page",
    "text": "Refresh file links",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.de4e430f63d7",
    "scope": "app.service.work.code.page",
    "text": "Load attached files",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.c3fdceb256b1",
    "scope": "app.service.work.code.page",
    "text": "Loading private attachments…",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.fa4f0e1212cc",
    "scope": "app.service.work.code.page",
    "text": "No evidence is attached to this request.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.9d2666d6ec3b",
    "scope": "app.service.work.code.page",
    "text": "Open {{value1}} in a new tab",
    "page": "Service Providers",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.4190c0c7ec72",
    "scope": "app.service.work.code.page",
    "text": "Open file",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.c649d0e2fe03",
    "scope": "app.service.work.code.page",
    "text": "Remove this attachment?",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.bb0f9ad6dc33",
    "scope": "app.service.work.code.page",
    "text": "Confirm removal",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.cf00c0b1279c",
    "scope": "app.service.work.code.page",
    "text": "Keep file",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.d2f6b9b77710",
    "scope": "app.service.work.code.page",
    "text": "Remove {{value1}}",
    "page": "Service Providers",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.c3812fc4acb8",
    "scope": "app.service.work.code.page",
    "text": "Remove",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.54bd167a5111",
    "scope": "app.service.work.code.page",
    "text": "Private file links expire after five minutes. Refresh them here if a file no longer opens.",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.dc85af8f2b1d",
    "scope": "app.service.work.code.page",
    "text": "Saving...",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.64115d5b9c79",
    "scope": "app.service.work.code.page",
    "text": "Submitting...",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.service.work.code.page.0435d1b361c0",
    "scope": "app.service.work.code.page",
    "text": "Send revised work",
    "page": "Service Providers",
    "area": "Product",
    "section": "Page text",
    "source": "app/service-work/[code]/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.e85c464416f3",
    "scope": "app.site.editor.page",
    "text": "A previous save needs confirmation. Retry it before making another change.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.845056b445ef",
    "scope": "app.site.editor.page",
    "text": "Recovery storage is unavailable. Export your local changes before reloading.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.cecbf3bf358c",
    "scope": "app.site.editor.page",
    "text": "Reload Site Editor before making another publishing change.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.eee0810038e1",
    "scope": "app.site.editor.page",
    "text": "Resolve the current save issue with the recovery controls before publishing, discarding, or restoring.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.bf88cc32f31d",
    "scope": "app.site.editor.page",
    "text": "Fix highlighted content, keep primary text and actions at 4.5:1 contrast, and keep accent text at 3:1 before publishing.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.a780f888e244",
    "scope": "app.site.editor.page",
    "text": "Your previous change was saved. Another edit followed it; export local changes and reload before continuing.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.ebdc22e5a6c8",
    "scope": "app.site.editor.page",
    "text": "The save could not be confirmed.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.69cc3b83164d",
    "scope": "app.site.editor.page",
    "text": "Could not clear the draft preview cookie.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.2a49ea34c2c6",
    "scope": "app.site.editor.page",
    "text": "The signed-in account changed. Reload Site Editor before previewing.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.e107cb92e5df",
    "scope": "app.site.editor.page",
    "text": "Your account changed. Reload Site Editor to continue.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.e7a91e2b4bab",
    "scope": "app.site.editor.page",
    "text": "Server draft loaded.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.ca1f63cb40c8",
    "scope": "app.site.editor.page",
    "text": "Published content loaded.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.0f8bbd571c6c",
    "scope": "app.site.editor.page",
    "text": "Could not load Site Editor. Retry when the service is available.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.5f2c12ebe38c",
    "scope": "app.site.editor.page",
    "text": "Published preview is unavailable.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.4315de7fb3b8",
    "scope": "app.site.editor.page",
    "text": "Draft preview is unavailable.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.302960c98c5c",
    "scope": "app.site.editor.page",
    "text": "Unlock Settings JSON before loading an import.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.499f64a6a071",
    "scope": "app.site.editor.page",
    "text": "JSON is valid, but the imported settings need corrections before they can be loaded.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.44f3536d98dc",
    "scope": "app.site.editor.page",
    "text": "Validated JSON loaded. Autosave will store it as the shared draft.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.313358c4d59b",
    "scope": "app.site.editor.page",
    "text": "Settings JSON is not valid JSON.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.00f6795cf8d1",
    "scope": "app.site.editor.page",
    "text": "Settings backup downloaded.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.f81f7545ce0a",
    "scope": "app.site.editor.page",
    "text": "Copying export…",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.6a46a60d6ff2",
    "scope": "app.site.editor.page",
    "text": "Settings export copied.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.45a34082834d",
    "scope": "app.site.editor.page",
    "text": "Could not copy automatically. Use Download backup to save the settings export.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.7c912eb1b432",
    "scope": "app.site.editor.page",
    "text": "Enter a brand and a valid https URL or site-relative path.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.9a80291326a6",
    "scope": "app.site.editor.page",
    "text": "Brand logo added to the draft.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.42a94d91df70",
    "scope": "app.site.editor.page",
    "text": "Content sections",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.208d4e01ad3b",
    "scope": "app.site.editor.page",
    "text": "Editing mode",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.47bd29075f8b",
    "scope": "app.site.editor.page",
    "text": "Content",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.9f088dbebd6c",
    "scope": "app.site.editor.page",
    "text": "Advanced",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.005abd0bb982",
    "scope": "app.site.editor.page",
    "text": "Search {{value1}}",
    "page": "Content Studio",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.be52471041bb",
    "scope": "app.site.editor.page",
    "text": "Search {{value1}} content",
    "page": "Content Studio",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.findAllPlaceholder",
    "scope": "app.site.editor.page",
    "text": "Find wording on any page",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.findAllLabel",
    "scope": "app.site.editor.page",
    "text": "Find text across all pages",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.matchingFields",
    "scope": "app.site.editor.page",
    "text": "Matching text fields",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.oneMatch",
    "scope": "app.site.editor.page",
    "text": "1 matching field",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.manyMatches",
    "scope": "app.site.editor.page",
    "text": "{{count}} matching fields",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.noMatches",
    "scope": "app.site.editor.page",
    "text": "No matching fields. Try a shorter phrase.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.0072e6b93494",
    "scope": "app.site.editor.page",
    "text": "Design",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.5491b0ff70a2",
    "scope": "app.site.editor.page",
    "text": "Brand assets",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.5fdf43a3219f",
    "scope": "app.site.editor.page",
    "text": "Draft activity",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.81c69bb85eae",
    "scope": "app.site.editor.page",
    "text": "unpublished",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.12ea12eace7d",
    "scope": "app.site.editor.page",
    "text": "change",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.d0b4ba2311b3",
    "scope": "app.site.editor.page",
    "text": "changes",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.8f4d9115378d",
    "scope": "app.site.editor.page",
    "text": "is open",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.a2e67e3d39fd",
    "scope": "app.site.editor.page",
    "text": "Page editing view",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.c661980d2edb",
    "scope": "app.site.editor.page",
    "text": "Page content",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.d84427076f69",
    "scope": "app.site.editor.page",
    "text": "Section arrangement",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.467c12a6a1ae",
    "scope": "app.site.editor.page",
    "text": "Content section",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.7893cc8c1973",
    "scope": "app.site.editor.page",
    "text": "Page content sections",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.c0d2856b74d0",
    "scope": "app.site.editor.page",
    "text": "field",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.bfe5d697162d",
    "scope": "app.site.editor.page",
    "text": "fields",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.5d2bd273b938",
    "scope": "app.site.editor.page",
    "text": "Managed by system",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.a56cca2cfbd1",
    "scope": "app.site.editor.page",
    "text": "{{value1}} This value is intentionally read-only.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.2e4aaca6ea8c",
    "scope": "app.site.editor.page",
    "text": "Allowed variables:",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.131d28535a61",
    "scope": "app.site.editor.page",
    "text": "{{{{value1}}}}",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.725b6fa6df52",
    "scope": "app.site.editor.page",
    "text": "Reset field",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.8749aa136a36",
    "scope": "app.site.editor.page",
    "text": "No content matched on",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.866daf3d66a9",
    "scope": "app.site.editor.page",
    "text": "Try a section name, field label, or content key from this page.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.eeb51b63cf49",
    "scope": "app.site.editor.page",
    "text": "Safe preview",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.f199529a30df",
    "scope": "app.site.editor.page",
    "text": "{{value1}} email",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.92f2897724bf",
    "scope": "app.site.editor.page",
    "text": "Email preview",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.bbad0a028b19",
    "scope": "app.site.editor.page",
    "text": "Whitelisted variables are replaced with sample values here. Previewing never sends an email or exposes a real token.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.68971283841a",
    "scope": "app.site.editor.page",
    "text": "Subject",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.a439fba430a3",
    "scope": "app.site.editor.page",
    "text": "QR",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.d081f5e40298",
    "scope": "app.site.editor.page",
    "text": "guitar",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.77cf4575c15c",
    "scope": "app.site.editor.page",
    "text": "QRguitar notification",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.3dcab0a37bb0",
    "scope": "app.site.editor.page",
    "text": "Open QRguitar",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.2f40e3ad9bf8",
    "scope": "app.site.editor.page",
    "text": "Plain-text preview",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.dadbd9e6486e",
    "scope": "app.site.editor.page",
    "text": "{{value1}}\n\n{{value2}}\n\n{{value3}}\n\n{{value4}}\n\n{{value5}}",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.afdb2a6b3534",
    "scope": "app.site.editor.page",
    "text": "Sending test…",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.4e19e53db870",
    "scope": "app.site.editor.page",
    "text": "Send test to my admin email",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.8ddb6a61231c",
    "scope": "app.site.editor.page",
    "text": "The recipient is fixed to the authenticated admin account. Addresses cannot be entered here.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.6a4c09bcdc12",
    "scope": "app.site.editor.page",
    "text": "Canonical origin",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.0f2d62a92588",
    "scope": "app.site.editor.page",
    "text": "Site URL",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.a4c0fb64632a",
    "scope": "app.site.editor.page",
    "text": "Canonical site URL",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.de8b7527c29d",
    "scope": "app.site.editor.page",
    "text": "Use the public QRguitar HTTPS origin for canonical metadata.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.fd0112ea773b",
    "scope": "app.site.editor.page",
    "text": "Search and social",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.30636cab278d",
    "scope": "app.site.editor.page",
    "text": "{{value1}} preview",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.94ae9de3ddac",
    "scope": "app.site.editor.page",
    "text": "Live SEO preview",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.7e8cd2056da7",
    "scope": "app.site.editor.page",
    "text": "Title",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.526e0087cc3f",
    "scope": "app.site.editor.page",
    "text": "Description",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.963e3a2a5127",
    "scope": "app.site.editor.page",
    "text": "Social image set",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.d6394e0fdb8c",
    "scope": "app.site.editor.page",
    "text": "Using global social image",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.6d1ad6e2ee80",
    "scope": "app.site.editor.page",
    "text": "Invalid indexing value — page blocked",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.4bdfc8059e30",
    "scope": "app.site.editor.page",
    "text": "Untitled QRguitar page",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.09722b5de3c0",
    "scope": "app.site.editor.page",
    "text": "Add a clear description for search results.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.1a32cd5a3a29",
    "scope": "app.site.editor.page",
    "text": "QRguitar",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.917c7e050b98",
    "scope": "app.site.editor.page",
    "text": "Add a social description.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.1a719f6a72dd",
    "scope": "app.site.editor.page",
    "text": "qrguitar.com",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.4a866105af15",
    "scope": "app.site.editor.page",
    "text": "Design system",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.efb52e7172b7",
    "scope": "app.site.editor.page",
    "text": "Theme",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.08dfce1d03af",
    "scope": "app.site.editor.page",
    "text": "Change the small set of approved QRguitar color tokens. Preview contrast before publishing.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.d21552c09125",
    "scope": "app.site.editor.page",
    "text": "Six-digit hex color",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.3d3fa6131c8f",
    "scope": "app.site.editor.page",
    "text": "Theme contrast checks",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.3a4e9214f0ee",
    "scope": "app.site.editor.page",
    "text": "{{value1}}:1",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.a639bb65798f",
    "scope": "app.site.editor.page",
    "text": "Invalid color",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.bf56ee2fe334",
    "scope": "app.site.editor.page",
    "text": "Readable",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.bfb4366f94f8",
    "scope": "app.site.editor.page",
    "text": "Needs {{value1}}:1",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.a41f536cdf78",
    "scope": "app.site.editor.page",
    "text": "Live token preview",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.3f1e961fb0d3",
    "scope": "app.site.editor.page",
    "text": "Clear, calm, unmistakably QRguitar.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.da2eb576b5f6",
    "scope": "app.site.editor.page",
    "text": "Primary action",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.c4dfafee898c",
    "scope": "app.site.editor.page",
    "text": "Official brand logos are controlled here. Instrument owners cannot replace a brand identity.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.090ed4316f1d",
    "scope": "app.site.editor.page",
    "text": "Brand",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.6711ae89251e",
    "scope": "app.site.editor.page",
    "text": "Fender",
    "page": "Content Studio",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.4c67258f3a3c",
    "scope": "app.site.editor.page",
    "text": "Brand key used by the logo registry.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.062cc3d67c02",
    "scope": "app.site.editor.page",
    "text": "Transparent logo URL",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.0aede7e7963c",
    "scope": "app.site.editor.page",
    "text": "/brands/fender.svg",
    "page": "Content Studio",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.fdafc7dc3390",
    "scope": "app.site.editor.page",
    "text": "HTTPS URL or a site-relative path.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.57e6ff68eee1",
    "scope": "app.site.editor.page",
    "text": "Add to draft",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.05c2e3277039",
    "scope": "app.site.editor.page",
    "text": "Registry",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.9d933f9c19c5",
    "scope": "app.site.editor.page",
    "text": "Official logos",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.c3812fc4acb8",
    "scope": "app.site.editor.page",
    "text": "Remove",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.49b597ef3482",
    "scope": "app.site.editor.page",
    "text": "No official logos have been added. Brand names continue to render as text.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.d6831de6e415",
    "scope": "app.site.editor.page",
    "text": "Publishing safety",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.5ae0d3d186c7",
    "scope": "app.site.editor.page",
    "text": "Revision history",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.42597272a488",
    "scope": "app.site.editor.page",
    "text": "Restore places a prior version into the shared draft. Nothing goes live until you review and publish it.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.185c64e10bf3",
    "scope": "app.site.editor.page",
    "text": "changed fields",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.119135fecb55",
    "scope": "app.site.editor.page",
    "text": "Resolve the current save issue before restoring a revision.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.c38472e59d29",
    "scope": "app.site.editor.page",
    "text": "Restore to draft",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.2a29e0a485e0",
    "scope": "app.site.editor.page",
    "text": "No prior published revisions yet.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.fe19646b2baa",
    "scope": "app.site.editor.page",
    "text": "Content governance",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.818c6d12483c",
    "scope": "app.site.editor.page",
    "text": "Copy coverage",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.92ca1b16f685",
    "scope": "app.site.editor.page",
    "text": "Registered website wording is listed below. User-entered Profile and account data remain in their records; browser dialogs and protected system behavior are outside this editor. Counts describe connected fields, not a universal coverage guarantee.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.eb47b979f529",
    "scope": "app.site.editor.page",
    "text": "registered fields",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.ee9fb78f117e",
    "scope": "app.site.editor.page",
    "text": "editable fields",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.b5deeadb6cce",
    "scope": "app.site.editor.page",
    "text": "security locked",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.808558d61bb0",
    "scope": "app.site.editor.page",
    "text": "Machine-readable manifest",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.996c2cb8d88a",
    "scope": "app.site.editor.page",
    "text": "Classification sources",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.35e1e7990d8b",
    "scope": "app.site.editor.page",
    "text": "Settings JSON",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.7beee9b9b1b2",
    "scope": "app.site.editor.page",
    "text": "Normal editing never requires JSON. This validated import/export surface is for recovery and controlled migrations.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.44eb00ce43f1",
    "scope": "app.site.editor.page",
    "text": "Editing unlocked",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.0a7338b94362",
    "scope": "app.site.editor.page",
    "text": "Read-only by default",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.c9f0664d6ce5",
    "scope": "app.site.editor.page",
    "text": "Validate before loading. Publishing still requires the normal Publish action.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.c376a71aa874",
    "scope": "app.site.editor.page",
    "text": "Download a backup before unlocking an advanced import.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.669211280b63",
    "scope": "app.site.editor.page",
    "text": "Download backup",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.d4e86bd24e4e",
    "scope": "app.site.editor.page",
    "text": "Lock editor",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.bc879a375fab",
    "scope": "app.site.editor.page",
    "text": "Unlock editor",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.cbc4aeaf8a9f",
    "scope": "app.site.editor.page",
    "text": "Validate and load draft",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.a0d7b2fa2b5f",
    "scope": "app.site.editor.page",
    "text": "Copy export",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.13d06b13fc80",
    "scope": "app.site.editor.page",
    "text": "Review recovery introduction",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.ec6baee192a7",
    "scope": "app.site.editor.page",
    "text": "The separate recovery tool reviews only the password-reset introduction. Finish current edits and resolve any shared draft before using it.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.6586948feb58",
    "scope": "app.site.editor.page",
    "text": "Admin tools",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.ba5e8c6179e8",
    "scope": "app.site.editor.page",
    "text": "Checking Site Editor access.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.d173d8097380",
    "scope": "app.site.editor.page",
    "text": "Site Editor is temporarily unavailable.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.d92c603b66e1",
    "scope": "app.site.editor.page",
    "text": "Admin access required.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.0dba518055eb",
    "scope": "app.site.editor.page",
    "text": "Retrying Site Editor…",
    "page": "Content Studio",
    "area": "Product",
    "section": "Feedback",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.942087cc2d41",
    "scope": "app.site.editor.page",
    "text": "Retry",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.bfd402b2f6f3",
    "scope": "app.site.editor.page",
    "text": "Sign in",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.345c74235673",
    "scope": "app.site.editor.page",
    "text": "Back to Admin",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.e44e710bee9f",
    "scope": "app.site.editor.page",
    "text": "Open content tree",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.2b06d01c3eba",
    "scope": "app.site.editor.page",
    "text": "QRguitar / Admin",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.06c85ff37596",
    "scope": "app.site.editor.page",
    "text": "Content Studio",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.6015fb9d7c7a",
    "scope": "app.site.editor.page",
    "text": "Save needs attention",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.d3d563f1bc30",
    "scope": "app.site.editor.page",
    "text": "{{value1}} unpublished {{value2}}",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.586a61861f0c",
    "scope": "app.site.editor.page",
    "text": "Saving draft…",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.882467178b39",
    "scope": "app.site.editor.page",
    "text": "Resolve the current save issue before discarding the draft.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.cb30147eec19",
    "scope": "app.site.editor.page",
    "text": "Discard draft",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.69a02c64d5c5",
    "scope": "app.site.editor.page",
    "text": "Back to editing",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.324b134f57c7",
    "scope": "app.site.editor.page",
    "text": "Preview",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.25a8b63d9378",
    "scope": "app.site.editor.page",
    "text": "Resolve the current save issue before publishing.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.859390eb495b",
    "scope": "app.site.editor.page",
    "text": "Publish",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.8d24f73a9916",
    "scope": "app.site.editor.page",
    "text": "Export local changes",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.878d2ebf6ad9",
    "scope": "app.site.editor.page",
    "text": "Retry the same save",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.16a029bbde48",
    "scope": "app.site.editor.page",
    "text": "Resume saving",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.5670576a5886",
    "scope": "app.site.editor.page",
    "text": "Export and reload latest",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.d3f642b0549e",
    "scope": "app.site.editor.page",
    "text": "Site content navigation",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.7de0ab86da2a",
    "scope": "app.site.editor.page",
    "text": "Site content",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.5cfdcc35d8e2",
    "scope": "app.site.editor.page",
    "text": "Close content tree",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.827488f33a51",
    "scope": "app.site.editor.page",
    "text": "Search results for \"{{value1}}\" on {{value2}}",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.5ccb8caacdc5",
    "scope": "app.site.editor.page",
    "text": "Draft saved",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.ee283c5bb84b",
    "scope": "app.site.editor.page",
    "text": "No saved draft",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.2ef42ec21d93",
    "scope": "app.site.editor.page",
    "text": "Published",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.e84062f1f34c",
    "scope": "app.site.editor.page",
    "text": "Publish date unavailable",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.7109f299864f",
    "scope": "app.site.editor.page",
    "text": "Review {{value1}} {{value2}}",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.c699aa00b26d",
    "scope": "app.site.editor.page",
    "text": "No changes",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.ae75c788f381",
    "scope": "app.site.editor.page",
    "text": "Drafts save automatically. Publishing applies all changes across the site.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.860cbf1a2ef2",
    "scope": "app.site.editor.page",
    "text": "Draft changes compared with published settings",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.45d1bd82d4cd",
    "scope": "app.site.editor.page",
    "text": "Draft compared with published",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.f066504404d5",
    "scope": "app.site.editor.page",
    "text": "Close comparison",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.830d1798762a",
    "scope": "app.site.editor.page",
    "text": "No settings differ from the published version.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.28dbe8914f6b",
    "scope": "app.site.editor.page",
    "text": "Showing the first 100 of",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.736afe256bd7",
    "scope": "app.site.editor.page",
    "text": "changes. Download a backup to review the complete settings document.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.494d442c8f74",
    "scope": "app.site.editor.page",
    "text": "{{value1}} site preview",
    "page": "Content Studio",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.99e15fdbef0d",
    "scope": "app.site.editor.page",
    "text": "Preview source",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.ebf12ef47cf5",
    "scope": "app.site.editor.page",
    "text": "Draft",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.2261434c7aeb",
    "scope": "app.site.editor.page",
    "text": "Preview size",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.144adf27f7f3",
    "scope": "app.site.editor.page",
    "text": "Desktop preview",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.42805a318ee1",
    "scope": "app.site.editor.page",
    "text": "Tablet preview",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.f4185502ae83",
    "scope": "app.site.editor.page",
    "text": "Mobile preview",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.5b529abadacc",
    "scope": "app.site.editor.page",
    "text": "Refresh preview",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.7723e4dec204",
    "scope": "app.site.editor.page",
    "text": "Open full preview",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.7d8ab368210c",
    "scope": "app.site.editor.page",
    "text": "Close preview",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.7d9eb7acb13e",
    "scope": "app.site.editor.page",
    "text": "Close",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.b99fa6c06150",
    "scope": "app.site.editor.page",
    "text": "Preview unavailable",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.d8b8392e2c54",
    "scope": "app.site.editor.page",
    "text": "Try again",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.5db120413cf7",
    "scope": "app.site.editor.page",
    "text": "{{value1}} {{value2}} preview",
    "page": "Content Studio",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.d8f27ff08958",
    "scope": "app.site.editor.page",
    "text": "Opening the real",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.5ccec630b66f",
    "scope": "app.site.editor.page",
    "text": "page…",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.489499d1fba4",
    "scope": "app.site.editor.page",
    "text": "Selected route",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.31c9df53eaed",
    "scope": "app.site.editor.page",
    "text": "Previewing",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.9f03d34eb73f",
    "scope": "app.site.editor.page",
    "text": "Shared draft",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.caf8e3e0baf3",
    "scope": "app.site.editor.page",
    "text": "Published site",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.2ed6520fbcc7",
    "scope": "app.site.editor.page",
    "text": "Discard shared draft?",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.dea6edd12ab5",
    "scope": "app.site.editor.page",
    "text": "Publish all draft changes?",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.32456d5ba894",
    "scope": "app.site.editor.page",
    "text": "Restore this revision?",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.d2252166e49d",
    "scope": "app.site.editor.page",
    "text": "Close confirmation",
    "page": "Content Studio",
    "area": "Product",
    "section": "Accessibility",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.b52ea90f8343",
    "scope": "app.site.editor.page",
    "text": "This removes the current shared draft and returns the editor to the published version. Published pages will not change.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.ca134dbc9252",
    "scope": "app.site.editor.page",
    "text": "{{value1}} unpublished {{value2}} will be published globally. The prior live version stays available in revision history.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.47dd228eac4e",
    "scope": "app.site.editor.page",
    "text": "This copies the version published {{value1}} into the shared draft. It will not go live until you publish it.",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.7bb7415c01f4",
    "scope": "app.site.editor.page",
    "text": "Release note (optional)",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.6884a542b504",
    "scope": "app.site.editor.page",
    "text": "What changed in this release?",
    "page": "Content Studio",
    "area": "Product",
    "section": "Labels and help",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.19766ed6ccb2",
    "scope": "app.site.editor.page",
    "text": "Cancel",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.site.editor.page.47231b7511bd",
    "scope": "app.site.editor.page",
    "text": "Confirm publish",
    "page": "Content Studio",
    "area": "Product",
    "section": "Page text",
    "source": "app/site-editor/page.tsx"
  },
  {
    "key": "ui.app.terms.page.ede548996483",
    "scope": "app.terms.page",
    "text": "Terms",
    "page": "Terms",
    "area": "Support & Legal",
    "section": "Page text",
    "source": "app/terms/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.fdee411bbf65",
    "scope": "app.transfer.id.page",
    "text": "Loading this transfer took too long. Try again.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Feedback",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.68c903e92912",
    "scope": "app.transfer.id.page",
    "text": "Use the recipient account or the current owner account to view this handoff.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Feedback",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.34e5b6deb1c9",
    "scope": "app.transfer.id.page",
    "text": "We could not load this transfer.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Feedback",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.66e1da988511",
    "scope": "app.transfer.id.page",
    "text": "We could not load this transfer. Check your connection and try again.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Feedback",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.d311b7c2186b",
    "scope": "app.transfer.id.page",
    "text": "Could not accept this transfer.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Feedback",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.60ae02829abd",
    "scope": "app.transfer.id.page",
    "text": "Ownership accepted. The permanent QRguitar URL stayed the same.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Feedback",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.dbf639836efe",
    "scope": "app.transfer.id.page",
    "text": "We could not confirm the transfer. Reload its status before trying again.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Feedback",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.3a1b86ed2e8b",
    "scope": "app.transfer.id.page",
    "text": "Profile link copied.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Feedback",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.6f055fbdab66",
    "scope": "app.transfer.id.page",
    "text": "Could not copy the link. Open the Profile and copy its address from your browser.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Feedback",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.cbfa6a5b513b",
    "scope": "app.transfer.id.page",
    "text": "Ownership transfer",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.779107766b60",
    "scope": "app.transfer.id.page",
    "text": "Checking claim link.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.b9077ab4b6f2",
    "scope": "app.transfer.id.page",
    "text": "Loading this ownership transfer now.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.64384260ddf0",
    "scope": "app.transfer.id.page",
    "text": "Unable to load this transfer",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.06ca975631d1",
    "scope": "app.transfer.id.page",
    "text": "Sign in with the recipient account",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.ba00298cf2c9",
    "scope": "app.transfer.id.page",
    "text": "This transfer is unavailable",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.42c72206d5cf",
    "scope": "app.transfer.id.page",
    "text": "Your instrument and transfer have not been changed by this check.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.227180c6db35",
    "scope": "app.transfer.id.page",
    "text": "Check the link and the account you are signed in to, or ask the current owner for help.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.d8b8392e2c54",
    "scope": "app.transfer.id.page",
    "text": "Try again",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.bfd402b2f6f3",
    "scope": "app.transfer.id.page",
    "text": "Sign in",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.73aefc65d247",
    "scope": "app.transfer.id.page",
    "text": "Go to Dashboard",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.a8c70c41dc7c",
    "scope": "app.transfer.id.page",
    "text": "Accept ownership of",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.2ff08141880b",
    "scope": "app.transfer.id.page",
    "text": "This transfer has already been accepted. The permanent QR link stays with the instrument.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.907670850268",
    "scope": "app.transfer.id.page",
    "text": "This transfer was cancelled. Ask the current owner for a fresh transfer link.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.723adcd00002",
    "scope": "app.transfer.id.page",
    "text": "Sign in with the recipient email on this transfer to accept ownership. The QRguitar URL will not change.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.d696a35bdd18",
    "scope": "app.transfer.id.page",
    "text": "Profile",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.a6c8f92c19f4",
    "scope": "app.transfer.id.page",
    "text": "QRguitar ID",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.920e413c7d41",
    "scope": "app.transfer.id.page",
    "text": "Status",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.63fab8557311",
    "scope": "app.transfer.id.page",
    "text": "Permanent QR link stays the same",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.8e8a07a66720",
    "scope": "app.transfer.id.page",
    "text": "Recipient must be signed in",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.85595a4753c6",
    "scope": "app.transfer.id.page",
    "text": "Ownership accepted.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.ca9a513b8ad6",
    "scope": "app.transfer.id.page",
    "text": "This Profile now belongs to the accepting account and keeps the same permanent QRguitar link.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.41a634bed373",
    "scope": "app.transfer.id.page",
    "text": "View Profile",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.8b812d5b9e9b",
    "scope": "app.transfer.id.page",
    "text": "Copy Profile Link",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.f6a3dab2fa61",
    "scope": "app.transfer.id.page",
    "text": "Open Dashboard",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.8b1575320b31",
    "scope": "app.transfer.id.page",
    "text": "This transfer was cancelled.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.02adc8f89c56",
    "scope": "app.transfer.id.page",
    "text": "The current owner needs to create a new transfer link before this instrument can be handed off.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.0da9392c3f27",
    "scope": "app.transfer.id.page",
    "text": "Sign in to accept ownership.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.33706bc1fbce",
    "scope": "app.transfer.id.page",
    "text": "Create an account or sign in with the recipient email on this transfer. Then return to this transfer link to accept it.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.798ca2ce18bf",
    "scope": "app.transfer.id.page",
    "text": "Create account",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.730cc4aa8fa6",
    "scope": "app.transfer.id.page",
    "text": "Ready to accept.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.cf41c2f3aef3",
    "scope": "app.transfer.id.page",
    "text": "Accepting transfers ownership of this QRguitar Profile to your signed-in account. The permanent QR URL stays unchanged.",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.31409c77894f",
    "scope": "app.transfer.id.page",
    "text": "Accepting...",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.8441cefbd0ef",
    "scope": "app.transfer.id.page",
    "text": "Accept Ownership",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.d52572393b42",
    "scope": "app.transfer.id.page",
    "text": "Preview Profile First",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.app.transfer.id.page.a5e2e77428e7",
    "scope": "app.transfer.id.page",
    "text": "Reload transfer status",
    "page": "Ownership Transfers",
    "area": "Product",
    "section": "Page text",
    "source": "app/transfer/[id]/page.tsx"
  },
  {
    "key": "ui.components.ActionDrawer.1c1587ee93e7",
    "scope": "components.ActionDrawer",
    "text": "Close profile actions",
    "page": "Action Drawer",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/ActionDrawer.tsx"
  },
  {
    "key": "ui.components.AdminWorkspaceGate.33b14c935c51",
    "scope": "components.AdminWorkspaceGate",
    "text": "QRguitar homepage",
    "page": "Admin Workspace Gate",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/AdminWorkspaceGate.tsx"
  },
  {
    "key": "ui.components.AdminWorkspaceGate.1300ecbecd41",
    "scope": "components.AdminWorkspaceGate",
    "text": "Admin workspace",
    "page": "Admin Workspace Gate",
    "area": "Global",
    "section": "Page text",
    "source": "components/AdminWorkspaceGate.tsx"
  },
  {
    "key": "ui.components.AdminWorkspaceGate.bfd402b2f6f3",
    "scope": "components.AdminWorkspaceGate",
    "text": "Sign in",
    "page": "Admin Workspace Gate",
    "area": "Global",
    "section": "Page text",
    "source": "components/AdminWorkspaceGate.tsx"
  },
  {
    "key": "ui.components.AdminWorkspaceGate.08c6bd357b7d",
    "scope": "components.AdminWorkspaceGate",
    "text": "Signing out…",
    "page": "Admin Workspace Gate",
    "area": "Global",
    "section": "Page text",
    "source": "components/AdminWorkspaceGate.tsx"
  },
  {
    "key": "ui.components.AdminWorkspaceGate.897c73053d5d",
    "scope": "components.AdminWorkspaceGate",
    "text": "Sign out and sign in again",
    "page": "Admin Workspace Gate",
    "area": "Global",
    "section": "Page text",
    "source": "components/AdminWorkspaceGate.tsx"
  },
  {
    "key": "ui.components.AdminWorkspaceGate.d8b8392e2c54",
    "scope": "components.AdminWorkspaceGate",
    "text": "Try again",
    "page": "Admin Workspace Gate",
    "area": "Global",
    "section": "Page text",
    "source": "components/AdminWorkspaceGate.tsx"
  },
  {
    "key": "ui.components.AdminWorkspaceGate.1bb548bc8507",
    "scope": "components.AdminWorkspaceGate",
    "text": "Return to dashboard",
    "page": "Admin Workspace Gate",
    "area": "Global",
    "section": "Page text",
    "source": "components/AdminWorkspaceGate.tsx"
  },
  {
    "key": "ui.components.AdminWorkspaceGate.723e1c99cb42",
    "scope": "components.AdminWorkspaceGate",
    "text": "Back to QRguitar",
    "page": "Admin Workspace Gate",
    "area": "Global",
    "section": "Page text",
    "source": "components/AdminWorkspaceGate.tsx"
  },
  {
    "key": "ui.components.BrandLogo.c5eb5d7d6633",
    "scope": "components.BrandLogo",
    "text": "QRguitar logo",
    "page": "Brand Logo",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/BrandLogo.tsx"
  },
  {
    "key": "ui.components.BrandLogo.1a32cd5a3a29",
    "scope": "components.BrandLogo",
    "text": "QRguitar",
    "page": "Brand Logo",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/BrandLogo.tsx"
  },
  {
    "key": "ui.components.BrandLogo.a439fba430a3",
    "scope": "components.BrandLogo",
    "text": "QR",
    "page": "Brand Logo",
    "area": "Global",
    "section": "Page text",
    "source": "components/BrandLogo.tsx"
  },
  {
    "key": "ui.components.BrandLogo.d081f5e40298",
    "scope": "components.BrandLogo",
    "text": "guitar",
    "page": "Brand Logo",
    "area": "Global",
    "section": "Page text",
    "source": "components/BrandLogo.tsx"
  },
  {
    "key": "ui.components.BulkImportWorkspace.01916f7252b9",
    "scope": "components.BulkImportWorkspace",
    "text": "Bulk Import",
    "page": "Bulk Import Workspace",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkImportWorkspace.tsx"
  },
  {
    "key": "ui.components.BulkImportWorkspace.1c7215c1acc2",
    "scope": "components.BulkImportWorkspace",
    "text": "Opening your inventory workspace...",
    "page": "Bulk Import Workspace",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkImportWorkspace.tsx"
  },
  {
    "key": "ui.components.BulkImportWorkspace.832fd327544b",
    "scope": "components.BulkImportWorkspace",
    "text": "Owner tools",
    "page": "Bulk Import Workspace",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkImportWorkspace.tsx"
  },
  {
    "key": "ui.components.BulkImportWorkspace.96812e83690f",
    "scope": "components.BulkImportWorkspace",
    "text": "Sign in to import inventory.",
    "page": "Bulk Import Workspace",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkImportWorkspace.tsx"
  },
  {
    "key": "ui.components.BulkImportWorkspace.897a89da498c",
    "scope": "components.BulkImportWorkspace",
    "text": "Bulk Import creates private QRguitar Profiles inside your owner workspace.",
    "page": "Bulk Import Workspace",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkImportWorkspace.tsx"
  },
  {
    "key": "ui.components.BulkImportWorkspace.bfd402b2f6f3",
    "scope": "components.BulkImportWorkspace",
    "text": "Sign in",
    "page": "Bulk Import Workspace",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkImportWorkspace.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.ad09774ce854",
    "scope": "components.BulkProfileImport",
    "text": "Sign in to restore your import.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Feedback",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.36cc5092f659",
    "scope": "components.BulkProfileImport",
    "text": "This browser cannot coordinate import drafts safely. Open QRguitar in a browser with Web Locks support to continue your saved import.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Feedback",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.f94bbd4e2aaa",
    "scope": "components.BulkProfileImport",
    "text": "An earlier request needs confirmation. Retry to check it before continuing.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Feedback",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.f3d830ae925f",
    "scope": "components.BulkProfileImport",
    "text": "Your saved import is ready to continue.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Feedback",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.e9fa2efddcc0",
    "scope": "components.BulkProfileImport",
    "text": "An older import draft is still saved in this browser. It cannot be resumed safely because it has no account or request identifiers. Review your collection before starting a replacement import.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Feedback",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.788866ad1f08",
    "scope": "components.BulkProfileImport",
    "text": "This tab could not open the import workspace. Reload to retry.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Feedback",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.315f32f55f51",
    "scope": "components.BulkProfileImport",
    "text": "Choose a CSV or TSV file smaller than 2 MB.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Feedback",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.1891003f33d2",
    "scope": "components.BulkProfileImport",
    "text": "{{value1}}: {{value2}} row{{value3}} reviewed.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Feedback",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.d1ce349f4ee9",
    "scope": "components.BulkProfileImport",
    "text": "{{value1}} rows reviewed. {{value2}} ready.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Feedback",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.756c43ace059",
    "scope": "components.BulkProfileImport",
    "text": "Paste a header row and at least one instrument row.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Feedback",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.9cf37a46f24e",
    "scope": "components.BulkProfileImport",
    "text": "Preview could not be completed. Retry.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Feedback",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.c5d512d8bc14",
    "scope": "components.BulkProfileImport",
    "text": "Fix the highlighted rows before creating Profiles.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Feedback",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.aaac9654580c",
    "scope": "components.BulkProfileImport",
    "text": "{{value1}} Profile{{value2}} created. Completed rows are saved; retry any remaining rows.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Feedback",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.35a1962baa23",
    "scope": "components.BulkProfileImport",
    "text": "Import stopped. Saved rows can be resumed safely.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Feedback",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.0fa5916a66ba",
    "scope": "components.BulkProfileImport",
    "text": "Column mapping updated. Review the rows before creating Profiles.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Feedback",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.01916f7252b9",
    "scope": "components.BulkProfileImport",
    "text": "Bulk Import",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.33d680f56e85",
    "scope": "components.BulkProfileImport",
    "text": "Copying template…",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.69bc70f7becd",
    "scope": "components.BulkProfileImport",
    "text": "Template copied.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.a906b8c86cc0",
    "scope": "components.BulkProfileImport",
    "text": "Could not copy automatically. Select and copy the template below.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.0adf88823e4b",
    "scope": "components.BulkProfileImport",
    "text": "Copyable import template",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.73065a710672",
    "scope": "components.BulkProfileImport",
    "text": "Bulk import template",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.185772fdfdfd",
    "scope": "components.BulkProfileImport",
    "text": "Import workflow",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.e70643644860",
    "scope": "components.BulkProfileImport",
    "text": "Add inventory",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.2778414273d9",
    "scope": "components.BulkProfileImport",
    "text": "Map columns",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.d14ebd741789",
    "scope": "components.BulkProfileImport",
    "text": "Review rows",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.3e8fd54e8e35",
    "scope": "components.BulkProfileImport",
    "text": "Create Private Profiles",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.f7c46329dcb1",
    "scope": "components.BulkProfileImport",
    "text": "1. Add inventory",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.be0f3406f789",
    "scope": "components.BulkProfileImport",
    "text": "Upload CSV/TSV or paste spreadsheet rows. Required: Brand, Model, Type, a Serial Number or explicit no-serial value, and a real photo URL.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.139e4dba0251",
    "scope": "components.BulkProfileImport",
    "text": "Choose CSV or TSV",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.1fb32101165a",
    "scope": "components.BulkProfileImport",
    "text": "Comma and tab delimiters are detected automatically.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.40caac83e202",
    "scope": "components.BulkProfileImport",
    "text": "Or paste spreadsheet rows",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.4dbb46fc867a",
    "scope": "components.BulkProfileImport",
    "text": "Load example",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.ae92c9f2f0fa",
    "scope": "components.BulkProfileImport",
    "text": "Map & preview rows",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.def70944c9bb",
    "scope": "components.BulkProfileImport",
    "text": "Creating...",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.eabc7445dbc1",
    "scope": "components.BulkProfileImport",
    "text": "Start new import",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.47ff1d8d9ef6",
    "scope": "components.BulkProfileImport",
    "text": "Column mapping",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.a9ee1dd2548f",
    "scope": "components.BulkProfileImport",
    "text": "Review detected headings",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.752c0e304f0c",
    "scope": "components.BulkProfileImport",
    "text": "Correct any heading before creating Profiles.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.0133a0192f49",
    "scope": "components.BulkProfileImport",
    "text": "Map {{value1}} column",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.5151f9e55ec2",
    "scope": "components.BulkProfileImport",
    "text": "Ignore column",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.62156aa9442a",
    "scope": "components.BulkProfileImport",
    "text": "ready /",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.11239872d178",
    "scope": "components.BulkProfileImport",
    "text": "total",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.63cdbf0ebd1d",
    "scope": "components.BulkProfileImport",
    "text": "Needs Attention",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.27cd21ba8e71",
    "scope": "components.BulkProfileImport",
    "text": "Bulk import results",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.95110d74c4c0",
    "scope": "components.BulkProfileImport",
    "text": "Row",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.29bf024f43da",
    "scope": "components.BulkProfileImport",
    "text": "Missing brand",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.fefe7f33d18d",
    "scope": "components.BulkProfileImport",
    "text": "Missing model",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.3bb8703eff27",
    "scope": "components.BulkProfileImport",
    "text": "Edit row {{value1}}",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.eeb091b0f05d",
    "scope": "components.BulkProfileImport",
    "text": "Row {{value1}} brand",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.090ed4316f1d",
    "scope": "components.BulkProfileImport",
    "text": "Brand",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.f33cdf26f0b0",
    "scope": "components.BulkProfileImport",
    "text": "Row {{value1}} model",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.5e2c614c23f0",
    "scope": "components.BulkProfileImport",
    "text": "Model",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.011f43f57b88",
    "scope": "components.BulkProfileImport",
    "text": "Row {{value1}} Serial Number",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.733b7358d78a",
    "scope": "components.BulkProfileImport",
    "text": "Serial Number or No Serial",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.5bcbc6403d90",
    "scope": "components.BulkProfileImport",
    "text": "Row {{value1}} type",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.baaddf70fb5d",
    "scope": "components.BulkProfileImport",
    "text": "Type",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.97e11dbd32a2",
    "scope": "components.BulkProfileImport",
    "text": "Row {{value1}} photo URL",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.80b025432964",
    "scope": "components.BulkProfileImport",
    "text": ": {{value1}}",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.96b49b37db1c",
    "scope": "components.BulkProfileImport",
    "text": "Open created Profile",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.f99c2f0fa023",
    "scope": "components.BulkProfileImport",
    "text": "Open existing Profile",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.f95735cf3428",
    "scope": "components.BulkProfileImport",
    "text": "Waiting to open this account’s import. Close its other import tab; saved progress will load here automatically.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.040a5f495622",
    "scope": "components.BulkProfileImport",
    "text": "Reload after resolving the storage issue; the saved draft has been kept.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.9e79ebbdd071",
    "scope": "components.BulkProfileImport",
    "text": "Retry confirms the original request. Keep this draft until its result is known.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.BulkProfileImport.ede0997eebfc",
    "scope": "components.BulkProfileImport",
    "text": "Import up to 50 rows per batch. Imported Profiles start Private, and Serial Numbers stay hidden unless show_serial explicitly says yes. Review each Profile before publishing it.",
    "page": "Bulk Profile Import",
    "area": "Global",
    "section": "Page text",
    "source": "components/BulkProfileImport.tsx"
  },
  {
    "key": "ui.components.CollectionInquiryForm.f5b9e421b518",
    "scope": "components.CollectionInquiryForm",
    "text": "Member message",
    "page": "Collection Inquiry Form",
    "area": "Global",
    "section": "Page text",
    "source": "components/CollectionInquiryForm.tsx"
  },
  {
    "key": "ui.components.CollectionInquiryForm.2f77668a9dfb",
    "scope": "components.CollectionInquiryForm",
    "text": "Message",
    "page": "Collection Inquiry Form",
    "area": "Global",
    "section": "Page text",
    "source": "components/CollectionInquiryForm.tsx"
  },
  {
    "key": "ui.components.CollectionInquiryForm.06e017302739",
    "scope": "components.CollectionInquiryForm",
    "text": "Ask about an instrument, availability, service, or a possible transfer. QRguitar relays the message while both email addresses stay private.",
    "page": "Collection Inquiry Form",
    "area": "Global",
    "section": "Page text",
    "source": "components/CollectionInquiryForm.tsx"
  },
  {
    "key": "ui.components.CollectionInquiryForm.427244f38501",
    "scope": "components.CollectionInquiryForm",
    "text": "Profile (optional)",
    "page": "Collection Inquiry Form",
    "area": "Global",
    "section": "Page text",
    "source": "components/CollectionInquiryForm.tsx"
  },
  {
    "key": "ui.components.CollectionInquiryForm.36f42bae0bbf",
    "scope": "components.CollectionInquiryForm",
    "text": "General collection inquiry",
    "page": "Collection Inquiry Form",
    "area": "Global",
    "section": "Page text",
    "source": "components/CollectionInquiryForm.tsx"
  },
  {
    "key": "ui.components.CollectionInquiryForm.97c4c42ae818",
    "scope": "components.CollectionInquiryForm",
    "text": "What would you like the owner, shop, or brand to know?",
    "page": "Collection Inquiry Form",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/CollectionInquiryForm.tsx"
  },
  {
    "key": "ui.components.CollectionInquiryForm.286a3af7348e",
    "scope": "components.CollectionInquiryForm",
    "text": "Sending...",
    "page": "Collection Inquiry Form",
    "area": "Global",
    "section": "Page text",
    "source": "components/CollectionInquiryForm.tsx"
  },
  {
    "key": "ui.components.CollectionInquiryForm.214ca7c74602",
    "scope": "components.CollectionInquiryForm",
    "text": "Send private inquiry",
    "page": "Collection Inquiry Form",
    "area": "Global",
    "section": "Page text",
    "source": "components/CollectionInquiryForm.tsx"
  },
  {
    "key": "ui.components.CollectionInquiryForm.bfd402b2f6f3",
    "scope": "components.CollectionInquiryForm",
    "text": "Sign in",
    "page": "Collection Inquiry Form",
    "area": "Global",
    "section": "Page text",
    "source": "components/CollectionInquiryForm.tsx"
  },
  {
    "key": "ui.components.CompactQr.817fa9875e3c",
    "scope": "components.CompactQr",
    "text": "QR code for {{value1}}",
    "page": "Compact Qr",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/CompactQr.tsx"
  },
  {
    "key": "ui.components.CompactQr.e13ef7af75b3",
    "scope": "components.CompactQr",
    "text": "QR preview unavailable; use the Profile link",
    "page": "Compact Qr",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/CompactQr.tsx"
  },
  {
    "key": "ui.components.CompactQr.a439fba430a3",
    "scope": "components.CompactQr",
    "text": "QR",
    "page": "Compact Qr",
    "area": "Global",
    "section": "Page text",
    "source": "components/CompactQr.tsx"
  },
  {
    "key": "ui.components.EditorTimelineEntry.f41419fb08be",
    "scope": "components.EditorTimelineEntry",
    "text": "Date unavailable",
    "page": "Editor Timeline Entry",
    "area": "Global",
    "section": "Page text",
    "source": "components/EditorTimelineEntry.tsx"
  },
  {
    "key": "ui.components.EditorTimelineEntry.591935b15b1c",
    "scope": "components.EditorTimelineEntry",
    "text": "Public",
    "page": "Editor Timeline Entry",
    "area": "Global",
    "section": "Page text",
    "source": "components/EditorTimelineEntry.tsx"
  },
  {
    "key": "ui.components.EditorTimelineEntry.c63eb6720c6e",
    "scope": "components.EditorTimelineEntry",
    "text": "Private",
    "page": "Editor Timeline Entry",
    "area": "Global",
    "section": "Page text",
    "source": "components/EditorTimelineEntry.tsx"
  },
  {
    "key": "ui.components.EditorTimelineEntry.fb10fb0165f6",
    "scope": "components.EditorTimelineEntry",
    "text": "Private:",
    "page": "Editor Timeline Entry",
    "area": "Global",
    "section": "Page text",
    "source": "components/EditorTimelineEntry.tsx"
  },
  {
    "key": "ui.components.EditorTimelineEntry.d83dfbcb6ec0",
    "scope": "components.EditorTimelineEntry",
    "text": "Edit Entry",
    "page": "Editor Timeline Entry",
    "area": "Global",
    "section": "Page text",
    "source": "components/EditorTimelineEntry.tsx"
  },
  {
    "key": "ui.components.EditorTimelineEntry.41bb004dc509",
    "scope": "components.EditorTimelineEntry",
    "text": "Delete Entry",
    "page": "Editor Timeline Entry",
    "area": "Global",
    "section": "Page text",
    "source": "components/EditorTimelineEntry.tsx"
  },
  {
    "key": "ui.components.Footer.76363a64dcfa",
    "scope": "components.Footer",
    "text": "Footer navigation",
    "page": "Footer",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/Footer.tsx"
  },
  {
    "key": "ui.components.Footer.0436231679a0",
    "scope": "components.Footer",
    "text": "Signing out...",
    "page": "Footer",
    "area": "Global",
    "section": "Page text",
    "source": "components/Footer.tsx"
  },
  {
    "key": "ui.components.Footer.d0527e4b3d65",
    "scope": "components.Footer",
    "text": "Logout",
    "page": "Footer",
    "area": "Global",
    "section": "Page text",
    "source": "components/Footer.tsx"
  },
  {
    "key": "ui.components.Footer.9d6322c1f4d9",
    "scope": "components.Footer",
    "text": "Login",
    "page": "Footer",
    "area": "Global",
    "section": "Page text",
    "source": "components/Footer.tsx"
  },
  {
    "key": "ui.components.Footer.7f508ae575ac",
    "scope": "components.Footer",
    "text": ": support@qrguitar.com",
    "page": "Footer",
    "area": "Global",
    "section": "Page text",
    "source": "components/Footer.tsx"
  },
  {
    "key": "ui.components.HomePageClient.bec4c56fb4cb",
    "scope": "components.HomePageClient",
    "text": "What stays with your instrument",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.ecbcf256c14d",
    "scope": "components.HomePageClient",
    "text": "One permanent identity",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.bc615fcc90ab",
    "scope": "components.HomePageClient",
    "text": "The same Profile. Every chapter.",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.eb341bf13357",
    "scope": "components.HomePageClient",
    "text": "Your privacy, your choice",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.a4c1dff0c2e1",
    "scope": "components.HomePageClient",
    "text": "Public, unlisted, or just for you.",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.f5ab906e49d7",
    "scope": "components.HomePageClient",
    "text": "A history that carries forward",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.104c2472352a",
    "scope": "components.HomePageClient",
    "text": "Service and ownership, connected.",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.72cdbf43eb3a",
    "scope": "components.HomePageClient",
    "text": "PUBLIC PROFILES",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.3b67d76945bd",
    "scope": "components.HomePageClient",
    "text": "See what's already documented.",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.5c75e88902f3",
    "scope": "components.HomePageClient",
    "text": "Browse real QRguitar Profiles from the public Catalog.",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.025320721b82",
    "scope": "components.HomePageClient",
    "text": "View all Profiles",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.230cdd8c2e80",
    "scope": "components.HomePageClient",
    "text": "Explore additional QRguitar Profiles",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.4c90147fd5f7",
    "scope": "components.HomePageClient",
    "text": "A QRguitar Profile keeps the instrument and its history together",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.d28da756523e",
    "scope": "components.HomePageClient",
    "text": "Documented {{value1}} in QRguitar",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.42ab3b00b1c2",
    "scope": "components.HomePageClient",
    "text": "A permanent identity for every instrument",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.8969d61bdcd8",
    "scope": "components.HomePageClient",
    "text": "One Profile",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.5545daa79d3d",
    "scope": "components.HomePageClient",
    "text": "Choose how you use QRguitar",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.cd7d731ce76a",
    "scope": "components.HomePageClient",
    "text": "See the workflow",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.34165e2cdda6",
    "scope": "components.HomePageClient",
    "text": "SERVICE & OWNERSHIP",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.b655c5fb6426",
    "scope": "components.HomePageClient",
    "text": "The history stays with the instrument.",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.9a4346833f50",
    "scope": "components.HomePageClient",
    "text": "Approved service and completed ownership transfers update the same Profile. The QRguitar ID and link do not change.",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.7bf7f24c48ad",
    "scope": "components.HomePageClient",
    "text": "See How It Works",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.b575d2660321",
    "scope": "components.HomePageClient",
    "text": "Start with one instrument.",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.9dae741a1b7c",
    "scope": "components.HomePageClient",
    "text": "Create the Profile now. Add the rest over time.",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.8088497eb587",
    "scope": "components.HomePageClient",
    "text": "Create a Profile",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomePageClient.004ca2d8b070",
    "scope": "components.HomePageClient",
    "text": "Explore the Catalog",
    "page": "Home Page Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomePageClient.tsx"
  },
  {
    "key": "ui.components.HomeProfileShowcase.44cebddc8ad6",
    "scope": "components.HomeProfileShowcase",
    "text": "Photos are currently unavailable",
    "page": "Home Profile Showcase",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomeProfileShowcase.tsx"
  },
  {
    "key": "ui.components.HomeProfileShowcase.1dd0ddc0cf78",
    "scope": "components.HomeProfileShowcase",
    "text": "QRguitar Profile ·",
    "page": "Home Profile Showcase",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomeProfileShowcase.tsx"
  },
  {
    "key": "ui.components.HomeProfileShowcase.55c64d0fcd6f",
    "scope": "components.HomeProfileShowcase",
    "text": "photo",
    "page": "Home Profile Showcase",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomeProfileShowcase.tsx"
  },
  {
    "key": "ui.components.HomeProfileShowcase.84a6dae49cf0",
    "scope": "components.HomeProfileShowcase",
    "text": "photos",
    "page": "Home Profile Showcase",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomeProfileShowcase.tsx"
  },
  {
    "key": "ui.components.HomeProfileShowcase.033eefff7069",
    "scope": "components.HomeProfileShowcase",
    "text": " available",
    "page": "Home Profile Showcase",
    "area": "Global",
    "section": "Page text",
    "source": "components/HomeProfileShowcase.tsx"
  },
  {
    "key": "ui.components.LatestPublicRecord.feef6ffa93b4",
    "scope": "components.LatestPublicRecord",
    "text": "Loading latest QRguitar Profile",
    "page": "Latest Public Record",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/LatestPublicRecord.tsx"
  },
  {
    "key": "ui.components.LatestPublicRecord.b4a345555f15",
    "scope": "components.LatestPublicRecord",
    "text": "Latest QRguitar Profile",
    "page": "Latest Public Record",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/LatestPublicRecord.tsx"
  },
  {
    "key": "ui.components.LatestPublicRecord.bf94b5d71589",
    "scope": "components.LatestPublicRecord",
    "text": "No public Profiles yet.",
    "page": "Latest Public Record",
    "area": "Global",
    "section": "Page text",
    "source": "components/LatestPublicRecord.tsx"
  },
  {
    "key": "ui.components.MessagesClient.050263ed6fbc",
    "scope": "components.MessagesClient",
    "text": "A message can include up to four photos or videos.",
    "page": "Messages Client",
    "area": "Global",
    "section": "Feedback",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.9c3b38b4c727",
    "scope": "components.MessagesClient",
    "text": "{{value1}} is not a supported image or video under 15 MB.",
    "page": "Messages Client",
    "area": "Global",
    "section": "Feedback",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.082e906c9e36",
    "scope": "components.MessagesClient",
    "text": "Write a message or attach a photo or video.",
    "page": "Messages Client",
    "area": "Global",
    "section": "Feedback",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.a3d34439a016",
    "scope": "components.MessagesClient",
    "text": "Message sent.",
    "page": "Messages Client",
    "area": "Global",
    "section": "Feedback",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.83f2c9bb85e1",
    "scope": "components.MessagesClient",
    "text": "{{value1}} Retry will use the same protected send operation.",
    "page": "Messages Client",
    "area": "Global",
    "section": "Feedback",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.a690f84ddf9a",
    "scope": "components.MessagesClient",
    "text": "Opening Messages",
    "page": "Messages Client",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.f2bb009c8d53",
    "scope": "components.MessagesClient",
    "text": "Loading your private conversations.",
    "page": "Messages Client",
    "area": "Global",
    "section": "Feedback",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.239303a784f1",
    "scope": "components.MessagesClient",
    "text": "Sign in to Messages",
    "page": "Messages Client",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.71bf7347acaa",
    "scope": "components.MessagesClient",
    "text": "Private conversations are available to signed-in QRguitar members.",
    "page": "Messages Client",
    "area": "Global",
    "section": "Feedback",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.bfd402b2f6f3",
    "scope": "components.MessagesClient",
    "text": "Sign in",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.5326173134ea",
    "scope": "components.MessagesClient",
    "text": "Messages are unavailable",
    "page": "Messages Client",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.d8b8392e2c54",
    "scope": "components.MessagesClient",
    "text": "Try again",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.3ec615683303",
    "scope": "components.MessagesClient",
    "text": "Private member conversations",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.04d7b4833927",
    "scope": "components.MessagesClient",
    "text": "Messages",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.a7aa5fa1de11",
    "scope": "components.MessagesClient",
    "text": "Connect with owners, stores, brands, builders, and repair professionals without exposing either member's email address. Conversation history stays available to both members.",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.249635fe58a8",
    "scope": "components.MessagesClient",
    "text": "Find members",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.18fdd549b2ed",
    "scope": "components.MessagesClient",
    "text": "New",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.799272298625",
    "scope": "components.MessagesClient",
    "text": " / {{value1}}",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.4efca0d10c5f",
    "scope": "components.MessagesClient",
    "text": "About",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.ae6ed6c2b574",
    "scope": "components.MessagesClient",
    "text": "{{value1}}{{value2}}",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.8c031eb3ebd3",
    "scope": "components.MessagesClient",
    "text": "Start the conversation.",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.9021d87e3048",
    "scope": "components.MessagesClient",
    "text": "Unread message",
    "page": "Messages Client",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.4c6806ae9de5",
    "scope": "components.MessagesClient",
    "text": "Your inbox is ready",
    "page": "Messages Client",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.482ca0d75627",
    "scope": "components.MessagesClient",
    "text": "Open a member page or public QRguitar Profile to start a private conversation.",
    "page": "Messages Client",
    "area": "Global",
    "section": "Feedback",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.1fbba5113528",
    "scope": "components.MessagesClient",
    "text": "Browse member collections",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.ba3bbbe10d8b",
    "scope": "components.MessagesClient",
    "text": "Loading…",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.cc4b4d7fdcea",
    "scope": "components.MessagesClient",
    "text": "Load older conversations",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.b8507b92eee1",
    "scope": "components.MessagesClient",
    "text": "Loading earlier messages…",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.33fd46b9e779",
    "scope": "components.MessagesClient",
    "text": "Load earlier messages",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.e5e09a778387",
    "scope": "components.MessagesClient",
    "text": "Start the conversation",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.fb2b2f0b47af",
    "scope": "components.MessagesClient",
    "text": "Ask a focused question about the Profile, availability, service, or a potential transfer.",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.839d6deea6a7",
    "scope": "components.MessagesClient",
    "text": "Open {{value1}}",
    "page": "Messages Client",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.cf3948a413e9",
    "scope": "components.MessagesClient",
    "text": "Your browser cannot play this video.",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.2f77668a9dfb",
    "scope": "components.MessagesClient",
    "text": "Message",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.577c10d6f210",
    "scope": "components.MessagesClient",
    "text": "Message {{value1}}",
    "page": "Messages Client",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.d2f6b9b77710",
    "scope": "components.MessagesClient",
    "text": "Remove {{value1}}",
    "page": "Messages Client",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.d5d5d266ceab",
    "scope": "components.MessagesClient",
    "text": "Add media",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.286a3af7348e",
    "scope": "components.MessagesClient",
    "text": "Sending...",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.6bc12f1358f6",
    "scope": "components.MessagesClient",
    "text": "Retry send",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.f6f4688ff23d",
    "scope": "components.MessagesClient",
    "text": "Send",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.9e9c59e21685",
    "scope": "components.MessagesClient",
    "text": "Member and conversation details",
    "page": "Messages Client",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.1d8bddb65817",
    "scope": "components.MessagesClient",
    "text": "View member page",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.15bf74726c6b",
    "scope": "components.MessagesClient",
    "text": "Visit website",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.MessagesClient.980b3fdfd32e",
    "scope": "components.MessagesClient",
    "text": "Report a safety concern",
    "page": "Messages Client",
    "area": "Global",
    "section": "Page text",
    "source": "components/MessagesClient.tsx"
  },
  {
    "key": "ui.components.Nav.collections",
    "scope": "components.Nav",
    "text": "Collections",
    "page": "Nav",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/Nav.tsx"
  },
  {
    "key": "ui.components.Nav.33b14c935c51",
    "scope": "components.Nav",
    "text": "QRguitar homepage",
    "page": "Nav",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/Nav.tsx"
  },
  {
    "key": "ui.components.Nav.99904db30de4",
    "scope": "components.Nav",
    "text": "Close navigation",
    "page": "Nav",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/Nav.tsx"
  },
  {
    "key": "ui.components.Nav.0ed77fd2619b",
    "scope": "components.Nav",
    "text": "Open navigation",
    "page": "Nav",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/Nav.tsx"
  },
  {
    "key": "ui.components.Nav.e1bfe7eccc45",
    "scope": "components.Nav",
    "text": "Primary navigation",
    "page": "Nav",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/Nav.tsx"
  },
  {
    "key": "ui.components.Nav.7fb5995bca43",
    "scope": "components.Nav",
    "text": "Account menu",
    "page": "Nav",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/Nav.tsx"
  },
  {
    "key": "ui.components.Nav.7e1b0d5641f2",
    "scope": "components.Nav",
    "text": "Account",
    "page": "Nav",
    "area": "Global",
    "section": "Page text",
    "source": "components/Nav.tsx"
  },
  {
    "key": "ui.components.Nav.04d7b4833927",
    "scope": "components.Nav",
    "text": "Messages",
    "page": "Nav",
    "area": "Global",
    "section": "Page text",
    "source": "components/Nav.tsx"
  },
  {
    "key": "ui.components.Nav.a587aa1f4ffc",
    "scope": "components.Nav",
    "text": "Account settings",
    "page": "Nav",
    "area": "Global",
    "section": "Page text",
    "source": "components/Nav.tsx"
  },
  {
    "key": "ui.components.Nav.0436231679a0",
    "scope": "components.Nav",
    "text": "Signing out...",
    "page": "Nav",
    "area": "Global",
    "section": "Page text",
    "source": "components/Nav.tsx"
  },
  {
    "key": "ui.components.Nav.48f0d3d397d4",
    "scope": "components.Nav",
    "text": "Sign out",
    "page": "Nav",
    "area": "Global",
    "section": "Page text",
    "source": "components/Nav.tsx"
  },
  {
    "key": "ui.components.Nav.bfd402b2f6f3",
    "scope": "components.Nav",
    "text": "Sign in",
    "page": "Nav",
    "area": "Global",
    "section": "Page text",
    "source": "components/Nav.tsx"
  },
  {
    "key": "ui.components.OptionalTrackingConsent.fa1a9c947c79",
    "scope": "components.OptionalTrackingConsent",
    "text": "Privacy choices",
    "page": "Optional Tracking Consent",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/OptionalTrackingConsent.tsx"
  },
  {
    "key": "ui.components.OptionalTrackingConsent.06f0e210b27d",
    "scope": "components.OptionalTrackingConsent",
    "text": "Turn off",
    "page": "Optional Tracking Consent",
    "area": "Global",
    "section": "Page text",
    "source": "components/OptionalTrackingConsent.tsx"
  },
  {
    "key": "ui.components.OptionalTrackingConsent.20bd75748803",
    "scope": "components.OptionalTrackingConsent",
    "text": "Your browser could not save that choice. Optional tracking is off for this page.",
    "page": "Optional Tracking Consent",
    "area": "Global",
    "section": "Page text",
    "source": "components/OptionalTrackingConsent.tsx"
  },
  {
    "key": "ui.components.OptionalTrackingConsent.6633c9b4a1f3",
    "scope": "components.OptionalTrackingConsent",
    "text": "Optional tracking choices",
    "page": "Optional Tracking Consent",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/OptionalTrackingConsent.tsx"
  },
  {
    "key": "ui.components.OptionalTrackingConsent.b9f17c08f7b6",
    "scope": "components.OptionalTrackingConsent",
    "text": "Optional tracking is off. You can allow it here or keep it off.",
    "page": "Optional Tracking Consent",
    "area": "Global",
    "section": "Page text",
    "source": "components/OptionalTrackingConsent.tsx"
  },
  {
    "key": "ui.components.OptionalTrackingConsent.54a57c3147c4",
    "scope": "components.OptionalTrackingConsent",
    "text": "Privacy",
    "page": "Optional Tracking Consent",
    "area": "Global",
    "section": "Page text",
    "source": "components/OptionalTrackingConsent.tsx"
  },
  {
    "key": "ui.components.OptionalTrackingConsent.89713b9c9c1b",
    "scope": "components.OptionalTrackingConsent",
    "text": "Accept",
    "page": "Optional Tracking Consent",
    "area": "Global",
    "section": "Page text",
    "source": "components/OptionalTrackingConsent.tsx"
  },
  {
    "key": "ui.components.OptionalTrackingConsent.05a2d7332eb9",
    "scope": "components.OptionalTrackingConsent",
    "text": "Deny",
    "page": "Optional Tracking Consent",
    "area": "Global",
    "section": "Page text",
    "source": "components/OptionalTrackingConsent.tsx"
  },
  {
    "key": "ui.components.OptionalTrackingConsent.41a94e4f8462",
    "scope": "components.OptionalTrackingConsent",
    "text": "Keep off",
    "page": "Optional Tracking Consent",
    "area": "Global",
    "section": "Page text",
    "source": "components/OptionalTrackingConsent.tsx"
  },
  {
    "key": "ui.components.OwnerWorkspace.9346fd1d6596",
    "scope": "components.OwnerWorkspace",
    "text": "My collection",
    "page": "Owner Workspace",
    "area": "Global",
    "section": "Navigation and choices",
    "source": "components/OwnerWorkspace.tsx"
  },
  {
    "key": "ui.components.OwnerWorkspace.bb758aff6f87",
    "scope": "components.OwnerWorkspace",
    "text": "Create Profile",
    "page": "Owner Workspace",
    "area": "Global",
    "section": "Navigation and choices",
    "source": "components/OwnerWorkspace.tsx"
  },
  {
    "key": "ui.components.OwnerWorkspace.04d7b4833927",
    "scope": "components.OwnerWorkspace",
    "text": "Messages",
    "page": "Owner Workspace",
    "area": "Global",
    "section": "Navigation and choices",
    "source": "components/OwnerWorkspace.tsx"
  },
  {
    "key": "ui.components.OwnerWorkspace.59c347b7f7a7",
    "scope": "components.OwnerWorkspace",
    "text": "Service work",
    "page": "Owner Workspace",
    "area": "Global",
    "section": "Navigation and choices",
    "source": "components/OwnerWorkspace.tsx"
  },
  {
    "key": "ui.components.OwnerWorkspace.96bc5cd7d154",
    "scope": "components.OwnerWorkspace",
    "text": "Profile credits",
    "page": "Owner Workspace",
    "area": "Global",
    "section": "Navigation and choices",
    "source": "components/OwnerWorkspace.tsx"
  },
  {
    "key": "ui.components.OwnerWorkspace.7e1b0d5641f2",
    "scope": "components.OwnerWorkspace",
    "text": "Account",
    "page": "Owner Workspace",
    "area": "Global",
    "section": "Navigation and choices",
    "source": "components/OwnerWorkspace.tsx"
  },
  {
    "key": "ui.components.OwnerWorkspace.4d0260e6c3e7",
    "scope": "components.OwnerWorkspace",
    "text": "Your workspace",
    "page": "Owner Workspace",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/OwnerWorkspace.tsx"
  },
  {
    "key": "ui.components.OwnerWorkspace.004ca2d8b070",
    "scope": "components.OwnerWorkspace",
    "text": "Explore the Catalog",
    "page": "Owner Workspace",
    "area": "Global",
    "section": "Page text",
    "source": "components/OwnerWorkspace.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.d7c54b3b1ce7",
    "scope": "components.PhotoOrganizer",
    "text": "No photos added",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Page text",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.a73e7c9c2caf",
    "scope": "components.PhotoOrganizer",
    "text": "Add a clear full-instrument photo first, then detail, serial, condition, and case photos.",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Page text",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.4d0e02a0fca6",
    "scope": "components.PhotoOrganizer",
    "text": "Profile photo organizer",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.84a6dae49cf0",
    "scope": "components.PhotoOrganizer",
    "text": "photos",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Page text",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.6ab8e2b748a8",
    "scope": "components.PhotoOrganizer",
    "text": "Drag to reorder. The starred photo leads the Profile and Catalog card.",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Page text",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.14b29400712f",
    "scope": "components.PhotoOrganizer",
    "text": "Main photo",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Page text",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.f04fbba80f5f",
    "scope": "components.PhotoOrganizer",
    "text": "Instrument photo {{value1}}",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.eb814be3ca3b",
    "scope": "components.PhotoOrganizer",
    "text": "Main",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Page text",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.829f729dbe1d",
    "scope": "components.PhotoOrganizer",
    "text": "Drag photo {{value1}} to reorder",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.ef86a0ed9287",
    "scope": "components.PhotoOrganizer",
    "text": "Drag to reorder",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.daaaffa5d6f6",
    "scope": "components.PhotoOrganizer",
    "text": "Photo {{value1}} is the main photo",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.3fa930326917",
    "scope": "components.PhotoOrganizer",
    "text": "Set photo {{value1}} as main",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.d35820958872",
    "scope": "components.PhotoOrganizer",
    "text": "Set as main",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.83b5debd0495",
    "scope": "components.PhotoOrganizer",
    "text": "Remove photo {{value1}}",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.f46512ab2099",
    "scope": "components.PhotoOrganizer",
    "text": "Remove photo",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.2ad1142c1f1c",
    "scope": "components.PhotoOrganizer",
    "text": "Uploading {{value1}}%",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Page text",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.3cc3767e7032",
    "scope": "components.PhotoOrganizer",
    "text": "Uploaded",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Page text",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.6efc5d27f30b",
    "scope": "components.PhotoOrganizer",
    "text": "Upload failed",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Page text",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.c7dbb502bdce",
    "scope": "components.PhotoOrganizer",
    "text": "More options for photo {{value1}}",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.d47d7cb0e4f8",
    "scope": "components.PhotoOrganizer",
    "text": "More",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Page text",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.736612d4d0a9",
    "scope": "components.PhotoOrganizer",
    "text": "Move earlier",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Page text",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoOrganizer.d6e856081ebe",
    "scope": "components.PhotoOrganizer",
    "text": "Move later",
    "page": "Photo Organizer",
    "area": "Global",
    "section": "Page text",
    "source": "components/PhotoOrganizer.tsx"
  },
  {
    "key": "ui.components.PhotoViewer.bc7b631a689b",
    "scope": "components.PhotoViewer",
    "text": "Zoom out",
    "page": "Photo Viewer",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/PhotoViewer.tsx"
  },
  {
    "key": "ui.components.PhotoViewer.0e47f09a748f",
    "scope": "components.PhotoViewer",
    "text": "Zoom in",
    "page": "Photo Viewer",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/PhotoViewer.tsx"
  },
  {
    "key": "ui.components.PhotoViewer.a076bdea28fd",
    "scope": "components.PhotoViewer",
    "text": "Close photos",
    "page": "Photo Viewer",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/PhotoViewer.tsx"
  },
  {
    "key": "ui.components.PhotoViewer.d45c880eede6",
    "scope": "components.PhotoViewer",
    "text": "Zoom out of photo",
    "page": "Photo Viewer",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/PhotoViewer.tsx"
  },
  {
    "key": "ui.components.PhotoViewer.405d6e9235bb",
    "scope": "components.PhotoViewer",
    "text": "Zoom into photo",
    "page": "Photo Viewer",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/PhotoViewer.tsx"
  },
  {
    "key": "ui.components.PhotoViewer.49fba41bc3d1",
    "scope": "components.PhotoViewer",
    "text": "Loading photo…",
    "page": "Photo Viewer",
    "area": "Global",
    "section": "Page text",
    "source": "components/PhotoViewer.tsx"
  },
  {
    "key": "ui.components.PhotoViewer.2f55863e032e",
    "scope": "components.PhotoViewer",
    "text": "Previous photo",
    "page": "Photo Viewer",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/PhotoViewer.tsx"
  },
  {
    "key": "ui.components.PhotoViewer.894bb2b7ac07",
    "scope": "components.PhotoViewer",
    "text": "Next photo",
    "page": "Photo Viewer",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/PhotoViewer.tsx"
  },
  {
    "key": "ui.components.PhotoViewer.29afaa1f472b",
    "scope": "components.PhotoViewer",
    "text": "Choose a photograph",
    "page": "Photo Viewer",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/PhotoViewer.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.3a06720a52cb",
    "scope": "components.ProfileQuickEdit",
    "text": "Profile updated.",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Feedback",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.67524ea94ea8",
    "scope": "components.ProfileQuickEdit",
    "text": "Could not save Quick Edit changes.",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Feedback",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.d4e63f569f33",
    "scope": "components.ProfileQuickEdit",
    "text": "Quick Edit",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.a9e9f2e46b92",
    "scope": "components.ProfileQuickEdit",
    "text": "{{value1}} {{value2}}",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.4ee3c33fc702",
    "scope": "components.ProfileQuickEdit",
    "text": "Close Quick Edit",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.8d615ba766e1",
    "scope": "components.ProfileQuickEdit",
    "text": "Profile title",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.7448611d5f93",
    "scope": "components.ProfileQuickEdit",
    "text": "Visibility",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.591935b15b1c",
    "scope": "components.ProfileQuickEdit",
    "text": "Public",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.bc96567e77ca",
    "scope": "components.ProfileQuickEdit",
    "text": "Unlisted",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.c63eb6720c6e",
    "scope": "components.ProfileQuickEdit",
    "text": "Private",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.12f67f8539c4",
    "scope": "components.ProfileQuickEdit",
    "text": "Availability",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.323d22588945",
    "scope": "components.ProfileQuickEdit",
    "text": "Not for sale",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.aedf56fc02b4",
    "scope": "components.ProfileQuickEdit",
    "text": "For sale",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.39b36d38d6eb",
    "scope": "components.ProfileQuickEdit",
    "text": "Condition",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.ae7d8dfac9ff",
    "scope": "components.ProfileQuickEdit",
    "text": "Used",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.18fdd549b2ed",
    "scope": "components.ProfileQuickEdit",
    "text": "New",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.15b61974b270",
    "scope": "components.ProfileQuickEdit",
    "text": "Location",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.14b29400712f",
    "scope": "components.ProfileQuickEdit",
    "text": "Main photo",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.d84eebada93e",
    "scope": "components.ProfileQuickEdit",
    "text": "Photo",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.15ed202dfc23",
    "scope": "components.ProfileQuickEdit",
    "text": " (current)",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.ca6f44db47d0",
    "scope": "components.ProfileQuickEdit",
    "text": "Profile story",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.22765505d8f2",
    "scope": "components.ProfileQuickEdit",
    "text": "Show Serial Number on the public Profile",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.b281350e38d8",
    "scope": "components.ProfileQuickEdit",
    "text": "Hides only the serial field. The permanent QR ID and URL may still include the serial. Use private visibility to restrict access.",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.32cf4596244a",
    "scope": "components.ProfileQuickEdit",
    "text": "Lost / stolen status",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.d1af410eb4d0",
    "scope": "components.ProfileQuickEdit",
    "text": "No alert",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.3f1cf9ff5a13",
    "scope": "components.ProfileQuickEdit",
    "text": "Reported lost",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.f616a2b55136",
    "scope": "components.ProfileQuickEdit",
    "text": "Reported stolen",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.37ce0a91ee27",
    "scope": "components.ProfileQuickEdit",
    "text": "Recovered",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.5919565fba50",
    "scope": "components.ProfileQuickEdit",
    "text": "Public alert note",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.a6c8f92c19f4",
    "scope": "components.ProfileQuickEdit",
    "text": "QRguitar ID",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.f8eb11bf748c",
    "scope": "components.ProfileQuickEdit",
    "text": "and the permanent URL cannot be changed here.",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.19766ed6ccb2",
    "scope": "components.ProfileQuickEdit",
    "text": "Cancel",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.dc85af8f2b1d",
    "scope": "components.ProfileQuickEdit",
    "text": "Saving...",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.ProfileQuickEdit.c74a565b3fc9",
    "scope": "components.ProfileQuickEdit",
    "text": "Save Quick Edit",
    "page": "Profile Quick Edit",
    "area": "Global",
    "section": "Page text",
    "source": "components/ProfileQuickEdit.tsx"
  },
  {
    "key": "ui.components.PwaInstall.f171a98f8645",
    "scope": "components.PwaInstall",
    "text": "QRguitar, one tap away.",
    "page": "Pwa Install",
    "area": "Global",
    "section": "Page text",
    "source": "components/PwaInstall.tsx"
  },
  {
    "key": "ui.components.PwaInstall.f27c6dbee587",
    "scope": "components.PwaInstall",
    "text": "Add QRguitar to your device for quick access to your collection. Profiles and changes need an internet connection.",
    "page": "Pwa Install",
    "area": "Global",
    "section": "Page text",
    "source": "components/PwaInstall.tsx"
  },
  {
    "key": "ui.components.PwaInstall.50aaf88a0fed",
    "scope": "components.PwaInstall",
    "text": "Opening install…",
    "page": "Pwa Install",
    "area": "Global",
    "section": "Page text",
    "source": "components/PwaInstall.tsx"
  },
  {
    "key": "ui.components.PwaInstall.2bba98486f9b",
    "scope": "components.PwaInstall",
    "text": "Install QRguitar",
    "page": "Pwa Install",
    "area": "Global",
    "section": "Page text",
    "source": "components/PwaInstall.tsx"
  },
  {
    "key": "ui.components.PwaInstall.00c03664654c",
    "scope": "components.PwaInstall",
    "text": "Add to your Home Screen",
    "page": "Pwa Install",
    "area": "Global",
    "section": "Page text",
    "source": "components/PwaInstall.tsx"
  },
  {
    "key": "ui.components.PwaInstall.21e4bfef4e76",
    "scope": "components.PwaInstall",
    "text": "Open QRguitar in Safari, tap Share, then Add to Home Screen. If shown, keep Open as Web App on, then tap Add.",
    "page": "Pwa Install",
    "area": "Global",
    "section": "Page text",
    "source": "components/PwaInstall.tsx"
  },
  {
    "key": "ui.components.PwaInstall.d847e0376f46",
    "scope": "components.PwaInstall",
    "text": "If Add to Home Screen is missing, look under Edit Actions in the Share menu.",
    "page": "Pwa Install",
    "area": "Global",
    "section": "Page text",
    "source": "components/PwaInstall.tsx"
  },
  {
    "key": "ui.components.QrDownload.9500f9846391",
    "scope": "components.QrDownload",
    "text": "Open large QR preview",
    "page": "Qr Download",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.a439fba430a3",
    "scope": "components.QrDownload",
    "text": "QR",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.d6eafe823591",
    "scope": "components.QrDownload",
    "text": "Download",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.2f180e49010d",
    "scope": "components.QrDownload",
    "text": "Download unavailable",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.cf1aa6cc5951",
    "scope": "components.QrDownload",
    "text": "Preparing",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.7d9eb7acb13e",
    "scope": "components.QrDownload",
    "text": "Close",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.c6e3168391a9",
    "scope": "components.QrDownload",
    "text": "Customize QR",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.5ee3796350c7",
    "scope": "components.QrDownload",
    "text": "Open Print Suite",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.d8b8392e2c54",
    "scope": "components.QrDownload",
    "text": "Try again",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.f99f7962fd39",
    "scope": "components.QrDownload",
    "text": "QR appearance presets",
    "page": "Qr Download",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.3495e757855a",
    "scope": "components.QrDownload",
    "text": "White",
    "page": "Qr Download",
    "area": "Global",
    "section": "Navigation and choices",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.aac7e89fcd0e",
    "scope": "components.QrDownload",
    "text": "Transparent",
    "page": "Qr Download",
    "area": "Global",
    "section": "Navigation and choices",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.78e7771b8b46",
    "scope": "components.QrDownload",
    "text": "Orange",
    "page": "Qr Download",
    "area": "Global",
    "section": "Navigation and choices",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.df0fe79898ef",
    "scope": "components.QrDownload",
    "text": "Print",
    "page": "Qr Download",
    "area": "Global",
    "section": "Navigation and choices",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.2b8182617f0e",
    "scope": "components.QrDownload",
    "text": "Custom QR colors",
    "page": "Qr Download",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.40c995a68029",
    "scope": "components.QrDownload",
    "text": "QR Color",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.526957d2b9d2",
    "scope": "components.QrDownload",
    "text": "QR module color",
    "page": "Qr Download",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.ea2b8a878841",
    "scope": "components.QrDownload",
    "text": "Background",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.c99579c0abce",
    "scope": "components.QrDownload",
    "text": "QR background color",
    "page": "Qr Download",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.2d306eb2cde0",
    "scope": "components.QrDownload",
    "text": "QR label text",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.fdb5e68a9e01",
    "scope": "components.QrDownload",
    "text": "This text appears under the QR when label is enabled.",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.a050ee1a54b4",
    "scope": "components.QrDownload",
    "text": "Include instrument label under QR",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.6ddae7c01069",
    "scope": "components.QrDownload",
    "text": "Transparent export contains only the QR. Place it on a plain, contrasting background and keep the clear margin around every edge.",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.3310d3f61e2a",
    "scope": "components.QrDownload",
    "text": "QR preview",
    "page": "Qr Download",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.6a108d03b4ca",
    "scope": "components.QrDownload",
    "text": "QR Preview",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.9aa176d79653",
    "scope": "components.QrDownload",
    "text": "Close QR preview",
    "page": "Qr Download",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.c8a21e7587a0",
    "scope": "components.QrDownload",
    "text": "QR code preview",
    "page": "Qr Download",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QrDownload.c61867c5855b",
    "scope": "components.QrDownload",
    "text": "Download PNG",
    "page": "Qr Download",
    "area": "Global",
    "section": "Page text",
    "source": "components/QrDownload.tsx"
  },
  {
    "key": "ui.components.QRGuitarBotPopup.bb8b9d85ff91",
    "scope": "components.QRGuitarBotPopup",
    "text": "QRguitar Bot",
    "page": "QRGuitar Bot Popup",
    "area": "Global",
    "section": "Page text",
    "source": "components/QRGuitarBotPopup.tsx"
  },
  {
    "key": "ui.components.QRGuitarBotPopup.96c74b17d1a5",
    "scope": "components.QRGuitarBotPopup",
    "text": "QRguitar Bot panel",
    "page": "QRGuitar Bot Popup",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/QRGuitarBotPopup.tsx"
  },
  {
    "key": "ui.components.QRGuitarBotPopup.3f43a26121a6",
    "scope": "components.QRGuitarBotPopup",
    "text": "{{value1}}",
    "page": "QRGuitar Bot Popup",
    "area": "Global",
    "section": "Page text",
    "source": "components/QRGuitarBotPopup.tsx"
  },
  {
    "key": "ui.components.QRGuitarBotPopup.618a357c2013",
    "scope": "components.QRGuitarBotPopup",
    "text": "The Guitar Expert and Assistant",
    "page": "QRGuitar Bot Popup",
    "area": "Global",
    "section": "Page text",
    "source": "components/QRGuitarBotPopup.tsx"
  },
  {
    "key": "ui.components.QRGuitarBotPopup.6c0d836deacd",
    "scope": "components.QRGuitarBotPopup",
    "text": "Close bot",
    "page": "QRGuitar Bot Popup",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/QRGuitarBotPopup.tsx"
  },
  {
    "key": "ui.components.QRGuitarBotPopup.1810407f5ab7",
    "scope": "components.QRGuitarBotPopup",
    "text": "Quick actions",
    "page": "QRGuitar Bot Popup",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/QRGuitarBotPopup.tsx"
  },
  {
    "key": "ui.components.QRGuitarBotPopup.08b041935798",
    "scope": "components.QRGuitarBotPopup",
    "text": "You",
    "page": "QRGuitar Bot Popup",
    "area": "Global",
    "section": "Page text",
    "source": "components/QRGuitarBotPopup.tsx"
  },
  {
    "key": "ui.components.QRGuitarBotPopup.47a853b9f140",
    "scope": "components.QRGuitarBotPopup",
    "text": "Working on it...",
    "page": "QRGuitar Bot Popup",
    "area": "Global",
    "section": "Page text",
    "source": "components/QRGuitarBotPopup.tsx"
  },
  {
    "key": "ui.components.QRGuitarBotPopup.9b75d531cca3",
    "scope": "components.QRGuitarBotPopup",
    "text": "Ask QRguitar Bot",
    "page": "QRGuitar Bot Popup",
    "area": "Global",
    "section": "Page text",
    "source": "components/QRGuitarBotPopup.tsx"
  },
  {
    "key": "ui.components.QRGuitarBotPopup.533d3c40018a",
    "scope": "components.QRGuitarBotPopup",
    "text": "Ask about {{value1}} record...",
    "page": "QRGuitar Bot Popup",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/QRGuitarBotPopup.tsx"
  },
  {
    "key": "ui.components.QRGuitarBotPopup.c45085ed2eb2",
    "scope": "components.QRGuitarBotPopup",
    "text": "Ask a guitar, serial, setup, price, or record question",
    "page": "QRGuitar Bot Popup",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/QRGuitarBotPopup.tsx"
  },
  {
    "key": "ui.components.QRGuitarBotPopup.b8c209cdead6",
    "scope": "components.QRGuitarBotPopup",
    "text": "Ask",
    "page": "QRGuitar Bot Popup",
    "area": "Global",
    "section": "Page text",
    "source": "components/QRGuitarBotPopup.tsx"
  },
  {
    "key": "ui.components.RecordShareButton.51c51629c471",
    "scope": "components.RecordShareButton",
    "text": "Share Profile",
    "page": "Record Share Button",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/RecordShareButton.tsx"
  },
  {
    "key": "ui.components.RecordShareButton.d12860c21e78",
    "scope": "components.RecordShareButton",
    "text": "Link copied",
    "page": "Record Share Button",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecordShareButton.tsx"
  },
  {
    "key": "ui.components.RecordShareButton.19a4ee88b7e3",
    "scope": "components.RecordShareButton",
    "text": "Share opened",
    "page": "Record Share Button",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecordShareButton.tsx"
  },
  {
    "key": "ui.components.RecordShareButton.aab63f85c7f1",
    "scope": "components.RecordShareButton",
    "text": "Open link",
    "page": "Record Share Button",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecordShareButton.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.f45fc1dfdc96",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Field",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.5120e705e4b2",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Published revision",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.d02e3d1642cf",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Published snapshot SHA-256",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.ca1844969742",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Unavailable",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.eb00feffb3b5",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Draft revision",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.cad993370313",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Empty — no saved draft revision",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.9f03d34eb73f",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Shared draft",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.f941ca5b8cd2",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Present — publication is blocked",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.dc937b598926",
    "scope": "components.RecoveryCopyCorrection",
    "text": "None",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.fd1a535735a9",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Currently saved",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.f4a5811bd13d",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Restore this introduction",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.59804df893cb",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Approved introduction",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.aaffba64417d",
    "scope": "components.RecoveryCopyCorrection",
    "text": "A previous correction needs confirmation. Retry that same request first.",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Feedback",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.71fb849ec7a0",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Recovery storage is unavailable. Reload before making a change.",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Feedback",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.8b9e035960fe",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Review the authoritative saved introduction before publishing any change.",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Feedback",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.a3bb7ead4055",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Reading current published content and draft state…",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Feedback",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.1a2cc45a435d",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Only the introduction below will change. Save the raw backup and review both values.",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Feedback",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.209b2a74b727",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Could not load the review.",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Feedback",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.804d790a82c8",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Backup download prepared. Confirm you saved it and reviewed the introduction before continuing.",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Feedback",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.1d74897ba2e0",
    "scope": "components.RecoveryCopyCorrection",
    "text": "The backup download could not start. No change was sent.",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Feedback",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.524f615f6cc7",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Confirming the original request…",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Feedback",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.67764127fda3",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Publishing only the reviewed introduction…",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Feedback",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.a300dc0718c5",
    "scope": "components.RecoveryCopyCorrection",
    "text": "The result could not be confirmed. Retry the same request.",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Feedback",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.1d4c7ec8aae3",
    "scope": "components.RecoveryCopyCorrection",
    "text": "QRguitar home",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.a5af24c9f4f4",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Checking admin access",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.607a80121c65",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Sign in to continue",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.3a6573ba3009",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Your session expired",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.812fc8371083",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Admin access required",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.62e232ca1846",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Admin workspace unavailable",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.de9bb8feda72",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Confirming your session…",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.6eb2121fc2c3",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Opening the sign-in page…",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.e59df9499d3b",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Sign out of this expired session, then sign in again to continue.",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.005eb65d5e98",
    "scope": "components.RecoveryCopyCorrection",
    "text": "This account does not have access to this workspace.",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.c4c6859aef65",
    "scope": "components.RecoveryCopyCorrection",
    "text": "We couldn’t verify access right now. Please try again.",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.bfd402b2f6f3",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Sign in",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.08c6bd357b7d",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Signing out…",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.897c73053d5d",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Sign out and sign in again",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.8cda64dffe43",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Retry access check",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.1bb548bc8507",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Return to dashboard",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.1300ecbecd41",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Admin workspace",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.e145db962517",
    "scope": "components.RecoveryCopyCorrection",
    "text": "QRguitar Admin",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.c1c224b03cd9",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Admin",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.06c85ff37596",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Content Studio",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.454a2f1f26f9",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Content recovery",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.f5e7e725b4d9",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Password-reset introduction",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.c5a8bdb730c1",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Review one saved sentence without importing defaults or publishing a shared draft. Other saved content remains unchanged.",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.0f4cb195dc94",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Review saved introduction",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.925e2db79845",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Retry the same request",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.0e9d87919f79",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Review rollback",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.eab1eeffc8a9",
    "scope": "components.RecoveryCopyCorrection",
    "text": "The restoration record could not be downloaded. Retry the download.",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Feedback",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.1203d6838bcb",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Download restoration record",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.b2993ead56b7",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Download raw backup",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.95e883340c62",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Open password-reset page",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.ecc849ee139a",
    "scope": "components.RecoveryCopyCorrection",
    "text": "I saved the backup and reviewed this single-field change.",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.f41afacddad1",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Restore only this introduction",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.RecoveryCopyCorrection.5117dc6c0ea4",
    "scope": "components.RecoveryCopyCorrection",
    "text": "Publish only this introduction",
    "page": "Recovery Copy Correction",
    "area": "Global",
    "section": "Page text",
    "source": "components/RecoveryCopyCorrection.tsx"
  },
  {
    "key": "ui.components.SellerWebsiteLink.514b1ad00779",
    "scope": "components.SellerWebsiteLink",
    "text": "{{value1}}: {{value2}} ({{value3}}, opens in a new tab)",
    "page": "Seller Website Link",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/SellerWebsiteLink.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.4904a0d50cf7",
    "scope": "components.SiteCompositionEditor",
    "text": "{{value1}} section arrangement",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.783dc516d32b",
    "scope": "components.SiteCompositionEditor",
    "text": "Page sections",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.d557a972ab06",
    "scope": "components.SiteCompositionEditor",
    "text": "Arrange",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.4697ef322d1b",
    "scope": "components.SiteCompositionEditor",
    "text": "sections",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.bdb7f34c2678",
    "scope": "components.SiteCompositionEditor",
    "text": "Choose a section to manage its content. Drag to reorder, or use the arrow controls for precise placement.",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.a3405724636d",
    "scope": "components.SiteCompositionEditor",
    "text": "Drag {{value1}} to reorder",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.68857f555f0c",
    "scope": "components.SiteCompositionEditor",
    "text": "This section stays in its required position.",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.ccd456181b42",
    "scope": "components.SiteCompositionEditor",
    "text": "Drag to reorder. Use the arrow keys or move buttons for keyboard control.",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.93e9f40bff0d",
    "scope": "components.SiteCompositionEditor",
    "text": "Unnamed section",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.ee38dfaf5c5f",
    "scope": "components.SiteCompositionEditor",
    "text": "{{value1}} content {{value2}}",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.74de83b70ea6",
    "scope": "components.SiteCompositionEditor",
    "text": "Page copy and layout",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.6ba2a0e0afd0",
    "scope": "components.SiteCompositionEditor",
    "text": "Shown",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.7e6fefff0f0a",
    "scope": "components.SiteCompositionEditor",
    "text": "Hidden",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.740ebe32a73f",
    "scope": "components.SiteCompositionEditor",
    "text": "Move {{value1}} up",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.a1ae739bcef6",
    "scope": "components.SiteCompositionEditor",
    "text": "Move {{value1}} down",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.4850b174b713",
    "scope": "components.SiteCompositionEditor",
    "text": "Required",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.ac20a57bfde0",
    "scope": "components.SiteCompositionEditor",
    "text": "Hide",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.0df6f1cad36c",
    "scope": "components.SiteCompositionEditor",
    "text": "Show",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.aeb976353a17",
    "scope": "components.SiteCompositionEditor",
    "text": "Reset {{value1}}",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.7c0faddce9a7",
    "scope": "components.SiteCompositionEditor",
    "text": "Section name",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.f6514d2b3986",
    "scope": "components.SiteCompositionEditor",
    "text": "{{value1}} content items",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.c014c64b338c",
    "scope": "components.SiteCompositionEditor",
    "text": "Unnamed item",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.f59ab8d1331b",
    "scope": "components.SiteCompositionEditor",
    "text": "Untitled",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.d1a0b329a72b",
    "scope": "components.SiteCompositionEditor",
    "text": "Add item",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.4f98de363fa7",
    "scope": "components.SiteCompositionEditor",
    "text": "Edit {{value1}}",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Labels and help",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.abb8fd53815a",
    "scope": "components.SiteCompositionEditor",
    "text": "Selected item",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.a145120d719e",
    "scope": "components.SiteCompositionEditor",
    "text": "Item actions",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.c66feb5eb8f2",
    "scope": "components.SiteCompositionEditor",
    "text": "Move up",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.40bb50da160c",
    "scope": "components.SiteCompositionEditor",
    "text": "Move down",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.02cdaabfca80",
    "scope": "components.SiteCompositionEditor",
    "text": "Duplicate",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.c3812fc4acb8",
    "scope": "components.SiteCompositionEditor",
    "text": "Remove",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.70d5f430ca1e",
    "scope": "components.SiteCompositionEditor",
    "text": "Item name",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.b5a829ad13ef",
    "scope": "components.SiteCompositionEditor",
    "text": "Approved icon",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.7e8cd2056da7",
    "scope": "components.SiteCompositionEditor",
    "text": "Title",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.f96e28614336",
    "scope": "components.SiteCompositionEditor",
    "text": "Supporting copy",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.f21c1973ea84",
    "scope": "components.SiteCompositionEditor",
    "text": "Label / price",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.57a9536e074b",
    "scope": "components.SiteCompositionEditor",
    "text": "Button label",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.594d5f2b982b",
    "scope": "components.SiteCompositionEditor",
    "text": "CTA URL",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.7fdd310bf84a",
    "scope": "components.SiteCompositionEditor",
    "text": "List items",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.9b451cd0021d",
    "scope": "components.SiteCompositionEditor",
    "text": "One item per line.",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.57677897bcd3",
    "scope": "components.SiteCompositionEditor",
    "text": "This section uses the page's approved layout and copy fields.",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.27b448e5215c",
    "scope": "components.SiteCompositionEditor",
    "text": "This required section stays visible in its fixed position.",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.SiteCompositionEditor.5ce4a28799d5",
    "scope": "components.SiteCompositionEditor",
    "text": "You can still hide or reorder it.",
    "page": "Site Composition Editor",
    "area": "Global",
    "section": "Page text",
    "source": "components/SiteCompositionEditor.tsx"
  },
  {
    "key": "ui.components.StartConversation.c2ad2f8a287b",
    "scope": "components.StartConversation",
    "text": "The conversation could not be opened.",
    "page": "Start Conversation",
    "area": "Global",
    "section": "Feedback",
    "source": "components/StartConversation.tsx"
  },
  {
    "key": "ui.components.StartConversation.6117bce566e1",
    "scope": "components.StartConversation",
    "text": "Conversation unavailable",
    "page": "Start Conversation",
    "area": "Global",
    "section": "Page text",
    "source": "components/StartConversation.tsx"
  },
  {
    "key": "ui.components.StartConversation.2a8b850dadd9",
    "scope": "components.StartConversation",
    "text": "Opening conversation",
    "page": "Start Conversation",
    "area": "Global",
    "section": "Page text",
    "source": "components/StartConversation.tsx"
  },
  {
    "key": "ui.components.StartConversation.33b411810f73",
    "scope": "components.StartConversation",
    "text": "Creating a private QRguitar conversation.",
    "page": "Start Conversation",
    "area": "Global",
    "section": "Page text",
    "source": "components/StartConversation.tsx"
  },
  {
    "key": "ui.components.StartConversation.30f0846e225a",
    "scope": "components.StartConversation",
    "text": "Return to member page",
    "page": "Start Conversation",
    "area": "Global",
    "section": "Page text",
    "source": "components/StartConversation.tsx"
  },
  {
    "key": "ui.components.StartConversation.7ff385329889",
    "scope": "components.StartConversation",
    "text": "Open Messages",
    "page": "Start Conversation",
    "area": "Global",
    "section": "Page text",
    "source": "components/StartConversation.tsx"
  },
  {
    "key": "ui.components.UnavailablePage.33b14c935c51",
    "scope": "components.UnavailablePage",
    "text": "QRguitar homepage",
    "page": "Unavailable Page",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/UnavailablePage.tsx"
  },
  {
    "key": "ui.components.UnavailablePage.7b06d0dd6977",
    "scope": "components.UnavailablePage",
    "text": "Site navigation",
    "page": "Unavailable Page",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/UnavailablePage.tsx"
  },
  {
    "key": "ui.components.UnavailablePage.3877d14889a9",
    "scope": "components.UnavailablePage",
    "text": "Catalog",
    "page": "Unavailable Page",
    "area": "Global",
    "section": "Page text",
    "source": "components/UnavailablePage.tsx"
  },
  {
    "key": "ui.components.UnavailablePage.9f9feade761d",
    "scope": "components.UnavailablePage",
    "text": "Collections",
    "page": "Unavailable Page",
    "area": "Global",
    "section": "Page text",
    "source": "components/UnavailablePage.tsx"
  },
  {
    "key": "ui.components.WorkspaceActions.5b2a2c7763d2",
    "scope": "components.WorkspaceActions",
    "text": "Daily workspace tools",
    "page": "Workspace Actions",
    "area": "Global",
    "section": "Accessibility",
    "source": "components/WorkspaceActions.tsx"
  },
  {
    "key": "ui.components.WorkspaceActions.4af5dab92546",
    "scope": "components.WorkspaceActions",
    "text": "Tools for your day",
    "page": "Workspace Actions",
    "area": "Global",
    "section": "Page text",
    "source": "components/WorkspaceActions.tsx"
  },
  {
    "key": "ui.components.WorkspaceActions.be6bf5712015",
    "scope": "components.WorkspaceActions",
    "text": "Change workspace type",
    "page": "Workspace Actions",
    "area": "Global",
    "section": "Page text",
    "source": "components/WorkspaceActions.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.ade3e28bc653",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Privacy & Data",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.6914ba38bf46",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Request account deletion",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.cea974129f65",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Ask us to review removal of your personal information while preserving permanent instrument Profiles and factual history.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.e00f97d66b3c",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "This sends a request for review. Submitting it does not delete your account or personal information.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.ad202c3d2a9a",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Checking your request status…",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.05b1b03a62ae",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Sign in to review or manage your own deletion request.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.bfd402b2f6f3",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Sign in",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.85619e51261a",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Your signed-in account changed. Open the current account before continuing.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.b1c630f317ed",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Open current account",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.703768ef7366",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Confirming your request action…",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.fb77f71f37c4",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Request not confirmed",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.0f2d057ac075",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Cancellation not confirmed",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.ce678498e948",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Retry to finish or check the same action.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.3dbca56138ea",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Retry same submission",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.d0bc4f1c409d",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Retry same cancellation",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.366e6e4e1dd4",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Action reference",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.05863f5bcc2d",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Request recovery unavailable",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.bc07e3ed87b7",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Status is still available. Restore site storage access, then refresh before sending an action. If this continues,",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.d80b08242b0c",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "contact support",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.4f2273f73624",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Request received",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.7108183f1888",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Request cancelled",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.2d9e28289fac",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Requested",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.d353a99eb455",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Cancelled",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.7f8d29af322d",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Account writes are frozen and public content is hidden while the storage safety window drains{{value1}}. This request can no longer be cancelled.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.ad8878cbfeaf",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Database personal-information removal is complete and sign-in deletion is being reconciled. This request can no longer be cancelled.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.bebef336a8e6",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Your personal-information deletion request is awaiting review. The request preserves the direction to keep instrument history.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.fd56ab71296e",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "This deletion request is no longer active. No account or personal information was deleted by this request flow.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.28302fc68b7f",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Request reference",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.ba315b2930f7",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "You have no recorded deletion request.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.c6869022ffb1",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Cancel deletion request",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.56028ffdcd1e",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Request another review",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.fb70d5541e6a",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Request deletion review",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.94b33ef05ab1",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Confirm your review request",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.1046a5651648",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Cancel this request?",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.00abec7b9ab5",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "You are asking for review of personal-information deletion while keeping instrument history. Submitting a request leaves your current account access unchanged.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.9e36292d48f8",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "This stops the selected review request. It does not restore or change account data.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.59f03d642b41",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Request",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.e03623406120",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "I want to request review of deleting my personal information while preserving instrument history.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.6a2ad5ceaaa7",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "I want to cancel this deletion request.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.629b254abba9",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Confirm review request",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.040f7f9e4c20",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Confirm cancellation",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.6aadac2f2b7a",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Go back",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.4279e5ed88f6",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Refreshing status…",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.442c4b893915",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Refresh status",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.574eb64ca776",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Refreshing checks status only.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.AccountDeletionSection.b72989690e0a",
    "scope": "lib.account.deletion.AccountDeletionSection",
    "text": "Retry sign-in check",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/AccountDeletionSection.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.70ce871f8a3d",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "record",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.043a718774c5",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "s",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.66cd6491b057",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Record values are withheld because this snapshot exceeds the verified inspection limit.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.48481e242cda",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "No retained records in this section.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.5a498918a0db",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Section content digest",
    "page": "Account deletion",
    "area": "Product",
    "section": "Labels and help",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.ba64516e5a32",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "← Back to Admin",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.acf74e7f56f3",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Privacy operations",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.e0886ce64b1e",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Deletion review requests",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.18a815f16b35",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Requests to remove personal information while preserving permanent instrument Profiles and factual history.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.bd0cb2e82c68",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Reviewed fulfillment",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.1517829393ad",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "pending request",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.3fd0c015741c",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "loaded · Newest first",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.4a7e52297640",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Current administrator access is required.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.8bed1f5655a8",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Checking queue…",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.e47e62c4d3c9",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Refresh queue",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.d5d21e3f82bb",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Checking the request queue…",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.622cf33c3166",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Sign in to view requests",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.f5d147fa9cbd",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Use your administrator account to continue.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.bfd402b2f6f3",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Sign in",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.031cc7a3ec82",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Administrator access required",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.1fb2001d0746",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "This account is not authorized to view the private intake queue.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.c47d6b0ab008",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Queue unavailable",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.73a0904b45be",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "A submitted request is not a deletion receipt. The safe check stops on paid credits, payment review, private storage, or unresolved workflows. A clear result anonymizes database identity, deletes Auth, and holds retained instrument Profiles private for a later custody review.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.123bcb8f0ec5",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Pending deletion review requests",
    "page": "Account deletion",
    "area": "Product",
    "section": "Accessibility",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.dcea8abbdff0",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Review request",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.2d9e28289fac",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Requested",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.28302fc68b7f",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Request reference",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.ecbb48b41cda",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Actor ID",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.25457a14ddcd",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Identity unlinked",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.6184efe974cb",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Requested at",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.3211345102f3",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Storage safety window",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.b87874ac2924",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Blocked safely",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.c37e58018b92",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Retry after",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.7fd49e35f7e8",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": ". The deadline is fixed and does not extend on retries.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.647eadc6ef7d",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Resolve this recorded blocker before retrying.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.73193db2cf68",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Database anonymization finished, but Auth deletion is not confirmed. Retry to reconcile; do not tell the customer deletion is complete.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.eb0a3c8af0e5",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Private file content reviews",
    "page": "Account deletion",
    "area": "Product",
    "section": "Accessibility",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.771b7556de8c",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Private file reviews",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.28391d3bc64e",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "of",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.8d3c6686ec30",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "decided",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.6b1e14c845a8",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Open each exact private file before deciding whether its bytes may remain. Storage paths and uploader identities stay server-only.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.3aaa74307be6",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "{{value1}} recorded",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.f0742e3a82fe",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Review required",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.2ac5fdc2439c",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Unknown media type",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.6d14357696d8",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Private file fingerprint",
    "page": "Account deletion",
    "area": "Product",
    "section": "Labels and help",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.3f7cb36b1e84",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Inspect exact private file",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.66d4fe335e69",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Authenticated byte-bound preview",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.437a78c91eef",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Private PDF content review",
    "page": "Account deletion",
    "area": "Product",
    "section": "Labels and help",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.a1cba07815a7",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Private file content under administrator review",
    "page": "Account deletion",
    "area": "Product",
    "section": "Accessibility",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.02c8763ec86d",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Inspect the entire visible file. The server also parses the container for hidden EXIF, XMP, PDF properties, embedded files, and active content before hashing it again.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.24faf4126596",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Delete required: QRguitar cannot safely retain original image-container bytes because they can carry information outside the visible picture.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.04fc8054c33e",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Delete required: {{value1}}. Retaining these bytes could preserve unseen personal information.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.36068c82a4cc",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "No hidden metadata or malformed container structure was detected.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.c33249fe7fa2",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Retain reviewed file",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.fcfb9f1ce896",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Delete reviewed file",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.53a3d292f5c3",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "The exact reviewed bytes are approved for private relocation.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.ef6b2990d100",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "The exact reviewed bytes are approved for durable deletion.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.336a8611bded",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Historically connected Profile reviews",
    "page": "Account deletion",
    "area": "Product",
    "section": "Accessibility",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.f8b66ceeae1b",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Profile privacy reviews",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.9599915bd8cd",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "confirmed",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.1c20f3320883",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Open each Profile, check the retained record for the departing account’s UUID and current email, then confirm only the fingerprint shown here.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.fe00b67b6dd1",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Confirmed",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.1b40c8a8412e",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Connections:",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.20a655bc39aa",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Content fingerprint",
    "page": "Account deletion",
    "area": "Product",
    "section": "Labels and help",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.79ed26bf6c98",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Inspect private Profile record",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.fb9b339294f8",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Private fingerprint-bound snapshot",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.0a30a815d67d",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Page",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.373e0712c83c",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "delivered",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.2843496ee746",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "This Profile exceeds the verified 500-record or 512 KiB review limit. Record values are withheld, each section’s count and digest remain visible, and confirmation is unavailable.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.76996cc8d457",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Review every nonempty section for personal information belonging to the departing account. This is the projected retained record; fulfillment separately removes the exact Auth UUID and current email. Secret keys and internal identity links are removed from this browser view.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.2537184286a8",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Previous review page",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.7b2de051c9d2",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Load next review page",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.70c8f283e664",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Load every fingerprint-bound page before final confirmation. Any record mutation changes the aggregate fingerprint and makes these page receipts stale.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.b17395fe87b8",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Evidence-backed custody claims",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.5ce49d461461",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Release only after matching every retained proof item to the verified claimant. Ownership changes now; the Profile stays private until the new owner chooses otherwise.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.fc084fe3730a",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "retained proof item",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.4a9f40ad4434",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Load current proof files",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.ccc39d8af4a6",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Ownership proof",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.f2811ff078a4",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Byte receipt recorded",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.64cc271734fe",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Inspection required",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.f7de21d9d0c9",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Inspect exact proof file",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.5762a7533cd2",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Private ownership proof review",
    "page": "Account deletion",
    "area": "Product",
    "section": "Labels and help",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.0c4ab83adab8",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Private ownership proof under administrator review",
    "page": "Account deletion",
    "area": "Product",
    "section": "Accessibility",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.6520efbc2ad8",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Inspect the entire proof. The server downloads and hashes it again before recording the receipt.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.6f3ade667d77",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Record exact proof review",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.00cdb657f4a5",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Proof page",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.f12b1f3a54ec",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "exact byte receipts recorded.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.18c7d7b2f027",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Previous proof page",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.55c09d8960f8",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Next proof page",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.b6ea7a97cc06",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Release custody to verified claimant",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.2ffe42377acf",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Every current proof file needs a matching byte receipt before release.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.3bc86da6ab5f",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Personal information to remove",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.5b5a788634ec",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "One exact name, email, address, or other identifying phrase per line",
    "page": "Account deletion",
    "area": "Product",
    "section": "Labels and help",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.91479541ead7",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Use exact personal phrases of at least 3 characters. Redaction changes retained records and requires a fresh inspection.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.3cfb3daca70b",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Redact listed terms",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.1485b3aa0922",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Confirm no additional personal information remains",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.5e0ed800b18c",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Retained history reviews",
    "page": "Account deletion",
    "area": "Product",
    "section": "Accessibility",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.3ca92dbcab24",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Confirm the exact immutable record set only after checking that it contains required factual history and no removable personal information.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.6c44539b5e1d",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Billing ledger",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.a734981c99b6",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Service history",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.61c7e7ef8b8a",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Inspect private",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.916db527a92d",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "billing ledger",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.db37e976e1ed",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "service history",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.72e583ef2538",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "This history exceeds the verified 500-record or 512 KiB review limit. Record values are withheld, each section’s count and digest remain visible, and confirmation is unavailable.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.12e8687e4e1b",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Review every nonempty section. Confirm only the factual records that must remain after the account identity is replaced by a private retention subject.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.c1245894bfe5",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Load every fingerprint-bound page before final confirmation. Any record mutation makes all prior page receipts stale.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.eebdd24a77d9",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Confirm",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.8f76728c2a79",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "lawful billing retention",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.ecee7fbfc923",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "privacy-safe service history",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.3c3d1dcd02e8",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Checking safely…",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.3f7b01e01def",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Rescan after deadline",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.be1241ad5531",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Run fulfillment check",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.69fcd7804f31",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Review and fulfill",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.883a9f47c79e",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "No pending requests",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.6cf14d881488",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "No active review requests were returned by the latest successful check.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.5de2ff742877",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Older requests may still be available.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.a45cc2e6dbb9",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Loading older requests…",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.ac318011a661",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "Load older requests",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  },
  {
    "key": "ui.lib.account.deletion.admin.ui.AdminIntakeQueue.b51e0cc09ff6",
    "scope": "lib.account.deletion.admin.ui.AdminIntakeQueue",
    "text": "End of the loaded queue. Refresh to check for new or cancelled requests.",
    "page": "Account deletion",
    "area": "Product",
    "section": "Page text",
    "source": "lib/account-deletion/admin-ui/AdminIntakeQueue.tsx"
  }
];
