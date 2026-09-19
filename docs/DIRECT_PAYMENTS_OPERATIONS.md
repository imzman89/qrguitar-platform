# Direct Profile credit payments

The retained `/billing/manual` page recovers earlier QRguitar orders paid through
approved business payment links with manual receipt verification. The default
`/billing` candidate now uses [automatic PayPal checkout](PAYPAL_CHECKOUT_SETUP.md).
New manual order creation, provider-link display, and payer self-report are
retired. Keep `QRGUITAR_DIRECT_PAYMENTS_ENABLED=false`; the recovery page shows
only sanitized order status and support actions, and payer API responses omit
the stored receiving address, account key, and payment URL.
QRguitar does not collect card numbers, bank
credentials, or provider passwords. Customers complete payment with the provider;
an active QRguitar administrator checks the receiving account before adding credits.
This is a one-time purchase flow, not automatic recurring billing.

This document describes the local release candidate. It does not establish that
the candidate, its migrations, or any receiving links have been deployed or enabled.
Adding code, configuring links, or applying migrations does not charge anyone.

## Product contract

Every ordinary account has room for 25 free owned Profiles. The fixed USD packs
are `profile_1`: $12 for 1 credit; `profile_10`: $50 for 10; and `profile_25`:
$99 for 25. Unused purchased credits never expire. A new Profile uses one credit
when the free allowance is full. Ownership transfers are free and do not restore
a credit already used. Existing Profiles remain available; the five-Profile
change does not remove Profiles or consume credits retroactively.

Separately approved business/enterprise access remains separate from purchases.
Buying credits does not grant verification, an administrator role, or commercial
privileges. Accounts with expanded access are not offered unnecessary packs.

## Configure receiving methods privately

Keep actual receiving identities, hosted payment URLs, and secrets in server
environment settings. Do not put them in source files, public environment
variables, screenshots, logs, or this runbook. `.env.example` contains blank
settings only. Merchant logins, verification codes, bank details, and account
linking belong in the provider's own site or app.

- `QRGUITAR_DIRECT_PAYMENTS_ENABLED=false` keeps new direct purchases disabled.
  Only the exact value `true` enables a complete configuration.
- `QRGUITAR_DIRECT_MERCHANT_NAME` is the public receiving business name shown to
  customers. Use the name they can confirm at checkout.
- `QRGUITAR_DIRECT_PAYMENT_METHODS` is a JSON array of configured `paypal`,
  `venmo`, `cashapp`, or `zelle` methods. Include only methods ready for business
  payments. Incomplete, duplicate, or unsupported configuration fails closed.
- `QRGUITAR_DIRECT_APPROVAL_MESSAGE` is optional customer-facing text, limited to
  400 characters. Give an achievable manual review expectation; never promise
  instant credits. The default explains that credits follow receipt confirmation.
- `QRGUITAR_BILLING_ENVIRONMENT=live` selects the LIVE ledger. `test` requires an
  explicitly isolated database as described below. The legacy `STRIPE_ENVIRONMENT`
  may remain blank; conflicting values disable billing instead of mixing ledgers.

Each method has an internal `accountKey`, a stable nonpersonal identifier for the
actual receiving business account, and links for the three approved pack keys.
Keep the key unchanged when editing that account's display name or link. Use a
different key for a different receiving account. It is normalized to lowercase,
must be 3–120 characters, and may contain letters, digits, `_`, `.`, `:`, or `-`.
Do not use a person's phone number or email address as this internal key.

For PayPal, create three distinct fixed-price hosted business checkout links and
map each to its exact pack. Confirm the amount, USD currency, business identity,
and one-time purchase on all three provider pages. Use provider-generated hosted
checkout links; a personal `paypal.me` link is not supported. Card or wallet
availability is determined by that provider account and the customer's checkout.
Do not advertise Apple Pay or another wallet until it is visible and verified in
the intended supported checkout. Linking a bank alone does not verify those
checkout capabilities.

Illustrative JSON shape only; the placeholder values below cannot accept payments:

```json
[
  {
    "key": "paypal",
    "accountKey": "qrguitar-business-main",
    "paymentUrls": {
      "profile_1": "REPLACE_WITH_HOSTED_12_USD_CHECKOUT_LINK",
      "profile_10": "REPLACE_WITH_HOSTED_50_USD_CHECKOUT_LINK",
      "profile_25": "REPLACE_WITH_HOSTED_99_USD_CHECKOUT_LINK"
    }
  }
]
```

Venmo, Cash App, and Zelle require supported provider-hosted business links for
every pack. The customer still checks and sends the exact order amount. Zelle
additionally requires its private enrolled `address` in server configuration;
a phone number or email alone does not enable a method. The customer response
does not expose that field or the internal account key. A provider link or the
provider's own checkout can disclose its receiving business identity, so review
the real customer view before enabling it. QRguitar cannot hide identity that the
provider itself displays.

Keep `QRGUITAR_BILLING_ENABLED=false` for the legacy Stripe integration. Direct
payments do not require Stripe keys, Price IDs, or a Stripe webhook. Existing
legacy routes are retained for previously created orders; their separate operation
is documented in [BILLING_OPERATIONS.md](BILLING_OPERATIONS.md).

## Historical order and operator workflow

