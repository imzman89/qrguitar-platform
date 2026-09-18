# QRguitar UX Completeness Checklist

These are acceptance requirements, not checked-off results. Product rules reflect the September 17, 2026 approved credit packs and free transfers. Each release must record its actual browser, device and provider evidence; automated coverage alone does not prove every platform works.

## Editable Content

- Homepage copy must be editable from one content source.
- Pricing copy must be editable without hunting through components.
- Footer, CTA labels, trust text, and enterprise copy must be editable.
- Future admin CMS should map to `site_content` in Supabase.

## Customer Flow

- Customer can log in with magic email link.
- Customer can register/login from desktop or mobile.
- Customer can register a guitar from desktop or mobile.
- Registration requires make, model, serial, and year.
- Customer can upload photos from desktop or mobile.
- Customer can preview the public scan profile before sharing.
- Customer can download QR PNG.
- Customer can customize QR foreground/background/label.
- Customer can see the permanent QRguitar ID and understand it never changes.

## Brand / Builder / Shop Flow

- Every workspace has the approved 5 free owned-Profile allowance unless a protected entitlement explicitly applies.
- After payment activation, customers can buy permanent Profile credits: US$12/1, US$50/10 or US$99/25.
- Workspace selection never grants paid, verified-provider or administrator permissions.
- Brand can pre-register each guitar.
- Brand can attach specs, photos, docs, provenance, and builder verification.
- Brand can transfer ownership to the purchaser for free; subsequent transfers are also free.
- Purchaser receives claim link.
- Purchaser verifies email before ownership changes.
- Purchaser accepts ownership without paying transfer fee.
- Builder provenance remains attached after transfer.

## Permanent Link Rules

- QR code is generated once.
- QR code is unique in the database.
- QRguitar ID uses `QRG-{SERIAL}` when serial exists.
- QR code is not based only on editable guitar fields.
- Profile edits never change the QR URL.
- Ownership transfer never changes the QR URL.
- If routing ever changes, old paths redirect through `qr_redirects`.

## Device Coverage

- Desktop web dashboard.
- Tablet web dashboard.
- Mobile web scan profile.
- Mobile web create/edit flow.
- PWA install support before native apps.
- Native preparation must be distinguished from signed, installed iOS/Android acceptance and store distribution.
- QR scan profile should feel app-native on mobile.

## Public Profile Modes

- Verification record.
- Sales/trust listing.
- Builder showcase.
- Owner collection page.

## Defaults

- Photos public by default.
- Documents private by default.
- Web-only version 1.

## Before Live

- Connect Supabase Auth.
- Configure magic-link email login.
- Save guitars to Supabase.
- Save photos/documents to Supabase Storage.
- Generate permanent QR URLs from database IDs.
- Activate only the approved Stripe credit packs after real hosted test checkout, webhook, refund and entitlement acceptance. Future commercial subscriptions require a separate product decision.
- Add transfer claim emails.
- Add admin tools for site copy, pricing copy, verification, and support.
- Add analytics for scans and funnel tracking.

## Recovery and privacy

- Interrupted uploads must preserve a discoverable attempt across reloads and account changes without duplicate attachment or cross-account exposure.
- Status checks must be read-only; finishing or discarding an unresolved upload must be an explicit action.
- Account deletion must preserve permanent instrument history while removing personal information. Request intake must not be presented as completed erasure.
- Restore the database and file archive in an isolated environment before claiming complete recovery readiness.
