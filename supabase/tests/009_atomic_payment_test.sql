-- Disposable-database assertions. Do not run on production.
-- Apply schema.sql, then 007, 008, and 009 first.
-- psql "$DISPOSABLE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/009_atomic_payment_test.sql
-- Failed assertions raise and exit nonzero with ON_ERROR_STOP.
-- Not executed in the review environment.

do $$
declare
  exposed int;
begin
  if to_regprocedure('public.apply_verified_payment(uuid,text,text,text,text,bigint,text,text)') is null then
    raise exception 'FAIL apply_verified_payment is missing';
  end if;
  select count(*) into exposed
    from information_schema.routine_privileges
   where routine_schema = 'public'
     and routine_name = 'apply_verified_payment'
     and grantee in ('PUBLIC', 'anon', 'authenticated')
     and privilege_type = 'EXECUTE';
  if exposed <> 0 then
    raise exception 'FAIL client role can execute apply_verified_payment';
  end if;
end $$;

do $$
declare
  result text;
  uid uuid := '00000000-0000-0000-0000-000000000000';
begin
  result := public.apply_verified_payment(uid, 'paystack', 'evt', 'bad-plan', 'weekly', 150000, 'NGN', 'manual');
  if result <> 'rejected_plan' then raise exception 'FAIL rejected_plan got %', result; end if;
  result := public.apply_verified_payment(uid, 'paystack', 'evt', 'bad-amount', 'monthly', 1, 'NGN', 'manual');
  if result <> 'rejected_amount' then raise exception 'FAIL rejected_amount got %', result; end if;
  result := public.apply_verified_payment(uid, 'paystack', 'evt', 'bad-currency', 'monthly', 150000, 'USD', 'manual');
  if result <> 'rejected_currency' then raise exception 'FAIL rejected_currency got %', result; end if;
  result := public.apply_verified_payment(uid, 'paystack', 'evt', '', 'monthly', 150000, 'NGN', 'manual');
  if result <> 'missing_reference' then raise exception 'FAIL missing_reference got %', result; end if;
end $$;

-- Missing user raises and must not leave a claim.
do $$
declare
  ref text := 'missing-' || gen_random_uuid();
begin
  begin
    perform public.apply_verified_payment(
      '00000000-0000-0000-0000-000000000000', 'paystack', 'evt-missing', ref,
      'monthly', 150000, 'NGN', 'manual'
    );
    raise exception 'FAIL expected missing_subscription';
  exception
    when others then
      if SQLERRM not like '%missing_subscription%' then
        raise;
      end if;
  end;
  if exists (select 1 from public.payment_events where provider_reference = ref) then
    raise exception 'FAIL missing subscription left a payment claim';
  end if;
end $$;

-- Fixture users. Requires auth.users to be insertable, as on the local stub
-- or a disposable Supabase SQL editor session.
do $$
declare
  existing_id uuid := gen_random_uuid();
  new_id uuid := gen_random_uuid();
  kept_start timestamptz := timestamptz '2020-01-01';
  kept_end timestamptz := timestamptz '2020-04-01';
  new_end timestamptz;
  result text;
  ref1 text := 'pay-' || gen_random_uuid();
  ref2 text := 'retry-' || gen_random_uuid();
  other_id uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (existing_id, 'existing@example.test', '{}'::jsonb);
  update public.usage
     set trial_starts_at = kept_start,
         trial_ends_at = kept_end
   where user_id = existing_id;
  if (select trial_ends_at from public.usage where user_id = existing_id) <> kept_end then
    raise exception 'FAIL could not set existing trial date';
  end if;

  insert into auth.users (id, email, raw_user_meta_data)
  values (new_id, 'new@example.test', '{}'::jsonb);
  select trial_ends_at into new_end from public.usage where user_id = new_id;
  if new_end is null or new_end < now() + interval '13 days' or new_end > now() + interval '15 days' then
    raise exception 'FAIL new account trial was not 14 days';
  end if;
  if (select trial_ends_at from public.usage where user_id = existing_id) <> kept_end then
    raise exception 'FAIL existing trial date changed';
  end if;

  result := public.apply_verified_payment(existing_id, 'paystack', 'evt-1', ref1, 'monthly', 150000, 'NGN', 'manual');
  if result <> 'processed' then raise exception 'FAIL first payment got %', result; end if;
  result := public.apply_verified_payment(existing_id, 'paystack', 'evt-1b', ref1, 'monthly', 150000, 'NGN', 'manual');
  if result <> 'already_processed' then raise exception 'FAIL duplicate reference got %', result; end if;
  result := public.apply_verified_payment(new_id, 'paystack', 'evt-1', ref2, 'monthly', 150000, 'NGN', 'manual');
  if result <> 'duplicate_event_id' then raise exception 'FAIL duplicate event id got %', result; end if;

  insert into public.receipts (id, user_id, receipt_number, payload)
  values (gen_random_uuid(), existing_id, 'RCT-1', jsonb_build_object('shareToken', 'sharetoken1'));
  if public.has_entitlement(existing_id) is not true then
    raise exception 'FAIL paid user lacks entitlement';
  end if;
  if public.get_shared_receipt('sharetoken1') is null then
    raise exception 'FAIL eligible owner share was hidden';
  end if;

  update public.subscriptions set status = 'expired', expires_at = now() - interval '1 day' where user_id = existing_id;
  update public.usage set trial_ends_at = now() - interval '1 day' where user_id = existing_id;
  if public.has_entitlement(existing_id) then
    raise exception 'FAIL expired owner still entitled';
  end if;
  if public.get_shared_receipt('sharetoken1') is not null then
    raise exception 'FAIL expired owner share still visible';
  end if;

  other_id := new_id;
  if public.has_entitlement(other_id) is not true then
    raise exception 'FAIL another eligible account was affected';
  end if;
end $$;
