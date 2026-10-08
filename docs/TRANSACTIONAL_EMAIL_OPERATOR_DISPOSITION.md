# Transactional notification disposition

This is the operator view of production behavior at release `0bde417` (September 26, 2026). Content Studio registration is not a delivery trigger. Earlier Account → Notifications wording promised more email delivery than was connected. The released page now names the implemented email paths and directs other updates to the relevant workspace. This copy correction does not implement the missing triggers listed below.

## Implemented delivery

| Event | Disposition | Trigger and recipient | Current UX / operating note |
| --- | --- | --- | --- |
| Signup confirmation | Implemented provider | `supabase.auth.signUp`; Supabase Auth emails the address being registered. | User follows the provider confirmation link. QRguitar must not duplicate it. |
| Password reset | Implemented provider | Login or Account security calls `resetPasswordForEmail`; Supabase Auth emails the signed-in or entered account address. | Reset page consumes the recovery link. Provider template is authoritative. |
| Transfer invitation / resend | Implemented provider | A committed email-bound transfer, or explicit resend, calls `signInWithOtp`; Supabase Auth emails `transfer.to_email`. | Recipient signs in and returns to the transfer claim route. Resend must not create another transfer. |
| Service work submitted or revised for owner review | Implemented application | Committed `submit`, `revise`, or explicit `retry_email`; current owner is reloaded and verified immediately before Brevo submission. | Owner gets the authenticated `/service-review/{id}` link; an in-app owner-review notification is also recorded. Provider acceptance is not inbox delivery. |
| Content Studio service-template test | Implemented application, operator-only | Authenticated administrator explicitly tests `email.service.submitted`; recipient is that administrator. | It validates renderer/transport only. All other families export or preview and cannot send tests. |
| Payment receipt | Implemented provider | Successful PayPal capture under PayPal's buyer/payment flow; recipient and receipt policy are PayPal-owned. | QRguitar shows durable order/credit status in Billing. Do not send a duplicate QRguitar receipt. |

## Intended but not connected

These registered families describe a useful action or high-value state change, but no application/provider send is connected today.

| Family / event | Disposition | Exact trigger and recipient if implemented | Current UX and blocker |
| --- | --- | --- | --- |
| `email.claim.ownerReview` | Needed but not connected | After an ownership claim commits in `awaiting_owner`; email the revalidated current owner. | Claim exists in the ownership-request UI only. Needs recipient revalidation, durable dispatch semantics, and a non-secret authenticated claim URL. |
| `email.claim.moreInfo` | Needed but not connected | After admin `request_information` commits; email the claimant. | Claimant sees `awaiting_claimant` and the note after opening claims. Needs a committed-event dispatch path and safe retry policy. |
| `email.claim.approved`, `.declined`, `.expired` | Needed but not connected | After the corresponding claim state transition commits; email the claimant. | Status/event history is visible in-app. Needs one canonical outcome event per committed transition and a decision on whether current owner also receives an outcome. |
| `email.service.revisionRequested` | Needed but not connected | After an owner requests changes; email the provider responsible for the submission. | Provider sees status in the service workbench. Needs an authoritative provider address lookup and committed-event dispatch. |
| `email.service.resubmitted` | Needed but not connected, replacement decision required | On committed revise/resubmit; recipient is the current owner. | Runtime already sends the generic submitted family on `revise`. Connecting this family without replacing that send would duplicate mail; product must choose generic versus distinct copy. |
| `email.service.approved`, `.declined`, `.cancelled` | Needed but not connected | After the corresponding committed owner/provider transition; email the other workflow participant. | Both parties can inspect workbench status. Needs explicit recipient rules and one send per committed transition. |
| `email.ownership.transferAccepted`, `.transferCancelled` | Needed but not connected | After atomic transfer acceptance or cancellation; acceptance goes to prior owner, cancellation to the assigned recipient when still valid. | Transfer pages show current status. Needs post-commit event identity and recipient/address-retention rules. |
| Account deletion completed | Needed but not connected; no registered family | Immediately before or as Auth identity deletion is finalized; email the account address captured under an approved retention rule. | Request, blockers, quiescence, and cancellation are visible in Account → Privacy while access exists. Completion removes sign-in, so in-app status alone is insufficient. Needs legal/product copy, address retention authority, and durable pre-deletion dispatch. |

## Intentionally in-app

| Event | Disposition | Trigger / recipient | Current UX |
| --- | --- | --- | --- |
| Member message received/replied | Intentionally in-app | `send_member_message`; the other conversation participant. | Durable QRguitar Messages holds the conversation and media while both email addresses stay private. There is no email preference or mail trigger. |
| Account deletion requested/cancelled/blocked | Intentionally in-app until completion | User submit/cancel or fulfillment blocker changes; the requesting account. | Account → Privacy shows the request reference, status, blockers, recovery, and refresh controls. The completion exception is listed above. |
| Payment pending/review/refund/dispute state | Intentionally in-app for QRguitar status; provider mail remains provider-owned | Verified PayPal capture/webhook/reconciliation events; signed-in purchaser. | Billing shows saved payment, fulfilled credits, review holds, and recovery. PayPal owns buyer payment notices; QRguitar should not duplicate them. |
| Claim submission confirmation and claimant withdrawal | Intentionally in-app | The claimant's own committed action. | The API returns confirmation and the claims UI/event history shows state. Counterparty/action-required claim events remain gaps above. |

