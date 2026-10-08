# Service and transfer outcome email proposal

This is a default-disabled schema proposal, not an installed migration or a live-email claim.
Install only through a separately authorized database change after, in order:
`service-email-outbox.sql`, `action-required-email.sql`, `claim-completion-recovery.sql`,
`action-email-operations.sql`, and `claim-outcome-email.sql`.

The extension locks both control singletons and requires the intact, disabled, unbound
`.2` predecessor. It updates six existing function hashes, registers five new private
functions, validates nine triggers, and advances readiness to `2026-09-27.action-email.4`.
It does not enable capture, dispatch, a scheduler, a provider, secrets, or historical backfill.
The worker/operator release and this schema must be compatible before any cutover.

## Committed sources and destinations

| Family | Transition | Recipient | Authenticated destination |
| --- | --- | --- | --- |
| `service.approved` | submitted to approved | Existing provider | `/service-work/<qr>?submission=<uuid>` |
| `service.declined` | submitted to declined | Existing provider | Same service status page |
| `service.cancelled` | draft/submitted/changes_requested to cancelled | Original owner when provider cancels; provider when another administrator cancels | Owner: `/service-review/<uuid>`; provider: service status page |
| `ownership.transferAccepted` | sent to accepted | Prior owner | `/transfer/<uuid>` |
| `ownership.transferCancelled` | sent to cancelled | Unique current confirmed Auth identity matching existing assigned email | `/transfer/<uuid>` |

Provider priority applies when the cancelling actor is also an administrator. A missing
authoritative cancellation role does not generate email. Blank code-only transfer assignments,
unconfirmed, changed, or ambiguous destination bindings cannot receive cancellation email.
Expired transfers are not cancellation events. Terminal inserts and unrelated closed-row
updates never backfill outcomes. Existing claim and service-revision behavior is preserved.

All recipients must still have an active profile, an Auth email, and no pending deletion.
Removed or archived Profiles suppress delivery. Owner-facing service links require the
original owner still to own the Profile. Terminal provider/prior-owner links use their
historical authenticated status routes, not a private Profile they may no longer access.
Expired workflow timestamps do not invalidate an otherwise valid committed terminal notice.

## Atomic cancellation API contract

`cancel_service_submission(p_submission_id uuid, p_actor_id uuid,
p_env_admin boolean default false, p_note text default '')`

- Only `service_role` can execute. HTTP must derive actor identity and verified admin
  status server-side; no client actor/admin override and no nonatomic fallback.
- SQL requires existing Auth identity, active profile, no requested deletion, and either
  the existing provider or verified administrator. It locks submission then guitar,
  consistent with the existing approval workflow.
- One transaction changes status/timestamps, records the non-PII recipient-role marker,
  preserves the existing activity author/note, and creates the original in-app notification.
- Result: `{ok:true, submission:<committed row>, alreadyCancelled:boolean}`.
- Authorized replay returns the cancelled row without another activity, notification, or
  email intent. Other closed statuses fail. Missing counterpart identity suppresses the
  notification/email rather than inventing an address. RPC absence must return unavailable.
- Browser roles cannot directly set cancellation status/marker or invoke the RPC. The marker
  cannot be added retrospectively or rewritten after cancellation.

## Dispatch and operator contracts

All five families use `{event,to,profileTitle,subjectId,qrCode}`. Terminal services additionally
carry `serviceRole: 'provider' | 'owner'`. `subjectId` is the submission or transfer UUID.
Provider service routes receive the real QR identifier; owner service and transfer routes
receive `qrCode:null`. Existing service-revision and claim DTO shapes remain unchanged.
Transport output must still be the approved strict document contract, never the source row.

Operator receipts add `transferId: uuid | null`; exactly one claim/submission/transfer source
is populated. Transfer reconciliation locks guitar then transfer before intent, matching the
existing transfer RPCs. Unknown provider outcomes still require explicit reviewed evidence;
they are never automatically replayed.

Dispatch locks the source and destination Auth/profile rows and rechecks eligibility after
the destination lock. This catches email-binding changes that commit while the worker waits.
A completed `begin_action_email` is the database authorization boundary, not an inbox receipt.
Later withdrawal/deletion cannot recall a request already released to an external provider.

No recipient address or duplicate actor UUID is stored on an intent. Closed source versions
and the role marker remain stable during existing privacy pseudonymization. Actual retained
service/transfer privacy preparation is included in the tests.

## Evidence and remaining scope

- `node apps/web/scripts/test-service-transfer-outcome-email-db.mjs`: 66 passing checks;
  full repository schema, six proposals, synthetic Auth scaffold, real workflow/privacy RPCs.
- `node apps/web/scripts/test-service-transfer-outcome-concurrency.mjs --execute <owned-container>`:
  15 native PostgreSQL 17 checks. The harness refuses nonempty databases, wrong container labels,
  external port bindings, bind mounts, or enabled cron execution before schema loading.
- Native checks cover authenticated owner/provider/admin direct-write/RPC denial, server RPC
  success, duplicate/rollback cancellation, both approval/cancellation orders, transfer replay
  and accept/cancel races, both Auth-email/dispatch lock orders, and stale owner-link suppression.
- Scheduler remained inactive and provider HTTP queue stayed empty. The owned fixture was
  removed after label verification; six original local services were untouched.

Logs: `outputs/customer-journey-20260926/service-transfer-db.log` and
`service-transfer-native.log` in the Senior Agent workspace. Boss owns HTTP integration,
renderer/worker/operator integration and the final combined build. These results do not prove
candidate browser integration, provider acceptance, inbox delivery, or production readiness.
