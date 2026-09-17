# QRguitar release candidate — September 2026

This candidate improves the existing Next.js/Vercel/Supabase application. It is a public-beta web application with an installable web experience. Paid Checkout and native App Store releases are not active.

## Release prerequisites

Use Node.js 24 with Git and tar available on PATH, and the committed lockfile (`npm ci`). The application is linked to the existing QRguitar Vercel project, with root directory `apps/web`. Keep its Supabase service key in the server environment and ignored `apps/web/.env.local`; never add it to source control, screenshots, deployment arguments, or public environment variables.

The production management sessions must be authenticated. A working Supabase service key is sufficient for the read-only readiness call, but does not authorize management SQL. Do not replace expired management authentication with a database reset or arbitrary-SQL workaround.

Verify the existing baseline schema before applying new migrations. This repository has historical supplemental SQL outside `supabase/migrations`, including the document vault, administration, archive controls, and profile history. Reconcile the installed migration history and prerequisites; do not replay all historical SQL indiscriminately.

Take an appropriate database backup and record the currently deployed revision. Schedule a coordinated release window and quiesce write traffic while the database and application contracts change. The old transfer overload is intentionally revoked; old Site Editor clients must reload. Private storage and direct-client policy changes also require the compatible server readers and public-file proxy. Do not leave the old application serving writes against a partially upgraded schema.

## New migration order

Apply the reviewed candidate migrations in this order after their historical prerequisites:

1. `20260910210000_reconcile_serial_alias_contract.sql`
2. `20260910220000_atomic_instrument_profile_save.sql`
3. `20260910230000_atomic_instrument_create.sql`
4. `20260910233000_staged_upload_registry.sql`
5. `20260910235900_server_data_boundary.sql`
6. `20260911001000_atomic_account_settings.sql`
7. `20260911001500_atomic_ownership_transfers.sql`
8. `20260911002000_atomic_service_evidence.sql`
9. `20260911002100_atomic_external_media.sql`
10. `20260911003000_atomic_instrument_controls.sql`
11. `20260911003500_atomic_site_editor.sql`
12. `20260911004000_beta_plan_quota.sql`
13. `20260911004500_release_readiness.sql`
14. `20260917170000_ownership_claim_guards.sql`
15. `20260917172000_account_settings_versions.sql`
16. `20260917173000_release_readiness.sql`
17. `20260917174500_business_conflict_responses.sql`
18. `20260917175000_release_readiness.sql`

For an installation already on release `2026-09-10.1`, the September 17 update applies only migrations 14–18 after verifying that baseline. An installation already on `2026-09-17.1` applies only migrations 17–18. The claim migration adds a service-only four-argument approval function, rechecks expiry, current ownership, account eligibility, and archived/removed instruments under lock, and revokes execution of the unsafe three-argument overload. The account migration adds a version column and a locked, version-checked save function so a delayed request cannot overwrite a newer save. The old unversioned account entry point is revoked. Existing clients must reload. Existing instrument QR identifiers remain unchanged. The matching readiness migration requires the reviewed implementations and blocks their old grants.

Migration 17 changes expected account, instrument, and service-evidence conflicts to `PT409`. Hosted PostgREST retries `40001` serialization failures; using that transient error for a permanent stale-version rejection can cause requests to time out. `PT409` returns an explicit HTTP conflict. This follow-up preserves the original transaction logic, locks, and permissions; historical applied migrations remain unchanged. Include a hosted stale-save rejection in acceptance in addition to local SQL tests.

The staged-upload wrapper and its private backing function must be installed together. Quota04000 patches the private backing function without enabling direct invocation. Do not restore old API-role grants afterward.

Verify all three storage buckets exist and have `public=false`: `instrument-media`, `instrument-documents`, and `service-evidence`. Preserve actual customer files. The new policies restrict access through the application; they do not delete stored objects. Previously issued owner signed URLs retain their normal expiry.

Wait for the PostgREST schema cache to recognize the new functions, then run:

```bash
npm run release:database
```

The service-only `qrguitar_release_readiness()` RPC checks the exact reviewed function implementations and signatures, client grants, private tables/buckets, policies, receipt uniqueness, editor versioning, and provenance triggers. All 14 checks must pass for release version `2026-09-17.2`. A missing RPC, incomplete response, changed implementation, or privilege drift blocks release. Inspect and fix the cause; do not regenerate fingerprints from an unreviewed live database just to make the check green.

## Application release

Commit the reviewed candidate only after the required local checks pass. The guarded release entrypoints are `npm run push:live`, `npm run deploy:web`, and `push-live.cmd`.

The release command requires a clean committed tree and the correct Vercel link, then runs:

- Production build and TypeScript check.
- Launch assertions and the complete behavior suite.
- Web workspace dependency audit, including development dependencies.
- Read-only database readiness check.