## Undefined; do not connect without a decision

| Family / event | Disposition | Missing definition |
| --- | --- | --- |
| `email.ownership.storeHandoff` | Not needed/undefined today | No distinct production event exists beyond the transfer workflow. Define whether this replaces the normal transfer invitation for verified stores before adding a send. |
| `email.notification.lostStolen` | Not needed/undefined today | No recipient policy is defined: the owner usually performs the safety-status change, and no watcher/subscriber model exists. Define the authoritative event and audience first. |
| `email.security.accountNotice` | Not needed/undefined as one generic family | “Account notice” does not identify a security event. Split explicit events—such as email-address change, lock, or admin restriction—with recipient and anti-abuse rules before implementation. Password recovery is already provider-owned. |
| Collection inquiry email | Not needed | The endpoint is retired with HTTP 410; members use durable QRguitar Messages. The legacy sender was removed. |

## Remaining operator decisions

1. The Account → Notifications copy correction is released and live-verified at `0bde417`; the former “Required” and “Enabled” claims no longer describe the current interface. There is no user-selectable email preference. The action-required claim/service and transfer-outcome delivery gaps above remain implementation work.
2. A separate disabled service-email recovery candidate exists at `3197d44`; it is not part of production `0bde417`. Complete its configured integration gate and separately authorize the required production migration/cutover before activation. It does not connect every family above. Do not send inside a transaction or infer success from a lost response; do not rely on the unverified optional Brevo idempotency field.
3. Define recipient revalidation and safe authenticated destinations per event. Never place evidence, ownership tokens, payment identifiers, or deletion secrets in email.
4. Decide account-deletion completion timing and lawful address retention before Auth deletion. This is the only identified event for which in-app-only status becomes unavailable by design.

## Live published-content precedence

Before the September 26 release, the public merged settings endpoint returned the prior Account → Notifications wording for these exact keys:

- `ui.app.account.page.b7d24faecb5a`
- `ui.app.account.page.c9aae06952ae`
- `ui.app.account.page.92c1cdfdf4cb`
- `ui.app.account.page.e16273f1c0f6`

A read-only query of the production `site_content` record confirmed that none of these four keys is explicitly stored in `homepage.content`, and that no draft row exists. `UiTextProvider` gives published content precedence, but no saved override blocked the corrected registry defaults. Release `0bde417` made those defaults effective; the settled live owner Account screen was independently inspected after deployment. No Content Studio mutation was needed. The read-only receipt is `outputs/email-automation-20260926/notification-raw-overrides.json` (2026-09-26T20:56:29Z). No production Content Studio value was changed during this audit.

## Local candidate continuation — September 27

The production dispositions above remain unchanged. Locally, the disabled service/action foundation, claim completion recovery, authenticated delivery-review UI, guarded runtime and inactive scheduler are integrated. The additional claimant outcomes `claim.approved`, `claim.declined` and `claim.expired` now have proposed atomic capture, current-recipient checks, registered-copy renderers and safe destinations. Approval uses the permanent Profile link only while the claimant remains its owner; declined/expired use the authenticated claim page. Withdrawal stays in-app. No current-owner outcome copy, automatic time-based expiry job, historical backfill or duplicate submission mail was added.

See `supabase/proposals/claim-outcome-email.md` for implementation and evidence. These are not live sends: required production schema installation and activation remain unauthorized, and actual candidate browser/Auth/Storage integration remains pending. Service/transfer outcomes and deletion-completion delivery are not completed by this claim-only extension.

## Service and transfer continuation — local implementation, not activation

The next disabled candidate connects service approval/decline to the submitting provider and service cancellation to the recorded counterparty: provider cancellation targets the original owner; another administrator cancellation targets the provider. The proposed atomic cancellation RPC commits status, existing activity, notification and a nonpersonal recipient-role marker together. Missing schema returns an unconfirmed result; the API never falls back to separate writes. This is a production schema dependency, not a safe standalone deployment.

Accepted transfer notices target the prior owner. Cancelled transfer notices require a unique, current, confirmed Auth binding for the existing assigned email. No new address-retention rule or token is introduced. Service links use authenticated workbench/review pages; terminal transfers use authenticated transfer-status pages. A former owner or provider is never assumed to retain private Profile access. Saved template values retain precedence; unavailable personal/Profile variables fail without sending.

Claims/services/transfers use mutually exclusive subject IDs in the safe operator DTO. Tests use synthetic inputs and captured transport. The worker remains disabled, the scheduler inactive, and all production migration, CMS publication and provider activation restrictions remain in force. Account deletion completion still needs an approved timing/address-retention decision and is not implemented by this slice.

Before any future activation, inspect the current published templates for unavailable legacy variables (including profile_url, provider_name and sender_name). The compatibility registry retains those names, but these terminal dispatches intentionally do not invent their values. Unsupported saved usage prevents sending. This local pass neither reads out private production templates nor publishes replacements.
