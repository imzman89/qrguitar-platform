# Account deletion fulfillment

Account deletion is a durable, resumable administrator workflow. It preserves each instrument's permanent QR identifier and factual record while removing the departing person's identity and personal content. A request is complete only after database anonymization, Supabase Auth deletion, and the database finalizer all succeed.

Apply `20260918170000_account_deletion_fulfillment.sql` followed by `20260918171000_release_readiness.sql`. Production must report release `2026-09-17.11` with all 14 readiness checks passing before the compatible application is promoted. The schema migration does not delete any account by itself.

## State contract

- `blocked`: the inventory found data that requires a reviewed business or storage decision. No anonymization or Auth deletion has started. An administrator may resolve the listed causes and safely run **Review and fulfill** again. The person may still cancel the request.
- `quiescing_storage`: a clean inventory has atomically recorded private custody, forced every affected instrument Profile to private visibility, frozen the account Profile as removed, and hidden its public content. Only then does it start one fixed three-hour drain window for already-issued Storage upload URLs. Database anonymization and Auth deletion have not started. Cancellation is no longer possible because the write freeze is active. Review again after the displayed deadline; a retry before it preserves the original deadline. A late object changes the blocker to `storage_cleanup_required`, and the same job resumes only after its bytes and metadata are verifiably removed.
- `ready_for_auth_deletion`: database identity links have been removed and the account is frozen. The target Auth UUID is consumed only inside the server process; it is never included in the browser/admin JSON response. Cancellation is no longer possible. A retry safely attempts Auth deletion and finalization again.
- `completed`: the database has independently observed the target Auth row disappear and recorded completion. This is the only completed state.

Prepare and complete operations have UUID receipts and serialize on the request. Exact retries are idempotent. The first clear prepare records the quiescence deadline after acquiring the deletion locks. A later prepare performs a fresh inventory after that deadline and anonymizes only when it is still clear. Losing the HTTP response after Auth deletion is safe: a retry receives the ready record, observes the null Auth foreign key, and completes the same state machine without duplicating history or audit effects.

The API surface is:

| Endpoint | Input | Result |
|---|---|---|
| `GET /api/admin/account-deletion-requests/{requestId}/fulfill` | No query or body | Safe fulfillment status, or null before review |
| `POST /api/admin/account-deletion-requests/{requestId}/fulfill` | Exactly `{ "operationId": "UUID", "action": "prepare" }` | Safe blocked, ready, or completed status |

Both methods use the existing server-side `requireAdmin` gate and service-role RPC boundary. Requests are same-origin, no-store, strict JSON, identity encoding only, and bounded to 512 bytes with an actual streamed-byte limit and read timeout. SQL checks administrator authority again. The server passes its normalized owner/admin email allowlist into the inventory so an environment-managed administrator remains blocked even when their Profile role is not `admin`. Native database permission errors fail closed as dependency failures.

## Retained instrument Profiles

Before Auth deletion can be attempted, the transaction locks the person's Profile row, inventories all known account-bearing tables, atomically records each affected instrument's custody and prior visibility, forces those instruments private, and freezes the account Profile as removed. It then waits out the fixed Storage drain window, rescans, and anonymizes under the same lock. A failure anywhere in the first transition rolls back the custody rows, visibility changes, account freeze, and job state together. Write-fence triggers make an earlier actor or recipient-email write finish before the inventory and reject a later write, including an Auth email change during review. The normalized target email is private protocol state during blocked/quiescing review and is cleared before the browser-safe ready state. A salted irreversible fingerprint remains after the Auth foreign-key cascade so a privileged or no-FK writer cannot reintroduce the deleted UUID.

Each retained instrument keeps its `id`, QR code, permanent path, brand, model, year, serial number, and non-personal system history structure. It becomes ownerless and private. Free-form Profile fields, specifications, external media, and timeline text are cleared or replaced with generic retained-history labels; timeline entries become private and lose actor/provider/reviewer links. Trust settings are rebuilt from a fixed machine-only schema with every note blank, so unknown legacy JSON cannot survive. Storage-backed media or documents block the operation before this phase because object-byte deletion must be confirmed separately.

Every detached instrument receives an immutable `privacy_review_required` custody record. Custody triggers prevent it from becoming public, being assigned, transferred, claimed, or deleted. Public catalog and public-file eligibility therefore remain false. This release intentionally has no custody-release RPC. A future reviewed protocol must establish a lawful claimant and inspect retained content before it can release or republish the Profile.