It exports an immutable Git archive of the reviewed commit, excluding ignored local secrets and untracked files. It rejects a changed HEAD before staging and promotion. Using pinned Vercel CLI 59.15.1 and an explicit project ID, it creates a production deployment with custom-domain promotion skipped. It reads structured CLI JSON, requires a READY production deployment with a valid deployment ID and URL, and probes that exact deployment through authenticated Vercel CLI curl. It promotes only after its configured database and resources pass, then verifies public production identity, `/api/health`, homepage, manifest, service worker, and offline document. The health endpoint checks the database configured in the deployed app and exposes only ready/unavailable and release version.

`--skip-domain` leaves custom domains unpromoted, but Vercel may move a generated stable `vercel.app` alias during staging, even if a later staged probe fails. Record alias targets before staging; inspect them afterward and restore any moved generated alias to its recorded baseline until the cutover. A failure after promotion does not mean production was unchanged. Inspect the deployment and database before retrying or restoring an earlier application. A rollback must account for the new database contracts; it is not a blind old-code deployment. Snapshot cleanup retries transient filesystem errors for a bounded period; if cleanup still fails, the command reports the verified retained path without replacing the release outcome or original error.

### First cutover from the legacy database

Use the split workflow for this incompatible upgrade. The normal command checks the database before starting the Vercel build, so it would otherwise keep the old application online against the new database during that build.

1. Commit the reviewed release, complete the backup and migration rehearsal, confirm Vercel management authentication, and record every current alias target. From the clean linked checkout, run `npm run push:live -- --stage-only`. This runs every existing local build, type, launch, behavior and audit check, archives exactly that commit, and deploys with `--prod --skip-domain --json`. Authenticated Vercel curl verifies the staged build identity. Database readiness and the full health/resource probes are deliberately deferred; custom-domain promotion is skipped. Inspect aliases immediately after the attempt and restore any generated alias that moved to the candidate back to its recorded baseline until cutover.
2. Review `.vercel/qrguitar-staged-release.json`. It records the production project, full commit SHA, exact deployment URL, public build identity environment, successful local check commands/timestamps, and staging time. `.vercel/` is ignored. It contains no service key or management token. Starting a new stage or normal release archives the prior active record before checks; a failed replacement cannot silently reuse it. Keep the checkout and project link unchanged through promotion.
3. Capture the current production deployment, aliases and firewall configuration. Publish a temporary project-wide WAF **deny** rule covering all paths, methods, hostnames and environments, with no candidate exception initially. Verify the deny on both canonical domains, every known stable alias, and the old deployment hostname using harmless unauthenticated probes. Check rule priority and system/custom bypasses. This intentionally gives a brief unavailable period and also prevents broken legacy reads during the privacy-policy cutover. A maintenance page or custom-domain-only block cannot stop historical deployment URLs.
4. Drain all existing legacy function invocations using the verified deployment/project maximum duration and available logs. Also confirm already-started database/Storage operations have settled; a function timeout alone does not prove a downstream operation stopped. Refresh the backup and data invariants after this drain. The legacy APIs use the service role for separate table mutations and file upload/removal, so restrictive policies for `anon`/`authenticated` do not freeze them. Do not use SQL edits to Storage object metadata as a file-operation barrier.
5. Apply the exact rehearsed migration bundle as one transaction, with its prerequisite/data checks and readiness assertion. Remove only each migration's top-level transaction wrappers when constructing that reviewed bundle; concatenated files retaining their own `COMMIT` statements do not form one atomic upgrade. Retain the write freeze if anything fails. Wait for PostgREST schema refresh and require `npm run release:database` to pass.
6. Amend the deny rule to exempt only the exact staged candidate hostname, publish it, and verify canonical/historical hosts remain denied. Complete dedicated-account acceptance on that staged deployment. The checked legacy browser uses same-origin APIs for all application data/file mutations; its direct Supabase calls are Auth flows and public/signed file reads. Auth can remain available if the fresh live schema confirms no unexpected Auth trigger changes application data. No legacy browser in this baseline issues signed upload capabilities. Candidate acceptance uploads must remain confined to synthetic fixtures.
7. Run `npm run push:live -- --promote-staged`. It validates the saved record against the current clean full SHA and linked production project; it does not rebuild. It checks live database readiness, then uses authenticated Vercel curl for the exact saved deployment's SHA, original build timestamp, production identity, health and public resources. Commit, project-link and stage-record drift stops promotion. Only then does it call `vercel promote` with that exact URL, followed by public production verification.
8. The all-path freeze initially blocks that final public verification. Keep the freeze until Vercel management confirms the candidate owns every intended canonical/stable alias, then update the rule to exempt those verified hosts plus the candidate. Retain denial on historical deployment hostnames. If the command already stopped on the expected public deny, rerun `--promote-staged` after confirming the alias state and updating the rule: all database/staged checks repeat, promotion is idempotently targeted to the same deployment, and public verification must pass. Successful verification archives the active stage record as `.promoted-*`; a failed promotion/public probe keeps it for inspection and retry.

