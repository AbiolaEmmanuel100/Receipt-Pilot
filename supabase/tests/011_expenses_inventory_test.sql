-- Receipt Pilot — migration 011 static and RLS checks
-- Run only against an isolated disposable database after applying
-- schema.sql and migrations 001–011. Do not run against production.
--
-- This script does not create auth users. The object checks can run in the
-- SQL Editor. The cross-user RLS checks require two authenticated sessions
-- and are included as explicit manual steps at the end.

begin;

do $$
declare
  missing text;
begin
  if to_regclass('public.expenses') is null then
    raise exception 'FAIL missing public.expenses';
  end if;
  if to_regclass('public.products') is null then
    raise exception 'FAIL missing public.products';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'expenses' and policyname = 'expenses_select_own'
  ) then
    raise exception 'FAIL missing expenses_select_own';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products' and policyname = 'products_insert_own'
  ) then
    raise exception 'FAIL missing products_insert_own';
  end if;
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'expenses' and c.relrowsecurity
  ) then
    raise exception 'FAIL expenses RLS disabled';
  end if;
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'products' and c.relrowsecurity
  ) then
    raise exception 'FAIL products RLS disabled';
  end if;
  if has_table_privilege('anon', 'public.expenses', 'select') then
    raise exception 'FAIL anon can select expenses';
  end if;
  if has_table_privilege('anon', 'public.products', 'insert') then
    raise exception 'FAIL anon can insert products';
  end if;
  if not has_table_privilege('authenticated', 'public.expenses', 'insert') then
    raise exception 'FAIL authenticated cannot insert expenses';
  end if;
  if not has_table_privilege('authenticated', 'public.products', 'update') then
    raise exception 'FAIL authenticated cannot update products';
  end if;
  raise notice 'PASS migration 011 object and privilege checks';
end $$;

rollback;

-- Manual authenticated tests, run only in an isolated project:
-- 1. Sign in as user A and insert one expense and one product.
-- 2. Sign in as user B and confirm both selects return zero rows.
-- 3. As user B, attempt to update user A's product by id and confirm zero rows change.
-- 4. As user A, attempt to insert amount 0 and confirm the check constraint rejects it.
-- 5. As user A, insert two products with the same SKU and confirm the unique index rejects the second.
-- 6. As user A, archive a product and confirm archived_at is set while the row remains owned by user A.
