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
`tests/p3plan.js` (plan notice rules with mocked `/api/billing/status`: daily notice, final 2 days, expired, paid, status error, verify).
`tests/p4pages.js` (notifications + admin vs the old pages, same mocks), `tests/p4sw.js` (old `receiptly-v34` service worker →
new build hand-over on one origin, offline, and rollback).

Design polish (branch `design-polish`): `tests/p5install.js` (phone field sizing at 320/375/414/1280 incl. long country
names; Install app entry: Chrome `beforeinstallprompt` path, iPhone Safari guide, hidden when standalone; installability),
`tests/audit.js` (overflow at 320/375/414/768/1280, tap targets <44px, unlabeled controls, broken images, HTTP and console
errors; `BASE=https://receipt-pilot.com LIVE=1` audits public pages read-only), `tests/focus.js` (visible focus on every Tab
stop), `tests/phoneshot.js` and `tests/polishshots.js` (screenshots).


Record payments (branch `record-payments`): `node tests/payments.unit.js` (lib/payments rules, legacy receipt markup
byte-identical to the pre-change renderer via `tests/fixtures/legacy-receipts.json`, payment-history markup, sales
"owing" filter, payload round trip) and `tests/p6payments.js` (browser, mocked: partial/multiple/full payments,
overpayment blocked, undo with confirmation, image/PDF markup, edit lock, Owing filter + Balance column, synced row keys).
Payment history is stored inside the receipt object (`payments`, `paidAtIssue`, `paidInFullOn`, `undonePayments`),
which already syncs in the existing `receipts.payload` JSON column; no schema change.

Design system: one font (Inter via next/font), tokens in `app/globals.css` (`@theme`), Lucide icons wrapped in
`components/ui/Icons.tsx`, dialogs/sheets on Radix Dialog (`components/ui/Modal.tsx`, same props as before). Single-line
controls share `controlClass` (exact 44px height). The phone field's country picker is a fixed 6.25rem (6.75rem from `sm`)
and shows only the flag and dial code; the number input takes the rest.

Install app (`lib/install.ts`, `lib/installSnippet.ts`, `components/app/Install.tsx`): an inline head script captures
`beforeinstallprompt` before hydration. "Install app" sits in the sidebar, the More sheet and as a dismissible dashboard
card (`receiptly_install_dismiss` / `receiptly_ios_install_dismiss` hide only the card). Chrome/Android opens the native
prompt; iPhone/iPad Safari, in-app browsers and other browsers get a short guide sheet. Nothing shows when the app already
runs standalone. Nothing opens on its own. Service worker cache is `rp-next-v4`.

Plan notice (`lib/planStatus.ts`, `PlanNotice` in `components/app/AccessLayer.tsx`), read-only from `GET /api/billing/status`:
more than 2 Africa/Lagos calendar days left (trial or paid) → small fixed notice at most once a day per user
(`localStorage rp_plan_notice_<userId>`); 2 days or less, or ended → on every page view until the status shows an active
paid plan ("Close" hides it for that view only); missing/unreadable dates or a status error → nothing shown (console only).
It is position-fixed (no layout shift) and stays hidden while the existing paywall is open. Access rules are unchanged
(`AccessGate`, same rules as before). The billing page shares each status it loads, so a verify clears the prompt at once.

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
| `/notifications` (`/notifications.html`) | `app/(app)/notifications` | Native port of `notifications.html`: same copy, same "Sign in required" gate; no Supabase writes. |
| `/admin` (`/admin.html`) | `app/admin` | Native port of `admin.html` + `js/admin.js`: same session wait and the same `rpc("list_account_deletion_requests")`; access decided only by the database. Loads no account/billing code (`AppShell access={false}`). |

Nothing is copied from the old site any more: `scripts/postbuild.mjs` only checks that the required files exist.

Navigation: sidebar at ≥1024px; on phones a bottom tab bar (Home, New, History, Sales, More). PWA `start_url` is `/app`;
the service worker cache is `rp-next-v3` (old caches are dropped on activate).

## Switching production (Cloudflare Workers Builds, Worker `receipt-pilot`)

Settings → Build (do not change until you are ready):

- Git branch: `simplify-receipt-pilot` (after merging `nextjs-redesign`)
- Root directory: `web`
- Build command: `npm ci && npm run build`
- Deploy command: `npx wrangler deploy` (reads `web/wrangler.jsonc`: assets `./out`, 404 page, auto trailing slash)
- Build variable (optional): `NODE_VERSION=22` (Next 16 needs Node ≥ 20.9)

Rollback: set Root directory back to empty (`/`), Build command back to empty, Deploy command back to what it was,
or redeploy the previous version from the Worker's Deployments tab ("Rollback"), or revert the merge commit.
