# QRguitar Version 1 Decisions

Updated September 17, 2026 to reflect the approved Profile credit packs and free transfers. This records product rules, not launch acceptance. See `BILLING_OPERATIONS.md` for activation gates and `ACCOUNT_DELETION_INTAKE.md` for the current privacy workflow.

## Platform

- Responsive web is the first consumer release, with PWA support.
- Native iOS/Android preparation exists; signing, installed-device acceptance and distribution remain separate unfinished launch work.

## Registration

- Required fields: make, model, serial, year.
- If serial exists, QRguitar ID format is `QRG-{SERIAL}`.
- Flexible custom fields handle builder, finish, pickups, provenance, sale links, warranty, and anything else.

## Public Profile

The same profile should support:

- Verification record
- Sales/trust listing
- Builder showcase
- Owner collection page

## Ownership

- Buyer claim requires email verification before ownership changes.
- Ownership transfers are free for all accounts; no purchase or first-transfer limit applies.
- Transferring a Profile does not change its permanent link or restore a consumed credit.

## Privacy Defaults

- Photos are public by default.
- Documents are private by default.

## Login

- Email/password and magic-link authentication are implemented. Real email delivery and recovery acceptance must be verified for the configured environment.

## Pricing

- Each owner has 5 free owned Profiles.
- Existing Profiles remain available; the new allowance never consumes credits retroactively.
- One-time permanent Profile credits: US$12 for 1, US$50 for 10, US$99 for 25.
- Unused purchased credits do not expire. A new Profile consumes one credit when the free owned-Profile allowance is full; replayed or failed creation must not consume another.
- Checkout remains disabled until merchant configuration and hosted payment acceptance pass.

## Workspace and commercial direction

- Player/owner, collector, store/retailer, builder/brand, luthier/technician and other workspace choices tailor navigation; they do not grant administrative access, verification or paid entitlements.
- Earlier annual commercial-price suggestions are proposals, not approved purchasable offers. Do not advertise or activate them as part of the approved credit packs.

## Account closure

- Preserve permanent instrument history and remove the departing user's personal information.
- The deployed request/cancellation flow records review requests. Full fulfillment still requires the custody, unused-credit and retention decisions; it must not claim that submitting a request erases the account.
