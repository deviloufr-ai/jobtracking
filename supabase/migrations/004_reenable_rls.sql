-- 004 — Re-enable Row-Level Security (FINAL STEP of the auth cutover)
--
-- ⚠️ RUN THIS ONLY AFTER:
--   1. The Supabase Google sign-in is live and working in prod, AND
--   2. You've signed in on prod and confirmed your jobs/history/CVs appear
--      (i.e. authMigration has repointed your rows from the legacy sync UUID
--       onto your auth.uid()).
--
-- Until now RLS was OFF, which is why "anyone with the project URL can read/
-- edit/delete" (the Supabase advisor warning). The app now authenticates with
-- Supabase and writes every row under auth.uid(), so we can enforce per-user
-- isolation again. These policies match the originals in 001 and are written
-- idempotently (drop-if-exists + create) so they're safe to run on the live DB.
--
-- Verify BEFORE running (should return rows still owned by the legacy UUID = 0
-- once you've signed in on prod):
--   select user_id, count(*) from jobs group by 1 order by 2 desc;

-- ── Core per-user tables: enable RLS + (re)create auth.uid() policies ──────────
do $$
declare
  t text;
begin
  foreach t in array array['jobs','job_history','cvs','user_settings','position_checks',
                           'user_metadata','deleted_jobs','notifications','notification_log',
                           'gmail_accounts','sync_metadata']
  loop
    execute format('alter table if exists public.%I enable row level security', t);

    -- Drop any prior CRUD policies we manage, then recreate the four standard ones.
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format('drop policy if exists %I on public.%I', t||'_del', t);

    execute format('create policy %I on public.%I for select using (user_id = auth.uid())', t||'_sel', t);
    execute format('create policy %I on public.%I for insert with check (user_id = auth.uid())', t||'_ins', t);
    execute format('create policy %I on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t||'_upd', t);
    execute format('create policy %I on public.%I for delete using (user_id = auth.uid())', t||'_del', t);
  end loop;
end $$;

-- ── gmail_user_sync_mapping ────────────────────────────────────────────────────
-- email → legacy sync UUID. Harmless once RLS above is on (a sync UUID no longer
-- grants data access), but enable RLS to clear the advisor warning and keep anon
-- out. Authenticated users may read/write (the one-time authMigration lookup +
-- gmail.js reconcile both run post-login).
alter table if exists public.gmail_user_sync_mapping enable row level security;
drop policy if exists gusm_authenticated_all on public.gmail_user_sync_mapping;
create policy gusm_authenticated_all on public.gmail_user_sync_mapping
  for all to authenticated using (true) with check (true);

-- ── shared_key_usage ───────────────────────────────────────────────────────────
-- Written only by the server via the service role (which bypasses RLS), so enable
-- RLS with NO policies → no anon/authenticated client can read or tamper with it.
alter table if exists public.shared_key_usage enable row level security;

-- Verify AFTER running: every app table should report rowsecurity = true.
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' order by tablename;