After successful cutover, inventory every page of the project's historical deployments and aliases, including obsolete candidates created by failed staging attempts. Replace the temporary inverse-host allowlist with a permanent deny matching the exact legacy deployment hostnames and legacy aliases; verify each remains blocked before retiring the temporary rule. This permits future newly staged hostnames to pass their identity probe while old service-role APIs stay unreachable. If the legacy inventory is incomplete, retain the broader freeze rather than claiming historical deployments are covered. A stage-only identity probe blocked by WAF does not create a promotable record; fix the firewall coverage before starting a new guarded staging attempt.

Do not automatically remove the freeze on failure or restore the old deployment after the migrations commit. The old transfer overload is revoked, direct public reads lose privileges, and storage buckets become private. Fix forward or use the verified coordinated database/application restoration procedure. Cached legacy clients should reload before resuming edits.

Firewall controls are operational steps outside the release script. [Vercel WAF rules](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules) take effect without an application rebuild; [the CLI](https://vercel.com/docs/cli/firewall) stages rule changes until `vercel firewall publish`. Verify actual coverage and the [configured function duration](https://vercel.com/docs/functions/configuring-functions/duration), rather than assuming defaults. [Supabase Storage](https://supabase.com/docs/guides/storage/schema/design) stores metadata separately from file bytes.

GitHub CI verifies the build, types, behavior suite and web audit. Do not push this incompatible candidate to an auto-deploying branch before the coordinated database release is ready.

## Authenticated acceptance after migration

Use dedicated synthetic accounts and private test Profiles. Never use customer records for destructive tests or send unsolicited test emails.

1. Create with a photo and private document, repeat the same request after a simulated lost response, and confirm one Profile/receipt.
2. Edit photos, documents, specifications, trust display and visibility. Reject stale ownership/version writes without partial changes.
3. Confirm anonymous and unrelated-account access cannot read private Profiles, documents, transfer details or service evidence. Verify owner preview, account switching, sign-out and gallery cleanup.
4. Prepare and accept ownership transfers with the intended recipient; reject wrong email, expired/revoked buyer codes and stale-owner changes. Confirm a lost-response retry does not duplicate history. Keep outbound email disabled/mocked until an authorized delivery test is arranged.
5. Run bulk import with malformed rows, duplicate serials, refresh/retry, and two tabs. Confirm completed rows remain committed and uncertain rows keep their original request identity.
6. Exercise provider submission, evidence, owner review and protected approved history. Rejected writes must preserve state; confirmed evidence deletion may report pending private-file cleanup if storage is unavailable.
7. Use two authorized Site Editor tabs. Test conflict, typing during autosave, publish after autosave, interrupted-response retry, discard, restore and legacy logo publishing with an existing shared draft.
8. Test label/hang-tag/profile-sheet output and scannable permanent URLs. Private QR links become publicly readable only after choosing public or unlisted visibility.
9. Test supported iOS/Android installation and standalone launch. Offline navigation must show only the connection page; reconnect and sign out must not expose cached account pages.
10. Remove only the synthetic fixtures and their staged objects after final verification.

The PGlite tests execute real PostgreSQL routines, constraints and rollback behavior. Their single connection does not prove scheduling under multiple independent production database connections. Route/effect tests and local Chromium browser checks do not replace the migrated HTTP/Storage, real device, email delivery or production acceptance checks.

## Product and operational limits

The public offer remains up to 25 beta Profiles. Stored business/enterprise access and explicit launch allowlists retain their existing exception. Purchase labels do not grant verification. No credits are consumed while payment processing is inactive.

Stripe requires a finalized commercial entitlement contract, provider access, hosted Checkout/Portal, verified idempotent webhook fulfillment, transactional allowances and refund/reconciliation rules before activation. Price labels or success redirects alone must never grant paid access.

The old Expo workspace remains a native prototype. Its dependency audit is separate and is not represented by the clean web audit. Do not publish it as a finished native application.

Draft previews recheck the actor’s active administrator access on every server read. Sign-out/account switches clear the preview cookie and iframe, and delayed issuance is cleaned up. If cleanup cannot reach the server while that actor remains an active administrator, the existing bearer capability may persist until its five-minute expiry; server rendering cannot infer a local account switch from browser local storage.

Site Editor receipts intentionally remain durable for uncertain retries. Private evidence cleanup failures are reported truthfully; an automatic orphan-cleanup queue is not part of this candidate. Operational backup/restore, independent-session concurrency, email delivery, and installed-device acceptance remain release evidence to collect.

No code review or test suite guarantees a financial valuation or proves the absence of every defect.

Deployment references: [Vercel staged production deployments](https://vercel.com/docs/cli/deploying-from-cli), [Vercel curl protection handling](https://vercel.com/docs/cli/curl), and [promotion](https://vercel.com/docs/cli/promote). CLI argument syntax was also checked against installed 59.15.1 help.
