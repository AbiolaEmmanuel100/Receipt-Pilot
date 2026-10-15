-- Migration 002 — existing Receiptly databases
-- Issue 2 numbering: unique (user_id, receipt_number), RCT- default,
-- receipt_counters, allocate_receipt_number().
-- Safe to re-run. Does not rewrite existing receipt numbers or data.

create unique index if not exists receipts_user_number_uidx
  on public.receipts (user_id, receipt_number);

alter table public.business_information
  alter column prefix set default 'RCT-';

create table if not exists public.receipt_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  prefix text not null default 'RCT-',
  last_number integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, prefix)
);

alter table public.receipt_counters enable row level security;
drop policy if exists "counters_own" on public.receipt_counters;
create policy "counters_own" on public.receipt_counters
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on table public.receipt_counters to authenticated;

create or replace function public.allocate_receipt_number(p_prefix text default 'RCT-')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pref text;
  next_n integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  pref := coalesce(nullif(trim(p_prefix), ''), 'RCT-');

  insert into public.receipt_counters (user_id, prefix, last_number)
  values (uid, pref, 0)
  on conflict (user_id, prefix) do nothing;

  perform 1
    from public.receipt_counters
   where user_id = uid and prefix = pref
   for update;

  select greatest(
           c.last_number,
           coalesce((
             select max(substring(r.receipt_number from char_length(pref) + 1)::int)
             from public.receipts r
             where r.user_id = uid
               and char_length(r.receipt_number) > char_length(pref)
               and left(r.receipt_number, char_length(pref)) = pref
               and substring(r.receipt_number from char_length(pref) + 1) ~ '^[0-9]+$'
           ), 0)
         )
    into next_n
    from public.receipt_counters c
   where c.user_id = uid and c.prefix = pref;

  next_n := coalesce(next_n, 0) + 1;

  update public.receipt_counters
     set last_number = next_n, updated_at = now()
   where user_id = uid and prefix = pref;

  return pref || lpad(next_n::text, 6, '0');
end;
$$;

revoke all on function public.allocate_receipt_number(text) from public;
grant execute on function public.allocate_receipt_number(text) to authenticated;

-- Align new-user bootstrap with the canonical schema (adds receipt_counters row).
-- Does not change existing users or receipt numbers.
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
    new.id, now(), now(), now(), now(), now() + interval '90 days'
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
