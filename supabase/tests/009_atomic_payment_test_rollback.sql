-- Corrected disposable test. Newly generated. Original file is unchanged.
-- For receipt-pilot-test only. Do not run on production.
-- Not executed. Rolls back all fixture changes.
--
-- psql "$DISPOSABLE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/009_atomic_payment_test_rollback.sql

begin;

-- The usage trigger blocks trial-date changes. Disable only this trigger,
-- and only inside this transaction. Rollback restores it.
alter table public.usage disable trigger protect_usage_trial;

do $$
declare
  exposed int;
  result text;
  got_missing boolean := false;
  existing_id uuid := gen_random_uuid();
  new_id uuid := gen_random_uuid();
  missing_id uuid := gen_random_uuid();
  kept_start timestamptz := timestamptz '2020-01-01';
  kept_end timestamptz := timestamptz '2020-04-01';
  new_end timestamptz;
  ref_missing text := 'missing-' || gen_random_uuid();
  ref_monthly text := 'monthly-' || gen_random_uuid();
  ref_dup_event text := 'dup-event-' || gen_random_uuid();
  ref_quarterly text := 'quarterly-' || gen_random_uuid();
  ref_semi text := 'semi-' || gen_random_uuid();
  ref_annual text := 'annual-' || gen_random_uuid();
  share_token text := 'share-' || replace(gen_random_uuid()::text, '-', '');
  email_a text := 'existing-' || gen_random_uuid() || '@example.test';
  email_b text := 'new-' || gen_random_uuid() || '@example.test';
  email_missing text := 'missing-' || gen_random_uuid() || '@example.test';
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

  result := public.apply_verified_payment(existing_id, 'paystack', 'evt', 'bad-plan-' || gen_random_uuid(), 'weekly', 150000, 'NGN', 'manual');
  if result <> 'rejected_plan' then raise exception 'FAIL rejected_plan got %', result; end if;
  result := public.apply_verified_payment(existing_id, 'paystack', 'evt', 'bad-amount-' || gen_random_uuid(), 'monthly', 1, 'NGN', 'manual');
  if result <> 'rejected_amount' then raise exception 'FAIL rejected_amount got %', result; end if;
  result := public.apply_verified_payment(existing_id, 'paystack', 'evt', 'bad-currency-' || gen_random_uuid(), 'monthly', 150000, 'USD', 'manual');
  if result <> 'rejected_currency' then raise exception 'FAIL rejected_currency got %', result; end if;
  result := public.apply_verified_payment(existing_id, 'paystack', 'evt', '', 'monthly', 150000, 'NGN', 'manual');
  if result <> 'missing_reference' then raise exception 'FAIL missing_reference got %', result; end if;

  insert into auth.users (id, email, raw_user_meta_data)
  values (missing_id, email_missing, '{}'::jsonb);
  delete from public.subscriptions where user_id = missing_id;

  begin
    perform public.apply_verified_payment(
      missing_id, 'paystack', 'evt-missing', ref_missing,
      'monthly', 150000, 'NGN', 'manual'
    );
  exception
    when others then
      if SQLERRM = 'missing_subscription' then
        got_missing := true;
      else
        raise;
      end if;
  end;
  if not got_missing then
    raise exception 'FAIL payment function did not raise the missing subscription error';
  end if;
  if exists (select 1 from public.payment_events where provider_reference = ref_missing) then
    raise exception 'FAIL missing subscription left a payment claim';
  end if;

  insert into auth.users (id, email, raw_user_meta_data)
  values (existing_id, email_a, '{}'::jsonb);
  update public.usage
     set trial_starts_at = kept_start, trial_ends_at = kept_end
   where user_id = existing_id;

  insert into auth.users (id, email, raw_user_meta_data)
  values (new_id, email_b, '{}'::jsonb);
  select trial_ends_at into new_end from public.usage where user_id = new_id;
  if new_end is null or new_end < now() + interval '13 days' or new_end > now() + interval '15 days' then
    raise exception 'FAIL new account trial was not 14 days';
  end if;
  if (select trial_ends_at from public.usage where user_id = existing_id) <> kept_end then
    raise exception 'FAIL existing trial date changed';
  end if;

  result := public.apply_verified_payment(existing_id, 'paystack', 'evt-monthly', ref_monthly, 'monthly', 150000, 'NGN', 'manual');
  if result <> 'processed' then raise exception 'FAIL monthly got %', result; end if;
  result := public.apply_verified_payment(existing_id, 'paystack', 'evt-monthly-retry', ref_monthly, 'monthly', 150000, 'NGN', 'manual');
  if result <> 'already_processed' then raise exception 'FAIL duplicate reference got %', result; end if;

  -- Same event id, different user and reference. The event-id unique index must reject it.
  result := public.apply_verified_payment(new_id, 'paystack', 'evt-monthly', ref_dup_event, 'quarterly', 427500, 'NGN', 'manual');
  if result <> 'duplicate_event_id' then raise exception 'FAIL duplicate event id got %', result; end if;

  result := public.apply_verified_payment(new_id, 'paystack', 'evt-quarterly', ref_quarterly, 'quarterly', 427500, 'NGN', 'manual');
  if result <> 'processed' then raise exception 'FAIL quarterly got %', result; end if;
  result := public.apply_verified_payment(new_id, 'paystack', 'evt-semi', ref_semi, 'semi_annual', 810000, 'NGN', 'manual');
  if result <> 'processed' then raise exception 'FAIL semi_annual got %', result; end if;
  result := public.apply_verified_payment(new_id, 'paystack', 'evt-annual', ref_annual, 'annual', 1530000, 'NGN', 'manual');
  if result <> 'processed' then raise exception 'FAIL annual got %', result; end if;

  insert into public.receipts (id, user_id, receipt_number, payload)
  values (gen_random_uuid(), existing_id, 'RCT-TEST', jsonb_build_object('shareToken', share_token));
  if public.has_entitlement(existing_id) is not true then
    raise exception 'FAIL paid user lacks entitlement';
  end if;
  if public.get_shared_receipt(share_token) is null then
    raise exception 'FAIL eligible owner share was hidden';
  end if;

  update public.subscriptions
     set status = 'expired', expires_at = now() - interval '1 day'
   where user_id = existing_id;
  update public.usage
     set trial_ends_at = now() - interval '1 day'
   where user_id = existing_id;
  if public.has_entitlement(existing_id) then
    raise exception 'FAIL expired owner still entitled';
  end if;
  if public.get_shared_receipt(share_token) is not null then
    raise exception 'FAIL expired owner share still visible';
  end if;
  if public.has_entitlement(new_id) is not true then
    raise exception 'FAIL another eligible account was affected';
  end if;
end $$;

rollback;
