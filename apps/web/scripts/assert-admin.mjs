import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const page = read("app/admin/page.tsx");
const styles = read("app/globals.css");
const usersApi = read("app/api/admin/users/[id]/route.ts");
const recordsApi = read("app/api/admin/records/[id]/route.ts");
const claimsApi = read("app/api/ownership-claims/route.ts");
const overviewApi = read("app/api/admin/overview/route.ts");
const recordsListApi = read("app/api/admin/records/route.ts");
const serviceOperations = read("app/admin/service-workflow/page.tsx");
const paymentOperations = read("app/admin/payments/AdminPaymentsPage.tsx");

if (page.includes("window.prompt")) throw new Error("Admin still uses browser prompts.");
for (const marker of ["admin-command-bar", "admin-sidebar", "admin-entity-drawer", 'kind: "claim"', 'kind: "transfer"', "Operator reason", "System Health"]) {
  if (!page.includes(marker)) throw new Error(`Admin command center is missing ${marker}.`);
}
for (const marker of ["aria-controls=\"admin-primary-navigation\"", "aria-expanded={navOpen}", "focusableSelector", 'event.key === "Escape"', 'document.body.style.overflow = "hidden"', "returnFocus.focus()"]) {
  if (!page.includes(marker)) throw new Error(`Admin responsive accessibility is missing ${marker}.`);
}
for (const marker of ["@media (max-width: 1099px)", ".admin-shell { display: block; width: 100%; }", ".admin-sidebar.is-open { transform: none; }"]) {
  if (!styles.includes(marker)) throw new Error(`Admin responsive shell is missing ${marker}.`);
}
for (const api of [usersApi, recordsApi]) {
  if (!api.includes("An operator reason is required for the audit trail.")) throw new Error("Admin mutation API does not enforce an operator reason.");
  if (!api.includes("logAdminAuditEvent")) throw new Error("Admin mutation API does not write an audit event.");
}
for (const marker of ["You cannot remove your own admin access", "At least one admin must remain", "environment-managed admin"]) {
  if (!usersApi.includes(marker)) throw new Error(`User protection is missing ${marker}.`);
}
if (!claimsApi.includes("An operator reason is required for the audit trail.")) throw new Error("Ownership-claim admin decisions do not require a reason.");
const overviewExcludesProfileCreated =
  overviewApi.includes('query = query.neq(column, value)') &&
  overviewApi.includes('[["event_type", "profile_created"]]');
if (!overviewExcludesProfileCreated || !recordsListApi.includes('neq("event_type", "profile_created")')) {
  throw new Error("Service History still includes Profile-created timeline events.");
}

