-- OPTIONAL / UNUSED
-- Not required for Receiptly. The website does not depend on these objects.
-- Do NOT run this for a normal install.
-- If an older database already has these tables, leave them; this file does not DROP them.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customers enable row level security;
drop policy if exists "customers_own" on public.customers;
create policy "customers_own" on public.customers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on table public.customers to authenticated;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  sku text not null default '',
  quantity numeric not null default 0,
  unit_price numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;
drop policy if exists "products_own" on public.products;
create policy "products_own" on public.products
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on table public.products to authenticated;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  amount numeric not null default 0,
  category text not null default '',
  expense_date date,
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;
drop policy if exists "expenses_own" on public.expenses;
create policy "expenses_own" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on table public.expenses to authenticated;

create table if not exists public.error_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  source text not null default '',
  message text not null default '',
  created_at timestamptz not null default now()
);
alter table public.error_events enable row level security;
drop policy if exists "errors_insert_own" on public.error_events;
create policy "errors_insert_own" on public.error_events
  for insert with check (auth.uid() is null or user_id is null or auth.uid() = user_id);
grant insert on table public.error_events to authenticated, anon;

create table if not exists public.admin_emails (
  email text primary key
);
alter table public.admin_emails enable row level security;

create or replace function public.platform_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
  result json;
begin
  select exists (
    select 1 from public.admin_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) into allowed;
  if not allowed then
    raise exception 'not authorized';
  end if;
  select json_build_object(
    'users', (select count(*) from auth.users),
    'receipts', (select count(*) from public.receipts where deleted_at is null),
    'receipts_today', (select count(*) from public.receipts where deleted_at is null and created_at::date = current_date),
    'receipts_month', (select count(*) from public.receipts where deleted_at is null and created_at >= date_trunc('month', now()))
  ) into result;
  return result;
end;
$$;
grant execute on function public.platform_stats() to authenticated;
