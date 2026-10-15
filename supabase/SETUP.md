# Connect Receipt Pilot to Supabase

This project is static HTML/JS (not Next.js). Public keys go in **one file**: `js/config.js`.

Do **not** put a `service_role` / `sb_secret` key, database password, or payment secret in the website.

Pick **one** path below.

---

## Brand-new empty Supabase project

1. Supabase → **SQL Editor**
2. Paste and run **`schema.sql`** once
3. Put the project URL and **publishable/anon** key in `js/config.js`
4. **Authentication → Providers → Email** — enable Email
5. **Authentication → URL Configuration**
   - Site URL: your site (for local testing, `http://localhost:8080`)
   - Redirect URLs:
     - `http://localhost:8080/**`
     - `http://localhost:8080/reset.html`
     - later, the same pattern for your live URL

That is the whole database install. Do **not** also run `grants.sql`, `share.sql`, or `upgrade.sql`.

`schema.sql` includes tables, RLS, numbering, public share (`get_shared_receipt`), and account delete (`delete_own_account`).

---

## Existing Receipt Pilot Supabase project (users/data already there)

Do **not** reset the project. Do **not** re-run `schema.sql` as a wipe.

In the SQL Editor, run these files **in order**:

1. `migrations/001_footer.sql`
2. `migrations/002_receipt_numbering.sql`
3. `migrations/003_get_shared_receipt.sql`
4. `migrations/004_delete_own_account.sql`

They are safe to re-run. They do not delete users, receipts, or receipt numbers.

If you previously ran the old `upgrade.sql` / `share.sql` / `grants.sql`, still run 001–004. Existing objects are left in place.

---

## Optional / unused objects

`customers`, `products`, `expenses`, `admin_emails`, `platform_stats`, and `error_events` are **not** required.

- Do not run them for a normal install.
- If they already exist, this setup does **not** drop them.
- To recreate them on purpose: `optional/unused_objects.sql`

---

## Old files

These are leftover pointers, not install steps:

- `grants.sql` — grants are inside `schema.sql` and the migrations
- `share.sql` — share RPC is inside `schema.sql` and `migrations/003`
- `upgrade.sql` — replaced by `migrations/001`–`004`
