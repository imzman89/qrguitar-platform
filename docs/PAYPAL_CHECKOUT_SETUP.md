# Automatic PayPal checkout setup

QRguitar's automatic checkout sells one-time Profile credit packs: $12 for 1,
$50 for 10, or $99 for 25. Ordinary accounts have 5 free owned Profiles;
unused purchased credits never expire and transfers remain free. PayPal collects
the payment and applies its merchant fees. QRguitar adds credits only after
server verification. This is an implementation and activation checklist, not
evidence that the candidate or merchant configuration is live.

## Connect the receiving business account

Use the QRguitar PayPal Business account in the [Developer Dashboard](https://developer.paypal.com/dashboard/).
Under Apps & Credentials, create a REST app for QRguitar. Create separate Sandbox
and Live configurations using the dashboard toggle. The app must belong to the
business receiving the money; this integration does not collect funds for other
sellers. Record the app's client ID and secret privately, and the receiving
account's merchant ID. See [PayPal's REST setup](https://developer.paypal.com/api/rest/).

Enter credentials directly in the deployment host's server environment settings.
Never put secrets, passwords, bank details, verification codes, or access tokens
in chat, source control, screenshots, logs, or public environment variables.
Bank linking and identity verification stay on PayPal's own website. The client
ID is a public SDK identifier; the client secret remains server-only. PayPal
checkout and receipts may show the account's configured business identity, so
review that identity in PayPal before accepting payments.

| Server setting | Purpose |
| --- | --- |
| `QRGUITAR_PAYPAL_ENABLED` | Keep `false` until configuration and release checks pass; exact `true` enables new checkout. Turning it off pauses new sales but does not stop recovery for existing orders. |
| `PAYPAL_ENVIRONMENT` | `test` for Sandbox or `live` for production; must match the billing environment. |
| `PAYPAL_CLIENT_ID` | Client ID of this environment's REST app. |
| `PAYPAL_CLIENT_SECRET` | Secret of that same app, stored privately. |
| `PAYPAL_MERCHANT_ID` | Expected receiving merchant ID, not an email address or client ID. |
| `PAYPAL_WEBHOOK_ID` | ID returned when the webhook is registered on this app in this environment. |
| `CRON_SECRET` | Random server-only value of 32–256 non-whitespace characters. It authenticates bounded queue recovery and is required before PayPal checkout can enable. |
| `QRGUITAR_BILLING_ENVIRONMENT` | `test` or `live`; conflicting legacy `STRIPE_ENVIRONMENT` values disable billing. |
| `QRGUITAR_BILLING_TEST_DATABASE_URL` | In test mode, must equal the isolated Supabase database URL; production is rejected. |
| `QRGUITAR_BILLING_TEST_APP_URL` | In test mode, exact test origin; production QRguitar hostnames are rejected. HTTPS is required except localhost/127.0.0.1 development. |
| `QRGUITAR_PAYPAL_APPLE_PAY_ENABLED` | Keep `false` until the separate Apple Pay integration and eligibility checks pass. |

Use different credentials, webhook registrations, Supabase projects, and app
origins for Sandbox and Live. Never place live credentials into preview or test
deployments. The server selects the environment; customers cannot select a
ledger. The live app origin is `https://www.qrguitar.com`.

Keep Vercel Hobby deployments in Sandbox with new sales disabled. Vercel's
[Hobby fair-use policy](https://vercel.com/docs/limits/fair-use-guidelines)
classifies requesting or processing payment as commercial activity, so enable
Live checkout only after the production project is on Vercel Pro (or an
equivalent commercial plan). Live operation requires an authenticated schedule
that calls `/api/internal/paypal-webhook-sweep` at least every five minutes.
Vercel Cron can call the route with `Authorization: Bearer $CRON_SECRET`; another
scheduler can use the same standard Bearer request. The route accepts `GET` or
`POST`, starts only a bounded amount of work, and is safe under duplicate runs.
Each successful run records a private database heartbeat. New checkout remains
disabled unless that heartbeat is at most 15 minutes old, so a configured secret
without a working scheduler cannot activate sales. Existing payment recovery
continues when the heartbeat is stale. Do not enable checkout until both the
secret and schedule are active. A Sandbox Hobby deployment can exercise the same
endpoint manually or on its daily cron while new sales remain disabled.

Keep the PayPal credentials, webhook registration, `CRON_SECRET`, and recovery
schedule active when pausing new sales. Existing approved or paid orders must
still receive webhooks and reconcile while `QRGUITAR_PAYPAL_ENABLED=false`.

## Register and verify webhooks

Register `https://www.qrguitar.com/api/billing/paypal/webhook` on the Live app,
and the same path on the isolated HTTPS test origin on the Sandbox app. Save
each registration's returned ID as that environment's `PAYPAL_WEBHOOK_ID`.
Subscribe to these
[PayPal events](https://developer.paypal.com/api/rest/webhooks/event-names/):

- `CHECKOUT.ORDER.APPROVED` and `CHECKOUT.PAYMENT-APPROVAL.REVERSED`.
- `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, and `PAYMENT.CAPTURE.DENIED`.
- `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `PAYMENT.REFUND.PENDING`, and `PAYMENT.REFUND.FAILED`.
- `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED`, and `CUSTOMER.DISPUTE.RESOLVED`.

The current PayPal event guide also lists `PAYMENT.CAPTURE.DECLINED` for Payments
v2. Subscribe to it as well when the app's event catalog exposes it; the listener
accepts both `DENIED` and `DECLINED`. Confirm the saved subscription against the
actual app's available events rather than assuming every name is selectable.

Buyer approval, a return URL, and a browser success callback do not establish a
completed capture. The listener must verify PayPal's signature against the
configured webhook ID and require `verification_status=SUCCESS`. It then checks
authoritative payment data and uses the database's idempotent credit operation.
An approval webhook can resume server capture after the browser closes. An
approval reversal closes an unpaid order or holds an already captured payment.
See [signature verification](https://developer.paypal.com/api/webhooks/v1/verify-webhook-signature-post).

Reconciliation must match the saved order, expected merchant, exact gross USD
pack amount, and completed capture. A refund has its own ID; its `rel=up` link
identifies the original capture. Disputes identify the merchant-side transaction
through `disputed_transactions[].seller_transaction_id`. Preserve holds for
refunds, reversals, and disputes until reviewed; a later success or resolved
event alone must not erase a hold. Confirm the app can read merchant disputes
as well as captures/refunds. References: [capture details](https://developer.paypal.com/api/payments/v2/captures-get),
[refund details](https://developer.paypal.com/api/payments/v2/refunds-get),
and [dispute API and scopes](https://developer.paypal.com/api/customer-disputes/v1/schema.json).

## Operate the durable queue and credit holds

The public webhook acknowledges only after it has durably stored the bounded raw
body and the five PayPal signature headers. It returns an accepted 2xx after
durable intake even when bounded inline work remains; the authenticated sweep
owns continuation independently of PayPal's retry window. Intake failure stays
non-2xx, and a verified invalid signature or identity conflict is rejected.
Processing is resumable and records
one immutable outcome per provider event ID and zero-based event item. A retry
never changes that identity. After signature verification and an allowlisted
work plan are saved, the raw body and signature material are deleted immediately;
unfinished items resume from that frozen plan. Pre-plan failures retain raw data
only for bounded recovery. Neither form is returned by the admin API or browser
UI. Configure a host-level rate limit on the public webhook as defense in depth;
the database quota and immediate purge of permanently invalid envelopes remain
the durable storage boundary.

Unverified/raw recovery has a seven-day hard window. A verified frozen plan has
a 30-day hard window, enough for every 20-item dispute to advance even under a
temporary daily Sandbox schedule. Consecutive failures back off from five
seconds to six hours; a successful verification, plan save, or item commit resets
that failure streak. Total claim counts remain audit metadata and do not shorten
the age-based recovery window. The live Pro schedule should still run at least
every five minutes so ordinary work settles promptly.

An active database administrator uses `/admin/payments` for two separate jobs:

1. **Webhook delivery health** lists only operational metadata for nonterminal or
   quarantined deliveries: delivery/event IDs, event type, state, item progress,
   attempt count, bounded error code, lease time, and timestamps. An operator can
   continue a queued, verified, planned, retryable, recoverable quarantined, or
   expired-lease delivery while its signed payload or verified frozen plan still
   exists. The action
   requires a unique UUID and a 10–1000 character reason, is append-only, resets
   the guarded retry window, and runs one bounded processing step with at most one
   financial effect. It does not skip signature verification, provider lookup,
   order matching, or ledger idempotency. An exact replay of the same action UUID
   returns the saved queue state without running another step; use a new reviewed
   action only if the delivery still needs another cursor advanced. Once a
   quarantined payload expires, it cannot be processed again. An audited
   acknowledgement can remove that operational alert after the PayPal case and
   ledger are checked; acknowledgement never releases a credit hold or changes a
   payment.
2. **Active PayPal holds** joins a hold to its immutable processing outcome and
   exposes only allowlisted evidence: event/resource/order/capture/refund/dispute
   IDs, status, verified amount/currency, pack amount, and credits. It omits payer
   identity, raw webhook content, signature headers, and unrestricted provider
   details. The only decisions are `retain_hold` and `release`. Both use the
   existing `billing_resolve_review` RPC with an immutable decision UUID and
   recorded reason. Neither decision creates a payment, credit grant, or refund.

Release a specific hold only after checking the corresponding case in PayPal.
Other verified holds for the same account remain active. A retained hold stays in
the queue with its latest reviewed reason. A lost response must be retried with
the saved decision identity; do not create a different decision until its result
is known.

## Apple Pay is a separate activation

The normal PayPal buttons do not prove that a dedicated Apple Pay button is
available. Complete PayPal's Apple Pay production onboarding and enable its
capability on the app. In Apps & Credentials, choose the app, then Features →
Accept payments → Advanced Credit and Debit Card Payments → Apple Pay → Manage.
Register every hostname actually showing the button.

Host PayPal's environment-specific association file at
`/.well-known/apple-developer-merchantid-domain-association` without a file
extension. It must return the original bytes over HTTPS with status 200,
`Content-Type: application/octet-stream`, no redirect, and no login requirement.
Register `www.qrguitar.com` for its checkout; the apex redirect does not validate
a separate apex button. Sandbox and Live registrations are separate.

This candidate serves PayPal's exact generic association bytes at that path,
without authentication, redirects, or a runtime download. Both files are 9,094
bytes. The default **Live** file has SHA-256
`cdb19c18ab558f50994fb98413eaad9d495b552a2fdf07505e4fb4f5777e4969`.
Only when both `PAYPAL_ENVIRONMENT=test` and
`QRGUITAR_BILLING_ENVIRONMENT=test` are set server-side does it serve **Sandbox**,
whose SHA-256 is
`5b972a09172f34fe71b19d306b0c0c11b2071013175063fa8f154849c099302a`.
The no-store response ignores query parameters. Verify the deployed bytes before
registering each hostname; keep Sandbox on its isolated test deployment and
register `www.qrguitar.com` in Live.

Before display, the client must pass `ApplePaySession.canMakePayments()` and
`paypal.Applepay().config().isEligible`. The Apple/PayPal SDK flow must validate
the merchant, confirm the order, and call the server capture endpoint. Start the
Apple Pay session from a user gesture. Domain registration or an environment
flag alone is insufficient. Follow [PayPal's direct-merchant Apple Pay guide](https://developer.paypal.com/v5/apple-pay/integrate).

## Activate only after end-to-end checks

Run the candidate's tests and database readiness gate before enabling checkout.
In the isolated Sandbox environment, verify each pack, buyer cancellation,
declines, pending captures, webhook retry, interrupted browser recovery, and
duplicate capture/webhook delivery. Confirm one grant only for each successful
payment and no live ledger changes. Exercise a refund and dispute hold before
relying on automated reconciliation. Confirm the sanitized evidence appears in
`/admin/payments`, retain/release decisions are idempotent, and an audited delivery
retry advances at most one bounded item. Synthetic webhook delivery alone does
not prove real payment settlement.

For Live, verify the app and receiving merchant IDs, working HTTPS webhook
delivery, and current database release evidence. Enable only methods the
account and SDK actually offer. Make any real-money acceptance purchase only
with the owner's authorization, using a separate eligible buyer account. Record
order/capture IDs and sanitized results; never record credentials or full payer
details. Retain credentials and webhook reconciliation when disabling new
checkout so payments already in flight can still settle correctly.
