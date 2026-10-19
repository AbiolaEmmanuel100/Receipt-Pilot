-- Receipt Pilot — accounting foundation
-- Migration 012. Additive only. Do not modify migrations 001–011.
-- Does not backfill historic payments, refunds, customers, or stock.
-- Apply to an isolated test database first.

begin;

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  amount numeric(12,2) not null,
  payment_method text not null default 'Cash',
  paid_on date not null default current_date,
  reference text not null default '',
  notes text not null default '',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint customer_payments_amount_positive check (amount > 0),
  constraint customer_payments_key_len check (char_length(idempotency_key) between 8 and 80)
);

create unique index if not exists customer_payments_user_key_uidx
  on public.customer_payments (user_id, idempotency_key);
create index if not exists customer_payments_receipt_idx
  on public.customer_payments (user_id, receipt_id, paid_on desc);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  receipt_id uuid references public.receipts (id) on delete set null,
  payment_id uuid references public.customer_payments (id) on delete set null,
  amount numeric(12,2) not null,
  status text not null default 'completed',
  reason text not null default '',
  refunded_on date not null default current_date,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint refunds_amount_positive check (amount > 0),
  constraint refunds_status_check check (status in ('pending', 'completed', 'failed', 'cancelled')),
  constraint refunds_key_len check (char_length(idempotency_key) between 8 and 80)
);

create unique index if not exists refunds_user_key_uidx
  on public.refunds (user_id, idempotency_key);
create index if not exists refunds_user_date_idx
  on public.refunds (user_id, refunded_on desc);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  movement_type text not null,
  quantity integer not null,
  unit_cost numeric(12,2),
  note text not null default '',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint stock_movements_type_check check (movement_type in ('opening', 'purchase', 'adjustment', 'sale')),
  constraint stock_movements_qty_nonzero check (quantity <> 0),
  constraint stock_movements_key_len check (char_length(idempotency_key) between 8 and 80)
);

create unique index if not exists stock_movements_user_key_uidx
  on public.stock_movements (user_id, idempotency_key);
create index if not exists stock_movements_product_idx
  on public.stock_movements (user_id, product_id, created_at desc);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_name_len check (char_length(name) between 1 and 120)
);

create table if not exists public.stock_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity integer not null,
  unit_cost numeric(12,2) not null,
  purchased_on date not null default current_date,
  notes text not null default '',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint stock_purchases_qty_positive check (quantity > 0),
  constraint stock_purchases_cost_nonneg check (unit_cost >= 0),
  constraint stock_purchases_key_len check (char_length(idempotency_key) between 8 and 80)
);

create unique index if not exists stock_purchases_user_key_uidx
  on public.stock_purchases (user_id, idempotency_key);

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
    if tg_table_name in ('suppliers') then
      new.created_at := now();
      new.updated_at := now();
    end if;
  elsif tg_table_name in ('suppliers') then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  else
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists customer_payments_set_owner on public.customer_payments;
create trigger customer_payments_set_owner before insert or update on public.customer_payments
  for each row execute function public.bm_set_owner();
drop trigger if exists refunds_set_owner on public.refunds;
create trigger refunds_set_owner before insert or update on public.refunds
  for each row execute function public.bm_set_owner();
drop trigger if exists stock_movements_set_owner on public.stock_movements;
create trigger stock_movements_set_owner before insert or update on public.stock_movements
  for each row execute function public.bm_set_owner();
drop trigger if exists suppliers_set_owner on public.suppliers;
create trigger suppliers_set_owner before insert or update on public.suppliers
  for each row execute function public.bm_set_owner();
drop trigger if exists stock_purchases_set_owner on public.stock_purchases;
create trigger stock_purchases_set_owner before insert or update on public.stock_purchases
  for each row execute function public.bm_set_owner();

