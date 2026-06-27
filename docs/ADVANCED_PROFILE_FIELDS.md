# QRguitar Advanced Profile Fields

This is the field map to preserve while building the QRguitar customer experience. The QR code stays permanent; customers edit the profile behind the QR code.

## Account Fields

- Display name
- Email
- Account role: owner, player, builder, shop, admin
- Public profile name
- Phone number
- Business name
- Website
- Location
- Avatar/logo
- Verification status

## Instrument Identity

- QRguitar identity code
- Instrument name
- Brand
- Builder
- Model
- Year built
- Serial number
- Instrument type
- Current location
- Status: verified, unverified, transferred, archived
- Visibility: public, unlisted, private
- Transferable: yes/no
- Claimed/unclaimed state
- Owner display name
- Registered date
- Builder verified date

## Public Profile Presentation

- Hero image
- Gallery images
- Brand/logo image
- Theme color
- Accent color
- Profile layout style
- Verified badge label
- Short profile tagline
- Public story/about text
- Public badge chips: one of one, handmade, verified, lifetime record, shop verified

## Specifications

- Body wood
- Neck wood
- Fingerboard
- Scale length
- Nut width
- Frets
- Pickups
- Electronics
- Bridge
- Tuners
- Finish
- Weight
- Case included
- Strings/gauge
- Custom spec label/value rows

## Provenance And Builder Record

- Builder notes
- Shop notes
- Certificate notes
- Original build date
- Original sale date
- Original retailer/shop
- Build photos
- Workshop photos
- Materials notes
- Authenticity statement
- Builder signature/logo

## Ownership

- Current owner ID
- Owner display preference
- Ownership history
- Transfer invitations
- Transfer recipient email
- Transfer accepted date
- Transfer notes
- Private owner notes
- Proof of purchase document
- Included first purchaser ownership transfer for $99 25-code packs and higher plans
- Bulk handoff claim link
- Transfer fee waived reason

## Repair And Service History

- Service date
- Service provider
- Work performed
- Parts replaced
- Setup notes
- Cost
- Photos
- Receipts/documents
- Visibility per service record

## Media

- Photos
- Videos
- Audio clips
- Alt text
- Caption
- Sort order
- Public/private flag

## Documents

- Certificate of authenticity
- Appraisal
- Purchase receipt
- Warranty
- Repair receipts
- Build sheet
- PDF uploads
- Download permissions

## QR Code And Certificate

- Permanent QR URL
- Permanent QRguitar ID generated once per instrument
- QR code uniqueness enforced by the database
- QR code must never be derived only from editable fields like name, model, owner, or serial number
- QR link must continue resolving forever after edits, ownership transfers, or profile redesigns
- Old profile paths must redirect to the current instrument record if routing changes
- QR PNG download
- QR SVG download
- QR foreground color
- QR background color
- QR label text
- QR frame style
- QR high-contrast print warning
- QR label/sticker print format
- Certificate PDF download
- Scan count
- Last scanned date
- Last scan location if available and permitted

## Commerce

- For sale flag
- Asking price
- Currency
- Buy button URL
- Contact seller option
- Marketplace/private sale status

## Privacy And Permissions

- Profile visibility
- Field-level visibility
- Owner contact visibility
- Transfer-only fields
- Builder editable fields
- Shop editable fields
- Admin verification fields

## Business / Builder / Shop

- Business plan type
- Business verification status
- Shop inventory ID
- Batch import group
- Bulk QR pack ID
- Purchased code count
- Remaining code count
- Free ownership transfers included
- Included ownership transfer count
- Remaining included ownership transfers
- Bulk purchaser handoff enabled
- Builder branded profile template
- Retail handoff notes
- Point-of-sale ownership claim status

## What The Customer Must Be Able To Do

- Create an account
- Register a guitar
- Save and edit the guitar profile
- Upload photos and documents
- Generate/download the QR code
- Preview the public scan page
- Choose what is public/private
- Transfer ownership
- View scan/profile history
- Download certificate
- Manage pricing/plan when live
- Edit public website copy from one content/admin location
- Claim a guitar from a builder/shop transfer link without paying a fee when the code came from a $99 25-code pack or higher plan
