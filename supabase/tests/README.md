# Disposable database test procedure

Do not use production credentials. Do not run this against the live Receipt Pilot database.

No SQL test in this procedure has been executed here. `psql` is not available in the review environment.

## Fresh disposable database

`schema.sql` is the full install for an empty database. Migrations 001–006 are for an existing project that already has data. Do not run `grants.sql`, `share.sql`, or `upgrade.sql`.

### Option A — new disposable Supabase project

1. Create a new empty Supabase project. Do not select the production project.
2. In the SQL Editor, run `supabase/schema.sql` once.
3. Run these in order:
   - `supabase/migrations/007_payment_foundation.sql`
   - `supabase/migrations/008_trial_and_entitlement.sql`
   - `supabase/migrations/009_apply_verified_payment.sql`
4. Get the disposable database URL from that project’s settings. Use it only as `DISPOSABLE_URL`.

### Option B — local PostgreSQL

```sh
createdb receipt_pilot_disposable
psql receipt_pilot_disposable -v ON_ERROR_STOP=1 -f supabase/tests/disposable_bootstrap_local.sql
psql receipt_pilot_disposable -v ON_ERROR_STOP=1 -f supabase/schema.sql
psql receipt_pilot_disposable -v ON_ERROR_STOP=1 -f supabase/migrations/007_payment_foundation.sql
psql receipt_pilot_disposable -v ON_ERROR_STOP=1 -f supabase/migrations/008_trial_and_entitlement.sql
psql receipt_pilot_disposable -v ON_ERROR_STOP=1 -f supabase/migrations/009_apply_verified_payment.sql
export DISPOSABLE_URL=postgresql://localhost/receipt_pilot_disposable
```

## Tests

```sh
psql "$DISPOSABLE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/009_atomic_payment_test.sql
```

This asserts rejection cases, missing-subscription rollback, 14-day trial for a new user, preservation of an existing trial date, duplicate reference, duplicate event id, expired-owner share denial, and that another eligible account is unaffected. A failure exits nonzero.

```sh
USER_ID=your-disposable-user-uuid \
DISPOSABLE_URL="$DISPOSABLE_URL" \
  sh supabase/tests/009_concurrency_test.sh
```

This opens two sessions. Session A holds the subscription row lock, then applies one payment. Session B uses a different reference and waits. It fails unless both events are processed and the expiry is more than one month later.

```sh
node supabase/tests/billing_plan_checks.js
```

This is the only test that has already passed in the review environment.

## Required variables

- `DISPOSABLE_URL` — connection string for the disposable database only
- `USER_ID` — a disposable `subscriptions.user_id` for the concurrency script

No Paystack secret or production service-role key is required for these database tests.
