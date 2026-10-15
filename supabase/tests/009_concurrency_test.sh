#!/bin/sh
# Two-session concurrency test. DISPOSABLE DATABASE ONLY.
# Requires psql, schema.sql, migrations 007-009, and a real subscriptions.user_id.
# Not executed in the review environment.
#
#   DISPOSABLE_URL=postgresql://... USER_ID=uuid \
#     sh supabase/tests/009_concurrency_test.sh

set -eu
if [ -z "${DISPOSABLE_URL:-}" ] || [ -z "${USER_ID:-}" ]; then
  echo "Set DISPOSABLE_URL and USER_ID." >&2
  exit 1
fi
command -v psql >/dev/null 2>&1 || { echo "psql is required." >&2; exit 1; }

RUN=$(psql "$DISPOSABLE_URL" -Atqc "select gen_random_uuid()")
REF_A="conc-a-$RUN"
REF_B="conc-b-$RUN"
BEFORE=$(psql "$DISPOSABLE_URL" -Atqc "select coalesce(expires_at, now()) from public.subscriptions where user_id = '$USER_ID'")

# Session A holds the subscription row lock, then applies one payment.
psql "$DISPOSABLE_URL" -v ON_ERROR_STOP=1 -v user_id="$USER_ID" -v ref="$REF_A" <<'SQL' &
begin;
select expires_at from public.subscriptions where user_id = :'user_id' for update;
select pg_sleep(3);
select public.apply_verified_payment(
  :'user_id'::uuid, 'paystack', 'evt-a-' || :'ref', :'ref',
  'monthly', 150000, 'NGN', 'manual'
);
commit;
SQL
A=$!
sleep 1

# Session B uses a different reference and waits on the same row lock.
psql "$DISPOSABLE_URL" -v ON_ERROR_STOP=1 -v user_id="$USER_ID" -v ref="$REF_B" <<'SQL' &
select public.apply_verified_payment(
  :'user_id'::uuid, 'paystack', 'evt-b-' || :'ref', :'ref',
  'monthly', 150000, 'NGN', 'manual'
);
SQL
B=$!
wait "$A"
wait "$B"

COUNT=$(psql "$DISPOSABLE_URL" -Atqc "select count(*) from public.payment_events where provider_reference in ('$REF_A','$REF_B') and processing_status = 'processed'")
AFTER=$(psql "$DISPOSABLE_URL" -Atqc "select expires_at from public.subscriptions where user_id = '$USER_ID'")
if [ "$COUNT" != "2" ]; then
  echo "FAIL expected 2 processed events, got $COUNT" >&2
  exit 1
fi
psql "$DISPOSABLE_URL" -v ON_ERROR_STOP=1 -c "select case when '$AFTER'::timestamptz > '$BEFORE'::timestamptz + interval '1 month' then 1 else 0 end" | grep -q 1 || {
  echo "FAIL expiry was not extended by both renewals" >&2
  exit 1
}
echo "concurrency test passed"
