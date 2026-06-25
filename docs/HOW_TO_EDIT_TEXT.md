# How To Edit QRguitar Text

## Homepage / marketing text

Edit:

`apps/web/content/site-copy.ts`

This controls the homepage headline, section copy, pricing card text, CTAs, and homepage feature cards.

## App screen text

For now, app screen labels live in the page files:

- Create/register screen: `apps/web/app/create/page.tsx`
- Edit profile screen: `apps/web/app/edit/[code]/page.tsx`
- Dashboard: `apps/web/app/dashboard/page.tsx`
- Public guitar profile: `apps/web/app/i/[code]/page.tsx`
- Login/register account screen: `apps/web/app/login/page.tsx`

## Best next upgrade

Move app labels into a second content file:

`apps/web/content/app-copy.ts`

Then later, when Supabase is connected, move editable public text into the `site_content` table so text can be edited from an admin screen instead of code.