The final privacy postcondition scans custody records, retained Profile text/linkage, actor-attributed content, site JSON/text, storage paths, and administrator audit identity fields for the departing UUID or normalized email. Any unexpected retained value aborts the whole anonymization transaction with `PD500`; Auth deletion is not attempted. Relational attribution drives deterministic scrubbing even when the text contains no identifier. Unattributed legacy prose containing only an old email, a name, phone number, or address cannot be linked to a person with certainty; it requires the documented manual privacy review and must not be represented as machine-proven erasure.

## Resolving blockers

Never remove a blocker by zeroing a balance, deleting evidence, or changing a status merely to make the workflow pass. Record and perform the actual resolution, then rerun prepare so the database recomputes the inventory.

| Blocker | Required resolution before retry |
|---|---|
| `administrator_account` | Assign required administration responsibility to another verified administrator and change the departing Profile through the existing admin workflow. |
| `unused_paid_credits` | Obtain and record the approved refund or privacy-safe entitlement migration. Do not silently forfeit credits. |
| `unused_profile_credits` | Resolve free/purchased Profile capacity through the same reviewed entitlement decision; do not manually zero it. |
| `unresolved_payment_order` | Finish or expire the order through its provider-specific order workflow and verify the ledger result. |
| `payment_hold_or_dispute` | Resolve and record the hold/dispute through the payment review ledger. |
| `billing_retention_migration_required` | Migrate required financial history to a non-personal, auditable retention subject under a separately reviewed procedure. Financial rows are never simply erased by this workflow. |
| `storage_cleanup_required` | Enumerate the exact private objects, delete their bytes through the owning storage workflow, verify absence, then remove/finish the matching metadata or staged receipt. A metadata-only delete is insufficient. |
| `storage_quiescence_required` | No manual change is required. Keep the Profile frozen and retry after the exact displayed deadline. The next prepare performs a new Storage and database inventory; it never treats the original scan as proof. |
| `active_ownership_transfer` | Complete or cancel the transfer through the ownership workflow after deciding who should retain the instrument. |
| `active_ownership_claim` | Resolve or cancel the claim through the claim workflow. |
| `active_service_workflow` | Complete, reject, or return the active service submission through the service workflow. |
| `service_record_migration_required` | Move required factual service history to privacy-safe attribution, remove private files, and retain an auditable migration record under a separately reviewed procedure. |
| `retained_personal_content_review_required` | Review target-authored unscoped Site Editor content and any other durable content/receipt containing the target UUID or email. Remove or migrate the personal material through the owning workflow, retain the change/audit receipt, and retry. |

If no approved procedure exists for a required migration, leave the job blocked. The blocked state is the durable resume contract and must be shown truthfully to the administrator.

## Operations and verification

The administrator queue shows the current blocker codes, the fixed quiescence retry deadline, and concrete resolution guidance. A ready record remains visible with an explicit Auth reconciliation warning. The queue never receives `authActorId`, target email, storage paths, payment identifiers, or private content. The self-service status reports the safe fulfillment phase, disables cancellation after quiescence starts, and never exposes the internal Auth target.

`npm run test:account-deletion-fulfillment --workspace @qrguitar/web` runs isolated database privacy/idempotency/custody tests, API boundary and stalled-body tests, and readiness generation. It also verifies the server-data boundary directly as `anon`: application tables remain inaccessible, while route-level catalog and file checks reject removed, hidden, and custody-held Profiles. `npm run test:release-readiness --workspace @qrguitar/web` fault-injects the pinned production contract. The **Account deletion concurrency** workflow uses independent PostgreSQL 17 connections and lock-manager evidence to prove both sides of the prepare/write boundary, including rejection after the Auth cascade. Local PGlite coverage does not replace that scheduling proof.

Before enabling fulfillment in production, rehearse at least one blocked case and one disposable clear case against an isolated clone with the real Supabase Auth admin API and Storage adapter. Confirm that the first clear pass hides the Profile, the fixed three-hour deadline survives retries, an object uploaded with a previously issued URL is found by the post-deadline rescan, cleanup resumes the same job, a provider failure leaves the job ready, retry completes after Auth absence is visible, retained QR URLs are not publicly eligible, private files are gone, and no deleted identity appears in API responses or logs.
