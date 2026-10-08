# Claimant Outcome Email Proposal

Bounded extension of the disabled action-email foundation. No shared SQL, production migration, binding, activation, scheduler change, recipient backfill or actual send is authorized by these artifacts. Install only after `action-email-operations.sql`; Boss owns TypeScript readiness version and operator integration, Agent2 owns renderer/sender/worker and UI mapping.

## Committed Events

Only a transition from `awaiting_owner`, `awaiting_claimant` or `admin_review` to one of these states captures an intent:

| Final claim state | Email event | Recipient | CTA |
| --- | --- | --- | --- |
| `approved` | `claim.approved` | Claimant's current Auth address | Actual Profile `/i/<QRG>` |
| `denied` | `claim.declined` | Claimant's current Auth address | Signed-in `/ownership-claim?claim=<UUID>` |
| `expired` | `claim.expired` | Claimant's current Auth address | Signed-in `/ownership-claim?claim=<UUID>` |

No owner copy is defined or created. `cancelled` is claimant withdrawal and remains in-app. Merely passing `expires_at` does not produce an event or introduce an expiry scheduler. Explicit admin expiration is a distinct committed `expired` state. Initial closed inserts, same-status edits, original-reviewer RPC replay and historical records never backfill. An incomplete saved request may be explicitly denied or expired; that outcome does not mark its evidence complete.

The existing source-version unique key and committed transaction capture enforce one intent per relevant transition. Rollback produces no outcome. Obsolete pending intents are suppressed; prior unknown/dispatching history is preserved for operator review, not silently retried. Closed same-status source versions remain frozen to preserve the existing privacy retained-facts fingerprint.

## Dispatch and Retry

The recipient is reloaded from Auth with an active Profile and no pending account deletion. No typed recipient address or copied email/actor snapshot is added. Version and final state must still match. Removed or archived Profiles suppress delivery.

For approval, current Profile ownership must still equal the claimant, not the old `current_owner_id` recorded on the claim. A later transfer suppresses an approved Profile CTA if it precedes dispatch authorization. Once dispatch authorization has committed, a subsequent ownership change cannot recall a provider request already in flight; this proposal does not promise that. Declined/expired historical outcomes still address the claimant if Profile ownership later changes. The prior owner's restrictions do not redirect or independently block a claimant outcome. Terminal outcomes do not become ineligible merely because the original request expiry passes.

The dispatch DTO stays `{event,to,profileTitle,subjectId,qrCode}`. `subjectId` is the claim UUID. Approval supplies the actual `g.qr_code`; declined/expired supply null. Agent2 must validate the QR path using the established allowlist and keep the approved Open Profile CTA truthful. No private note, evidence, token or owner identity enters this DTO. Existing owner-review, more-info and service-revision semantics are retained.

Manual failed/unknown reconciliation continues to use the shared eligibility helper, budget, exact timestamp and audit safeguards. No automatic unknown replay, extra recipient or new send path is added.

## Install Guard and Readiness

Before changing definitions, the proposal locks the control and operations singleton rows through commit, rejects missing rows, requires exact predecessor version `2026-09-27.action-email.1`, validates its manifest/schema, requires both capture and dispatch off, and requires the operations row unbound. Unexpected or active installations need operator review; this proposal never silently pauses or rebinds them.

The extension changes the event/family constraints and exactly four manifested functions: claim capture, dispatch begin, retry eligibility and readiness. Only those four hashes are refreshed; other preexisting drift is not blessed. Readiness becomes `2026-09-27.action-email.2`. The baseline operations proposal and its `.1` tests remain a deliberate predecessor-stage test. Runtime version `.2` and all three renderer/worker/operator event mappings must be integrated before any separately authorized activation.

## Evidence

- `node apps/web/scripts/test-claim-outcome-email-db.mjs`: 50 full-schema isolated SQL checks, including actual approval/denial RPCs, rollback/replay, withdrawal and timestamp exclusions, current Auth/address and owner checks, prior-family regressions, preserved unknowns and all three closed-outcome privacy intake/pseudonymization flows. Six rejected install scenarios compare all 20 original function definitions and manifest hashes after rollback; successful installation changes exactly four hashes.
- Native PostgreSQL17: `node apps/web/scripts/test-action-required-email-concurrency.mjs --execute qrg-action-email-pg-20260927 135f996c7135d9b71d14c0af20f3b4b5865cfd21 --operations --outcomes`. Eight cases cover concurrent approval/denial replay, duplicate expiry, rollback visibility, both dispatch-versus-later-transfer orders, withdrawal exclusion and inactive/unbound scheduling with zero HTTP requests. The owned fixture was removed by label check; the original six services remained.

These are source/database fixtures, not provider acceptance, inbox delivery, live migration or hydrated production evidence. No TypeScript, component, package or shared backend changes are part of this SQL slice. Boss owns the integrated build and cross-layer tests.
