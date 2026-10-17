-- Receipt Pilot — migration 010: entitlement caller check
-- Apply after 008. Do not rewrite 008 if it may already be applied.
-- Does not change trial dates, prices, payment RPC, or receipt policies.
--
-- Ownership note:
--   These functions are SECURITY DEFINER and run as their owner.
--   Revoking EXECUTE from anon, authenticated, and service_role does not
--   remove the owner's ability to execute them. Nested calls from
--   has_entitlement() and get_shared_receipt() work because those wrappers
--   are also owned by the migration role. Direct client calls do not.
--   Confirm ownership on a disposable database before relying on this.

create or replace function public.entitlement_active(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select
    exists (
      select 1 from public.usage u
      where u.user_id = uid
        and u.trial_ends_at > pg_catalog.now()
    )
    or exists (
      select 1 from public.subscriptions s
      where s.user_id = uid
        and s.status = 'active'
        and s.expires_at > pg_catalog.now()
    );
$$;

revoke all on function public.entitlement_active(uuid) from public;
revoke all on function public.entitlement_active(uuid) from anon;
revoke all on function public.entitlement_active(uuid) from authenticated;

do $migration$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function public.entitlement_active(uuid) from service_role';
  end if;
end
$migration$;

create or replace function public.has_entitlement(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select case
    when uid is not null and uid = auth.uid() then public.entitlement_active(uid)
    when COALESCE(auth.role(), '') = 'service_role' then public.entitlement_active(uid)
    else false
  end;
$$;

revoke all on function public.has_entitlement(uuid) from public;
revoke all on function public.has_entitlement(uuid) from anon;
grant execute on function public.has_entitlement(uuid) to authenticated;

do $migration$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.has_entitlement(uuid) to service_role';
  end if;
end
$migration$;

-- Same response shape as migration 008. Only the entitlement predicate
-- and the search_path qualifications change.
create or replace function public.get_shared_receipt(share text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  result jsonb;
begin
  if share is null or pg_catalog.length(pg_catalog.btrim(share)) < 8 then
    return null;
  end if;
  select COALESCE(r.payload, '{}'::jsonb)
    || pg_catalog.jsonb_build_object(
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
    and r.payload->>'shareToken' = pg_catalog.btrim(share)
    and public.entitlement_active(r.user_id)
  limit 1;
  return result;
end;
$$;

revoke all on function public.get_shared_receipt(text) from public;
grant execute on function public.get_shared_receipt(text) to anon, authenticated;
