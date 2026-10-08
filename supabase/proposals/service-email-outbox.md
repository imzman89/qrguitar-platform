# Service Review Outbox: Disabled Cutover Package

Status: implemented release candidate, NOT deployed or activated. Scope is only the existing service.submitted event, including a resubmitted revision. No new email families, audience policy, real inbox sends, or production schema changes.

## Exact Artifacts

- `service-email-outbox.sql`: exact candidate migration, version 20260926190000. Kept in proposals to prevent accidental migration execution. On authorized release, install these reviewed bytes as `20260926190000_service_email_outbox.sql`.
- `service-email-outbox-activate.sql`: guarded, explicit operational cutover. Not part of normal schema migration or deployment.
- `service-email-outbox-pause.sql`: stop future dispatch and disable the one cron job while retaining capture and all evidence. Not permission to downgrade application code.
- `service-email-outbox.ts` and `service-email-outbox-runtime.ts`: bounded worker/store and the current c994 sender outcome contract.
- `/api/internal/service-email-sweep`: POST only, dedicated constant-time bearer authentication, environment-disabled by default, canonical production review CTA, bounded database/send operations, readiness gate and heartbeat.
- `/api/admin/service-email`: authorized admin status, pagination, definite retry and evidence-based unknown reconciliation. No activation action.
- Service operations UI: counts, heartbeat warning, per-intent actions and audit evidence. Historical unknowns remain visible independently of the latest revision.
- Existing submit/revise/retry routes: atomic mode receipt selects exactly one sender; no legacy fallback for an outbox row. Participant and admin displays read the latest authoritative intent, not stale legacy sent fields.
- `test:service-workflow` now includes worker, SQL, handler and full-schema/privacy tests. Native multi-connection test is manual and rejects any non-dedicated container.

## Transaction And Authority

The BEFORE trigger records inline/outbox mode on the same row returned by the domain update; the AFTER trigger atomically captures the intent and in-app owner notification. Rollback removes all three. Replayed updates cannot enqueue another event. No existing submission is backfilled. Only new transitions after cutover are queued.

Capture starts disabled (`enabled=false`); dispatch separately starts disabled. Enabling capture is one-way. Pausing delivery preserves new intents instead of silently reverting to inline delivery. An application response lost after commit cannot lose the durable intent.

Queue rows hold submission identity/revision, state and provider outcome, not copied actor IDs, addresses, titles, evidence, raw tokens or bodies. Current authority is read from the existing service submission immediately before dispatch and checked against the current Profile owner, expiry, revision, status, Profile removal, and pending account deletion. Changes suppress rather than reroute mail. Existing account-deletion pseudonymization suppresses pending queue rows when actor authority is removed, without duplicating retention identities.

Review URLs are always `https://www.qrguitar.com/service-review/{id}` in the live worker. Tests may inject literal-loopback origins only through the separate isolated worker constructor. Existing authenticated approval authority and token/deadline rules are unchanged. Prior emailed tokens are never rotated by this outbox.

## Delivery And Recovery

Three items per bounded run; 120-second database lease; six dispatch attempts maximum. Definitive retryable rejection uses bounded exponential backoff. A lease lost before dispatch can retry. Once dispatch begins, a crash, network ambiguity, malformed acceptance or lost receipt becomes unknown and never automatically resends. Unknown acceptance must be resolved by an authorized administrator with evidence.

Provider acceptance requires a provider receipt and is never described as inbox delivery. Intent UUID is passed as an idempotency key, but correctness does not assume unverified or indefinite provider deduplication. A provider send and database receipt are not a distributed transaction. An ownership change after final eligibility check cannot recall an external email; authenticated review authorization still rejects the wrong owner.

Admin reconciliation records confirmed acceptance without sending. Confirmed non-acceptance retries only the latest eligible request below the attempt limit; expired, closed, superseded or ownership-changed events close as suppressed, and exhausted events close as failed. Decisions create service activity evidence. Recipients/providers cannot reconcile unknown outcomes. Normal provider retry only requeues a definite failure.

Latest-intent status drives participant/admin submission displays. The admin delivery queue separately enumerates every unresolved intent in 50-row pages, so a newer accepted revision cannot hide an older unknown.

## Ready-To-Review Evidence

Worker: 30 tests. Service route: 34 tests. Actual proposal SQL/original approval RPC: 33 tests. HTTP handlers/session-status helpers: 14 tests. Full repository install retains global readiness; feature readiness detects privilege drift. Actual privacy intake/review/pseudonymization RPCs preserve service facts and suppress queued mail. Exact activation/pause scripts pass isolated scheduler/Vault-fixture guards and preserve capture on pause; that fixture performs no scheduling or HTTP and is not production cutover proof.

Native PostgreSQL17: three independent connections, five tests for rollback visibility, exclusive claim, foreign lease rejection, dispatch crash quarantine and the real pg_cron job being inactive. Real pg_net request queue remained empty. The dedicated temporary container was removed; existing six containers/data were untouched.

Actual React component/CSS browser fixture at 390/768/1440: no page overflow or errors, one deliberate mutation, late INITIAL_SESSION(null) preserves active identity, real sign-out clears the panel. Auth/API responses in this visual fixture are synthetic; this is not a production admin browser claim.

Evidence lives under Senior `outputs/customer-journey-20260926/outbox-*.log` and `outbox-ui/`. No provider inbox/delivery/bounce verification is claimed.

## Authorized Activation Order

