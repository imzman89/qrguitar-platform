# QRguitar Platform

Free-tier MVP for QRguitar: permanent digital records for guitars, amps, pedals, builders, shops, collectors, and future owners.

## What This Includes

- Next.js web app
- Shared TypeScript models
- Supabase database/auth/storage schema
- Public instrument catalog and profile pages
- Authenticated dashboard, create flow, and edit flow
- QR-friendly URLs like `/i/QRG-PI260001`
- Floating QRguitar Bot helper with local fallback logic

## Free Stack

- Web hosting: Vercel free tier
- Database/auth/storage: Supabase free tier
- Payments later: Stripe, no monthly fee

Payments are not active in this MVP. When payments are added, QRguitar must use Stripe Checkout or Stripe Customer Portal only. Do not build credit-card fields into the app.

## Quick Start

1. Install Node.js 20+.
2. Create a free Supabase project.
3. Run the launch SQL in Supabase SQL Editor.
4. Copy `apps/web/.env.example` to `apps/web/.env.local`.
5. Add your Supabase project URL, anon key, and service role key.
6. Install dependencies:

```bash
npm install
```

7. Run the web app:

```bash
npm run dev:web
```

8. Open:

```text
http://127.0.0.1:3003
```

## Push to production with one cmd line flow

From PowerShell/Command Prompt:

```bash
cd "C:\\Users\\mrgar\\Documents\\Codex\\2026-06-22\\i-need-you-to-finish-and\\work\\qrguitar-platform"

# 1) Make sure the build is clean
npm run typecheck --workspace @qrguitar/web
npm run build --workspace @qrguitar/web

# 2) Deploy with Vercel (first time)
npx --yes vercel@latest login
npx --yes vercel@latest --prod
```

If you already linked this folder to a Vercel project (GitHub-backed), the first command is enough to push:

```bash
npx --yes vercel@latest --prod
```

## One-click live push on Windows

This repo now includes:

```text
push-live.cmd
start-local.cmd
```

Double-click that file from the project root and it will:

1. Build the web app
2. Stop if the build fails
3. Push the working build to Vercel production

If Vercel ever asks you to sign in on this computer, do that once and then the same button can be used again for later pushes.

For local work, run:

```text
start-local.cmd
```

That opens QRguitar at:

```text
http://127.0.0.1:3003
```

Optional environment variables to set in Vercel:

```text
NEXT_PUBLIC_SITE_URL=https://www.qrguitar.com
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
QRGUITAR_ADMIN_EMAILS=<comma-separated-admin-emails-if-needed>
QRGUITAR_BETA_TESTER_EMAILS=<comma-separated-beta-tester-emails-if-needed>
```

Optional placeholders:

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
NEXT_PUBLIC_SUPPORT_EMAIL=support@qrguitar.com
NEXT_PUBLIC_CONTACT_EMAIL=greg@qrguitar.com
EMAIL_FROM=QRguitar <noreply@qrguitar.com>
SMTP_FROM=noreply@qrguitar.com
SMTP_REPLY_TO=support@qrguitar.com
```

`OPENAI_API_KEY` is optional. Leave it blank unless a paid AI integration is intentionally wired. SMTP/email sending is not wired yet; the email values are placeholders for future transactional email setup.

For local development, put the same values in:

```text
apps/web/.env.local
```

The web app also reads the repo-root `.env.local` as a local fallback, but `apps/web/.env.local` is the clean source of truth because Vercel builds the Next app from `apps/web`.

Required QRguitar web env vars:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL
```

Optional owner/admin MVP allowlist:

```text
QRGUITAR_ADMIN_EMAILS
QRGUITAR_BETA_TESTER_EMAILS
```

Use comma-separated email addresses only if an account should receive owner/commercial MVP privileges without Stripe yet. `QRGUITAR_BETA_TESTER_EMAILS` is for launch testers who need free record creation and transfer beta access without a payment wall. Leave both blank for normal free/paid-plan behavior. Do not commit real private allowlist values.

## Vercel Project Settings

Use these settings when importing the project into Vercel:

```text
Root Directory: apps/web
Framework Preset: Next.js
Install Command: npm install
Build Command: npm run build --workspace @qrguitar/web
Output Directory: .next
Node Version: 20.x
```

Required Vercel environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL=https://www.qrguitar.com
```

Optional Vercel environment variables:

```text
QRGUITAR_ADMIN_EMAILS
QRGUITAR_BETA_TESTER_EMAILS
OPENAI_API_KEY
OPENAI_MODEL
NEXT_PUBLIC_SUPPORT_EMAIL
NEXT_PUBLIC_CONTACT_EMAIL
EMAIL_FROM
SMTP_FROM
SMTP_REPLY_TO
```

## Supabase Auth URLs

In Supabase Dashboard > Authentication > URL Configuration:

```text
Site URL:
https://www.qrguitar.com

