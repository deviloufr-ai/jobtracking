-- 006 — Cross-device job-deletion sync (High #2)
--
-- The `deleted_jobs` tombstone table already exists (001) and migration 004's RLS
-- re-enable already created full CRUD policies for it (deleted_jobs_sel/_ins/_upd/
-- _del under auth.uid()). So the DELETE capability the "clear deleted jobs / re-
-- import" flow needs is ALREADY present — the only genuinely-new thing the
-- cross-device deletion-sync feature requires here is:
--
--   * An index on (user_id, deleted_at) — supports the incremental
--     `deleted_at > watermark` fetch the poll loop runs every cycle.
--
-- This file also drops a redundant DELETE policy an earlier revision of this
-- migration created (functionally identical to deleted_jobs_del, just a duplicate).
--
-- Additive + idempotent: safe to run on the live DB before/with the app deploy.

-- Remove the redundant duplicate DELETE policy (deleted_jobs_del from 004 already
-- grants DELETE under auth.uid()). No-op if it was never created.
drop policy if exists "Users can delete their own deleted jobs" on public.deleted_jobs;

-- Incremental-fetch index (idempotent).
create index if not exists idx_deleted_jobs_user_deleted_at
  on public.deleted_jobs(user_id, deleted_at);

-- Verify AFTER running:
--   select polcmd, polname from pg_policy
--     where polrelid = 'public.deleted_jobs'::regclass order by polcmd;
--   -- expect r/SELECT, a/INSERT, d/DELETE (deleted_jobs_del) present.
--   select indexname from pg_indexes
--     where tablename = 'deleted_jobs' and indexname = 'idx_deleted_jobs_user_deleted_at';
