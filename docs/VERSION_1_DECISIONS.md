# QRguitar Version 1 Decisions

## Platform

- Web-only for version 1.
- Build as a responsive web app first.
- Add PWA install support before considering native apps.

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
- $99 25-code pack and higher include one free first-owner transfer per code.

## Privacy Defaults

- Photos are public by default.
- Documents are private by default.

## Login

- Magic email links first.
- Email/password can be added later if needed.

## Pricing

- Single instrument: $12
- 10-code pack: $50
- 25-code pack: $99
- Commercial packages start at $199/year

## Commercial Pricing Direction

Start accessible but avoid giving away high-touch business features:

- Commercial Starter: $199/year
- Future Plus tier: $399-$599/year
- Enterprise/custom: priced by volume, integrations, support, and onboarding needs
