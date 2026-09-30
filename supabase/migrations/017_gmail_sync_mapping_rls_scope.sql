-- 017 — Scope gmail_user_sync_mapping RLS to the caller's own address
--
-- Migration 004 enabled RLS on gmail_user_sync_mapping but with
--   for all to authenticated using (true) with check (true)
-- i.e. ANY signed-in user could SELECT every row (the full list of every
-- registered user's Gmail address — PII) and UPDATE/DELETE anyone's
-- email → sync_uuid mapping with the public anon key.
--
-- The table is legacy (identity is auth.uid() since the auth/RLS refactor); it is
-- only read by the one-time legacy-data migration (authMigration.js, looks up the
-- auth email) and by gmail.js reconcileSyncMapping (best-effort, errors are
-- caught). Restricting every verb to the row matching the caller's JWT email
-- keeps both working for the primary account and closes the cross-user read.
--
-- Idempotent: safe to re-run.

alter table if exists public.gmail_user_sync_mapping enable row level security;

drop policy if exists gusm_authenticated_all on public.gmail_user_sync_mapping;
drop policy if exists gusm_own_email on public.gmail_user_sync_mapping;

create policy gusm_own_email on public.gmail_user_sync_mapping
  for all to authenticated
  using (lower(gmail_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (lower(gmail_email) = lower(coalesce(auth.jwt() ->> 'email', '')));
