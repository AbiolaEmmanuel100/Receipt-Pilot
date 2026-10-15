-- Migration 008 — 14-day trial for new accounts and entitlement enforcement.
-- Does not update existing usage rows. Existing trial dates stay as they are.
-- Does not delete receipts. Expired users lose access until a verified renewal.
-- REVIEW ONLY. Do not apply to production until explicitly authorized.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, business_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'business_name', ''))
  on conflict (id) do nothing;

  insert into public.business_information (user_id, business_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'business_name', ''))
  on conflict (user_id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.usage (
    user_id, first_used_at, account_created_at, last_active_at, trial_starts_at, trial_ends_at
  ) values (
    new.id, now(), now(), now(), now(), now() + interval '14 days'
  )
  on conflict (user_id) do nothing;

  insert into public.subscriptions (user_id, status)
  values (new.id, 'trial')
  on conflict (user_id) do nothing;

  insert into public.receipt_counters (user_id, prefix, last_number)
  values (new.id, 'RCT-', 0)
  on conflict (user_id, prefix) do nothing;

  return new;
end;
$$;

-- New rows that omit trial_ends_at get 14 days. Existing rows are not rewritten.
alter table public.usage
  alter column trial_ends_at set default (now() + interval '14 days');

create or replace function public.has_entitlement(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.usage u
      where u.user_id = uid
        and u.trial_ends_at > now()
    )
    or exists (
      select 1 from public.subscriptions s
      where s.user_id = uid
        and s.status = 'active'
        and s.expires_at > now()
    );
$$;

revoke all on function public.has_entitlement(uuid) from public;
grant execute on function public.has_entitlement(uuid) to authenticated;

drop policy if exists "receipts_select_own" on public.receipts;
create policy "receipts_select_own" on public.receipts
  for select using (auth.uid() = user_id and public.has_entitlement(auth.uid()));

drop policy if exists "receipts_insert_own" on public.receipts;
create policy "receipts_insert_own" on public.receipts
  for insert with check (auth.uid() = user_id and public.has_entitlement(auth.uid()));

drop policy if exists "receipts_update_own" on public.receipts;
create policy "receipts_update_own" on public.receipts
  for update using (auth.uid() = user_id and public.has_entitlement(auth.uid()))
  with check (auth.uid() = user_id and public.has_entitlement(auth.uid()));

drop policy if exists "items_select_own" on public.receipt_items;
create policy "items_select_own" on public.receipt_items
  for select using (auth.uid() = user_id and public.has_entitlement(auth.uid()));

drop policy if exists "items_insert_own" on public.receipt_items;
create policy "items_insert_own" on public.receipt_items
  for insert with check (auth.uid() = user_id and public.has_entitlement(auth.uid()));

drop policy if exists "items_update_own" on public.receipt_items;
create policy "items_update_own" on public.receipt_items
  for update using (auth.uid() = user_id and public.has_entitlement(auth.uid()))
  with check (auth.uid() = user_id and public.has_entitlement(auth.uid()));

create or replace function public.get_shared_receipt(share text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if share is null or length(trim(share)) < 8 then
    return null;
  end if;
  select coalesce(r.payload, '{}'::jsonb)
    || jsonb_build_object(
      'number', r.receipt_number,
      'status', r.payment_status,
      'grand', r.total,
      'paid', r.amount_paid,
      'balance', r.outstanding,
      'currency', r.currency,
      'template', r.template_id,
      'date', r.receipt_date,
      'time', r.receipt_time,
      'notes', r.notes
    )
  into result
  from public.receipts r
  where r.deleted_at is null
    and r.payload->>'shareToken' = trim(share)
    and public.has_entitlement(r.user_id)
  limit 1;
  return result;
end;
$$;

revoke all on function public.get_shared_receipt(text) from public;
grant execute on function public.get_shared_receipt(text) to anon, authenticated;
