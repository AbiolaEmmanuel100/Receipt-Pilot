-- Receipt Pilot — migration 012 checks
-- Run only on an isolated database after migrations 001–012.
-- Do not run against production.

begin;

do $$
begin
  if to_regclass('public.customer_payments') is null then raise exception 'FAIL missing customer_payments'; end if;
  if to_regclass('public.refunds') is null then raise exception 'FAIL missing refunds'; end if;
  if to_regclass('public.stock_movements') is null then raise exception 'FAIL missing stock_movements'; end if;
  if to_regclass('public.suppliers') is null then raise exception 'FAIL missing suppliers'; end if;
  if to_regclass('public.stock_purchases') is null then raise exception 'FAIL missing stock_purchases'; end if;
  if not has_function_privilege('authenticated', 'public.apply_receipt_payment(uuid, numeric, text, date, text, text, text)', 'execute') then
    raise exception 'FAIL authenticated cannot execute apply_receipt_payment';
  end if;
  if has_function_privilege('anon', 'public.apply_receipt_payment(uuid, numeric, text, date, text, text, text)', 'execute') then
    raise exception 'FAIL anon can execute apply_receipt_payment';
  end if;
  raise notice 'PASS migration 012 object and privilege checks';
end $$;

rollback;

-- Manual isolated-database checks:
-- 1. As user A, call apply_receipt_payment for an owned unpaid receipt.
-- 2. Repeat the same idempotency key and confirm status duplicate.
-- 3. Attempt an amount greater than outstanding and confirm overpayment.
-- 4. As user B, attempt the same receipt id and confirm receipt_not_found.
-- 5. Record a completed refund and confirm the receipt outstanding is unchanged.
-- 6. Record a stock movement and confirm products.stock_qty changes once.
-- 7. Repeat the stock idempotency key and confirm the quantity does not change again.
