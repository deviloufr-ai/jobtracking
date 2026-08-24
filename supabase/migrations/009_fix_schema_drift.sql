-- 009 — Fix live-schema drift (deleted_jobs unique constraint + cvs.name column)
--
-- Two tables in the live DB were created by an earlier revision of 001, BEFORE
-- these bits were added to the CREATE TABLE statements. Because 001 uses
-- CREATE TABLE IF NOT EXISTS, the live tables were never re-altered, so:
--
--   * deleted_jobs is missing UNIQUE(user_id, job_id) → tombstoneService's
--     upsert(onConflict: 'user_id,job_id') fails on every call with
--     "there is no unique or exclusion constraint matching the ON CONFLICT
--     specification", so cross-device deletion tombstones are never written.
--   * cvs is missing the `name` column → cvSync's bulk upload fails with
--     "Could not find the 'name' column of 'cvs' in the schema cache".
--
-- Additive + idempotent: safe to run on the live DB.

-- ── deleted_jobs: add the missing composite unique constraint ───────────────
-- Collapse any duplicate (user_id, job_id) rows first (the broken upsert may
-- have inserted dupes), keeping the earliest — otherwise ADD CONSTRAINT fails.
DELETE FROM public.deleted_jobs a
USING public.deleted_jobs b
WHERE a.ctid > b.ctid
  AND a.user_id = b.user_id
  AND a.job_id  = b.job_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deleted_jobs_user_id_job_id_key'
      AND conrelid = 'public.deleted_jobs'::regclass
  ) THEN
    ALTER TABLE public.deleted_jobs
      ADD CONSTRAINT deleted_jobs_user_id_job_id_key UNIQUE (user_id, job_id);
  END IF;
END $$;

-- ── cvs: add the missing name column ───────────────────────────────────────
-- Nullable on purpose: the app always writes `name || 'CV'`, so new rows are
-- populated; keeping it nullable avoids a NOT-NULL failure on pre-existing rows.
ALTER TABLE public.cvs ADD COLUMN IF NOT EXISTS name varchar(255);

-- Verify AFTER running:
--   select conname from pg_constraint
--     where conrelid = 'public.deleted_jobs'::regclass and contype = 'u';
--   -- expect deleted_jobs_user_id_job_id_key
--   select column_name from information_schema.columns
--     where table_name = 'cvs' and column_name = 'name';
--   -- expect one row: name
