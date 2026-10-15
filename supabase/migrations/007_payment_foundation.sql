-- Migration 007 — payment/subscription foundation
-- Extends public.subscriptions. Does not create a second subscriptions table.
-- Does not change usage, trial dates, receipt rows, share RPCs, or existing RLS.
-- REVIEW ONLY. Do not apply to production until explicitly authorized.
--
-- Re-run / recovery:
--   Safe only when these objects are absent or already match this definition.
--   Not safe if a pre-existing payment_events table, index, or constraint has
--   the same name and a different definition. IF NOT EXISTS will skip it.
--   Migrations 001-006 do not wrap the file in BEGIN/COMMIT. If a statement
--   fails partway, fix the incompatible object, then re-run this file.
--   This file does not drop or rewrite existing objects.
--
-- Amount units:
--   public.subscriptions.amount stays numeric major units (e.g. 1500 for NGN).
--   public.payment_events.amount_minor is provider minor units.
--   Paystack NGN amounts are kobo: 1500 NGN = 150000 kobo.
-- Server code must convert. Never trust a browser-supplied amount.
--
-- Idempotency (database):
--   A. Every supplied provider event id is unique per provider.
--   B. A successful access-extending payment is unique per
--      (provider, provider_reference), whether or not an event id was sent.
--   C. Other event types remain unique per
--      (provider, event_type, provider_reference) when no event id is present.
--   D. A row with neither event id nor reference cannot be deduped here.
--      The server must reject it and must not extend access.
--   E. extends_access may be true only with a provider_reference. The database
--      cannot prove that Paystack was called. Only the trusted backend, using
--      service_role, may set extends_access = true, and only after Paystack
--      API verification has already succeeded outside the database transaction.
--
-- Trusted handler contract (not executed by this migration):
--   1. Verify the Paystack webhook signature.
--   2. Verify the reference with the Paystack API outside this database.
--   3. Confirm server-set metadata matches this user, plan, NGN, and kobo amount.
--   4. BEGIN.
--   5. INSERT the extending event as pending.
--      ON CONFLICT (provider, provider_reference)
--        WHERE extends_access AND provider_reference IS NOT NULL
--      DO NOTHING. If no id is returned, stop. Do not change expires_at.
--      A duplicate provider_event_id fails on payment_events_provider_event_unique.
--   6. SELECT the one subscriptions row FOR UPDATE before calculating expiry.
--   7. new_end = GREATEST(COALESCE(expires_at, now()), now()) + plan interval.
--   8. UPDATE that row. Require exactly one row.
--   9. Only then mark the payment_events row processed.
--  10. Any failure ROLLBACK, releasing the claim and the row lock.
--
-- Preflight if public.payment_events already exists. Stop on any mismatch.
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'payment_events';
--   select conname from pg_constraint
--    where conrelid = 'public.payment_events'::regclass;
--   select indexname, indexdef from pg_indexes
--    where schemaname = 'public' and tablename = 'payment_events';
--   select id, provider, provider_event_id, provider_reference, extends_access
--     from public.payment_events
--    where extends_access and provider_reference is null;

alter table public.subscriptions
  add column if not exists plan_code text,
  add column if not exists renewal_mode text not null default 'manual';

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.subscriptions'::regclass
      and conname = 'subscriptions_plan_code_check'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_plan_code_check
      check (plan_code is null or plan_code in (
        'monthly', 'quarterly', 'semi_annual', 'annual'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.subscriptions'::regclass
      and conname = 'subscriptions_renewal_mode_check'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_renewal_mode_check
      check (renewal_mode in ('manual', 'automatic'));
  end if;
end
$migration$;

-- Append-mostly provider event ledger. No secrets or card data.
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  provider text not null,
  provider_event_id text,
  provider_reference text,
  event_type text not null,
  processing_status text not null default 'pending',
  extends_access boolean not null default false,
  amount_minor bigint,
  currency text not null default 'NGN',
  metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now(),
  constraint payment_events_provider_nonempty check (length(trim(provider)) > 0),
  constraint payment_events_event_type_nonempty check (length(trim(event_type)) > 0),
  constraint payment_events_status_check check (
    processing_status in ('pending', 'processed', 'failed', 'ignored')
  ),
  constraint payment_events_amount_nonnegative check (
    amount_minor is null or amount_minor >= 0
  ),
  constraint payment_events_currency_check check (currency = upper(currency)),
  constraint payment_events_extends_needs_reference check (
    not extends_access or provider_reference is not null
  )
);

alter table public.payment_events
  add column if not exists extends_access boolean not null default false;

do $migration$
begin
  if to_regclass('public.payment_events') is not null
     and exists (
       select 1
         from public.payment_events
        where extends_access
          and provider_reference is null
     ) then
    raise exception
      'preflight failed: payment_events has extends_access rows without provider_reference';
  end if;
end
$migration$;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_events'::regclass
      and conname = 'payment_events_extends_needs_reference'
  ) then
    alter table public.payment_events
      add constraint payment_events_extends_needs_reference
      check (not extends_access or provider_reference is not null);
  end if;
end
$migration$;

create unique index if not exists payment_events_provider_event_unique
  on public.payment_events (provider, provider_event_id)
  where provider_event_id is not null;

create unique index if not exists payment_events_success_reference_unique
  on public.payment_events (provider, provider_reference)
  where extends_access
    and provider_reference is not null;

create unique index if not exists payment_events_reference_event_unique
  on public.payment_events (provider, event_type, provider_reference)
  where provider_event_id is null
    and provider_reference is not null
    and not extends_access;

create index if not exists payment_events_user_created_idx
  on public.payment_events (user_id, created_at desc);

create index if not exists payment_events_provider_reference_idx
  on public.payment_events (provider, provider_reference)
  where provider_reference is not null;

alter table public.payment_events enable row level security;

revoke all on table public.payment_events from public;
revoke all on table public.payment_events from anon;
revoke all on table public.payment_events from authenticated;

-- schema.sql grants authenticated SELECT on subscriptions only.
-- grants.sql is legacy and must not be run.
-- GRANT is dynamic because a static GRANT is not valid in this DO block.
do $migration$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update on table public.payment_events to service_role';
    execute 'grant select, update on table public.subscriptions to service_role';
  end if;
end
$migration$;
