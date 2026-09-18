# Netlify Free deployment adapter

This repository contains a source-only Netlify adapter. Adding these files does not create or link a Netlify account, deploy the application, add secrets, publish a domain, or change DNS. The existing Vercel release path remains available.

## Build contract

The root [`netlify.toml`](../netlify.toml) keeps the repository root as the build base, runs `npm run build --workspace @qrguitar/web`, publishes `apps/web/.next`, and selects Node 24. Keeping the root base allows npm to install both the web workspace and `packages/shared` from the committed root lockfile.

Netlify automatically applies its current OpenNext adapter to supported Next.js applications. The adapter provisions the SSR/API function, middleware edge function, caching, and image handling. Do not add or pin `@netlify/plugin-nextjs`: Netlify says pinning opts out of automatic adapter updates. The release script gives the CLI the reviewed source and configuration and does not depend on undocumented `.netlify/*` output paths.

Official references:

- [Next.js and the OpenNext adapter](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/#how-netlify-runs-your-next-js-app)
- [Next.js build and publish settings](https://docs.netlify.com/frameworks/#next-js)
- [Monorepo build settings](https://docs.netlify.com/build/configure-builds/monorepos/)
- [Node.js build version selection](https://docs.netlify.com/build/configure-builds/manage-dependencies/#node-js-and-javascript)

The application maps provider metadata into one QRguitar identity contract:

| QRguitar value | Explicit override | Vercel fallback | Netlify fallback |
| --- | --- | --- | --- |
| Environment | `QRGUITAR_BUILD_ENV` | `VERCEL` → `production` | `CONTEXT` |
| Commit | `QRGUITAR_GIT_SHA` | `VERCEL_GIT_COMMIT_SHA` | `COMMIT_REF` |
| Deploy | `QRGUITAR_DEPLOYMENT_ID` | `VERCEL_DEPLOYMENT_ID`, then `VERCEL_URL` | `DEPLOY_ID`, then `DEPLOY_URL` |

Explicit QRguitar values always win, so the guarded local release can inject the reviewed full SHA and timestamp. Netlify's `DEPLOY_URL` is the immutable per-deploy URL. `URL` is the main site URL and `DEPLOY_PRIME_URL` may move, so neither is accepted as staged identity. See [Netlify's read-only build variables](https://docs.netlify.com/build/configure-builds/environment-variables/#read-only-variables).

## Free-plan and runtime boundaries

Netlify states that its regular Free plan can host commercial projects. The current Free plan is $0 with a hard 300-credit monthly limit; it cannot auto-recharge or create an overage bill. Exhausting the limit pauses projects. A successful production deploy uses 15 credits. Preview/branch deploys, failed deploys, and a rollback to a previous production deploy do not use production-deploy credits, although compute, bandwidth, and web requests use their own credits.

- [Commercial projects on Netlify Free](https://www.netlify.com/blog/introducing-netlify-free-plan/)
- [Current Free-plan hard limit](https://www.netlify.com/pricing/)
- [Production-deploy credit accounting](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/#credit-usage-for-production-deploys)

The generated synchronous Next.js function has a non-configurable 60-second execution limit and a 6 MB buffered request/response limit. Binary request bodies are base64 encoded by the platform, reducing the practical binary request limit to about 4.5 MB. User files must upload directly to object storage through bounded signed URLs; application functions should receive only small metadata bodies. See [Netlify Function defaults](https://docs.netlify.com/build/functions/configuration/#default-values).

Run the source preflight before any Netlify release:

```bash
npm run check:netlify
```

It fails closed when a route declares more than 60 seconds or the Profile editor still sends inline file data in PATCH JSON. At this baseline it intentionally reports both blockers: `apps/web/app/api/billing/webhook/route.ts` declares 120 seconds, and `apps/web/app/edit/[code]/page.tsx` sends image/document data URLs. Those payment and Profile-edit changes are outside this adapter's scope. Do not stage or publish until their reviewed fixes are integrated and the preflight passes. The 6 MB response ceiling still needs production acceptance because static analysis cannot prove every dynamic response size.

## Local release state and required configuration

Keep all credentials in Netlify's environment configuration or an ignored local environment file. `netlify.toml` contains no tokens, Supabase keys, payment secrets, account IDs, site IDs, or domain changes. The release wrapper never puts `NETLIFY_AUTH_TOKEN` or application secrets in command arguments or staged records.

Set these non-secret operator values only in the release shell:

```text
QRGUITAR_NETLIFY_FREE_PLAN_CONFIRMED=true
QRGUITAR_NETLIFY_SITE_ID=<exact Netlify site UUID>
QRGUITAR_NETLIFY_PRODUCTION_ORIGIN=https://<assigned main host>
QRGUITAR_NETLIFY_CANONICAL_ORIGIN=https://qrguitar.com
```

`QRGUITAR_NETLIFY_CANONICAL_ORIGIN` is optional and defaults to `https://qrguitar.com`. The production origin must be returned by the expected Netlify site's API. The wrapper also requires Node 24, a clean committed tree, the same full SHA throughout, a pinned Netlify CLI, an authenticated CLI session or `NETLIFY_AUTH_TOKEN` in the process environment, and Netlify auto publishing locked. It does not log in, create a site, configure variables, lock the site, or edit a domain.

Netlify CLI state and QRguitar stage receipts stay under ignored `.netlify/`. They contain site/deploy IDs and public build identity only, never credentials.

## Stage, verify, publish, and rollback

Stage from the reviewed commit:

```bash
npm run release:netlify -- stage
```

The wrapper runs the existing build, typecheck, launch, behavior, and audit gates. It exports exactly the committed Git tree to a temporary directory, excluding ignored secrets and untracked edits, then installs that snapshot's locked dependencies with `npm ci --no-audit --no-fund`. Pinned Netlify CLI 27.8.0 selects the `@qrguitar/web` monorepo application, builds that snapshot with the `production` context, and creates a draft because the command contains neither `--prod` nor `--prod-if-unlocked`. The wrapper validates the CLI JSON against the exact site UUID, deploy ID, and immutable `<DEPLOY_ID>--<site>.netlify.app` URL; verifies `/api/build-info` against the full SHA, timestamp, and deploy ID; rechecks the locked production baseline; then writes `.netlify/qrguitar-netlify-staged-release.json`. A failed check never creates a publishable record.

The immutable draft must be reachable by the release process for identity verification. Netlify may enable private-by-default deploys for a new credit-based project; in that state the stage command fails safely at the HTTP probe. Configure access through Netlify before using this adapter, or keep the deployment unpublished. Do not bypass the identity probe.

Before the first real cutover, rehearse `restoreSiteDeploy` with a disposable Netlify site. Netlify documents the **Publish Deploy** action for successful deploys and exposes `POST /sites/{site_id}/deploys/{deploy_id}/restore`, but the public API text describes the operation primarily as restore/rollback rather than explicitly guaranteeing draft promotion. Set `QRGUITAR_NETLIFY_RESTORE_DRAFT_PROVEN=true` only after the pinned CLI/API flow has published the exact staged draft ID in that rehearsal. This adapter does not perform the rehearsal or create the disposable site.

Publish the saved draft only after reviewing its record and accepting one 15-credit production deploy:

```bash
npm run release:netlify -- publish --acknowledge-production-credits=15
```

Publication is blocked unless the saved baseline has both an exact deploy ID and full Git SHA. The wrapper checks database readiness, re-verifies the candidate and rollback target on their immutable URLs, confirms production still points at the locked baseline, restores the exact candidate ID, confirms that ID is published, verifies the configured live origin, and writes a publication receipt. It never rebuilds during publication.

Rollback only when the recorded application's database contract remains compatible:

```bash
npm run release:netlify -- rollback --acknowledge-database-compatibility
```

Rollback verifies the current candidate and recorded baseline before mutation, restores only that exact baseline ID, confirms it became the locked published deploy, checks live identity and health, and archives the receipt. Netlify says this atomic rollback does not use production-deploy credits. It does not restore Supabase schema or data. A Git auto publish can replace a rollback, which is why this workflow requires auto publishing to remain locked.

Official deployment references:

- [CLI draft and production deploy behavior](https://cli.netlify.com/commands/deploy/)
- [Atomic deploys, locks, retention, and rollback](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/)
- [`restoreSiteDeploy` API](https://open-api.netlify.com/#tag/deploy/operation/restoreSiteDeploy)

Netlify's default deploy retention is 30 days on Free. An automatically deleted deploy permalink cannot be restored. Keep a separate database backup and a current application release process; this receipt is a bounded application rollback pointer, not durable disaster recovery.
