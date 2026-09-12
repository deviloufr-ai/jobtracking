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
| Frontend | React 19 + Vite 8 + Tailwind 3 — 69 components, 45 services, 25 hooks |
| Auth & data | Supabase (Postgres + Auth + RLS) — 15 tables, 14 migration files |
| Local cache | IndexedDB — offline-first, this is the read path |
| Serverless | Vercel Functions in `/api/` — 12 endpoints (Hobby plan caps functions per deploy; add AI features via the shared `/api/claude` proxy, not new endpoints) |
| AI | Claude Haiku 4.5 (default) via the `/api/claude` proxy, OR a user-chosen Google Gemini / OpenAI-compatible provider (Groq, OpenRouter…). Claude model pinned by `VITE_CLAUDE_MODEL`; provider abstraction in `api/_lib/aiProvider.js` |
| Local ML | `@xenova/transformers` — in-browser inference |
| Mobile | Capacitor 8 → Android, `com.smartjobtracker.app` |
| Extension | Firefox MV3 in `jobtrackr-extension/` (folder name is legacy, left deliberately) |
| Analytics | Vercel Analytics, mounted in `Root.jsx` |
| Tests | Vitest + jsdom — 11 test files |

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

**Android share target** (add a candidature from a shared link, e.g. LinkedIn → Share →
SmartJobTracker): the manifest declares an `ACTION_SEND`/`text/plain` intent-filter and
`MainActivity.java` forwards the shared text to the web layer by polling
`window.__sjtReceiveSharedUrl(text)` (installed by `services/shareIntake.js`) until it's
consumed. On the web, `shareIntake.js` buffers the link and `App.jsx` opens
`LinkedInImport.jsx`, which resolves company/position/location via `/api/fetch-jd` (see
below) and `addJob`s it. The same modal is reachable from the "+" menu by pasting a link.
This is a **native manifest/MainActivity change → needs an APK rebuild** (no new Capacitor
plugin, so `npx cap sync android` is not required, but the web deploy alone won't add the
share target to installed apps).

`/api/fetch-jd` (the generic URL→text scraper used by CV/letter/score) special-cases
**LinkedIn**: a plain fetch of a LinkedIn job returns only the JS shell, so it extracts the
numeric job id from the URL (`/jobs/view/<id>`, slugged variants, or `?currentJobId=`) and
reads LinkedIn's public, auth-free guest fragment
(`/jobs-guest/jobs/api/jobPosting/<id>`) for the title/company/location/description. It
returns `{ text, url, meta:{ company, position, location, source:'linkedin' } }` — the new
`meta` is additive, other callers still read `.text`. Falls back to the page's `og:title`
("`<Company> hiring <Position> in <Location>`") and resolves `lnkd.in` shorteners via the
redirect. Still SSRF-guarded (`assertSafeUrl`/`safeFetch`) and IP-rate-limited.

File downloads (CV / cover-letter PDF, JSON export, interview transcript) go through
`services/fileSave.js`: a normal browser download on web, but on native a
Filesystem-write + Share-sheet, because the WebView has **no download manager** and a
blob/`<a download>`/`jsPDF.save()` silently no-ops there. This needs `@capacitor/filesystem`
and `@capacitor/share` compiled in — adding/removing any Capacitor plugin requires
`npx cap sync android` **and an APK rebuild** (a plain web deploy is not enough for native
plugin changes).

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
- **Rich per-job fields ride `jobs.extras` (jsonb, migration 007), not dedicated columns.** The
  whitelist lives in `syncManager.js` `EXTRA_FIELDS`: generated CV/cover letter (`cvSaved`,
  `letterSaved` + version history `letterVersions`), STAR answers, score, interview sessions,
  compensation (`compensation`), the per-application contacts CRM (`contacts` + touchpoints), and
  the saved negotiation draft (`negotiationSaved`), plus discovered apply-links / position-open
  checks (`positionLinks`, `positionChecks`). Adding a synced per-job field = add it here;
  no migration needed. The poll unbundles `extras` back onto the job (`pollManager.js`).
  **The `extras` write is a UNION, not an overwrite.** `sendMutationToSupabase` reads the row's
  current `extras` and merges this device's fields in (`mergeServerExtras`, this-device-wins per
  key) — because the blob is written whole and `buildExtras` only carries the fields the *writing*
  device holds. Without the union, a device that edits a job before polling a peer's freshly-added
  extra field wiped it from the server (score/CV/letter/interview data silently not syncing across
  devices). `buildExtras` never emits null, so the union only ever adds — it can't clear a field.

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

