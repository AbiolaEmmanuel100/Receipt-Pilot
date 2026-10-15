-- Migration 003 — existing Receiptly databases
-- Public share lookup used by r.html.
-- Same security model as before: token match only, no table-wide anon SELECT.
-- Safe to re-run. Does not change receipts.

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
