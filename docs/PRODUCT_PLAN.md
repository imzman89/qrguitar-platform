# QRguitar Product Plan

## MVP

The MVP proves the core loop:

1. Owner creates account using magic-link login.
2. Owner registers guitar, amplifier, or other gear with make, model, serial, and year.
3. App generates QR code.
4. Public profile is live.
5. Anyone can scan and verify the instrument.

## Version 1 Product Decisions

- QRguitar is web-only first.
- PWA support comes before native iOS or Android apps.
- Required registration fields: make, model, serial, year.
- If serial exists, permanent QRguitar ID format is `QRG-{SERIAL}`.
- Public profiles should support verification record, sales listing, builder showcase, and owner collection use cases.
- Buyer ownership claims require email verification before ownership changes.
- Photos are public by default.
- Documents are private by default.
- Login starts with magic email links.
- Version 1 public URLs use `/i/{QRG-ID}`.

## Profile Builder

Each guitar profile should support:

- Hero image
- Gallery
- Specs
- Builder notes
- Serial number
- Ownership status
- Timeline
- Repairs
- Documents
- Privacy controls
- Theme/customization options

## User Types

- Owner
- Collector
- Builder
- Shop
- Admin

## Paid Features

- Single instrument lifetime QR: $12
- 10-code pack: $50
- 25-code pack: $99
- Included first ownership handoff for each code in $99+ purchases
- Commercial starter plan from $199/year
- Higher business tiers later for shops, builders, inventory tools, branding, and support

## Suggested Commercial Pricing Ladder

- Commercial Starter: $199/year for small builders, repair shops, and retailers that need business branding and basic inventory/profile tools.
- Commercial Plus: future $399-$599/year tier for larger shops that need batch tools, staff accounts, advanced media/documents, analytics, and priority support.
- Enterprise: custom pricing for high-volume brands, distributors, integrations, data migration, and white-glove onboarding.

Keep the first business plan accessible, but do not bundle every high-touch support feature into the $199/year plan.

## Included Ownership Handoff Rule

When an actual brand, builder, shop, retailer, or customer buys the $99 25-code pack or any higher plan:

1. Each instrument receives a permanent QRguitar ID before sale.
2. The brand can pre-fill the guitar profile with build specs, photos, documents, and provenance.
3. At purchase handoff, the brand enters the guitar purchaser's email or phone.
4. QRguitar sends the purchaser a claim link.
5. The purchaser creates/logs into an account and accepts ownership.
6. The first ownership transfer for each purchased code is included/free for that purchaser.
7. The permanent QR link does not change.
8. Builder provenance remains attached after ownership transfers.

Example: a 25-code pack includes 25 first-owner transfers. A 50-code purchase includes 50 first-owner transfers. This handoff must work cleanly on desktop, tablet, iOS, and Android. The purchaser should never have to understand admin tools, pay a transfer fee for the included first handoff, or create duplicate guitar records.

## Editable Website Copy

All marketing/site copy should live in a small set of editable content files instead of being scattered through components. The current homepage copy lives in:

`apps/web/content/site-copy.ts`

Later this can move to an admin CMS table in Supabase so QRguitar can edit headlines, pricing copy, footer text, FAQs, and landing-page sections without code changes.

## Why This Beats WordPress

WordPress can market QRguitar. It should not be the core product database, ownership system, mobile app, or QR profile engine.

This platform gives you:

- API-first architecture
- Mobile apps
- Better database structure
- Easier scaling
- Cleaner profile customization
- Real ownership workflows
