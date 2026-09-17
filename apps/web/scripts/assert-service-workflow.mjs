import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filePath) => readFile(path.join(root, filePath), "utf8");
const ok = (value, message) => {
  if (!value) throw new Error(message);
};

const [
  migration,
  provenanceProtection,
  serviceRoleGrants,
  submissions,
  evidence,
  workflow,
  serviceEvents,
  publicInstruments,
  email,
  printKit,
  adminApi
] = await Promise.all([
  "../../supabase/migrations/20260718160000_service_provider_workflow.sql",
  "../../supabase/migrations/20260719193000_protect_service_provider_provenance.sql",
  "../../supabase/migrations/20260718173000_grant_service_workflow_service_role.sql",
  "app/api/service-submissions/route.ts",
  "app/api/service-evidence/route.ts",
  "lib/service-workflow.ts",
  "app/api/service-events/route.ts",
  "lib/public-instruments.ts",
  "lib/transactional-email.ts",
  "app/handout/[code]/page.tsx",
  "app/api/admin/service-workflow/route.ts"
].map(read));

ok(migration.includes("create table if not exists public.service_provider_profiles"), "Provider profile schema missing");
ok(migration.includes("create table if not exists public.service_submissions"), "Submission schema missing");
ok(migration.includes("create table if not exists public.service_submission_evidence"), "Private evidence schema missing");
ok(migration.includes("create or replace function public.approve_service_submission"), "Owner approval RPC missing");
ok(migration.includes("if v_submission.provider_user_id = p_owner_user_id then"), "Provider/owner separation missing");
ok(migration.includes("on conflict (service_submission_id) where service_submission_id is not null"), "Approval idempotency missing");
ok(migration.includes("unique index if not exists guitar_timeline_service_submission_unique"), "Canonical service-event uniqueness missing");
ok(migration.includes("insert into storage.buckets") && migration.includes("'service-evidence'") && migration.includes("public = false"), "Evidence bucket is not private");
ok(migration.includes("consumed_at is not null") && migration.includes("expires_at <= now()"), "Review-token expiry or single-use guard missing");
ok(!/\bdrop\s+(table|column|schema)\b/i.test(migration), "Migration contains a destructive drop");
ok(provenanceProtection.includes("protect_service_provider_provenance_trigger"), "Provider provenance trigger missing");
ok(provenanceProtection.includes("auth.role() <> 'authenticated'"), "Provider provenance protection does not distinguish client writes");
ok(provenanceProtection.includes("new.source_kind := 'owner_reported'"), "Owner-reported provenance is not enforced");
ok(provenanceProtection.includes("old.source_kind = 'provider_submitted_owner_approved'"), "Approved provider history mutation guard missing");
ok(provenanceProtection.includes("new.service_submission_id := null"), "Service submission provenance can be forged");
ok(serviceRoleGrants.includes("grant select, insert, update, delete on table"), "Workflow service-role table grants missing");
ok(serviceRoleGrants.includes("to service_role"), "Workflow grants are not restricted to the service role");
ok(!serviceRoleGrants.includes("to authenticated") && !serviceRoleGrants.includes("to anon"), "Workflow table privileges leak to client roles");

ok(submissions.includes("provider_user_id: auth.user.id") && submissions.includes("owner_user_id: guitar.owner_id"), "Submission participants are not bound server-side");
ok(submissions.includes('status !== "submitted"') && submissions.includes('action === "approve"'), "Approval state gate missing");
ok(submissions.includes('supabase.rpc("approve_service_submission"'), "Approval bypasses canonical RPC");
ok(submissions.includes("hashReviewToken(reviewToken)"), "Review token is not hashed before approval");
ok(submissions.includes("20"), "Submission rate limit missing");
ok(submissions.includes("priorVersion") && submissions.includes("revisedToVersion"), "Revision audit history does not preserve the prior version");
ok(evidence.includes('from("service-evidence")') && evidence.includes("createSignedUrl"), "Evidence is not served through short-lived signed URLs");
ok(evidence.includes("SERVICE_EVIDENCE_MAX_BYTES") && workflow.includes("15 * 1024 * 1024"), "Evidence size limit missing");
ok(evidence.includes("writeAllowed") && evidence.includes('submission.status === "changes_requested"'), "Evidence write-state guard missing");
execFileSync(process.execPath, [path.join(root, "scripts/security/auxiliary-routes.test.mjs"), "--match", "evidence signed-out"], { stdio: "inherit" });

ok(serviceEvents.includes('source_kind: "owner_reported"'), "Owner service provenance missing");
ok(serviceEvents.includes('source_kind === "provider_submitted_owner_approved"'), "Approved provider history protection missing");
ok(publicInstruments.includes("providerDisplayName") && publicInstruments.includes("providerVerifiedAt"), "Safe provider provenance is not mapped publicly");
ok(!publicInstruments.includes("service_submission_tokens"), "Public mapping references private review tokens");
ok(!publicInstruments.includes("service_submission_evidence"), "Public mapping references private evidence");

ok(email.includes("Nothing becomes part of the public Profile until you approve it"), "Owner email overstates publication");
ok(email.includes('status: "failed"') && email.includes("email delivery failed"), "Email failure is not reported honestly");
const printLayout = await read("lib/print-layout.ts");
const printDocument = await read("app/handout/[code]/PrintDocument.tsx");
ok(printLayout.includes('PrintMode = "label" | "hangtag" | "handout" | "service"'), "Service Summary print mode missing");
ok(printDocument.includes("Private evidence and internal notes are not included"), "Print Kit private-evidence disclosure missing");
ok(![printKit, printDocument].join("\n").includes("storage_path"), "Print Kit exposes a private evidence path");
ok(adminApi.includes("createSignedUrl") && adminApi.includes("previewUrl"), "Admin evidence review link missing");
ok(adminApi.includes('action === "verify_provider"') && adminApi.includes('action === "mark_evidence_reviewed"'), "Admin provider/evidence controls missing");

console.log("Service-provider workflow assertions passed.");
