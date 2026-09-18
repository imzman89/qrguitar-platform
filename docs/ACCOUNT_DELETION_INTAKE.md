# Account deletion request intake

The Account → Privacy & Data flow records or cancels a request for review. Intake alone does not erase data, freeze an account, or complete a fulfillment job. Administrators use the separate durable fulfillment protocol described in [Account deletion fulfillment](ACCOUNT_DELETION_FULFILLMENT.md).

Administrators open **Deletion requests** in Admin navigation, or visit /admin/deletion-requests. The queue lists pending requests newest first. Refresh reconciles cancellations, new submissions, and fulfillment status; the displayed count is loaded rows, not a lifetime total. An empty state appears only after a successful query. **Review and fulfill** performs a fresh server-side inventory and either records explicit blockers or advances the separate deletion state machine. A clear first review enters a fixed three-hour Storage quiescence phase and hides the Profile; review again after its displayed deadline for the required rescan. Never describe an intake receipt, blocked review, or quiescence window as completed deletion.

This candidate's production deployment gate must validate release **2026-09-17.11** before promotion; this document does not establish that the candidate was deployed. Apply the full reviewed sequence in [Release runbook](RELEASE_2026_09.md), ending with `20260918170000_account_deletion_fulfillment.sql` and `20260918171000_release_readiness.sql`. The schema migration does not erase an account by itself. Keep payment flags disabled until the applicable merchant/provider acceptance. See [Direct payment operations](DIRECT_PAYMENTS_OPERATIONS.md) for the candidate's receiving and review workflow.

The fulfillment inventory includes `service_evidence_uploads`: private actor-bound protocol receipts containing evidence metadata and an original saved-row result. These are not public instrument history. Their presence blocks Auth deletion until an approved service-record and Storage migration has been completed.

Client confirmations retain the read revision and UUID across retries. A delayed request cannot reopen a later-cancelled request. A verified matching 412 can settle an earlier unknown result; a 429 cannot. Shared settings-save failures do not disable the separate intake controller, and authenticated profile-metadata failures retain privacy access. Missing/corrupt retry storage blocks new actions without guessing a replacement identity.

The self-service read includes only a safe fulfillment phase, blocker codes, revision, review timestamp, and Storage deadline. It never includes the target Auth UUID or private inventory. Cancellation remains available while fulfillment is blocked; the client and database both reject it after the atomic quiescence freeze or database anonymization has started.

Verification: `npm run test:account-deletion-intake --workspace @qrguitar/web` runs the intake SQL/HTTP/runtime/client suites and historical readiness faults. `npm run test:account-deletion-fulfillment --workspace @qrguitar/web` covers the separate deletion state machine. The Account deletion concurrency GitHub workflow adds actual PostgreSQL 17 independent-client lock-barrier acceptance; local PGlite does not replace it.

## Server and database contract

Use the existing bearer-authenticated App Router conventions in `apps/web/lib/supabase-server.ts`, `apps/web/lib/admin-auth.ts`, and `apps/web/app/api/account/route.ts`. Keep all responses `Cache-Control: no-store`. Do not include tokens, request bodies, email, or personal content in logs.

## Verified actor boundary

For every self-service request:

1. Obtain the bearer token through the established server helper. Verify it with Supabase Auth `auth.getUser(token)`; use only the returned `user.id` as `p_actor_id`.
2. Fail closed if configuration, Auth verification, or the database is unavailable. A missing/invalid verified identity cannot reach the RPC. Preserve dependency-unavailable errors rather than presenting a fabricated empty state.
3. Do not accept `actorId`, `ownerId`, `targetUserId`, a client-selected email, role, account status, or an environment-admin flag. Reject unexpected JSON fields. Do not use user-editable account-type metadata for authority.
4. Do not apply `assertAccountCanWrite`: it intentionally blocks ordinary writes for locked/banned/removed profiles, whereas an Auth-verified person must still be able to ask for privacy review. SQL checks Auth existence without restoring/upserting a profile.

