-- Migration 006 — admin-only view of pending account deletion requests.
-- Does not change request_account_deletion / cancel_account_deletion / delete_own_account.
-- Safe to re-run.
--
-- After this migration, insert the owner auth user id once (SQL Editor as postgres):
--   insert into public.app_admins (user_id)
--   values ('YOUR-AUTH-USER-UUID');

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.app_admins enable row level security;

drop policy if exists "app_admins_no_client" on public.app_admins;
-- No authenticated/anon policies: clients cannot read or write this table.

revoke all on table public.app_admins from public;
revoke all on table public.app_admins from anon;
revoke all on table public.app_admins from authenticated;

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
