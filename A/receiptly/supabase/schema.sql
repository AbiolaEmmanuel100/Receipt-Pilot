-- Receiptly canonical schema
-- For a BRAND-NEW empty Supabase project, run this file once in the SQL Editor.
-- Existing live projects: do NOT use this as a reset. Run supabase/migrations/ in order instead.
-- Public/anon key in the website only. Never put a service_role / sb_secret key in the site.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_name text not null default '',
  deletion_requested_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table if not exists public.business_information (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  business_name text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  logo text not null default '',
  footer text not null default '',
  prefix text not null default 'RCT-',
  currency text not null default 'NGN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  default_template text not null default 'classic',
  currency text not null default 'NGN',
  updated_at timestamptz not null default now()
);

create table if not exists public.usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_used_at timestamptz,
  account_created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  trial_starts_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '90 days'),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  status text not null default 'trial',
  provider text,
  provider_reference text,
  currency text default 'NGN',
  amount numeric,
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receipts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  receipt_number text not null,
  customer_name text not null default '',
  customer_phone text not null default '',
  customer_email text not null default '',
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  tax numeric not null default 0,
  tax_pct numeric not null default 0,
  total numeric not null default 0,
  amount_paid numeric not null default 0,
  outstanding numeric not null default 0,
  payment_status text not null default 'UNPAID',
  payment_method text not null default 'Cash',
  currency text not null default 'NGN',
  template_id text not null default 'classic',
  receipt_date date,
  receipt_time text not null default '',
  notes text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  quantity numeric not null default 0,
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists receipts_user_updated_idx on public.receipts (user_id, updated_at desc);
create index if not exists receipts_user_date_idx on public.receipts (user_id, receipt_date);
create index if not exists receipts_user_status_idx on public.receipts (user_id, payment_status);
create index if not exists receipt_items_receipt_idx on public.receipt_items (receipt_id);

create unique index if not exists receipts_user_number_uidx
  on public.receipts (user_id, receipt_number);

create table if not exists public.receipt_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  prefix text not null default 'RCT-',
  last_number integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, prefix)
);

-- ---------------------------------------------------------------------------
-- New-account bootstrap (no service-role key in the website)
-- ---------------------------------------------------------------------------

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Keep trial dates authoritative (clients may only bump last_active_at)
create or replace function public.protect_usage_trial()
returns trigger
language plpgsql
as $$
begin
  new.trial_starts_at := old.trial_starts_at;
  new.trial_ends_at := old.trial_ends_at;
  new.account_created_at := old.account_created_at;
  if old.first_used_at is not null then
    new.first_used_at := old.first_used_at;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_usage_trial on public.usage;
create trigger protect_usage_trial
  before update on public.usage
  for each row execute procedure public.protect_usage_trial();

-- Allocate the next unused receipt number for the current user + prefix.
-- Includes deleted receipts so a number is never reused. Serialized per user/prefix.
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

-- Public share lookup. Token is unguessable; does not grant table-wide anon SELECT.
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
  limit 1;
  return result;
end;
$$;

revoke all on function public.get_shared_receipt(text) from public;
grant execute on function public.get_shared_receipt(text) to anon, authenticated;

-- Account UI calls this. Only deletes the signed-in user.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  insert into public.profiles (id)
  values (uid)
  on conflict (id) do nothing;
  update public.profiles
     set deletion_requested_at = now(),
         purge_after = now() + interval '30 days',
         updated_at = now()
   where id = uid;
end;
$$;

create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  update public.profiles
     set deletion_requested_at = null,
         purge_after = null,
         updated_at = now()
   where id = uid;
end;
$$;

revoke all on function public.request_account_deletion() from public;
revoke all on function public.cancel_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;

create or replace function public.list_account_deletion_requests()
returns table (
  email text,
  business_name text,
  deletion_requested_at timestamptz,
  purge_after timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from public.app_admins a where a.user_id = uid) then
    raise exception 'not authorized';
  end if;

  return query
  select
    u.email::text,
    coalesce(nullif(b.business_name, ''), nullif(p.business_name, ''), '')::text,
    p.deletion_requested_at,
    p.purge_after
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.business_information b on b.user_id = p.id
  where p.purge_after is not null
  order by p.deletion_requested_at desc nulls last;
end;
$$;

revoke all on function public.list_account_deletion_requests() from public;
revoke all on function public.list_account_deletion_requests() from anon;
grant execute on function public.list_account_deletion_requests() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.app_admins enable row level security;
alter table public.business_information enable row level security;
alter table public.user_settings enable row level security;
alter table public.usage enable row level security;
alter table public.subscriptions enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;
alter table public.receipt_counters enable row level security;

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- business_information
drop policy if exists "biz_select_own" on public.business_information;
create policy "biz_select_own" on public.business_information
  for select using (auth.uid() = user_id);
drop policy if exists "biz_insert_own" on public.business_information;
create policy "biz_insert_own" on public.business_information
  for insert with check (auth.uid() = user_id);
drop policy if exists "biz_update_own" on public.business_information;
create policy "biz_update_own" on public.business_information
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- user_settings
drop policy if exists "settings_select_own" on public.user_settings;
create policy "settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);
drop policy if exists "settings_insert_own" on public.user_settings;
create policy "settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);
drop policy if exists "settings_update_own" on public.user_settings;
create policy "settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- usage (select + update last_active; trial dates locked by trigger)
drop policy if exists "usage_select_own" on public.usage;
create policy "usage_select_own" on public.usage
  for select using (auth.uid() = user_id);
drop policy if exists "usage_update_own" on public.usage;
create policy "usage_update_own" on public.usage
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- subscriptions: read-only for the user (payments come later via webhook)
drop policy if exists "subs_select_own" on public.subscriptions;
create policy "subs_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- receipts
drop policy if exists "receipts_select_own" on public.receipts;
create policy "receipts_select_own" on public.receipts
  for select using (auth.uid() = user_id);
drop policy if exists "receipts_insert_own" on public.receipts;
create policy "receipts_insert_own" on public.receipts
  for insert with check (auth.uid() = user_id);
drop policy if exists "receipts_update_own" on public.receipts;
create policy "receipts_update_own" on public.receipts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "receipts_delete_own" on public.receipts;
create policy "receipts_delete_own" on public.receipts
  for delete using (auth.uid() = user_id);

-- receipt_items
drop policy if exists "items_select_own" on public.receipt_items;
create policy "items_select_own" on public.receipt_items
  for select using (auth.uid() = user_id);
drop policy if exists "items_insert_own" on public.receipt_items;
create policy "items_insert_own" on public.receipt_items
  for insert with check (auth.uid() = user_id);
drop policy if exists "items_update_own" on public.receipt_items;
create policy "items_update_own" on public.receipt_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "items_delete_own" on public.receipt_items;
create policy "items_delete_own" on public.receipt_items
  for delete using (auth.uid() = user_id);

drop policy if exists "counters_own" on public.receipt_counters;
create policy "counters_own" on public.receipt_counters
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Table privileges (RLS still filters rows).
grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.business_information to authenticated;
grant select, insert, update on table public.user_settings to authenticated;
grant select, update on table public.usage to authenticated;
grant select on table public.subscriptions to authenticated;
grant select, insert, update, delete on table public.receipts to authenticated;
grant select, insert, update, delete on table public.receipt_items to authenticated;
grant select, insert, update on table public.receipt_counters to authenticated;
grant usage, select on all sequences in schema public to authenticated;