const origin = process.env.QRGUITAR_TEST_ORIGIN || "http://127.0.0.1:3003";
for (const endpoint of ["/api/admin/overview", "/api/admin/users", "/api/admin/records"]) {
  const response = await fetch(`${origin}${endpoint}`, { cache: "no-store" });
  if (![401, 403].includes(response.status)) throw new Error(`Unauthenticated ${endpoint} returned ${response.status}.`);
}
for (const marker of ["Permanent account deletion unavailable", "ACCOUNT_DELETION_UNAVAILABLE", 'aria-describedby="admin-deletion-unavailable"']) {
  if (!page.includes(marker)) throw new Error(`Admin permanent deletion safeguards are missing ${marker}.`);
}
for (const marker of [
  "readAdminSession()",
  "onAuthStateChange",
  "adminLoadRevision.current",
  "setSelectedUser((current)",
  "setSelectedRecord((current)",
  "nextClaimsError",
  'role="alert">{claimsError}',
  'loadAdmin({ successMessage: resultMessage })',
  'disabled={Boolean(busy) || !pendingAction.reason.trim()',
  'goToSection("users", "", { search: transfer.fromOwnerEmail',
  'goToSection("users", "", { search: transfer.acceptedByEmail',
  'filterControls("proof")',
  'filterControls("service")'
]) {
  if (!page.includes(marker)) throw new Error(`Admin state and failure handling is missing ${marker}.`);
}
if (page.includes("tokenPromise")) throw new Error("Admin still caches one access token for the page lifetime.");
for (const marker of [
  "beginAdminRoleChange(accessTarget)",
  "beginAdminRoleChange(user)",
  "beginAdminRoleChange(selectedUser)",
  "Role after removing admin access",
  '<option value="builder">Builder</option>',
  '<option value="shop">Service Shop</option>'
]) {
  if (!page.includes(marker)) throw new Error(`Admin access changes can bypass confirmation: ${marker}.`);
}
for (const marker of ["unavailableSources", "Counts and lists were not replaced with incomplete results", "Trust states were not replaced with default values"]) {
  if (!recordsListApi.includes(marker)) throw new Error(`Admin record reads can conceal partial failures: ${marker}.`);
}
for (const marker of ["onAuthStateChange", "loadRevision.current", "finally", "successMessage", "The signed-in account changed", 'type LoadPhase = "loading" | "signed-out" | "unauthorized" | "error" | "ready"', "Retry access", "Try again", 'href={`/edit/${encodeURIComponent(submission.qrCode)}`}']) {
  if (!serviceOperations.includes(marker)) throw new Error(`Service Operations failure handling is missing ${marker}.`);
}
for (const marker of ["Legacy manual-payment archive", "New QRguitar checkout uses automatic PayPal verification", "<details"]) {
  if (!paymentOperations.includes(marker)) throw new Error(`Legacy payment controls are not clearly separated: ${marker}.`);
}
for (const marker of [
  "isSafeBrandLogoUrl",
  "if (!isSafeBrandLogoUrl(url))",
  "Use an HTTPS URL or a site-relative path beginning with one slash.",
  'type AdminAccessState = "checking" | "authorized" | "unauthorized" | "unavailable"',
  "setAdminAccessState(overviewAuthorized",
  "setAdminDataReady(coreReady)",
  "Retry admin access",
  "Retry admin data",
  "Admin is temporarily unavailable.",
  "let confirmed = false",
  "if (confirmed) setPendingAction(null)",
  '{message ? <div className="admin-message" role="alert">{message}</div> : null}',
  'overlayKind = adminAuthorized && adminDataReady ?',
  "adminAuthorized && adminDataReady && navOpen ?",
  "adminAuthorized && adminDataReady && selectedUser",
  "adminAuthorized && adminDataReady && pendingAction",
  "window.innerWidth >= 1100",
  'window.addEventListener("resize", closeDesktopNavigation)',
  'if (overlayKind === "modal" && busyRef.current) return',
  "No Profiles match this trust view.",
  "No Profiles match this safety view."
]) {
  if (!page.includes(marker)) throw new Error(`Final admin reliability audit is missing ${marker}.`);
}
if (page.includes(String.raw`/^(https?:\/\/|\/)/i`)) throw new Error("Admin brand-logo validation still uses its old URL regex instead of the shared safety rule.");
if (page.includes("Owner command center") || page.includes("Owner access")) throw new Error("Admin chrome still uses stale owner-only wording.");
const confirmStart = page.indexOf("async function confirmPendingAction()");
const confirmEnd = page.indexOf("const filteredUsers", confirmStart);
const confirmFlow = page.slice(confirmStart, confirmEnd);
if (!confirmFlow.includes("confirmed = await updateUser") || !confirmFlow.includes("confirmed = await updateRecord") || !confirmFlow.includes("confirmed = await updateTransfer") || !confirmFlow.includes("confirmed = await updateOwnershipClaim")) {
  throw new Error("Admin confirmation modal does not wait for a confirmed mutation result.");
}
const coreFailureStart = page.indexOf("if (!coreReady) {");
const coreFailureEnd = page.indexOf("const responseMessage", coreFailureStart);
const coreFailureFlow = page.slice(coreFailureStart, coreFailureEnd);
for (const marker of ["setNavOpen(false)", "setSelectedUser(null)", "setSelectedRecord(null)", "setPendingAction(null)"]) {
  if (!coreFailureFlow.includes(marker)) throw new Error(`Incomplete admin data does not clear ${marker}.`);
}
console.log("Admin assertions passed.");
