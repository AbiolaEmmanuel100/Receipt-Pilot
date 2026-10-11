# Receipt Pilot

Simple receipts. Organized records.

A static website: create professional receipts, save them in the browser, search them later, print/PDF, and export CSV or a JSON backup. Optional Supabase login syncs your own records across devices.

## Run

Open `index.html` in a modern browser, or serve the folder. The receipt generator works without any cloud keys.

## Pages

- `index.html` — receipt generator
- `records.html` — saved records, filters, export
- `sales.html` — daily / weekly / monthly totals
- `reset.html` — password reset (after email link)
- `about.html`, `contact.html`, `privacy-policy.html`, `terms.html`

## Storage

Offline: IndexedDB on this device (`js/storage.js`).

Online (when logged in): receipts sync to your own Supabase account. Public URL and publishable key are in `js/config.js` only. Never add a service_role / sb_secret key.

If logged-in save fails with a permission error, see `supabase/SETUP.md`.
- **New empty project:** run `supabase/schema.sql` once.
- **Existing project with data:** run `supabase/migrations/001` through `004` in order. Do not reset the database.

Conflict rule: later `updatedAt` wins. Deletes are remembered in the cloud so they do not come back on another device.

## Deploy on Netlify

- Build command: empty
- Publish directory: the folder that contains `index.html`
- After deploy, add the Netlify URL to Supabase Auth redirect URLs

Payments are **not** connected in this phase.

## Analytics

In `js/config.js` set `gaMeasurementId` when you have a real GA4 ID. Events do not send receipt contents.

## Brand

Change the text “Receipt Pilot” in the HTML headers and footers.
