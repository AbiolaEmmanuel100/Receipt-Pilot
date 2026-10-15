-- Migration 009 — atomic verified-payment application.
-- One transaction claims the reference, locks the subscription, extends it,
-- and marks the event processed. Any failure rolls all of that back.
-- Execute is granted only to service_role. Clients cannot call it.
-- REVIEW ONLY. Do not apply to production until explicitly authorized.

create or replace function public.apply_verified_payment(
  p_user_id uuid,
  p_provider text,
  p_provider_event_id text,
  p_provider_reference text,
  p_plan_code text,
  p_amount_minor bigint,
  p_currency text,
  p_renewal_mode text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_existing_status text;
  v_existing_user uuid;
  v_existing_amount bigint;
  v_existing_plan text;
  v_expires timestamptz;
  v_new_end timestamptz;
  v_months int;
  v_naira numeric;
  v_expected bigint;
  v_count int;
begin
  if p_provider is distinct from 'paystack' then
    return 'rejected_provider';
  end if;
  if p_provider_reference is null or length(trim(p_provider_reference)) = 0 then
    return 'missing_reference';
  end if;
  if p_currency is distinct from 'NGN' then
    return 'rejected_currency';
  end if;
  if p_renewal_mode is distinct from 'automatic' then
    p_renewal_mode := 'manual';
  end if;

  if p_plan_code = 'monthly' then
    v_months := 1; v_naira := 1500; v_expected := 150000;
  elsif p_plan_code = 'quarterly' then
    v_months := 3; v_naira := 4275; v_expected := 427500;
  elsif p_plan_code = 'semi_annual' then
    v_months := 6; v_naira := 8100; v_expected := 810000;
  elsif p_plan_code = 'annual' then
    v_months := 12; v_naira := 15300; v_expected := 1530000;
  else
    return 'rejected_plan';
  end if;
  if p_amount_minor is distinct from v_expected then
    return 'rejected_amount';
  end if;

  insert into public.payment_events (
    provider, provider_event_id, provider_reference, event_type,
    extends_access, processing_status, amount_minor, currency, user_id,
    metadata
  ) values (
    p_provider, nullif(p_provider_event_id, ''), p_provider_reference, 'charge.success',
    true, 'pending', p_amount_minor, 'NGN', p_user_id,
    jsonb_build_object('plan_code', p_plan_code, 'renewal_mode', p_renewal_mode)
  )
  on conflict (provider, provider_reference)
    where extends_access and provider_reference is not null
  do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select id, processing_status, user_id, amount_minor, metadata->>'plan_code'
      into v_event_id, v_existing_status, v_existing_user, v_existing_amount, v_existing_plan
      from public.payment_events
     where provider = p_provider
       and provider_reference = p_provider_reference
       and extends_access
     for update;
    if v_event_id is null then
      return 'already_claimed';
    end if;
    if v_existing_status = 'processed' then
      return 'already_processed';
    end if;
    if v_existing_user is distinct from p_user_id
       or v_existing_amount is distinct from p_amount_minor
       or v_existing_plan is distinct from p_plan_code then
      return 'reference_conflict';
    end if;
  end if;

  select expires_at into v_expires
    from public.subscriptions
   where user_id = p_user_id
   for update;
  if not found then
    raise exception 'missing_subscription';
  end if;

  v_new_end := greatest(coalesce(v_expires, now()), now())
    + make_interval(months => v_months);

  update public.subscriptions
     set status = 'active',
         plan_code = p_plan_code,
         renewal_mode = p_renewal_mode,
         amount = v_naira,
         currency = 'NGN',
         provider = p_provider,
         provider_reference = p_provider_reference,
         started_at = coalesce(started_at, now()),
         expires_at = v_new_end,
         updated_at = now()
   where user_id = p_user_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'subscription_update_count_%', v_count;
  end if;

  update public.payment_events
     set processing_status = 'processed',
         processed_at = now(),
         processing_error = null
   where id = v_event_id
     and processing_status in ('pending', 'failed');
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'event_mark_count_%', v_count;
  end if;

  return 'processed';
exception
  when unique_violation then
    return 'duplicate_event_id';
end;
$$;

revoke all on function public.apply_verified_payment(uuid, text, text, text, text, bigint, text, text) from public;
revoke all on function public.apply_verified_payment(uuid, text, text, text, text, bigint, text, text) from anon;
revoke all on function public.apply_verified_payment(uuid, text, text, text, text, bigint, text, text) from authenticated;

do $migration$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.apply_verified_payment(uuid, text, text, text, text, bigint, text, text) to service_role';
  end if;
end
$migration$;

drop policy if exists "receipts_delete_own" on public.receipts;
create policy "receipts_delete_own" on public.receipts
  for delete using (auth.uid() = user_id and public.has_entitlement(auth.uid()));

drop policy if exists "items_delete_own" on public.receipt_items;
create policy "items_delete_own" on public.receipt_items
  for delete using (auth.uid() = user_id and public.has_entitlement(auth.uid()));
