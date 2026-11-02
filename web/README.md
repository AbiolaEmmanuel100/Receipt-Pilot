# Receipt Pilot — Next.js frontend (`web/`)

Next.js 16 (App Router, `output: "export"`), React 19, TypeScript, Tailwind 4, Framer Motion.
Static files only: `npm run build` writes everything to `web/out/`. No server, no new backend.
Same Supabase project and public key (`lib/config.ts` = `js/config.js`), same IndexedDB (`receiptly_db`),
same auth storage key (`receiptly-auth`), same billing Worker endpoints and rules.

## Commands

    npm ci
    npm run build        # next build + scripts/postbuild.mjs -> out/
    node tests/cfserve.mjs out 3000   # local server that behaves like Cloudflare assets (x.html -> 307 /x, query kept)

Browser tests (need `npm i --no-save puppeteer-core` and Chrome at /usr/bin/google-chrome):
`tests/billingtest.js` (all /api/billing/verify outcomes, mocked), `tests/signintest.js`, `tests/buildertest.js`, `tests/nextshots.js`.

## Routes

| URL | Source | Notes |
|---|---|---|
| `/` | `app/(marketing)/page.tsx` | Landing. Auth callbacks, `#generator`, `?edit=`/`?duplicate=` and the installed app go to `/new`. |
| `/new` | `app/(app)/new` | Receipt builder (port of `js/app.js`). |
| `/records` | `app/(app)/records` | Receipts list (port of `js/records.js`). `?view=<id>` supported. |
| `/signin` | `app/(app)/signin` | `?mode=signup`, `?next=/path`. |
| `/billing` (`/billing.html`) | `app/billing` | Paystack callback `SITE_ORIGIN/billing.html` → Cloudflare 307 → `/billing?reference=…` (query kept). |
| `/r` (`/r.html`) | `app/r` | Receipt verification (`get_shared_receipt`). |
| `/reset` (`/reset.html`) | `app/reset` | Password reset link target. |
| `/about`, `/privacy-policy`, `/terms`, 404 | `app/(marketing)`, `app/not-found.tsx` | Legal copy verbatim. |
| `/sales.html`, `/customers.html`, `/notifications.html`, `/admin.html` | copied from the repo root by `scripts/postbuild.mjs` | Legacy pages (Phase 2), with `index.html` links pointed at `/new`. |

## Switching production (Cloudflare Workers Builds, Worker `receipt-pilot`)

Settings → Build (do not change until you are ready):

- Git branch: `simplify-receipt-pilot` (after merging `nextjs-redesign`)
- Root directory: `web`
- Build command: `npm ci && npm run build`
- Deploy command: `npx wrangler deploy` (reads `web/wrangler.jsonc`: assets `./out`, 404 page, auto trailing slash)
- Build variable (optional): `NODE_VERSION=22` (Next 16 needs Node ≥ 20.9)

Rollback: set Root directory back to empty (`/`), Build command back to empty, Deploy command back to what it was,
or redeploy the previous version from the Worker's Deployments tab ("Rollback"), or revert the merge commit.
