# Transactional email event ledger

This ledger distinguishes runtime sends from provider-owned Auth mail, provider receipts, administrator tests, and design-only Content Studio entries. A registered template is not evidence of a trigger.

## Runtime events

| Event | Trigger/source | Recipient authority | Rendering owner | Link/token | Idempotency and retry | Evidence and current gap |
| --- | --- | --- | --- | --- | --- | --- |
| Service work ready for owner review | `POST /api/service-submissions`, actions `submit` and `revise`; manual `retry_email` | Immediately before sending, the route reloads the submitted request, fetches that owner through Supabase Admin, and verifies that the active Profile still belongs to the same owner | QRguitar renders `email.service.submitted.*`; Brevo accepts transport | Existing authenticated `/service-review/{id}` route; the email contains no review token. The request keeps its original `expires_at`, and retry does not extend it. | The transport adapter can include an optional UUID idempotency field, but single-recipient provider deduplication and the exact accepted header spelling have not been verified. The current route does not pass one, does not retry automatically, and has no durable outbox; future retry logic must not rely on this field without a controlled provider test. | Source records accepted/rejected/unknown semantics, activity, and the provider receipt when present. A 2xx response without a provider receipt is unknown, not accepted; unknown outcomes direct the operator to check the inbox before manual retry. The inactive outbox/cutover proposal must be reviewed before any migration or caller change. |
| Content Studio application test | `POST /api/site-editor/test-email`, authenticated administrator | Fixed to authenticated administrator email | Same application renderer/transport as service review; subject is prefixed `[TEST]` | Fixed non-secret sample review URL | No automatic retry; provider acceptance/rejection/unknown is returned. Only `email.service.submitted` is allowed. | Admin audit records status, outcome, provider message ID, and delivery owner. No real test was sent during this implementation. |
| Confirm signup | `supabase.auth.signUp` | Email entered for the new Auth identity | Supabase Auth template `confirm signup` | Provider-generated `{{ .ConfirmationURL }}` | Provider-owned; application does not retry or duplicate it through Brevo. | Install artifact: `docs/provider-email-templates/supabase-confirmation.html`. Provider save and inbox delivery require separate evidence. |
| Password recovery | `supabase.auth.resetPasswordForEmail` from login/account recovery | Email submitted to Supabase Auth | Supabase Auth template `recovery` | Provider-generated `{{ .ConfirmationURL }}` | Provider-owned; application does not retry or duplicate it through Brevo. | Install artifact: `docs/provider-email-templates/supabase-recovery.html`. Content Studio copy is a review reference, not synchronized configuration. |
| Transfer sign-in / claim | `supabase.auth.signInWithOtp` in `POST /api/transfers`, with `shouldCreateUser: true` | Transfer recipient email | Supabase Auth `magic link` template | Provider-generated `{{ .ConfirmationURL }}` redirects to the claim route | Provider-owned; do not add a duplicate Brevo invitation. | Install artifact: `docs/provider-email-templates/supabase-magic-link.html`. Profile/sender CMS variables are unavailable at this provider boundary. |
| PayPal receipt or payment notice | PayPal checkout/provider event | PayPal account/customer address under PayPal policy | PayPal | Provider-owned payment links and receipt identifiers | Provider-owned | QRguitar has no receipt sender and must not duplicate one. |
| Collection inquiry email | None; `/api/collection-inquiries` returns HTTP 410 | None | Retired | None | None | Legacy sender removed. Members use durable QRguitar Messages. |

Brevo request acceptance means the provider accepted the request. It does not prove inbox delivery. The application requires an explicit `SMTP_FROM` or `EMAIL_FROM` that matches a Brevo-verified sender; it never falls back to an unverified branded address. A timeout or lost response is `unknown`, not a safe automatic-retry signal. Brevo documents a 30-minute idempotency window for batch-email patterns, but that guarantee was not verified here for the single-recipient endpoint. A durable worker must not assume this adapter field provides deduplication.

## Registered Content Studio families

| Family | Runtime status | Delivery authority |
| --- | --- | --- |
| `email.service.submitted` | Application-renderer-bound | QRguitar + Brevo |
| `email.service.revisionRequested` | Design preview only | None |
| `email.service.resubmitted` | Design preview only | None |
| `email.service.approved` | Design preview only | None |
| `email.service.declined` | Design preview only | None |
| `email.service.cancelled` | Design preview only | None |
| `email.ownership.transferInvitation` | Provider-owned review reference | Supabase Auth magic link |
| `email.ownership.transferAccepted` | Design preview only | None |
| `email.ownership.transferCancelled` | Design preview only | None |
| `email.ownership.storeHandoff` | Design preview only | None |
| `email.claim.submitted` | Design preview only | None |
| `email.claim.ownerReview` | Design preview only | None |
| `email.claim.moreInfo` | Design preview only | None |
| `email.claim.approved` | Design preview only | None |
| `email.claim.declined` | Design preview only | None |
| `email.claim.expired` | Design preview only | None |
| `email.notification.lostStolen` | Design preview only | None |
| `email.security.passwordReset` | Provider-owned review reference | Supabase Auth recovery |
| `email.security.accountNotice` | Design preview only | None |

Content Studio can send an administrator test only for the application-renderer-bound family. Every other family downloads a setup export that identifies its owner and binding status. The export does not change provider configuration or prove delivery.
