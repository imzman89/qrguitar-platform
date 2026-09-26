# Service Review Email Outbox: Review Proposal

Status: implementation proposal, NOT activated. No production migration is authorized or applied. SQL is intentionally outside `supabase/migrations`. No existing route, renderer, email family, recipient policy, authorization rule, or scheduler is changed by these files.

## Concrete Scope

- One existing event: a service submission enters `submitted`, including a revised submission. Recipient stays the submission's recorded owner only while that person is also the current Profile owner. Changed ownership suppresses the intent for manual review; it does not silently choose a new recipient.
- `service-email-outbox.sql`: disabled capture control, durable intent table, atomic transition trigger, lease/dispatch/outcome RPCs, aggregate status RPC. No backfill, provider calls or scheduler creation.
- `apps/web/lib/service-email-outbox.ts`: dependency-injected worker and RPC adapter. Three items maximum per run, bounded reads/send/outcome writes, canonical production review origin, no logs of delivery content. Explicit isolated mode accepts only literal127.0.0.1/[::1] on a nonprivileged port and rejects production/arbitrary origins, so synthetic CTA tests cannot send people to production. No code imports this worker into a live endpoint yet.
- `apps/web/scripts/test-service-email-outbox.mjs`: worker failure/recovery and source-contract tests. These are NOT execution tests for the SQL proposal.

Claims and other ownership notices are deliberately not queued: their intended recipients, real committed transition hooks and approved family mapping must first be specified by Boss/Agent2. A template existing in Content Studio is not a notification mandate.

## Commit And Dedupe

The trigger runs in the transaction updating `service_submissions`. It captures only a transition into `submitted` or a changed provider revision while submitted. A row's held domain lock serializes the per-submission event sequence; `(submission_id,event_sequence)` is unique. A replay/no-op update in submitted state creates no new intent. A new revision/request-changes cycle is a new event, not a retry of the previous event.

Email-status-only updates cannot enqueue another email. A rollback removes both domain update and intent. No asynchronous HTTP callback is responsible for remembering that the transition occurred.

Persisted intent contains identifiers and delivery outcome, not email address, title, body, evidence, raw review token or rendered HTML. The authorized worker retrieves the current destination and permitted display context immediately before dispatch. Account deletion sets user references null; missing/changed recipient suppresses rather than reroutes. Submission deletion cascades the intent.

## Sender Interface

Worker sender receives `{to, profileTitle, providerName, submissionId, reviewUrl, idempotencyKey}` and an AbortSignal. Wrap Agent2's `sendServiceReviewEmail` without teaching the worker about CMS internals. Adapter must honor cancellation or finish within a strictly shorter internal deadline.

Outcome is `{outcome:'accepted'|'rejected'|'unknown', providerMessageId?, retryable?, retryAfterSeconds?}`:

- Accepted requires a bounded provider message ID. It means provider acceptance, never inbox delivery.
- A definitive rejection may retry with bounded delay/backoff. Six dispatches maximum. Permanent rejection or exhausted attempts ends failed.
- Network failure, timeout, lost response, malformed provider acceptance, or crash after marking dispatching ends unknown. Unknown is NOT picked up automatically. Operator review/provider reconciliation is needed before any resend decision.
- Intent UUID remains the idempotency key. Agent2 reports Brevo's finite dedupe window; this worker does not rely on deduplication beyond any provider window and never auto-retries an uncertain acceptance.
- A failed database receipt write fails the worker run; it never reports accepted or automatically repeats the send. The expired dispatch lease becomes unknown.

Lease before dispatch can be recovered for retry. Once dispatch has begun, an expired lease is ambiguous and becomes unknown. Concurrent workers use locked rows and skip-locked claiming. Recipient eligibility is rechecked in begin-dispatch; a change immediately after that DB transaction can still occur before external provider acceptance. No distributed atomicity with email is claimed. The review destination independently enforces current ownership.

## Existing Review Authority And Links

Proposed emails use `/service-review/{submissionId}` without token. Existing page/API already use authenticated account identity; the existing approval RPC permits a null optional token but still checks current owner, status and submission deadline. This proposal changes none of those checks.

The outbox never deletes, rotates or modifies `service_submission_tokens`. Previously emailed token links keep their existing validity/expiry after a failed new delivery. PGlite execution of the original approval RPC confirms old-token approval after a failed new dispatch, current-owner tokenless approval, wrong-owner/changed-owner/expired/cancelled/anonymous rejection. This is DB-function proof with synthetic prerequisite tables, not browser/HTTP proof; those remain an isolated integration gate.

