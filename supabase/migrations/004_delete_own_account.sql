-- Migration 004 — existing Receiptly databases
-- Account UI calls delete_own_account().
-- This file only DEFINES the function. It does not delete any account.
-- Safe to re-run.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
