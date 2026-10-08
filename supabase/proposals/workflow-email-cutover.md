# Workflow Email: Installation and Cutover

Prepared September 27, 2026 for the sole release integrator. This document does not perform
a deployment, database change, secret provisioning, activation, or real email send.

## Frozen package

- Six proposal bodies are read from exact Git source `be098252d49817cd7fc9a3c11df5bd0c0e306273`,
  independent of dirty files or a later checkout. No SQL body is edited.
- `apps/web/scripts/prepare-workflow-email-schema.mjs` removes only the six reviewed outer
  transaction wrappers, adds fail-closed pre/postconditions, and emits one outer transaction.
- Order: service outbox, action-required email, claim completion recovery, action operations,
  claimant outcomes, service/transfer outcomes.
- Expected generated SQL SHA256:
  `0085168d910ddaff421c0c1fc201d6e848afaded058462d483f621dec78b0473`.
- Generate to a new absolute path:
  `node apps/web/scripts/prepare-workflow-email-schema.mjs <absolute-output.sql>`.
  The generator never connects to a database and refuses to overwrite an existing file.
- Boss's final application commit may include packaging-only commits beyond this source.
  Runtime release binding must use the actual approved deployed SHA, not silently substitute
  this proposal-source SHA when they differ.

## Fresh destination inspection

Use the normal supported, private connection or authenticated SQL interface. Verify destination
identity out of band before each session. Never put credentials, Vault values, addresses, or
customer records in output. Run `workflow-email-preflight.sql` as its own read-only transaction.

Required results:

1. Existing `qrguitar_release_readiness()` is ready at `2026-09-23.1`, with every one of its
   14 named checks true. Historical production reports are context, not a substitute.
2. All six feature tables and seven feature columns are absent, all required workflow RPCs
   are present, and Auth's existing `email_confirmed_at` exists. Do not add or alter Auth to
   repair production: the column is scaffolded only in isolated tests.
3. Neither workflow cron name exists. `pg_cron`, `pg_net`, and Supabase Vault availability
   must be recorded. Installation can preserve a scheduler-less environment, but that is not
   activation-ready; never invent credentials or install extensions as an implicit side effect.
4. Any partial feature objects, unknown routine, wrong baseline, existing schedule, active
   gate or differing reviewed bytes means stop and reconcile the exact state. There is no
   `IF NOT EXISTS`, overwrite, down migration, or blind replay path.

Boss reported a preliminary September 27 production read: PostgreSQL17.6, base readiness .1
and all14 checks passing; sampled workflow control/RPC objects absent; pg_cron/pg_net/Vault
present. Full catalog preflight and later state remain the release integrator's fresh evidence.

The preserved synthetic database was independently reported at ready `2026-09-17.13`, not
the current base. That version comes from `20260919102000_release_readiness.sql`. The only
later repository migrations are `20260923120000_five_free_profiles.sql`, followed by
`20260923121000_release_readiness.sql`. The former changes the two reviewed allowance
functions for future creation without rewriting Profiles or the credit ledger and rejects
unrecognized/mixed source. Inspect existing migration state and apply only that reviewed
delta where actually missing; do not replay older migrations or weaken this package's guard.
Production reported at `2026-09-23.1` does not need that delta.

## Install disabled, atomically

Coordinate a maintenance window and stop overlapping schema changes. The generated bundle
has a five-second lock timeout and 60-second statement timeout. It does **not** require an
empty database. It preserves existing Profiles, service work, claims and prior evidence;
only this new feature's objects must be absent.

Execute the verified whole file in one session with stop-on-error behavior. For psql, use
`--no-psqlrc --set=ON_ERROR_STOP=1 --file=<verified-absolute-file>` with the already approved
private libpq connection configuration. Do not use `--single-transaction` around a file that
already owns its transaction; do not select only part of the file in the SQL editor.

The intermediate .1/.2 readiness preconditions execute inside the same transaction, see the
preceding DDL, and require disabled/unbound state. Final postconditions require unchanged base
readiness, service readiness `2026-09-26.service-email.1`, action schema readiness
`2026-09-27.action-email.3`, disabled controls, null release/database bindings, empty queues,
and exactly two inactive schedules when cron/net are available.

On any error, issue `ROLLBACK` in a still-open session and inspect the receipt. Do not continue
with the next proposal. A lost connection/uncertain commit requires fresh catalog inspection,
not replay. After a successful commit, independently read all three readiness routines,
control booleans, counts only, and the two cron active flags. Do not invoke sweep functions.

The test package proves on a populated base that late failure rolls back tables, routines,
triggers and native cron rows. The application must still be tested against the installed
compatible schema before production promotion.

## Fence and drain the old sender

Actual source `0bde417` lacks the service API's `email_dispatch_mode`/outbox branches.
An old runtime can send inline even when the new database also queues delivery. Therefore
capture activation cannot coexist with that runtime's admitted service mutations.

