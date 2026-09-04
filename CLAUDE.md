# SmartJobTracker — Claude Code Context

> Verified against commit `347c45c` (2026-09-04). When you change the architecture,
> update this file in the same commit. Every AI session on this project reads this
> first — a stale line here becomes wrong code.

## Project

- **Production**: https://smartjobtracker.com
- **GitHub**: https://github.com/deviloufr-ai/jobtracking (private)
- **Notion**: `373cc77e6ec181219e83f3eb51390690` — full technical docs under "Documentation technique"
- **Owner**: Alexandre Leblanc — Senior PM, FR/EN/JP
- **Origin**: built as a technical test for Publidata (Rémi Wetteren), since grown well past it

There is **no version source of truth**: `package.json` is `0.0.0`, there are no git tags,
and `android/app/build.gradle` `versionName 0.5.0` tracks the APK only. Version numbers in
prose ("v0.7", "v1.0") are documentation artifacts. Do not trust them.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19 + Vite 8 + Tailwind 3 — 64 components, 45 services, 25 hooks |
| Auth & data | Supabase (Postgres + Auth + RLS) — 15 tables, 14 migration files |
| Local cache | IndexedDB — offline-first, this is the read path |
| Serverless | Vercel Functions in `/api/` — 12 endpoints |
| AI | Claude Haiku 4.5 via the `/api/claude` proxy, model pinned by `VITE_CLAUDE_MODEL` |
| Local ML | `@xenova/transformers` — in-browser inference |
| Mobile | Capacitor 8 → Android, `com.smartjobtracker.app` |
| Extension | Firefox MV3 in `jobtrackr-extension/` (folder name is legacy, left deliberately) |
| Analytics | Vercel Analytics, mounted in `Root.jsx` |
| Tests | Vitest + jsdom — 8 test files |

## Architecture

```
Web / Android shell / Firefox extension
        |
   React + hooks
        |
   IndexedDB  <-- read path, never blocks on network
        |
   syncManager (optimistic writes, queued when offline)
        |
   Supabase Postgres (RLS)  <-- pollManager pulls every 5 minutes
        |
   Vercel /api/*  -->  Claude Haiku, job boards, PDF tooling
```

The **Android app is a Capacitor shell pointed at the live site** (`capacitor.config.json`
→ `server.url`). A web deploy changes the Android app with no store release.

### Sync engine — the part most likely to break

- Reads come from IndexedDB (`indexeddb.js`); the UI never waits on the network.
- Writes are optimistic and queue in IndexedDB, flushed with exponential backoff (`syncManager.js`).
- Server changes arrive by polling — `POLL_INTERVAL = 300000` (**5 minutes**, not 30 seconds).
- Conflicts are last-write-wins on `last_modified_at`, with `version` and `device_id` on each row.
- **Deletes are tombstones** (`tombstoneService.js`, tables `deleted_jobs` and
  `deleted_history_entries`). Never delete a row outright — without a tombstone, a delete on
  one device is indistinguishable from a row another device has not yet received, and the row
  resurrects.
- `syncCoordinator.js` sequences all of the above; `syncDiagnostic.js` is the debugging entry point.

### Gmail ingestion

```
Google OAuth (multi-account, silent refresh via GOOGLE_CLIENT_SECRET)
  -> gmail.js           parallel query batches, sent mail + full bodies
  -> claude.js          batch parsing, JSON extraction
  -> enrichTimeline.js  Calendar events, meeting links
  -> job_history        one entry per detected event
```

Recurring failure mode: token freshness across multiple accounts (see commits `9c0f8f8`, `347c45c`).
Anything that was per-device is now per-account — check that assumption when touching this path.

### AI cost gate

All Claude traffic goes through `/api/claude`, for CORS **and** for the trial gate: a caller
without their own key is metered per IP in `shared_key_usage` (migration 003). Past
`SHARED_KEY_TRIAL_LIMIT` calls in `SHARED_KEY_WINDOW_DAYS`, the endpoint returns
`402 {code:'TRIAL_EXHAUSTED'}` and the app prompts for a personal key.

## Environment variables

Server-side (Vercel only, never in the client bundle):
`ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
`SHARED_KEY_TRIAL_LIMIT`, `SHARED_KEY_WINDOW_DAYS`, `ALLOWED_ORIGINS`

Client-side (compiled into the bundle — public by definition):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_CLIENT_ID`,
`VITE_CLAUDE_MODEL`, `VITE_ADZUNA_APP_ID`, `VITE_ADZUNA_APP_KEY`

Anything prefixed `VITE_` is public. Never move a secret behind that prefix.

## Job statuses

`todo` | `sent` | `reviewing` | `interview` | `waiting` | `offer` | `rejected` | `rejected_ats` | `cancelled` | `archived`

## Business rules

- `sent` / `reviewing` / `waiting` with no response after **60 days** → auto-archived
- `rejected` / `rejected_ats` / `cancelled` after **90 days** → auto-archived
- Notes containing ` | ` are split into separate history entries (`splitPipeNotes`)
- ATS rejections auto-detected: ashbyhq, greenhouse, lever, workable, teamtailor
- **`mergeSameDateEntries` is NOT applied.** The function exists but is deliberately skipped
  (`useJobs.js:2042`) because it concatenated history entries. Do not re-enable it without
  fixing that first.

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # run before every push
npm run lint
npm test             # Vitest, single run
npm run test:watch
npx cap sync android # after a build, to update the Android shell
```

PowerShell: `&&` does not chain commands — use `;` or run them separately.
Deploy is automatic on push to `main`.

## Conventions

- New migrations go in `supabase/migrations/` and **must be numbered**. One file
  (`add_email_fields_and_constraints.sql`) is unnumbered and breaks ordering — do not add more.
- RLS is the only thing separating one user's data from another's. Migration 004 exists because
  it was once off. Verify RLS after any schema change.
- Gmail scope stays read-only.
- Generated emails are drafted, never auto-sent.

## Known issues

- Gmail import: email dates sometimes grouped on one date. Fix was attempted in the `claude.js`
  prompt; commit `d38969a` (data-loss/parsing/security pass) may have closed it — **unverified**.
- Old Gmail accounts connected before `GOOGLE_CLIENT_SECRET` was configured have no refresh
  token and fall back to interactive re-auth.
- `ALLOWED_ORIGINS` still permits `jobtracking-three.vercel.app` — legacy, safe to drop.
- Local Cursor files often out of sync with AI container copies. Verify before overwriting.

## Repository hygiene

Twelve loose `.md` files at the repo root (`SYNC_FIXES`, `AUTOMATION_SYNC_FIX`,
`CHECKLIST_COMPLETION`, `IMPLEMENTATION_SUMMARY`, `DEPLOYMENT_CHECKLIST`, …) are working
notes, not documentation. `V1_RELEASE_NOTES.md` in particular still claims 30-second polling.
Treat this file and the Notion documentation as authoritative; treat those as history.
