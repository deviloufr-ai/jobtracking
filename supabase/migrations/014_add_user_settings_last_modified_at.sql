-- 014 — Fix user_settings live-schema drift (last_modified_at + sibling columns)
--
-- Same root cause as 009: the live user_settings table was created by an EARLIER
-- revision of 001, before `last_modified_at` (and its version/device_id siblings)
-- were added to the CREATE TABLE statement. Because 001 uses CREATE TABLE IF NOT
-- EXISTS, the live table was never re-altered, so every settings sync fails with:
--
--   PGRST204 "Could not find the 'last_modified_at' column of 'user_settings'
--   in the schema cache"
--
-- settingsToSupabaseRow (fieldConversion.js) stamps last_modified_at on every
-- upsert, and syncManager's conflict resolution reads it for last-write-wins, so
-- without the column the whole settings row never persists (theme, archive/
-- follow-up thresholds, auto-refresh, position-check — all stuck local-only).
--
-- Additive + idempotent: safe to run on the live DB. This also defensively
-- ensures the rest of the explicit settings allow-list exists (same drift risk),
-- so a fixed last_modified_at can't just uncover the next missing column.

-- The reported failure:
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS last_modified_at timestamp DEFAULT now();

-- Sync-contract siblings from 001 (written by the generic sync path elsewhere):
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS device_id varchar(255);

-- The full settingsToSupabaseRow allow-list (defaults mirror 001 / 010):
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS weekly_apps integer DEFAULT 5;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS response_rate integer DEFAULT 30;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS monthly_interviews integer DEFAULT 3;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS archive_sent_days integer DEFAULT 60;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS archive_rejected_days integer DEFAULT 90;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS follow_up_sent_days integer DEFAULT 14;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS follow_up_reviewing_days integer DEFAULT 10;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS follow_up_waiting_days integer DEFAULT 7;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS follow_up_offer_days integer DEFAULT 3;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS auto_refresh_hours integer DEFAULT 6;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS check_position_after_days integer DEFAULT 14;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS check_position_enabled boolean DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS gmail_period_days integer DEFAULT 14;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS theme varchar(20) DEFAULT 'light';

-- Verify AFTER running:
--   select column_name from information_schema.columns
--     where table_name = 'user_settings' and column_name = 'last_modified_at';
--   -- expect one row: last_modified_at
