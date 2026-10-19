-- Receipt Pilot — inventory linkage and atomic stock operations
-- Migration 013. Additive only. Do not modify migrations 001–012.
-- Does not backfill historic receipt items, payments, or stock.

begin;

alter table public.products
  add column if not exists unit_of_measure text not null default 'piece';

alter table public.receipt_items
  add column if not exists product_id uuid references public.products (id) on delete set null;

create index if not exists receipt_items_product_idx
  on public.receipt_items (user_id, product_id);

create or replace function public.apply_sale_stock(
  p_receipt_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  item record;
  existing_count integer;
  deducted integer := 0;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_receipt_id is null or p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 8 then
    raise exception 'invalid_request';
  end if;
  if not exists (
    select 1 from public.receipts where id = p_receipt_id and user_id = uid and deleted_at is null
  ) then
    raise exception 'receipt_not_found';
  end if;

  select count(*) into existing_count
  from public.stock_movements
  where user_id = uid and idempotency_key like p_idempotency_key || ':%';
  if existing_count > 0 then
    return jsonb_build_object('status', 'duplicate', 'movements', existing_count);
  end if;

  for item in
    select ri.id, ri.product_id, ri.quantity
    from public.receipt_items ri
    where ri.receipt_id = p_receipt_id and ri.user_id = uid and ri.product_id is not null
    order by ri.sort_order
  loop
    if item.quantity <= 0 then continue; end if;
    perform public.record_stock_movement(
      item.product_id,
      'sale',
      -item.quantity::integer,
      null,
      'Sale ' || p_receipt_id::text,
      p_idempotency_key || ':' || item.id::text
    );
    deducted := deducted + 1;
  end loop;

  return jsonb_build_object('status', 'applied', 'movements', deducted);
end;
$$;

create or replace function public.record_stock_purchase(
  p_supplier_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_purchased_on date,
  p_notes text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing public.stock_purchases%rowtype;
  purchase_id uuid;
  movement jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'invalid_quantity'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'invalid_cost'; end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 8 then raise exception 'invalid_idempotency_key'; end if;
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers where id = p_supplier_id and user_id = uid
  ) then
    raise exception 'supplier_not_found';
  end if;

  select * into existing from public.stock_purchases where user_id = uid and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('status', 'duplicate', 'purchase_id', existing.id);
  end if;

  insert into public.stock_purchases (
    user_id, supplier_id, product_id, quantity, unit_cost, purchased_on, notes, idempotency_key
  ) values (
    uid, p_supplier_id, p_product_id, p_quantity, p_unit_cost, coalesce(p_purchased_on, current_date),
    coalesce(p_notes, ''), p_idempotency_key
  ) returning id into purchase_id;

  movement := public.record_stock_movement(
    p_product_id, 'purchase', p_quantity, p_unit_cost, coalesce(p_notes, 'Stock purchase'), p_idempotency_key
  );

  return jsonb_build_object('status', 'recorded', 'purchase_id', purchase_id, 'movement', movement);
end;
$$;

create or replace function public.record_return(
  p_receipt_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_reason text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  movement jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'invalid_quantity'; end if;
  if not exists (
    select 1 from public.receipts where id = p_receipt_id and user_id = uid
  ) then
    raise exception 'receipt_not_found';
  end if;
  movement := public.record_stock_movement(
    p_product_id, 'adjustment', p_quantity, null, coalesce(p_reason, 'Return'), p_idempotency_key
  );
  return jsonb_build_object('status', 'recorded', 'movement', movement);
end;
$$;

revoke all on function public.apply_sale_stock(uuid, text) from public, anon;
revoke all on function public.record_stock_purchase(uuid, uuid, integer, numeric, date, text, text) from public, anon;
revoke all on function public.record_return(uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.apply_sale_stock(uuid, text) to authenticated;
grant execute on function public.record_stock_purchase(uuid, uuid, integer, numeric, date, text, text) to authenticated;
grant execute on function public.record_return(uuid, uuid, integer, text, text) to authenticated;

commit;