Follow the existing detailed ingress-fence/drain procedure in `service-email-outbox.md`.
Inventory production-connected immutable, branch, custom and canonical hosts plus deployment
pinning. Verify controls in the actual Vercel project, not assumptions about plan features.
Fence service POST/PATCH entry points and observed rewrites across those hosts; record an
actual ingress-denial receipt, not just application401. Obtain old-function effective duration
and logs proving no new old invocation and completion/timeout of admitted invocations.
Keep old-host/pin denial persistent after the approved runtime reopens. Never infer drain from
a browser refresh, alias promotion, worker timeout or queue lease duration.

No tested old-host fence/drain means **schema may stay disabled; delivery must not activate**.
Unknown old sends are quarantined, not backfilled. Do not delete deployments or change WAF
rules outside the release integrator's reviewed operation.

## Exact activation prerequisites

All of these require actual environment evidence, separate from local unit tests:

- Approved application is serving canonical production, `/api/build-info` matches the actual
  final SHA, required RPCs exist, and authenticated affected journeys pass. No dependent
  cancellation/claim API deployment against the old schema.
- Action worker admission observes `NODE_ENV=production`, `VERCEL=1`, `VERCEL_ENV=production`,
  exact canonical request URL and genuine `VERCEL_GIT_COMMIT_SHA`. A CLI deployment without
  that identity remains disabled; never add a fallback identity to pass a test.
- Worker/transport flags are explicit: `QRGUITAR_ACTION_EMAIL_WORKER_ENABLED`,
  `QRGUITAR_ACTION_EMAIL_TRANSPORT_ENABLED`, and `QRGUITAR_SERVICE_EMAIL_WORKER_ENABLED`.
- Dedicated service/action runtime secrets match their dedicated Vault secrets. Secret names
  are `qrguitar_service_email_cron_secret` and `qrguitar_action_email_cron_secret`; each exists
  exactly once with valid length/shape. Never display the value, embed it in cron SQL, reuse
  the PayPal secret, or infer equality from existence.
- Action runtime `QRGUITAR_ACTION_EMAIL_EXPECTED_SUPABASE_URL` equals the real strict HTTPS
  Supabase project URL and `QRGUITAR_ACTION_EMAIL_APPROVED_COMMIT` equals the genuine deployed
  SHA. The operations row must be bound to those same reviewed values during cutover.
- Actual published `site_content` shape and all enabled families' templates render under the
  strict variable allowlists. Saved unsupported variables require deliberate content correction;
  never overwrite saved content or use draft/default content to disguise a failed published read.
- Sender identity/provider configuration is valid, rate/credit limits are reviewed, and a
  controlled recipient/test-data plan or genuine business event is identified. Provider
  acceptance and inbox receipt remain separate evidence. No guessed recipient or audience send.
- Both queues are empty before initial activation, both schedules unique/inactive, and the
  old-runtime fence/drain receipt is complete. No bulk historic enqueue or retry operation.

Service activation uses the existing reviewed `service-email-outbox-activate.sql` and its
session confirmation. For action activation, the sole operator must atomically set the reviewed
operations project/commit binding, enable capture/dispatch, verify `.3` readiness against that
exact binding, and activate only the existing `qrguitar-action-email-sweep` job. Keep the two
cutovers coordinated under the same maintenance receipt. Do not treat this description as an
unreviewed substitute for the operator's exact transactional activation SQL.

The action runtime requires dispatch readiness before processing, so it cannot return a
successful authenticated worker receipt while DB dispatch is false. Test disabled rejection
first; an authenticated **empty-queue** action smoke succeeds only in the guarded activation
window, with maintenance held and no synthetic business mutation. If any prerequisite fails,
keep dispatch off and retain the source evidence.

## Pause and rollback limits

Before installation commits, a transaction failure rolls back everything in this package.
After installation, leave the additive schema in place. Before capture activation, the prior
application may be retained only with affected-workflow compatibility verified.

After activation, rollback means operational pause, not schema removal or inline-code downgrade:
disable both cron jobs and dispatch controls, disable runtime worker flags, retain capture,
bindings, all intents/receipts and an outbox-aware application. Service capture is intentionally
one-way. Pausing cannot recall provider requests already in flight. Never zero attempts, delete
queues or replay accepted/unknown outcomes. Resolve unknowns through the reviewed admin path.

Resume only after the genuine approved runtime/binding is restored, all readiness checks pass,
old-host fences still hold, and uncertain outcomes are reviewed. Reuse existing schedules.
Rollback to inline code requires keeping service mutations externally blocked for the whole
downgrade; prefer a forward correction.

## Evidence

`test-workflow-email-schema-package.mjs`: 12 PGlite checks and 13 native PostgreSQL17 checks.
Native proof includes exact unchanged base readiness, populated-row preservation, late-failure
full rollback including cron, replay/partial rejection, two inactive schedules and zero HTTP.
Independent Audit reran PGlite12 and matched the exact bundle hash.

Senior evidence: `outputs/customer-journey-20260926/workflow-schema-package-db.log`,
`workflow-schema-package-native.log`, and `workflow-email-install-be09825.sql`.
Dedicated fixture removed after label verification; original six services preserved.
These artifacts do not assert production installation, deployment, activation or inbox delivery.
