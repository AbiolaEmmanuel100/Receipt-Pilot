# Existing-database migrations

Run these **in order** on a Receipt Pilot Supabase project that already has users/data.

Do **not** run `schema.sql` as a reset.

| File | Purpose |
|---|---|
| `001_footer.sql` | `business_information.footer` |
| `002_receipt_numbering.sql` | Unique receipt numbers, counters, `allocate_receipt_number()` |
| `003_get_shared_receipt.sql` | Public share RPC for `r.html` |
| `004_delete_own_account.sql` | Account-delete RPC |

All four are idempotent. They do not delete data or rewrite receipt numbers.
