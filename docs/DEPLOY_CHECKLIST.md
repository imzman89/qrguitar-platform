# QRguitar Deploy Checklist

For the September 2026 candidate, follow [the current release runbook](RELEASE_2026_09.md), including its guarded `--stage-only` / `--promote-staged` cutover, database readiness, WAF freeze/drain, and authenticated acceptance. The legacy setup notes below do not replace those release gates. Never replay the baseline schema over an existing production database.

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

The guarded release command:

1. requires a clean committed checkout linked to the production project
2. runs build, type, launch, behavior, audit and database readiness checks
3. stages with custom-domain promotion skipped, verifies the exact deployment, promotes, and verifies public production

For the first incompatible database cutover, use the split commands in the release runbook instead. `npm run push:live -- --stage-only` completes local checks and staging before migration. Capture alias targets before staging: generated Vercel aliases can move despite `--skip-domain` and must be inspected/restored until cutover. `npm run push:live -- --promote-staged` requires the same clean commit and checks database readiness and the exact staged deployment before promotion.

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
