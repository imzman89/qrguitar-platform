# Profile credit billing

The default customer billing candidate uses automatic PayPal checkout, documented
in [PAYPAL_CHECKOUT_SETUP.md](PAYPAL_CHECKOUT_SETUP.md). Earlier direct-link payments
remain recoverable through `/billing/manual`; their receipt review is documented
in [DIRECT_PAYMENTS_OPERATIONS.md](DIRECT_PAYMENTS_OPERATIONS.md). The Stripe-specific
configuration and webhook instructions below apply to the retained legacy
integration. All flows share the protected Profile credit ledger.

Billing is disabled by default. Adding this code or applying its schema does not
activate purchases, create a Stripe account, or charge a customer.

## Product contract

The approved packs are one-time USD purchases: 1 credit for $12, 10 for $50, and
25 for $99. Unused purchased credits do not expire. Each successful new Profile
uses one credit when the owner's 5 free owned-Profile allowance is full.
Transfers are free and do not restore a previously consumed credit. Failed or
replayed creates consume no extra credits. The existing protected business and
enterprise plan exceptions remain; choosing a workspace type does not grant an
exception. The authoritative owned count includes retained owner-linked records.
The five-Profile allowance applies to future creation only: existing Profiles are
preserved, and adopting the limit does not consume purchased credits retroactively.

## Deployment and configuration

The billing migrations are `20260917190000_billing_credits.sql` and
`20260917191000_release_readiness.sql`. The current release also requires
`20260917200000_account_deletion_intake.sql` and
`20260917201000_release_readiness.sql`, followed by
`20260917210000_service_evidence_uploads.sql` and
`20260917211000_release_readiness.sql`. This application additionally requires
`20260917220000_service_evidence_recovery.sql`,
`20260917220500_site_editor_helper_permissions.sql` and
`20260917221000_release_readiness.sql`, followed by
`20260918120000_direct_business_payments.sql` and
`20260918121000_release_readiness.sql`, in that order. This candidate's required readiness
version is **2026-09-17.7**; the historical `.3`, `.4`, `.5`, and `.6` migrations are intermediate
contracts. The active contract checks the private ledger, intake and evidence-upload schema,
exact function implementations, grants, constraints, and LIVE database boundary.
Do not edit old migrations or bypass fingerprint checks. Coordinate schema and
application promotion against the active contract, not an older readiness
version. An empty offer catalog is expected before merchant provisioning.

The first six migrations listed above were applied to the production project on September 17,
2026, with all 14 readiness checks passing. Applying them did not activate
checkout. Do not reapply them to an existing database; inspect its migration
history and current readiness before preparing a release.

The values in `.env.example` are server-only configuration. Store credentials in
the hosting provider's secret settings, never in source, browser variables, task
messages, or logs. The SDK is pinned to Stripe `22.6.2`; the reviewed webhook/API
version is `2026-08-26.dahlia`. Version mismatches disable payment operations.

`QRGUITAR_BILLING_ENABLED=true` alone is insufficient to sell. A matching
environment, secret key, webhook secret/version, and approved Stripe Price IDs
must be configured. Each Price must be active, one-time, per-unit USD, with the
exact approved amount. Register the same immutable tuple through the trusted
service-only `billing_register_offer(environment, offer)` RPC before exposing it.
An offer contains `key`, `version:1`, `currency:"usd"`, integer `amount` in cents,
integer `credits`, and the actual provider `priceId`. No fake Price IDs are seeded.

The authenticated balance can be read without payment credentials. New purchases
remain unavailable. Turning off the purchase flag retains configured webhook
processing so already-paid customers can still receive their credits.

Configure `POST /api/billing/webhook` for these supported events, using the
reviewed API version and matching account/mode:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `refund.created`
- `refund.updated`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `charge.dispute.funds_withdrawn`
- `charge.dispute.funds_reinstated`

The untouched JSON body and `Stripe-Signature` header are required. Connected
account events are rejected. Unknown valid event types are ignored; errors on
supported events return a failure status for retry. A dispute closing does not
automatically release a credit hold. Existing financial outcomes continue to be
recorded if the owner's account becomes restricted after starting checkout.

## Isolated sandbox

Test mode requires a separate Supabase database. Set its private instance boundary
to TEST while it is completely empty, before creating Auth users, Profiles,
uploads, customers, or orders. The normal six-argument Profile creation RPC always
uses LIVE; only explicitly isolated server configuration selects the test overload.
The sandbox URL must match `QRGUITAR_BILLING_TEST_DATABASE_URL` and cannot be the
production project. Production readiness deliberately rejects a TEST database.

