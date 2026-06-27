# QRguitar MVP Security Checklist

QRguitar does not store or process credit card numbers. Payments must use Stripe Checkout or Stripe Customer Portal only. Do not build card fields into this app.

## Environment Variables

Only these browser-exposed variables are allowed for the MVP:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Do not create `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. Supabase service role keys are server-only and must never be imported into client components.

## Supabase

Run `supabase/security-rls.sql` after the base schema.

Required launch checks:

- RLS is enabled on every user-owned table.
- Public instrument records are readable only when `visibility = 'public'`.
- Private/unlisted records are readable only by their owner.
- Users can update/delete only their own instruments and child rows.
- Documents are private by default and readable only by the owner.
- Media storage uses owner-prefixed paths: `{auth.uid()}/{guitar_id}/{filename}`.
- Storage buckets are private unless a policy explicitly allows public profile media reads.

## Payments

- Use Stripe Checkout for purchases.
- Use Stripe Customer Portal for billing changes.
- Never collect card numbers, CVV, expiration dates, or billing card details in QRguitar forms.
- Store only Stripe IDs and payment status later, never raw card data.

## Forms And Abuse Controls

Current MVP protections:

- Required instrument identity fields.
- Basic length and character validation.
- Honeypot fields on create/edit forms.
- Repeat-submission blocking in browser demo mode.
- Server/API rate-limit helper placeholder in `apps/web/lib/security.ts`.

Before launch with real APIs:

- Use server-side validation for every write.
- Apply IP/user rate limits to API routes and server actions.
- Verify uploaded file MIME type and size server-side.
- Scan or quarantine risky file types.

## Headers

Security headers are configured in `apps/web/next.config.mjs`:

- `Content-Security-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`

These reduce accidental exposure, framing, sniffing, and unnecessary browser capability access. They do not make the app unhackable.

## Admin/Flagging Placeholder

Accounts and instruments include verification fields for MVP behavior. A future admin panel can flag malicious accounts, but no automated maleficence detection exists yet.