**Web search** (Claude `web_search_20250305` server tool) is wired into
`/api/generate-motivation-letter` to ground the letter in real company facts, but ONLY for
callers using their OWN key (`req.body.apiKey` present) — it is billed per search and the
trial gate meters requests, not searches, so the shared-key path stays search-free. The
handler loops on `stop_reason:'pause_turn'` to let the server tool finish. (Web search is
Anthropic-only — the multi-provider adapter below doesn't carry it, so it fires only on the
Claude path.)

### AI provider selection

The app speaks Anthropic's Messages shape everywhere. `api/_lib/aiProvider.js` (import-only,
no function-count cost) translates a request to **Gemini** or any **OpenAI-compatible** endpoint
and the response back to `{ content: [{ text }] }`, so no endpoint or component changes its
prompt-building or `.content[0].text` parsing. Every AI endpoint (`/api/claude` + the 5 CV/letter
helpers) resolves credentials via `resolveAiCredentials` and calls `callAiMessages`. **Only Claude
has a shared project key** (the free trial above); Gemini/OpenAI require the user's own key — no
shared fallback, and no per-call cost clamp (they're the user's key). On the client, one wrapper
(`services/apiKey.js` `withUserApiKey`) injects `{ provider, model, baseUrl, apiKey }` into every
request body. **Keys are per-device** (localStorage, per provider — anthropic reuses
`jobtrackr_claude_api_key`); the **provider + model + base URL sync** via `user_settings`
(`aiProvider`/`aiModelGemini`/`aiModelOpenai`/`aiBaseUrl`, migration 015 — add to
`fieldConversion.js` `SETTINGS_TO_SUPABASE` only after the columns exist). PDF import (`parse-pdf`)
needs Claude or Gemini; it 422s on an OpenAI-compatible provider.

## Environment variables

Server-side (Vercel only, never in the client bundle):
`ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_MAPS_API_KEY`,
`FRANCE_TRAVAIL_CLIENT_ID`, `FRANCE_TRAVAIL_SECRET`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SHARED_KEY_TRIAL_LIMIT`, `SHARED_KEY_WINDOW_DAYS`,
`ALLOWED_ORIGINS`, `CV_MODEL`, `LETTER_MODEL`
(`GOOGLE_MAPS_API_KEY` powers `/api/jobs` commute; the France Travail + server-side
Adzuna keys power job search. `CV_MODEL` / `LETTER_MODEL` are OPTIONAL model overrides
for `/api/generate-cv` and `/api/generate-motivation-letter` — both default to
`claude-haiku-4-5-20251001`; set to a Sonnet id for higher-quality (costlier)
generation. See `.env.example` for the full annotated list.)

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
- **`mergeSameDateEntries` is NOT applied.** The function (defined at `useJobs.js:777`) exists
  but is deliberately skipped (see the "Skip mergeSameDateEntries" comment near `useJobs.js:2069`)
  because it concatenated history entries. Do not re-enable it without fixing that first.

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

The old working-note `.md` files (`SYNC_FIXES`, `AUTOMATION_SYNC_FIX`, `CHECKLIST_COMPLETION`,
`IMPLEMENTATION_SUMMARY`, `DEPLOYMENT_CHECKLIST`, `DEDUPLICATE_SETUP`, `LINKEDIN_POST`,
`NOTIFICATIONS_V1`, `V1_RELEASE_NOTES`) have been moved to `docs/archive/` — they are history,
not documentation (`V1_RELEASE_NOTES.md` in particular still claims 30-second polling). The repo
root now keeps only `README.md`, this file, and the two setup guides (`SETUP_GUIDE.md`,
`SUPABASE_SETUP.md`). Treat this file and the Notion documentation as authoritative.

Lint is baselined: `eslint-suppressions.json` records the pre-existing violations so
`npm run lint` passes while still failing on any NEW error. Regenerate with
`npx eslint . --suppress-all`, or drop stale entries with `npx eslint . --prune-suppressions`.
