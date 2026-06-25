# QRguitar UX Completeness Checklist

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

- Brand, builder, shop, or customer can buy the $99 25-code pack or higher.
- $99 25-code purchase enables one included/free first-owner transfer per code.
- Brand can pre-register each guitar.
- Brand can attach specs, photos, docs, provenance, and builder verification.
- Brand can transfer ownership to purchaser for free when using an included first-owner transfer.
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
- Native iOS/Android apps are not version 1.
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
- Add Stripe checkout for single, packs, bulk, business, and enterprise.
- Add transfer claim emails.
- Add admin tools for site copy, pricing copy, verification, and support.
- Add analytics for scans and funnel tracking.