alter table public.customer_payments enable row level security;
alter table public.refunds enable row level security;
alter table public.stock_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.stock_purchases enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['customer_payments','refunds','stock_movements','suppliers','stock_purchases']
  loop
    execute format('drop policy if exists %I_select_own on public.%I', t, t);
    execute format('create policy %I_select_own on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists %I_insert_own on public.%I', t, t);
    execute format('create policy %I_insert_own on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists %I_update_own on public.%I', t, t);
    execute format('create policy %I_update_own on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists %I_delete_own on public.%I', t, t);
    execute format('create policy %I_delete_own on public.%I for delete using (auth.uid() = user_id)', t, t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;

create or replace function public.apply_receipt_payment(
  p_receipt_id uuid,
  p_amount numeric,
  p_method text,
  p_paid_on date,
  p_reference text,
  p_notes text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  rec public.receipts%rowtype;
  existing public.customer_payments%rowtype;
  new_paid numeric(12,2);
  new_out numeric(12,2);
  next_status text;
  payment_id uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 8 then raise exception 'invalid_idempotency_key'; end if;

  select * into existing from public.customer_payments
    where user_id = uid and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('status', 'duplicate', 'payment_id', existing.id);
  end if;

  select * into rec from public.receipts
    where id = p_receipt_id and user_id = uid and deleted_at is null
    for update;
  if not found then raise exception 'receipt_not_found'; end if;
  if rec.outstanding <= 0 then raise exception 'nothing_outstanding'; end if;
  if p_amount > rec.outstanding then raise exception 'overpayment'; end if;

  new_paid := rec.amount_paid + p_amount;
  new_out := rec.outstanding - p_amount;
  next_status := case when new_out = 0 then 'PAID' when new_paid > 0 then 'PARTIAL' else rec.payment_status end;

  insert into public.customer_payments (
    user_id, receipt_id, amount, payment_method, paid_on, reference, notes, idempotency_key
  ) values (
    uid, rec.id, p_amount, coalesce(nullif(p_method, ''), 'Cash'), coalesce(p_paid_on, current_date),
    coalesce(p_reference, ''), coalesce(p_notes, ''), p_idempotency_key
  ) returning id into payment_id;

  update public.receipts
    set amount_paid = new_paid,
        outstanding = new_out,
        payment_status = next_status,
        updated_at = now()
    where id = rec.id and user_id = uid;

  return jsonb_build_object('status', 'applied', 'payment_id', payment_id, 'amount_paid', new_paid, 'outstanding', new_out);
end;
$$;

create or replace function public.record_refund(
  p_receipt_id uuid,
  p_amount numeric,
  p_status text,
  p_reason text,
  p_refunded_on date,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing public.refunds%rowtype;
  refund_id uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_status not in ('pending', 'completed', 'failed', 'cancelled') then raise exception 'invalid_status'; end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 8 then raise exception 'invalid_idempotency_key'; end if;
  if p_receipt_id is not null and not exists (
    select 1 from public.receipts where id = p_receipt_id and user_id = uid
  ) then
    raise exception 'receipt_not_found';
  end if;

  select * into existing from public.refunds where user_id = uid and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('status', 'duplicate', 'refund_id', existing.id);
  end if;

  insert into public.refunds (user_id, receipt_id, amount, status, reason, refunded_on, idempotency_key)
  values (uid, p_receipt_id, p_amount, p_status, coalesce(p_reason, ''), coalesce(p_refunded_on, current_date), p_idempotency_key)
  returning id into refund_id;

  return jsonb_build_object('status', 'recorded', 'refund_id', refund_id);
end;
$$;

create or replace function public.record_stock_movement(
  p_product_id uuid,
  p_type text,
  p_quantity integer,
  p_unit_cost numeric,
  p_note text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prod public.products%rowtype;
  existing public.stock_movements%rowtype;
  movement_id uuid;
  next_qty integer;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_type not in ('opening', 'purchase', 'adjustment', 'sale') then raise exception 'invalid_type'; end if;
  if p_quantity is null or p_quantity = 0 then raise exception 'invalid_quantity'; end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 8 then raise exception 'invalid_idempotency_key'; end if;

  select * into existing from public.stock_movements where user_id = uid and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('status', 'duplicate', 'movement_id', existing.id);
  end if;

  select * into prod from public.products where id = p_product_id and user_id = uid for update;
  if not found then raise exception 'product_not_found'; end if;
  next_qty := prod.stock_qty + p_quantity;
  if next_qty < 0 then raise exception 'insufficient_stock'; end if;

  insert into public.stock_movements (user_id, product_id, movement_type, quantity, unit_cost, note, idempotency_key)
  values (uid, prod.id, p_type, p_quantity, p_unit_cost, coalesce(p_note, ''), p_idempotency_key)
  returning id into movement_id;

  update public.products
    set stock_qty = next_qty, updated_at = now()
    where id = prod.id and user_id = uid;

  return jsonb_build_object('status', 'recorded', 'movement_id', movement_id, 'stock_qty', next_qty);
end;
$$;

revoke all on function public.apply_receipt_payment(uuid, numeric, text, date, text, text, text) from public, anon;
revoke all on function public.record_refund(uuid, numeric, text, text, date, text) from public, anon;
revoke all on function public.record_stock_movement(uuid, text, integer, numeric, text, text) from public, anon;
grant execute on function public.apply_receipt_payment(uuid, numeric, text, date, text, text, text) to authenticated;
grant execute on function public.record_refund(uuid, numeric, text, text, date, text) to authenticated;
grant execute on function public.record_stock_movement(uuid, text, integer, numeric, text, text) to authenticated;

commit;
