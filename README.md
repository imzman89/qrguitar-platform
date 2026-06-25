# QRguitar Platform

Free-tier MVP starter for a real QRguitar SaaS platform.

## What This Includes

- Next.js web app
- Expo mobile app starter
- Shared TypeScript models
- Supabase database schema
- Public guitar profile pages
- Dashboard/create-flow starter
- QR-friendly URLs like `/i/QRG-0001`

## Free Stack

- Web hosting: Vercel free tier
- Database/auth/storage: Supabase free tier
- Mobile development: Expo free tier
- Payments later: Stripe, no monthly fee

Publishing mobile apps is not fully free:

- Apple Developer Program: $99/year
- Google Play Console: $25 one-time

## Quick Start

1. Install Node.js 20+.
2. Create a free Supabase project.
3. Run the SQL in `supabase/schema.sql` inside Supabase SQL Editor.
4. Copy `.env.example` to `.env.local`.
5. Add your Supabase project URL and anon key.
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
http://localhost:3000
```

9. Run the mobile app:

```bash
npm run dev:mobile
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
