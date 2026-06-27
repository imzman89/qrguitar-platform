# QRguitar Free MVP: Step By Step

## 1. Install Free Tools

Install:

- Node.js 20 LTS
- GitHub Desktop or Git
- VS Code
- Expo Go app on your phone

## 2. Create Free Accounts

Create:

- GitHub account
- Supabase account
- Vercel account
- Expo account

## 3. Set Up Supabase

1. Go to Supabase.
2. Create a new free project.
3. Open SQL Editor.
4. Paste the contents of `supabase/schema.sql`.
5. Click Run.
6. Go to Project Settings > API.
7. Copy:
   - Project URL
   - anon public key

## 4. Configure The App

1. Copy `.env.example`.
2. Rename the copy to `.env.local`.
3. Fill in:

```text
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## 5. Run Locally

From the project root:

```bash
npm install
npm run dev:web
```

Open:

```text
http://localhost:3000
```

Try:

```text
http://localhost:3000/i/QRG-0001
```

## 6. Run Mobile

From the project root:

```bash
npm run dev:mobile
```

Scan the Expo QR code with Expo Go.

## 7. Deploy Web For Free

1. Push the project to GitHub.
2. Import the repo into Vercel.
3. Choose `apps/web` as the project root.
4. Add the same environment variables.
5. Deploy.

## 8. Connect qrguitar.com

In Vercel:

1. Go to Project Settings > Domains.
2. Add `qrguitar.com`.
3. Follow the DNS instructions.

## 9. What Costs Money Later

Free now:

- Development
- Web app hosting
- Database while small
- Auth while small
- Mobile development

Costs later:

- Apple App Store: $99/year
- Google Play: $25 one time
- Storage when users upload lots of media
- Database when traffic grows
- Email sending when volume grows
- Stripe transaction fees

## 10. Build Order

1. Connect auth.
2. Make create form save guitars.
3. Add image uploads.
4. Generate QR PNG/download.
5. Add edit profile dashboard.
6. Add ownership transfer invites.
7. Add Stripe checkout.
8. Polish mobile scanning.