## Required Application Integration Before Activation

1. Add a single authoritative route mode backed by the DB control/availability receipt. An outbox-enabled submit/revise must rely on atomic trigger capture and return truthful queued status, not call `sendOwnerReview`. Never leave both inline sender and outbox worker active for the same transition.
2. Replace manual `retry_email` token rotation with a reviewed, permission-checked retry/inspection operation on the existing intent. Requeue only definite failures; unknown requires explicit outcome reconciliation and an audit reason. The proposal does not yet implement this Admin/provider HTTP action.
3. Preserve or move in-app notification creation into the same reviewed transaction as its corresponding event. Current unchecked route insert cannot be called reliable merely because email has an outbox. Remove duplicate route inserts if moving them into DB.
4. Add an authenticated internal worker endpoint, one selected scheduler, aggregate Admin status and heartbeat/oldest-pending alerts. Use existing secret validation and safe error conventions. Never expose service-role RPCs, recipient details or keys to browser clients. These activation integrations are NOT present in this proposal.
5. Verify this schema against release readiness and account-deletion fulfillment invariants; include any required manifest/grant/retention update in the reviewed release. No automatic purge of pending/unknown intents. Any later retention deletes must preserve domain event dedupe and privacy guarantees.

## Cutover: No Retroactive Sends

1. Run the full proposal in the exclusively assigned disposable DB first. Confirm rollback, concurrency, existing tokenless authorization and existing old-token behavior with synthetic actors. Do not reset or mutate the backend while Agent1 owns it.
2. Review and package the SQL as one versioned migration only after the application integration above exists. Apply with capture disabled. No `INSERT ... SELECT` backfill of old submissions; no historic email blast.
3. During a controlled service-submit/email-retry maintenance window, deploy the outbox-aware application, verify its fail-closed mode and disabled worker, disable the inline sender for the new mode, then enable capture and the one worker schedule. Pending requests from the previous deployment must finish before switching to prevent dual sends.
4. Resume submits; verify one synthetic approved recipient through the real provider, persisted accepted/failed/unknown outcome and Admin visibility. Verify current-owner access and no stale-recipient mail. Do not claim inbox delivery without recipient/provider delivery evidence.
5. Enable real customer flow only after those receipts pass. Other email families remain untouched.

## Rollback And Pause

Pause the scheduler and disable dispatch; let in-flight requests finish or reconcile them to unknown. Preserve the table and all receipts. Do not replay accepted/unknown intents and do not re-enable the old inline sender for previously queued work. If service transitions must continue while mail is paused, a separate capture/dispatch control is needed before activation; the current minimal switch pauses both and thus requires submit/retry maintenance during rollback. Do not drop the trigger/table until all durable intents are accounted for and rollback sequencing is reviewed.

## Acceptance Gates Still Required

PGlite execution currently passes21 tests for actual proposal SQL and the original service approval RPC: disabled/no-backfill, atomic rollback/no-op dedupe, repeated cycles, exclusive claims, lease expiry, retry cap, null/stale-lease rejection, paused dispatch, current-owner mismatch, expiry, superseded event, client-role denial and approval boundaries. The test loads original service migration with only its unsupported pgcrypto extension declaration omitted (core gen_random_uuid is used); auth/guitar/storage prerequisite tables are synthetic. Multi-connection concurrency, full live-schema account-deletion compatibility, actual HTTP/Auth/Storage and browser/inbox behavior remain unverified. No backend slot or real customer data was used.

Thirty worker tests pass for bounded transport/DB failure, unknown acceptance, late promise results, definitive retry delays, production versus literal-loopback origin, batch limits, no private data in summary and sanitized RPC failures. Web typecheck and focused worker lint pass. Provider integration must separately validate idempotency contract, timeout handling, acceptance message ID, real test inbox delivery and bounce behavior.

Reproduce from repository root: `node apps/web/scripts/test-service-email-outbox.mjs` and `node apps/web/scripts/test-service-email-outbox-db.mjs`. The latter creates and closes an in-memory PGlite instance; it has no connection to the shared Docker backend or Supabase production.

## Exact Production Prerequisite

After the unimplemented route/worker/status integration and isolated SQL gates pass: explicit authorization to apply ONE reviewed, versioned service-email-outbox migration to production, followed by the coordinated capture/inline-sender/worker cutover above. Applying the draft SQL alone will NOT make email delivery reliable or activate anything. Do not ask for production schema authorization while the integration and SQL tests remain incomplete.
