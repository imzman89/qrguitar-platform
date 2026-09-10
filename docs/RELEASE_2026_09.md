# QRguitar release candidate — September 2026

This candidate improves the existing Next.js/Vercel/Supabase application. It is a public-beta web application with an installable web experience. Paid Checkout and native App Store releases are not active.

## Release prerequisites

Use Node.js 24 with Git and tar available on PATH, and the committed lockfile (`npm ci`). The application is linked to the existing QRguitar Vercel project, with root directory `apps/web`. Keep its Supabase service key in the server environment and ignored `apps/web/.env.local`; never add it to source control, screenshots, deployment arguments, or public environment variables.

The production management sessions must be authenticated. A working Supabase service key is sufficient for the read-only readiness call, but does not authorize management SQL. Do not replace expired management authentication with a database reset or arbitrary-SQL workaround.

Verify the existing baseline schema before applying new migrations. This repository has historical supplemental SQL outside `supabase/migrations`, including the document vault, administration, archive controls, and profile history. Reconcile the installed migration history and prerequisites; do not replay all historical SQL indiscriminately.

Take an appropriate database backup and record the currently deployed revision. Schedule a coordinated release window and quiesce write traffic while the database and application contracts change. The old transfer overload is intentionally revoked; old Site Editor clients must reload. Private storage and direct-client policy changes also require the compatible server readers and public-file proxy. Do not leave the old application serving writes against a partially upgraded schema.

## New migration order

Apply the reviewed candidate migrations in this order after their historical prerequisites:

1. `20260910220000_atomic_instrument_profile_save.sql`
2. `20260910230000_atomic_instrument_create.sql`
3. `20260910233000_staged_upload_registry.sql`
4. `20260910235900_server_data_boundary.sql`
5. `20260911001000_atomic_account_settings.sql`
6. `20260911001500_atomic_ownership_transfers.sql`
7. `20260911002000_atomic_service_evidence.sql`
8. `20260911002100_atomic_external_media.sql`
9. `20260911003000_atomic_instrument_controls.sql`
10. `20260911003500_atomic_site_editor.sql`
11. `20260911004000_beta_plan_quota.sql`
12. `20260911004500_release_readiness.sql`

The staged-upload wrapper and its private backing function must be installed together. Quota04000 patches the private backing function without enabling direct invocation. Do not restore old API-role grants afterward.

Verify all three storage buckets exist and have `public=false`: `instrument-media`, `instrument-documents`, and `service-evidence`. Preserve actual customer files. The new policies restrict access through the application; they do not delete stored objects. Previously issued owner signed URLs retain their normal expiry.

Wait for the PostgREST schema cache to recognize the new functions, then run:

```bash
npm run release:database
```

The service-only `qrguitar_release_readiness()` RPC checks the exact reviewed function implementations and signatures, client grants, private tables/buckets, policies, receipt uniqueness, editor versioning, and provenance triggers. All 14 checks must pass for release version `2026-09-10.1`. A missing RPC, incomplete response, changed implementation, or privilege drift blocks release. Inspect and fix the cause; do not regenerate fingerprints from an unreviewed live database just to make the check green.

## Application release

Commit the reviewed candidate only after the required local checks pass. The guarded release entrypoints are `npm run push:live`, `npm run deploy:web`, and `push-live.cmd`.

The release command requires a clean committed tree and the correct Vercel link, then runs:

- Production build and TypeScript check.
- Launch assertions and the complete behavior suite.
- Web workspace dependency audit, including development dependencies.
- Read-only database readiness check.

It exports an immutable Git archive of the reviewed commit, excluding ignored local secrets and untracked files. It rejects a changed HEAD before staging and promotion. Using pinned Vercel CLI 59.15.1, it creates a production deployment with domain assignment skipped, probes that exact deployment through authenticated Vercel CLI curl, and promotes only after its configured database and resources pass. It then verifies the public production identity, `/api/health`, homepage, manifest, service worker, and offline document. The health endpoint checks the database configured in the deployed app and exposes only ready/unavailable and release version.

A failed staged deployment or failed staged probe does not assign the public domains. A failure after promotion does not mean production was unchanged. Inspect the deployment and database before retrying or restoring an earlier application. A rollback must account for the new database contracts; it is not a blind old-code deployment.

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
