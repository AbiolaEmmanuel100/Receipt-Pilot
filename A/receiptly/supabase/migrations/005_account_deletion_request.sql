-- Migration 005 — 30-day account deletion REQUEST (no purge)
-- Does not delete auth.users or receipt data.
-- Safe to re-run.

alter table public.profiles
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists purge_after timestamptz;

create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  insert into public.profiles (id)
  values (uid)
  on conflict (id) do nothing;
  update public.profiles
     set deletion_requested_at = now(),
         purge_after = now() + interval '30 days',
         updated_at = now()
   where id = uid;
end;
$$;

create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  update public.profiles
     set deletion_requested_at = null,
         purge_after = null,
         updated_at = now()
   where id = uid;
end;
$$;

revoke all on function public.request_account_deletion() from public;
revoke all on function public.cancel_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;
