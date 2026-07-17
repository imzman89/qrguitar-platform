# QRguitar Deploy Checklist

Use this in order.

## 1. Supabase

In your Supabase project, confirm:

- schema from `supabase/schema.sql` has been run
- Auth is enabled
- Storage buckets exist if your schema expects them
- you have these values ready:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

## 2. Local file

Create:

```text
.env.local
```

Paste:

```text
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3003
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## 3. Test locally

Run:

```text
npm install
npm run local:qa --workspace @qrguitar/web
```

Then test:

- homepage loads
- login works
- dashboard opens
- create record saves
- QRguitar Profile opens

## 4. Vercel

In Vercel project settings, add:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL=https://www.qrguitar.com
SUPABASE_SERVICE_ROLE_KEY
```

## 5. Push live

Double-click:

```text
PUSH QRGUITAR LIVE
```

That button:

1. builds the site
2. stops if the build fails
3. pushes production if the build passes

## 6. After push

Check:

- [https://www.qrguitar.com](https://www.qrguitar.com)
- login
- dashboard
- create flow
- catalog
- real public Profiles

## 7. If something fails

- do not keep pushing blindly
- read the black window output
- fix the issue locally first
- push again after the build passes
