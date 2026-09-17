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
console.log("Admin assertions passed.");
