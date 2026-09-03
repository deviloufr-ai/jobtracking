-- 013 — Cross-device history-ENTRY deletion sync
--
-- Whole-job deletions already propagate via `deleted_jobs` (001/006). But deleting
-- a single timeline ENTRY was recorded only in the deleting browser's localStorage,
-- so the additive poll merge on another device re-admitted the entry and re-uploaded
-- it — the deleted step reappeared ("deleted on historic not working" cross-device).
--
-- This is the entry-level analogue of `deleted_jobs`: one tombstone per
-- (job_id, entry_key), where entry_key is the app's canonical historyEntryKey. The
-- poll loop fetches these and drops the matching entries while merging history.
--
-- Additive + idempotent: safe to run on the live DB before OR with the app deploy.
-- The app degrades gracefully when this table is absent — the remote fetch returns
-- [] and the deletion simply stays local-only, exactly as before this migration.

create table if not exists public.deleted_history_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- NOT a FK to jobs(id): a tombstone may outlive its job row, and we never want a
  -- cascade to drop tombstones. Correlation is by value only.
  job_id uuid not null,
  entry_key text not null,
  deleted_at timestamp default now(),
  unique (user_id, job_id, entry_key)
);

-- Supports the incremental `deleted_at > watermark` fetch the poll runs each cycle.
create index if not exists idx_deleted_history_entries_user_deleted_at
  on public.deleted_history_entries(user_id, deleted_at);

alter table public.deleted_history_entries enable row level security;

-- RLS: a user can read and insert only their own tombstones (mirrors deleted_jobs).
drop policy if exists deleted_history_entries_sel on public.deleted_history_entries;
create policy deleted_history_entries_sel on public.deleted_history_entries
  for select using (user_id = auth.uid());

drop policy if exists deleted_history_entries_ins on public.deleted_history_entries;
create policy deleted_history_entries_ins on public.deleted_history_entries
  for insert with check (user_id = auth.uid());

-- Verify AFTER running:
--   select polcmd, polname from pg_policy
--     where polrelid = 'public.deleted_history_entries'::regclass order by polcmd;
--   -- expect r/SELECT and a/INSERT present.
--   select indexname from pg_indexes where tablename = 'deleted_history_entries';