Redirect URLs:
http://127.0.0.1:3003/**
http://localhost:3003/**
https://qrguitar.com/**
https://www.qrguitar.com/**
```

For Vercel production, set `NEXT_PUBLIC_SITE_URL` to:

```text
https://www.qrguitar.com
```

For local testing, set `NEXT_PUBLIC_SITE_URL` in `apps/web/.env.local` to:

```text
http://127.0.0.1:3003
```

If you want your custom domain live, then in Vercel:

```bash
npx --yes vercel@latest domains add qrguitar.com
npx --yes vercel@latest alias <your-project>.vercel.app qrguitar.com
```

Make sure your DNS A/CNAME points to Vercel per the domain instructions from Vercel.

Do not delete unrelated DNS records. Leave future email records alone until email is intentionally configured.

## QRguitar Email Setup

QRguitar uses two separate email pieces:

- Zoho Mail Free for real inboxes people can email.
- Brevo Free SMTP for automated app and Supabase Auth emails.

Do not commit or print SMTP passwords, Brevo keys, Zoho passwords, Supabase keys, or any other email secrets.

### Email Addresses

Create these addresses on `qrguitar.com`:

```text
greg@qrguitar.com      main owner inbox
support@qrguitar.com   customer/support inbox
admin@qrguitar.com     internal/admin inbox
noreply@qrguitar.com   automated app/Auth emails only
```

Public support/contact links should use `support@qrguitar.com`. Owner/admin setup notes can use `greg@qrguitar.com`. Automated senders should use `noreply@qrguitar.com`.

### App Email Env Vars

Keep these in `.env.example`, `apps/web/.env.example`, and Vercel when email is wired:

```text
NEXT_PUBLIC_SUPPORT_EMAIL=support@qrguitar.com
NEXT_PUBLIC_CONTACT_EMAIL=greg@qrguitar.com
EMAIL_FROM=QRguitar <noreply@qrguitar.com>
SMTP_FROM=noreply@qrguitar.com
SMTP_REPLY_TO=support@qrguitar.com
```

These values are labels/placeholders until an email provider is connected. Do not add SMTP credentials to the repo.

### A. Zoho Mail Free Inbox Setup

1. Create a Zoho Mail account.
2. Add the domain `qrguitar.com`.
3. Create these mailboxes:
   - `greg@qrguitar.com`
   - `support@qrguitar.com`
   - `admin@qrguitar.com`
   - `noreply@qrguitar.com`
4. In Zoho, copy the DNS records it gives you:
   - domain verification TXT/CNAME
   - MX records
   - SPF TXT
   - DKIM TXT/CNAME
5. Add those records only at the active DNS host for `qrguitar.com`.
6. Do not enable catch-all.
7. Do not delete Vercel website DNS records.

### B. Brevo SMTP Setup

1. Create a Brevo free account.
2. Add and verify `qrguitar.com` as a sending domain.
3. Copy Brevo's SPF/DKIM DNS records.
4. Add those records only at the active DNS host for `qrguitar.com`.
5. Generate SMTP credentials in Brevo.
6. Keep the SMTP username/password private. Do not commit them, paste them into docs, or print them in terminal output.

### C. Supabase Auth SMTP Setup

In Supabase Dashboard:

```text
Authentication -> Emails -> SMTP Settings
```

Use:

```text
Sender name: QRguitar
Sender email: noreply@qrguitar.com
Reply-to: support@qrguitar.com
SMTP host: from Brevo
SMTP port: from Brevo, usually 587
SMTP username: from Brevo
SMTP password: from Brevo
```

Then send a Supabase SMTP test email.

### D. DNS Notes

DNS may be hosted at Vercel, Porkbun, Cloudflare, or wherever the current nameservers point. Add Zoho and Brevo TXT/MX/CNAME records only in the active DNS host.

Do not remove:

- Vercel website records
- Supabase records
- Zoho verification/MX/SPF/DKIM records
- Brevo SPF/DKIM records
- Future email TXT records

### Supabase Email Templates

In Supabase:

```text
Authentication -> Emails -> Templates
```

Review these production templates:

- Confirm signup
- Password reset
- Magic link, if magic links are enabled later

Use plain QRguitar wording:

```text
Brand/product name: QRguitar
Site URL: https://www.qrguitar.com
Support email: support@qrguitar.com
Sender: noreply@qrguitar.com
```

Keep the messages short and clear. Do not mention unfinished payments, transfers, or future features in Auth emails.

### Email Verification Checklist

- Zoho inbox receives mail at `greg@qrguitar.com`.
- Zoho inbox receives mail at `support@qrguitar.com`.
- Zoho MX records pass.
- Zoho SPF/DKIM records pass.
- Brevo sending domain is verified.
- Brevo SPF/DKIM records pass.
- Supabase SMTP test email sends.
- Signup confirmation email arrives.
- Password reset email arrives.
- Emails do not land in spam after DNS verification settles.
- Public app support links show `support@qrguitar.com`.

## Final Launch Check

Before pushing live:

```bash
npm run build --workspace @qrguitar/web
npm run typecheck --workspace @qrguitar/web
```

Then verify:

```text
/
/catalog
/i/QRG-PI260001
/create
/dashboard
```

After production deploy, test:

```text
https://www.qrguitar.com
https://qrguitar.com
https://www.qrguitar.com/catalog
https://www.qrguitar.com/i/QRG-PI260001
https://www.qrguitar.com/create
https://www.qrguitar.com/dashboard
```

## MVP Roadmap

1. Auth and user accounts
2. Create/edit guitar records
3. Upload gallery photos
4. Generate permanent QR codes
5. Public profile pages
6. Ownership transfer workflow
7. Service/repair timeline
8. Builder/shop dashboards
9. Stripe pricing
10. iOS/Android publishing
