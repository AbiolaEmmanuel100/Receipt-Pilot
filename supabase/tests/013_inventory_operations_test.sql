-- Receipt Pilot — migration 013 checks
-- Isolated database only. Do not run against production.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'receipt_items' and column_name = 'product_id'
  ) then
    raise exception 'FAIL missing receipt_items.product_id';
  end if;
  if not has_function_privilege('authenticated', 'public.apply_sale_stock(uuid, text)', 'execute') then
    raise exception 'FAIL authenticated cannot execute apply_sale_stock';
  end if;
  if has_function_privilege('anon', 'public.record_stock_purchase(uuid, uuid, integer, numeric, date, text, text)', 'execute') then
    raise exception 'FAIL anon can execute record_stock_purchase';
  end if;
  raise notice 'PASS migration 013 object and privilege checks';
end $$;

rollback;
