# Receipt Pilot payment tests

These files are for the disposable Supabase project `receipt-pilot-test` only.
Do not run them on production.

They are working-copy files. They are not yet on GitHub `main`.

## What each file checks

- `supabase/tests/009_atomic_payment_test.sql`
  - Function exists and is not executable by `PUBLIC`, `anon`, or `authenticated`.
  - Rejects a bad plan, wrong amount, wrong currency, and missing reference.
  - A missing subscription raises and leaves no payment claim.
  - Inserts two disposable auth users, checks a 14-day trial for the new user, and checks an existing trial date is not rewritten by a later insert.
  - Applies one payment, rejects a duplicate reference, and rejects a duplicate event id.
  - Checks entitlement, public share for an eligible owner, expired-owner share denial, and that another eligible account is unaffected.
  - This script commits its fixture rows. It does not wrap them in a rollback transaction.

- `supabase/tests/009_concurrency_test.sh`
  - Opens two separate `psql` sessions.
  - Session A locks the subscription row, waits, then applies one payment.
  - Session B uses a different reference and must wait on that lock.
  - Fails unless both events are processed and expiry is more than one month later.
  - Requires `psql`, `DISPOSABLE_URL`, and a real disposable `USER_ID`.

- `supabase/tests/billing_plan_checks.js`
  - Checks the four plan kobo amounts and HMAC-SHA512 signature mismatch.
  - Does not connect to a database.

## Commands

```sh
node supabase/tests/billing_plan_checks.js
psql "$DISPOSABLE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/009_atomic_payment_test.sql
DISPOSABLE_URL="$DISPOSABLE_URL" USER_ID=your-disposable-user-uuid sh supabase/tests/009_concurrency_test.sh
```

## Execution status

- `billing_plan_checks.js` was executed in the review environment and passed.
- The SQL test has not been executed.
- The concurrency script has not been executed.

No secrets, API keys, or connection strings are included.
