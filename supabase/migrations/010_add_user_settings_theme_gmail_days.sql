-- 010 — Let theme + Gmail-lookback-in-days sync across devices
--
-- user_settings sync writes an explicit column allow-list (fieldConversion.js
-- settingsToSupabaseRow). Two app settings had no matching column and were
-- therefore excluded from sync:
--
--   * theme ('light' | 'dark' | …) — lived only in localStorage/IndexedDB, so
--     dark mode never followed the user to another device.
--   * gmailPeriodDays — the app measures Gmail lookback in DAYS, but the table
--     only had gmail_period_months (a different unit, defaulted and never used
--     by the app on read-back). So the user's real lookback never synced.
--
-- Add the two columns so both round-trip faithfully. Additive + idempotent:
-- safe to run on the live DB. gmail_period_months is left in place (harmless,
-- unused by the app) to avoid a destructive drop.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS theme varchar(20) DEFAULT 'light';

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS gmail_period_days integer DEFAULT 14;

-- Verify AFTER running:
--   select column_name from information_schema.columns
--     where table_name = 'user_settings'
--       and column_name in ('theme', 'gmail_period_days');
--   -- expect two rows: theme, gmail_period_days
