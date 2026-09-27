# Action Email Runtime: Disabled Preparation

The current claimant-outcome candidate also requires `claim-outcome-email.sql` after this baseline proposal. That extension advances readiness to `2026-09-27.action-email.2`; the current worker refuses this baseline `.1` alone. See `claim-outcome-email.md` for exact preconditions and evidence. Neither proposal activates delivery.

This candidate adds a mounted POST-only internal worker route, not an active mail system. Nothing in this change installs production SQL, writes secrets, enables flags, binds a database/release, activates cron, or sends real mail. Boss owns the separate authenticated Admin route and Agent2 owns its UI. No operator adapter or Admin files are changed here.

## Admission Contract

`/api/internal/action-email-sweep` has Node runtime, dynamic/no-store responses and a 60-second deployment maximum. No GET handler is exported. Before constructing the server database client, the request must satisfy all of these gates:

- `QRGUITAR_ACTION_EMAIL_WORKER_ENABLED` and `QRGUITAR_ACTION_EMAIL_TRANSPORT_ENABLED` are both exactly `true`. Missing values disable the worker.
- `NODE_ENV=production`, `VERCEL=1`, and `VERCEL_ENV=production`.
- The request URL is exactly the HTTPS production endpoint above, with no query or alternate origin.
- A dedicated `QRGUITAR_ACTION_EMAIL_CRON_SECRET` is 32-256 non-whitespace characters and matches the Bearer credential using constant-time digest comparison. No values belong in logs, evidence, chat, or Git.
- `NEXT_PUBLIC_SUPABASE_URL` is a strict HTTPS 20-character project host under supabase.co, without userinfo, path, port or query, and exactly matches `QRGUITAR_ACTION_EMAIL_EXPECTED_SUPABASE_URL`. No loopback, preview, custom domain or fallback destination is accepted.
- `VERCEL_GIT_COMMIT_SHA` is a full lowercase SHA and exactly matches `QRGUITAR_ACTION_EMAIL_APPROVED_COMMIT`. A different deployment is disabled until separately approved and rebound.
- The database returns the exact readiness version `2026-09-27.action-email.1`, with schema checks, matching database-side project/release binding and capture/dispatch controls all true.

These flags are not set by this proposal. The production-only boundary must not be weakened to demonstrate an isolated browser send. Tests inject a synthetic process object, database adapter and captured transport while loading the actual runtime and pipeline; they do not modify process environment, contact Supabase/Brevo or start Next.

Before a guarded CLI deployment can be activated, verify that `VERCEL_GIT_COMMIT_SHA` is actually populated with the approved release, that Vercel presents the canonical `request.url` expected here, and that the real published Site Editor record has the validated content shape. Do not assume Git-connected deployment semantics apply to a CLI deployment. Injected environment tests prove rejection/acceptance logic only, not the identity or configuration of a real deployment. Missing identity must remain fail-closed, not be bypassed with a fallback SHA.

## Database and Schedule

Installation order, when separately approved: service-email-outbox.sql, action-required-email.sql, claim-completion-recovery.sql, then action-email-operations.sql. These remain proposals, not automatic migrations.

The operations row starts with no project URL or approved commit. Existing capture/dispatch controls stay off. A private manifest records 20 source and operational function definitions. Readiness checks definition hashes, SECURITY DEFINER/search paths, anonymous/authenticated RPC access, private-table RLS/access and six expected enabled trigger/function attachments. Drift fails closed. Health records are aggregate timestamps, not recipient information or delivery guarantees.

If pg_cron and pg_net are installed, exactly one `qrguitar-action-email-sweep` job is created **inactive**, every five minutes. Existing jobs are untouched. Duplicate installation is refused. Its command contains only a function call, never a token. The function checks readiness before reading the dedicated Vault name `qrguitar_action_email_cron_secret`; missing, duplicate or malformed secrets cause no request. The sole destination is the fixed production POST endpoint. No secret is created by this proposal.

Only a separately authorized activation can set reviewed database bindings, deployment flags and the inactive schedule. Pausing dispatch stops new queue claims, but cannot recall a provider call already in progress. Unknown provider outcomes remain quarantined. An HTTP failure never means it is safe to resend a particular email.

## Delivery and Bounds

Published wording is read directly from the published Site Editor record with the preparation AbortSignal. Request cookies and draft previews are never consulted. A missing or failed published read is a definite no-send retry, not fallback publication. Registered missing keys retain the existing pipeline's registered-default semantics; malformed template content fails closed.

The existing pipeline keeps a separate five-second preparation bound and twelve-second provider bound. Late preparation cannot invoke its sending closure. Provider timeout stays unknown. DB operations use five-second abort signals; health receipts use two seconds. The worker starts at most three intents and stops starting new work after its fifteen-second loop-start budget. Given the existing per-intent bounds, the bounded asynchronous work fits below the route's 60-second ceiling; actual deployment execution remains an acceptance gate. Readiness is checked before claiming, and environment admission is rechecked immediately before provider entry. The existing Brevo transport retains its fixed endpoint and redirect refusal.

## Evidence

- `test-action-email-runtime.mjs`: 21 actual HTTP/runtime/pipeline tests, synthetic adapters and captured transport only. Covers all admission gates, published-read failure, late preparation, provider ambiguity, changing transport admission and health-receipt uncertainty.
- `test-action-email-operations-db.mjs`: 13 full-schema PGlite checks. Includes structural drift rejection and both claim email families for deleting either actor, actual privacy intake/cancellation/re-intake, suppression, active-workflow block, closed-claim pseudonymization and no replay. This does not simulate external auth deletion or real Storage removal.
- Native PostgreSQL17 with three connections: 15 cases, including existing authority/operator/recovery races and one unique inactive scheduler with no queued HTTP. Owned fixture removed after checking its label; original six Supabase services preserved.
- Web typecheck and focused runtime lint passed. No unchanged platform-wide build was repeated; Boss owns the integrated build.

`test:action-email` additionally references Boss's `test-action-email-admin-http.mjs` integration commit. That file is intentionally not duplicated here; the complete combined command requires the Boss route/test change.

Remaining gates: independent final review; integrated Admin UI/route and build; hydrated authenticated workflows; explicit deployment/migration approval and sequencing; secure secret provisioning; approved database/release binding; inactive schedule inspection; captured-to-real provider acceptance and inbox evidence under separate authorization. No production readiness or inbox delivery claim is made by these fixtures.
