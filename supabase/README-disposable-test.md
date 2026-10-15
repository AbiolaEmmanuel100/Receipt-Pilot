# Receipt Pilot disposable SQL

These scripts are for the disposable Supabase project `receipt-pilot-test` only.
Do not run them on the production database.

## Execution order

1. `supabase/schema.sql`
2. `supabase/migrations/007_payment_foundation.sql`
3. `supabase/migrations/008_trial_and_entitlement.sql`
4. `supabase/migrations/009_apply_verified_payment.sql`

Paste and run one file at a time in the `receipt-pilot-test` SQL Editor.

Do not run migrations 001–006, `grants.sql`, `share.sql`, or `upgrade.sql`.
`schema.sql` already includes those objects for a new empty project.

## Source

- `supabase/schema.sql` matches the current repository `HEAD` file.
- Migrations 007–009 are the current working-copy files. They are not yet on GitHub `main`.

No secrets, API keys, or connection strings are included.
