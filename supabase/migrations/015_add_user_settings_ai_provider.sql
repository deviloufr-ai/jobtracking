-- 015 — Sync the chosen AI provider + model across devices
--
-- The app can now route AI calls to Claude (default), Google Gemini, or any
-- OpenAI-compatible endpoint (Groq, OpenRouter…). The user's PROVIDER choice,
-- the per-provider MODEL, and (for OpenAI-compatible) the BASE URL should follow
-- them across devices. The API KEYS themselves are deliberately NOT stored here —
-- they stay per-device in localStorage (see services/apiKey.js).
--
-- user_settings sync writes an explicit column allow-list (fieldConversion.js
-- settingsToSupabaseRow). Adding these fields to that list before the columns
-- exist makes PostgREST reject the WHOLE settings upsert (PGRST204), so this
-- migration must be applied BEFORE deploying the matching code.
--
-- Additive + idempotent: safe to run on the live DB. RLS already covers
-- user_settings (migration 004) — no policy change.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS ai_provider varchar(20) DEFAULT 'anthropic';

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS ai_model_gemini text;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS ai_model_openai text;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS ai_base_url text;

-- Verify AFTER running:
--   select column_name from information_schema.columns
--     where table_name = 'user_settings'
--       and column_name in ('ai_provider', 'ai_model_gemini', 'ai_model_openai', 'ai_base_url');
--   -- expect four rows
