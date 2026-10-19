-- Receipt Pilot — expenses and inventory cloud storage
-- Migration 011. Do not modify migrations 001–010.
-- Apply to an isolated test database first. Do not run against production
-- until the test database review is approved.
--
-- Ownership is derived from auth.uid(). Browser-supplied user_id values are
-- overwritten on insert and cannot be changed on update.

begin;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expense_date date not null,
  category text not null,
  description text not null,
  amount numeric(12,2) not null,
  payment_method text not null default 'Cash',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_amount_positive check (amount > 0),
  constraint expenses_category_len check (char_length(category) between 1 and 60),
  constraint expenses_description_len check (char_length(description) between 1 and 120),
  constraint expenses_method_len check (char_length(payment_method) between 1 and 40)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  sku text,
  selling_price numeric(12,2) not null,
  unit_cost numeric(12,2),
  stock_qty integer not null default 0,
  low_stock_threshold integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_len check (char_length(name) between 1 and 120),
  constraint products_sku_len check (sku is null or char_length(sku) <= 60),
  constraint products_price_nonneg check (selling_price >= 0),
  constraint products_cost_nonneg check (unit_cost is null or unit_cost >= 0),
  constraint products_stock_nonneg check (stock_qty >= 0),
  constraint products_threshold_nonneg check (low_stock_threshold >= 0)
);

create index if not exists expenses_user_date_idx
  on public.expenses (user_id, expense_date desc, created_at desc);

create index if not exists products_user_active_idx
  on public.products (user_id, archived_at, name);

create unique index if not exists products_user_sku_uidx
  on public.products (user_id, sku)
  where sku is not null and sku <> '';

create or replace function public.bm_set_owner()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.created_at := now();
    new.updated_at := now();
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_set_owner on public.expenses;
create trigger expenses_set_owner
  before insert or update on public.expenses
  for each row execute function public.bm_set_owner();

drop trigger if exists products_set_owner on public.products;
create trigger products_set_owner
  before insert or update on public.products
  for each row execute function public.bm_set_owner();

alter table public.expenses enable row level security;
alter table public.products enable row level security;

drop policy if exists expenses_select_own on public.expenses;
create policy expenses_select_own on public.expenses
  for select using (auth.uid() = user_id);

drop policy if exists expenses_insert_own on public.expenses;
create policy expenses_insert_own on public.expenses
  for insert with check (auth.uid() = user_id);

drop policy if exists expenses_update_own on public.expenses;
create policy expenses_update_own on public.expenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists expenses_delete_own on public.expenses;
create policy expenses_delete_own on public.expenses
  for delete using (auth.uid() = user_id);

drop policy if exists products_select_own on public.products;
create policy products_select_own on public.products
  for select using (auth.uid() = user_id);

drop policy if exists products_insert_own on public.products;
create policy products_insert_own on public.products
  for insert with check (auth.uid() = user_id);

drop policy if exists products_update_own on public.products;
create policy products_update_own on public.products
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists products_delete_own on public.products;
create policy products_delete_own on public.products
  for delete using (auth.uid() = user_id);

revoke all on table public.expenses from public;
revoke all on table public.expenses from anon;
revoke all on table public.products from public;
revoke all on table public.products from anon;

grant select, insert, update, delete on table public.expenses to authenticated;
grant select, insert, update, delete on table public.products to authenticated;

revoke all on function public.bm_set_owner() from public;
revoke all on function public.bm_set_owner() from anon;
grant execute on function public.bm_set_owner() to authenticated;

commit;
