-- Migration 001 — existing Receiptly databases
-- Adds business footer column used by the generator.
-- Safe to re-run. Does not rewrite existing rows (new column defaults to '').

alter table public.business_information
  add column if not exists footer text not null default '';