`auth.getUser` verifies identity for the submitted session; it does not prove recent password entry or recent OAuth authentication. Do not use a refreshed JWT's `iat`, a client `reauthenticated` boolean, or `user.last_sign_in_at` as proof that this session just reauthenticated. Intake is non-destructive and this intake implementation requires only a currently verified identity plus explicit request confirmation. If the final product requires recent reauthentication before intake or fulfillment, add a separate server-validated, actor/session-bound challenge and a single-use confirmation receipt, tested for token refresh, session switching and replay. That challenge is not implemented or implied here.

## Endpoints

| Endpoint | Allowed client input | Service-only RPC |
|---|---|---|
| `GET /api/account/deletion-requests` | Optional UUID query `requestId` | `read_account_deletion_requests(verifiedUser.id, requestIdOrNull)` |
| `POST /api/account/deletion-requests` | Exactly `{ operationId: UUID, confirm: true, expectedRevision: string }` | `submit_account_deletion_request(verifiedUser.id, operationId, expectedRevision)` |
| `PATCH /api/account/deletion-requests/{requestId}` | Exactly `{ operationId: UUID, action: "cancel", expectedRevision: string }`; route request UUID | `cancel_account_deletion_request(verifiedUser.id, requestId, operationId, expectedRevision)` |
| `GET /api/admin/account-deletion-requests` | Optional paired `beforeRequestedAt`/`beforeId`, optional integer limit 1–100 | `read_account_deletion_queue(verifiedAdmin.id, serverEnvironmentAdmin, beforeAtOrNull, beforeIdOrNull, limit)` |
| `GET /api/admin/account-deletion-requests/{requestId}/fulfill` | No query or body | `read_account_deletion_fulfillment(verifiedAdmin.id, serverEnvironmentAdmin, requestId)` |
| `POST /api/admin/account-deletion-requests/{requestId}/fulfill` | Exactly `{ operationId: UUID, action: "prepare" }` | Prepare, provider Auth deletion, then database-confirmed completion |

Use a small enforced body limit, strict JSON/UUID validation, existing same-origin protections for browser calls, and the existing native bearer flow without cookies or cross-origin redirects. No files, evidence, mandatory reason, or arbitrary notes are accepted. No mutation runs on mount or as a side effect of GET.

`expectedRevision` must be a canonical nonnegative decimal string from `"0"` through `"9223372036854775807"`: no JSON number, whitespace, sign, exponent, decimal point, or leading zero except `"0"` itself. Preserve the string when passing `p_expected_revision` to the bigint RPC; do not round-trip through JavaScript Number. This input is the revision displayed when the user explicitly confirmed that action. It is not a caller-selected actor or target authority. The SQL functions have no old overload or default expected revision.

For the admin queue and fulfillment item, call the existing `requireAdmin` server gate. Derive the actor and environment-admin exception only from its verified result; never copy a query/body/header flag. SQL checks protected database authority again. The target Auth UUID returned by prepare is server-internal and must never enter the admin response.

## Receipts and client behavior

Successful submit/cancel responses have this shape:

```json
{
  "ok": true,
  "receipt": {
    "operationId": "client-operation-uuid",
    "action": "submit",
    "requestId": "server-request-uuid",
    "expectedRevision": "0",
    "recordedAt": "server timestamp"
  },
  "request": {
    "requestId": "server-request-uuid",
    "status": "requested",
    "requestedAt": "server timestamp",
    "cancelledAt": null
  }
}
```

`ok:true` means the intake operation is recorded. It never means the account or personal data was deleted. `receipt` is the stable historical operation; `request` is current state. A replayed submit can correctly return `status:"cancelled"`. A replayed cancellation for an older request does not describe a newer active request; refresh GET to display the current active request.

GET returns `{ ok:true, revision:"0", request, activeRequest, latestRequest }`, with null for absent request values. `revision` is a canonical decimal string, zero before any accepted action. Reading does not create a revision row or any other state. Request values and revision come from the same stable SQL statement snapshot. `request` refers only to an explicitly supplied request ID. A foreign or missing explicit ID returns the same 404.