1. Owner/coordinator approves the frozen package and exact migration; verify the approved commit/build identity. Do not apply draft bytes while review is open.
2. Complete the Vercel ingress fence and drain receipt below. c994 and earlier do NOT understand the outbox receipt and cannot coexist with enabled capture. Promoting the production alias alone is insufficient.
3. Install the reviewed SQL disabled. Verify existing `qrguitar_release_readiness()` and `service_email_outbox_readiness()`; the latter must report ready and version `2026-09-26.service-email.1`. Confirm exactly one inactive pg_cron job.
4. Deploy the outbox-aware application. Install a fresh dedicated runtime secret `QRGUITAR_SERVICE_EMAIL_CRON_SECRET` and matching Vault secret named `qrguitar_service_email_cron_secret`. Never put values in source, cron command, logs or chat. Set runtime `QRGUITAR_SERVICE_EMAIL_WORKER_ENABLED=true`. Keep DB dispatch disabled; perform authenticated empty-worker smoke check, with no queued historic work.
5. Explicitly confirm all old requests are drained and only the approved new runtime is serving, set the activation script's session confirmation, and run the separate activation SQL. This atomically enables capture/dispatch and the single five-minute cron job. No historic events are queued.
6. Recheck build identity, empty worker/status and the persistent old-deployment fence before reopening only the approved runtime's service mutations. Current evidence uses isolated fixtures and captured transport; no production synthetic record or real email is authorized. A production test record/recipient requires separate explicit permission and a cleanup plan; migration approval alone does not grant it. Otherwise observe the next genuine, owner-initiated business event without manufacturing one. Its persisted provider receipt and inbox outcome are separate checks; until observed, inbox delivery remains unverified. Never backfill or replay legacy sends.
7. Monitor queued age, accepted/failed/unknown counts and heartbeat (warning after 15 minutes). Missing/invalid Vault secret creates no call; runtime missing secret or disabled flag fails closed. Existing PayPal scheduler is untouched.

## Vercel Ingress Fence And Drain Receipt

This is an operator procedure, not an executed project change. Activation is NOT ready until the coordinator attaches actual-project proof for every gate below. Do not infer WAF availability, rule capacity, duration or routing configuration from a plan name. No account upgrade, deployment deletion or firewall mutation is authorized by this proposal.

1. Inventory every deployment with production database access: deployment ID, immutable/branch/custom hosts, route configuration, effective function maximum duration and observed deployment-pinning mechanisms. Include old c994 deployments and earlier inline-only runtimes. Record the exact approved new ID separately. Inspect current middleware/rewrites and firewall bypass rules; protect every normalized path that reaches POST/PATCH `/api/service-submissions`.
2. After separately authorized maintenance, publish a project WAF Deny rule for those mutations on all hosts, not just `www.qrguitar.com`. Record rule/version/time. Prove the deny action in firewall logs using harmless unauthenticated invalid-body requests to canonical, branch and each old immutable URL, including observed rewritten paths and `dpl`, `x-deployment-id`, `__vdpl` pins. An application 401 or a login redirect alone is not ingress-denial proof. Do not use genuine submission IDs or auth credentials in probes.
3. Start the drain clock only after that fence is proven. Record the OLD deployed route's effective Vercel maximum duration from deployment/project configuration, including overrides. Do not substitute Brevo's send timeout or the new queue's lease duration. Logs must show no new old-route invocation starts and completion/timeout of every previously admitted invocation through that ceiling. Reconcile committed-but-unrecorded sends; uncertain old delivery stays quarantined, never backfilled. Missing logs, unknown duration, remaining invocations or unresolved coverage means keep maintenance and capture disabled.
4. While maintenance remains in force, promote the approved outbox-aware runtime and establish persistent mutation denial for every old hostname and old deployment pin. Where supported, a verified Skew Protection threshold can reject old pins; it does not fence direct immutable URLs. Keep old-host denial independently. If coverage cannot be proved, stop activation and enumerate exact old deployment IDs for separately authorized removal; never delete by project-name wildcard. Deletion alone does not prove in-flight drain.
5. After activation, remove only the temporary all-host maintenance denial. Keep old-host/pin fences in place. Re-run harmless probes: approved runtime must return its normal validation/auth result, old destinations must still show the proven firewall/pinning rejection with no old handler invocation. Retain fence/drain/probe receipts without secrets. If any old destination reaches application code, reinstate maintenance and pause dispatch immediately; do not replay the ambiguous interval.

The deployment-pinning behavior, WAF controls and configurable function ceiling are described in [Skew Protection](https://vercel.com/docs/skew-protection), [WAF rule configuration](https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration), and [function duration](https://vercel.com/docs/functions/configuring-functions/duration). The gates above are a conservative procedure derived from those controls, not a claim that this project already has them configured.

## Rollback Is Pause, Not Old-Code Downgrade

Run the pause SQL, disable the runtime worker flag, and let active requests finish. Capture remains enabled for new service transitions and all outbox rows remain durable. Keep an outbox-aware application deployed. Do not drop schema, delete intents, reset attempts, rerun accepted/unknown work, or set capture false.

Dispatch pause alone NEVER permits rollback to c994 or any inline-only code: that code would send immediately for queued transitions and could later duplicate them when workers resume. If such a rollback becomes unavoidable, first disable service submit/revise/retry endpoints outside the old app, drain all requests, and keep those endpoints unavailable for the entire downgrade. Preserve queued intents and reconcile every dispatching/unknown receipt. Prefer a forward fix or prior outbox-aware release. There is deliberately no destructive down migration or unattended legacy re-send path.

Before resuming, restore the approved outbox-aware runtime, recheck both readiness contracts and exact SHA, reconcile expired in-flight leases (unknowns never auto-retry), then re-enable only dispatch and the existing cron job. Do not create another schedule or backfill events.