The first two steps describe how a retained order may originally have been
created. They are audit context only; the current recovery page cannot initiate
them or accept an **I sent the payment** report.

1. The signed-in customer chooses a pack and a configured payment method. The
   server saves an order with its amount, provider, receiving details, and request
   identity before showing a payment link. One unresolved order blocks a new one.
2. The customer opens the provider, confirms QRguitar's business name and exact
   amount, and includes the `QRG-…` order reference where the provider permits a
   note. They return and choose **I sent the payment**, optionally adding a payer
   name or transaction reference. This report never grants credits.
3. An active administrator opens `/admin/payments` and checks the provider's own
   receiving-account transaction record. The queue is bounded to 100 orders; use
   its exact `QRG-…` order lookup for older transactions. Match the actual receiving account,
   completed status, original incoming transaction ID, gross amount before fees,
   USD currency, and customer/order reference. A customer screenshot, return URL,
   reported name, or claimed payment alone is insufficient.
4. Enter the provider's original incoming transaction ID and exact gross amount,
   confirm the checked facts, and write an audit reason of 10–1000 characters.
   Verify only the matching completed payment. The database records its identity
   and grants the pack once. A repeated transaction ID cannot fund another order.
5. The customer refreshes Profile credits to read the confirmed balance, then
   returns to their preserved Profile form. A POST response alone does not increase
   the displayed balance. Free allowance is used first.

Wrong amounts, pending provider payments, missing order references, or a different
recipient need reconciliation in the provider and with the customer. Do not
rewrite the amount or invent a transaction ID to force a grant. Refunds, if
appropriate, are completed in the provider's own controls; QRguitar does not send
refunds or move money.

## Interrupted requests, holds, and configuration changes

Customer and administrator requests retain their operation UUID and original
details when a response is unknown. Refresh or retry the saved operation. Do not
generate a replacement order, send money again, or delete ledger rows to resolve
an interrupted response. The server can recover an existing purchase after new
purchases are disabled or receiving configuration changes; it preserves the
order's original receiving details. Disabling the flag therefore stops new sales
and does not cancel existing payment instructions or completed payments.

Close an unpaid order only after checking that no payment was received or is still
in progress, including an erroneous customer payment report. A closure adds no
credits and does not issue a refund. If money arrives
after closure, reconcile the original order: the database's late-verification path
records credits once under a review hold. Do not create a second grant elsewhere.

For a verified refund or dispute, enter the **original incoming payment transaction
ID** in the review action and include the refund/dispute reference in the audit
reason. The review holds remaining paid credits and new purchases, preserving
existing Profiles and consumed history. It does not issue a refund or remove
Profiles. Hold resolution uses the existing audited `billing_resolve_review` RPC
through trusted operator tooling after checking the provider state; the payment
review page does not automatically release holds.

## Isolated acceptance and promotion

The candidate requires `20260918120000_direct_business_payments.sql` followed by
`20260918121000_release_readiness.sql`, after the previously reviewed migrations
listed in [BILLING_OPERATIONS.md](BILLING_OPERATIONS.md). Its readiness version is
**2026-09-17.7**. Inspect the actual target's migration history and readiness before
promotion. Do not edit historical migrations, reapply them blindly, or bypass
fingerprint checks. These changes seed no merchant, receiving link, or paid credit.

Use synthetic local tests or a separately provisioned test database. A hosted test
environment needs `QRGUITAR_BILLING_ENVIRONMENT=test`, the isolated Supabase URL,
and the identical `QRGUITAR_BILLING_TEST_DATABASE_URL`. The database's separately
provisioned billing-instance boundary must also be TEST. Never repurpose the
production database for this. Production readiness deliberately rejects TEST.

PayPal TEST orders require supported sandbox checkout links; LIVE requires live
PayPal links. A mismatch disables new purchases. An ordinary Venmo, Cash App, or
Zelle link can still transfer real money even when the QRguitar ledger is TEST:
do not send real money as part of synthetic tests. Local tests make no provider
payments and do not certify hosted checkout, provider account eligibility, wallet
availability, mobile app handoff, settlement, or payouts.

Before activating real sales, verify all three fixed pack totals and receiving
identities through the intended provider flow, the review process, a confirmed
balance, one successful 26th Profile consuming one credit, and interrupted
request recovery. Verify the actual mobile/browser checkout and advertised wallet
choices. Keep payment fees and any tax/refund terms clear in the provider setup;
the QRguitar ledger currently expects the exact fixed USD gross amount.

## Repository checks

`npm run test:direct-payments --workspace @qrguitar/web` runs direct SQL behavior,
real service/HTTP integration, customer/admin client and render checks, and the
non-writing `.7` readiness generator drift check. `test:behavior` includes it and
the broader readiness suite. These commands operate on synthetic fixtures.

`npm run test:billing-concurrency --workspace @qrguitar/web` is separate: it
requires the guarded disposable PostgreSQL 17 fixture. Its 20 independent-client
lock-barrier cases include direct receipt verification, duplicate references, and
close/verify races. The GitHub workflow collects its report. PGlite and passing
connection guards do not establish that real PostgreSQL concurrency passed.

Neither the test scripts nor this runbook deploys the candidate, enables sales,
upgrades hosting, or establishes provider acceptance.