Configure `QRGUITAR_BILLING_TEST_APP_URL` with the isolated app's HTTPS origin,
without a path, query, credentials, fragment, or port. It cannot be either
production domain. Only TEST purchases use this return/cancel destination; LIVE
always returns to `https://www.qrguitar.com`. Client redirect URLs are not accepted.
Keep this origin stable while test orders are unresolved so retries preserve
Stripe's exact idempotency parameters. Missing configuration blocks new test
purchases without blocking balance reads or configured webhook processing.

Use the selected merchant's actual Stripe sandbox for provider acceptance. Offline
tests use the official SDK and real PostgreSQL semantics but cannot certify Stripe
account capabilities, hosted Checkout, tax behavior, webhook delivery, or payouts.
Verify successful, declined, authentication-required, cancelled, and expired
checkouts; interrupted responses and retry; repeated/out-of-order webhook delivery;
one successful sixth Profile consuming one credit; failed/replayed creates; refunds
and disputes placing remaining paid capacity on hold. Verify both browser return
pages against server ledger state. Never substitute test payment records into the
production ledger.

## Purchase integrity and support

The server verifies the authenticated owner, creates a durable order before any
provider request, and reuses that order's idempotency identity. Unknown results keep
the original order pending. After 23 hours the server only reconciles existing
provider objects; it does not risk a new charge after idempotency retention.
Do not manually delete an unresolved order to unblock another purchase.

Webhook handling verifies the untouched signed body and retrieves current provider
objects before granting credits. Amount, currency, environment, owner, customer,
session, payment, price, and quantity must match the immutable order. Redirect
query parameters and client claims never grant credits. Receipts and grants are
append-only; direct API-role writes, including service-role table writes, are denied.

Refunds and disputes hold remaining paid credits and new purchases for review;
they preserve existing Profiles and consumed history. The service-only
`billing_resolve_review` RPC requires an active administrator, a unique decision
ID, and a recorded reason. Release only after checking the actual receipt/provider
state. A released receipt cannot be reopened by an altered retry; a new verified
review event can create a new hold. There is no automatic refund, deletion, or
credit restoration operation in this release.

Automatic PayPal exceptions and its durable webhook delivery queue are operated
from `/admin/payments` as described in
[PAYPAL_CHECKOUT_SETUP.md](PAYPAL_CHECKOUT_SETUP.md). The browser receives only a
sanitized evidence projection. PayPal hold decisions delegate to the same
`billing_resolve_review` contract above; delivery retries are separately audited
and advance one bounded processing step. Neither operation can fabricate a
payment or add credits.

## Outstanding merchant decisions before enabling purchases

The user has an existing account described as Stripe for a Shopify business.
Confirm whether it provides a standalone Stripe Dashboard and API access and
whether QRguitar belongs to that same merchant. Shopify Payments is administered
through Shopify and should not be assumed to supply standalone Stripe credentials.
See [Shopify's gateway explanation](https://help.shopify.com/en/manual/payments/third-party-providers/payment-gateway-availability).

Business country/state, tax obligations and collection configuration, customer
refund terms, legal merchant identity, billing data retention, and support handling
must be settled before activation. The current exact-amount implementation rejects
nonzero tax, discounts, shipping, and currency conversion; automatic tax is off.
Do not enable it as a workaround for unfinished tax configuration. Any tax design
change needs matching receipt validation and provider acceptance tests.

Physical devices, Safari/Firefox, installed app links, and native store submission
remain separate acceptance work. Passing web billing tests does not certify them.

## Repository validation

`npm run test:billing --workspace @qrguitar/web` runs the service, official SDK,
HTTP, configuration, authenticated runtime, UI state/render, ledger, and complete
offline purchase-to-Profile tests. It also reproduces the readiness contract and
checks the isolated concurrency fixture's connection guards without connecting.
The main behavior suite includes this command. Offline tests contact no Stripe
account and do not mutate production.

The separate `Billing concurrency` GitHub Actions workflow uses a fresh PostgreSQL
17 service container and three independent connections. Twenty cases must each
observe a real database lock barrier before commit/rollback. It checks final-credit
spending, duplicate grants, competing checkout reservations, direct-payment
verification/replay, reused transaction references across accounts, and
close-versus-verification races under commit/rollback; captures source
hashes and outcomes; and makes no deployment. The runner refuses existing or
nonlocal databases and never starts or drops a server/database. An accepted CI
report is required before claiming these twenty cases passed. A syntax or connection-
guard pass is insufficient. The prior Windows startup failure executed zero cases.