Under the existing actor lock, SQL checks the operation receipt before comparing revisions. An exact original operation/action/cancellation target/expected revision replays its original receipt without incrementing revision, even after later actions. Reusing an operation UUID with changed action, target, or expected revision returns `PD409`. If no receipt exists, the expected revision must match the actor's current revision or SQL returns `PD412` without writes. Each accepted fresh operation advances revision exactly once, including attaching another submit receipt to an active request or cancelling an already-cancelled request. Request, receipt, and revision are one atomic transaction. The receipt's `expectedRevision` is historical, not the current revision; mutation success does not include a top-level revision. Refresh GET for current state.

Each client must retain both operation UUID and expected revision for an unknown outcome and retry only the exact original intent. A refresh must not silently substitute its newer revision into an existing intent. A matching authoritative `412 intake_state_changed` envelope contains the original `operationId` and `expectedRevision`, with `uncertain:false,retryable:false`. It proves that this original operation has no receipt and cannot pass its stale revision, so even a previously unknown intent can be resolved on that exact rejection. After it, read current status and require a new explicit user confirmation before creating any new operation. Ordinary 400/401/403/404/409 responses to an uncertain retry do not establish that proof; keep the original intent. Malformed/mismatched error or success envelopes cannot clear it.

An actor switch aborts/ignores prior requests and must not publish another actor's status or clear their persisted retry intent. Clearing browser storage or changing devices can lose receipt recovery identity, but a new confirmation still uses the current server revision; older unseen operations cannot later reopen intake after a newer submit/cancel sequence. This is ordering for intake only, not identity reauthentication or the separate destructive lifecycle fence.

Fresh accepted writes have a transactional rolling-hour budget per actor: at most 60 receipts, with the final slot reserved for cancelling an active request. Submit and already-cancelled no-op cancellation stop at 59 recent receipts. Exact replays bypass the rate check; stale revision resolution happens before it. SQL scans at most 60 recent receipts using the `(actor_id,recorded_at DESC)` index under the same actor lock. A rejection writes no request, receipt, or revision. This limits write amplification without adding a quota table or changing ordinary account access.

Suggested UI copy is “Request received” and “Request cancelled.” State that the request is awaiting review and that submission has not deleted the account. Do not display a fabricated response deadline, email-delivery status, processing job, deletion success, or data export. Cancelling intake should not be labelled “data restored,” because no erasure occurred.

## Error mapping

- Invalid exact body, missing UUID, SQL `22023`: 400.
- Invalid/missing verified identity: 401; unavailable Auth/configuration: 503. Do not confuse a service failure with a voluntary sign-out.
- `PD404`: 404, same message for unknown and foreign request IDs.
- `PD409`: 409 `operation_conflict`; operation ID already belongs to another action/request/expected revision. Do not silently replace its UUID or expected revision.
- `PD412`: 412 `intake_state_changed`; expected revision no longer matches current actor state and this operation has no existing receipt. Return `uncertain:false,retryable:false` plus the original normalized `operationId` and canonical `expectedRevision`. Client must read status and obtain a new explicit confirmation, not automatically resubmit at a newer revision.
- `PD429`: 429 `intake_rate_limited`, `uncertain:false,retryable:true`, with the original normalized operation ID and expected revision. This does not resolve a previously unknown intent: keep its original identity and allow an explicit later retry. Do not invent a fixed Retry-After duration; the rolling window changes with receipt timestamps.
- Explicit missing verified SQL actor (`PD401`): 401. Explicit valid-actor queue role/status denial (`PD403`): 403. A stale/nonexistent SQL actor after Auth verification requires refreshing verification; no mutation retry with a different actor.
- Native PostgreSQL `42501` is an infrastructure permission/ACL failure, not proof that the user signed out or lacks the intended application role. Map it to 503; after a mutation was dispatched preserve uncertainty and its original operation UUID.
- Database/transport/read dependency failure: 503. If a mutation was sent and its result is unknown, mark the result uncertain and preserve the original UUID. Retry the same operation; do not infer cancellation or create a replacement request from an absent response.

Before implementation is accepted, add actual route tests for authentication failures, extra target/permission fields, body limits, dependency outages, missing/mismatched receipts, unknown commits, and cache headers; client tests should cover actor changes, storage denial, retry identity and stale request displays. Those HTTP/client behaviors are not claimed by the SQL-only test report.
