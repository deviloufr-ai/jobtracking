-- The production `cvs` table predates 001_initial_schema (see cvSync.js header)
-- and is missing the columns the CV sync writes. CV upserts therefore fail with
--   PGRST204 "Could not find the 'content_raw' column of 'cvs' in the schema cache"
-- so base CVs never reach Supabase and don't follow the user across devices.
--
-- Add every column referenced by cvSync.js (toRow) and migration.js, idempotently,
-- matching the 001 schema. Existing rows keep their data; new columns default sanely.
ALTER TABLE cvs ADD COLUMN IF NOT EXISTS content_raw text;
ALTER TABLE cvs ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;
ALTER TABLE cvs ADD COLUMN IF NOT EXISTS device_id varchar(255);
ALTER TABLE cvs ADD COLUMN IF NOT EXISTS last_modified_at timestamp DEFAULT now();
ALTER TABLE cvs ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

-- Force PostgREST to refresh its schema cache so the new columns are usable
-- immediately (otherwise the next upsert can still see the stale cache).
NOTIFY pgrst, 'reload schema';
