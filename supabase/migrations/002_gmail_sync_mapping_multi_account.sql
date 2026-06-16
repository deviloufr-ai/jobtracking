-- Gmail → sync UUID mapping, corrected for multi-account support.
--
-- The sync identity (user_id across jobs/job_history/cvs/etc.) is resolved from a
-- Gmail email via this table. A user can connect SEVERAL Gmail accounts that all
-- feed ONE JobTrackr identity, so the relationship must be:
--   • one row per email           (gmail_email is unique / primary key)
--   • MANY emails may share a UUID (sync_uuid must NOT be unique)
--
-- The table was originally created ad-hoc with a UNIQUE(sync_uuid) constraint,
-- which forced a strict 1-email ↔ 1-UUID mapping. That split a single user's data
-- across multiple sync UUIDs whenever a second Gmail account was connected, and it
-- also made the app's reconcileSyncMapping() (which points every connected email at
-- one canonical UUID) fail with a 23505 unique violation.

-- Create the table if a fresh DB is being built from scratch.
CREATE TABLE IF NOT EXISTS gmail_user_sync_mapping (
  gmail_email varchar(255) PRIMARY KEY,
  sync_uuid   uuid NOT NULL,
  created_at  timestamp DEFAULT now(),
  updated_at  timestamp DEFAULT now()
);

-- Drop the constraint that blocked many-emails-to-one-UUID (existing DBs).
ALTER TABLE gmail_user_sync_mapping
  DROP CONSTRAINT IF EXISTS gmail_user_sync_mapping_sync_uuid_key;

-- Non-unique index keeps "which emails belong to this UUID?" lookups fast.
CREATE INDEX IF NOT EXISTS idx_gmail_sync_mapping_uuid
  ON gmail_user_sync_mapping (sync_uuid);
