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
Phase 2 (Supabase and the billing Worker are mocked in `tests/p2lib.js`; checkout is never called):
`tests/p2dash.js` (dashboard figures vs seeded receipts + screenshots), `tests/p2parity.js` (sales + customers vs the old
pages — serve the repo root on :3001), `tests/p2history_auth.js` (history search/open/re-download/share, sign-in redirects,
email-link forwarding, old URLs), `tests/p2lh.mjs` (Lighthouse mobile on signed-in `/app` and `/records`; `npm i --no-save lighthouse`).

## Routes

| URL | Source | Notes |
|---|---|---|
| `/` | `app/(marketing)/page.tsx` | Landing. Email links (`?code=`, `#access_token=`, `token_hash`, `type=`) and the installed app go to `/app`; link errors go to `/signin`; `#signin` → `/signin`; `#generator`, `?edit=`/`?duplicate=` → `/new`. |
| `/app` | `app/(app)/app` | Dashboard (sign-in required). Figures come only from the user's receipts (same rules as `js/sales.js`); plan card uses `GET /api/billing/status`. |
| `/new` | `app/(app)/new` | Receipt builder (port of `js/app.js`). Open to guests (first-session rules unchanged). |
| `/records` (`/records.html`) | `app/(app)/records` | Receipt history (port of `js/records.js`, sign-in required). `?view=<id>` supported. |
| `/sales` (`/sales.html`) | `app/(app)/sales` | Sales records, native port of `sales.html` + `js/sales.js` (sign-in required). |
| `/customers` (`/customers.html`) | `app/(app)/customers` | Customers, native port of `customers.html` (sign-in required). |
| `/signin` | `app/(auth)/signin` | `?mode=signup`, `?next=/path` (default `/app`). Signed-out visits to app pages land here with `next` set. |
| `/billing` (`/billing.html`) | `app/billing` | Paystack callback `SITE_ORIGIN/billing.html` → Cloudflare 307 → `/billing?reference=…` (query kept). |
| `/r` (`/r.html`) | `app/r` | Receipt verification (`get_shared_receipt`). |
| `/reset` (`/reset.html`) | `app/reset` | Password reset link target. |
| `/about`, `/privacy-policy`, `/terms`, 404 | `app/(marketing)`, `app/not-found.tsx` | Legal copy verbatim. |
| `/notifications.html`, `/admin.html` | copied from the repo root by `scripts/postbuild.mjs` | Legacy pages, with `index.html` links pointed at `/app`. |

Navigation: sidebar at ≥1024px; on phones a bottom tab bar (Home, New, History, Sales, More). PWA `start_url` is `/app`;
the service worker cache is `rp-next-v2` (old caches are dropped on activate).

## Switching production (Cloudflare Workers Builds, Worker `receipt-pilot`)

Settings → Build (do not change until you are ready):

- Git branch: `simplify-receipt-pilot` (after merging `nextjs-redesign`)
- Root directory: `web`
- Build command: `npm ci && npm run build`
- Deploy command: `npx wrangler deploy` (reads `web/wrangler.jsonc`: assets `./out`, 404 page, auto trailing slash)
- Build variable (optional): `NODE_VERSION=22` (Next 16 needs Node ≥ 20.9)

Rollback: set Root directory back to empty (`/`), Build command back to empty, Deploy command back to what it was,
or redeploy the previous version from the Worker's Deployments tab ("Rollback"), or revert the merge commit.
