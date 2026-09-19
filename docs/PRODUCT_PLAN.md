# QRguitar Product Plan

Product rules updated September 18, 2026. The approved launch offer is permanent Profile credits above 25 free owned Profiles, with free ownership transfers. Pricing experiments below the current contract must not be treated as active products. This plan is a requirements document, not evidence that all launch gates are complete.

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

## Approved Profile credits

- 25 free owned Profiles per owner, with protected existing entitlement exceptions documented in `BILLING_OPERATIONS.md`.
- Existing Profiles remain available. Applying this allowance does not consume credits for previously created Profiles.
- One-time permanent credits: US$12 for 1, US$50 for 10, US$99 for 25.
- Unused purchased credits do not expire. One is consumed for a successful new Profile when the free allowance is full. Failure and exact retry cannot charge twice.
- Ownership transfers are free. A transfer does not restore a consumed credit.
- Checkout remains disabled until merchant provisioning and hosted test acceptance pass.

## Future commercial proposals

Business subscriptions, team seats and enterprise packages need a separate approved scope and price. Earlier annual pricing suggestions are not active offers. Choosing a shop, builder or service-provider workspace tailors tools and navigation, not paid entitlement or verification.

## Free Ownership Handoff Rule

For brands, builders, shops, retailers and individual owners, regardless of a credit purchase:

1. Each instrument receives a permanent QRguitar ID before sale.
2. The brand can pre-fill the guitar profile with build specs, photos, documents, and provenance.
3. At purchase handoff, the owner enters the purchaser's email for the implemented claim-link workflow.
4. QRguitar sends the purchaser a claim link.
5. The purchaser creates/logs into an account and accepts ownership.
6. The ownership transfer is free, including subsequent transfers.
7. The permanent QR link does not change.
8. Builder provenance remains attached after ownership transfers.

This handoff must work cleanly on desktop, tablet, iOS and Android. The purchaser should not need admin tools, a transfer payment or a duplicate Profile. Device and email-delivery acceptance must be recorded separately from code tests.

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
