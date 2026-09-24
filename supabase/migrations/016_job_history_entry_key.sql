-- 016 — Stable server identity for history entries
--
-- job_history rows had no identity the app could address: every job write DELETED the
-- job's whole timeline and re-inserted the local copy. That (a) left a window where a
-- concurrent poll on another device saw an empty timeline, (b) silently dropped any
-- entry a peer device had written since this device's last poll, and (c) let
-- duplicates accumulate server-side whenever two devices normalised an entry slightly
-- differently — the root of the ~15 client-side dedup passes in useJobs.js.
--
-- `entry_key` is the app's canonical historyEntryKey (gmail:<id>, else
-- <date>||<status>||<normalised note>, ≤ ~150 chars) — the same key the
-- deleted_history_entries tombstones (013) already use. With UNIQUE(job_id, entry_key)
-- syncManager.writeJobHistory can UPSERT instead of replace-all.
--
-- No backfill: the key's note normalisation lives in JS and cannot be reproduced
-- exactly in SQL. Legacy rows keep entry_key NULL (NULLs never collide in a UNIQUE
-- constraint) and are replaced by keyed rows the next time each job is written.
--
-- Additive + idempotent: safe to run on the live DB before OR after the app deploy.
-- Until it runs, the app detects the missing column/constraint and falls back to the
-- old replace-all write for the session.

alter table public.job_history add column if not exists entry_key text;

-- The unnumbered add_email_fields_and_constraints.sql tried to add a (job_id, date, note)
-- unique constraint with invalid syntax (`ADD CONSTRAINT … ON CONFLICT DO NOTHING`), so it
-- most likely never applied; drop it if it somehow did — it would reject legitimate
-- same-day, same-note entries with different gmail ids.
alter table public.job_history drop constraint if exists job_history_natural_key;

alter table public.job_history drop constraint if exists job_history_job_entry_key;
alter table public.job_history add constraint job_history_job_entry_key unique (job_id, entry_key);
