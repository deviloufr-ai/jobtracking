# CV ↔ job match score — logic review (2026-10-19)

Scope: the match score in the web app (`src/services/scoreJob.js`, `src/hooks/useAutoScore.js`,
`src/components/ScoreJob.jsx`, `JobModal.jsx`, drawer/table consumers) and in the Firefox add-on
(`background.js` `computeMatchScore` / `scanScoreCards`, `popup.js` `calculateJobScore`,
`content.js` score pill + listing scan).

**Status (same day):** #1–#5, #6 (JD backfill), #7, #8, #9, #10, #11, #12, #13 implemented.
Open: the P3 items. (#11–#13 live in the add-on source; they reach users with the next signed
.xpi build.)

## How it works today

- **App, automatic**: `useAutoScore` runs on every `jobs`/`cvs` change. For each job not in
  `archived/rejected/rejected_ats/cancelled`, it picks a CV (the *generated tailored CV* if one is
  saved, else the newest base CV), resolves a JD (`jobDescription` → `description` → fetch `url`
  via `/api/fetch-jd` → `notes`), builds `scoreSignature = cvKey|jdId`, and if it differs from the
  stored one calls `/api/claude` (Haiku, 1000 tokens, full CV + full JD). Cap 25 calls/session,
  700 ms throttle. Result → `score`, `scoreDetails`, `scoreSignature` (synced via `jobs.extras`).
- **App, manual**: `JobModal` → tab "score" → `ScoreJob` lets the user pick a CV and calls the same
  service; writes `score` + `scoreDetails` into the modal form (persisted on Save).
- **Add-on, single job**: the on-page pill (`content.js` → `COMPUTE_SCORE` → background) and the
  popup each build the *same prompt independently* and cache the result in `storage.local` under
  `score:djb2(url || company|position|hash(jd)) + hash(cv)` for 30 days.
- **Add-on, listing scan**: up to 25 cards (title/company/location/snippet) scored in one call,
  CV truncated to 4000 chars, snippet to 300, 1500 output tokens, French one-line reason.

## Problems, by severity

### P1 — costs real money or produces wrong numbers

| # | Where | Problem | Fix |
|---|---|---|---|
| 1 | `useAutoScore.js` `canScore` / `MAX_PER_SESSION` | Background scoring runs on the **shared trial key**: 25 calls per session against a trial of 15 calls / 30 days (`SHARED_KEY_TRIAL_LIMIT` default). A keyless user who uploads a CV and has a few jobs has their whole trial eaten by scores they never asked for, then hits `402` on the first Gmail scan. | On the shared-key path, do not auto-score (manual "Score" button only), or cap to ~3 and only for `todo` leads. Auto mode only when `getProviderKey()` is set. Surface a one-line "auto-score uses your key" note in Settings → API. |
| 2 | `useAutoScore.js` `cvForJob` + `CVGenerator.jsx:632` | **Circular score.** The job is scored against the *tailored CV generated from that same JD*, and the generator seeds `knownGaps` from `scoreDetails.gaps`. After generation the score jumps and the gaps list empties: it measures how well Claude tailored, not the candidate's fit. It also triggers a re-score (and a trial credit) after every generation. | Always score fit against the **base CV**. Keep a second, clearly labelled number for the tailored CV (`cvSaved.atsScore` already exists and is shown as "ATS" in the drawer). Do not include `cvSaved.savedAt` in the signature. |
| 3 | `JobModal.jsx:206` + `useAutoScore.js` | Manual scoring never writes `scoreSignature`, so on the next load the auto-scorer sees a mismatch and **overwrites the user's chosen-CV score** with the base-CV one (one more call). The manual result also lives only in the modal form: close without Save and the Claude call is lost. | Export a `buildScoreSignature(job, cv)` helper from one module, have `ScoreJob` write `scoreSignature` too, and persist via `updateJob` immediately (then the modal just reflects it). |
| 4 | `scoreJob.js` return block, both add-on parsers | **No validation of the model output.** `score: result.score \|\| 0` accepts strings, NaN, 150, or a missing field (stored as 0 with verdict `PARTIAL_MATCH`, indistinguishable from a real 0). `verdict` is any string. Score and verdict are two independent model outputs, so `82 / GOOD_MATCH` and `58 / STRONG_MATCH` both happen, and the UI colour bands (80/60/40) then disagree with the verdict text. | Clamp `Number(score)` to 0–100 (throw if not finite, so the auto path marks it attempted instead of saving 0). Derive `verdict` from the score deterministically (≥80 strong, ≥60 good, ≥40 partial, else weak) in one shared helper used by app and add-on. Better: ask for 4 sub-scores (skills / experience / background / achievements, 0–25 each) and compute the total client-side so the number is explainable and stable. |
| 5 | `addJobBatch` (bg), `addJobToTracker` (bg), `useExtensionImport.js` | The listing-scan score and the pill score are **dropped on import** (`score`, `verdict`, `reason` not in the payload), so the app immediately re-scores every imported job: 25 scan jobs = 1 add-on call + up to 25 app calls. | Carry `score`, `verdict`, `reason`/`summary`, `scoreSource: 'listing'|'page'` and `cvName` in the batch/add payload; the app stores them with a signature so a re-score only happens when a fuller JD arrives (listing scores are card-level and should be flagged provisional in the UI). |

### P2 — silent inefficiency or inconsistency

| # | Where | Problem | Fix |
|---|---|---|---|
| 6 | `useAutoScore.js` `resolveJD` / `jdSourceId` | For URL-only jobs the fetched JD is **thrown away** (not written back to the job), so CV/letter generation refetches it, and until a score succeeds every session refetches (`attemptedRef` is per session). If the fetch fails and `notes` is used instead, the signature still says `url:…`, so a later JD edit may not re-score. | Backfill `jobDescription` with the fetched text (same path as commit `12a3d79`), and hash the *resolved* text for the signature. |
| 7 | `useAutoScore.js` loop order / `SKIP_STATUSES` | Jobs are scored in display order with a 25/session cap, so old `sent`/`waiting`/`done`/`offer` rows consume the budget before fresh `todo` leads, where the score is actually actionable. | Priority queue: `todo` newest-first, then `sent`, then the rest; skip `interview`/`done`/`offer` (fit is moot once interviewing). |
| 8 | `background.js`, `popup.js`, `scoreJob.js` | The single-job prompt + JSON parsing is **duplicated three times** (and the listing prompt is a fourth variant). They have already drifted (`extractJSON` vs `indexOf('{')`, 1000 vs clamped tokens, different thresholds). | Add-on: popup calls `COMPUTE_SCORE` in the background instead of its own copy (one prompt, one cache, one parser; the popup also gains the server JD fallback). App ↔ add-on: keep the prompt in one file each and note the twin in a comment, or move the prompt server-side behind `/api/claude` (`template: 'score'`, no new function). |
| 9 | `background.js` `computeMatchScore` vs `popup.js` | JD-length thresholds differ: pill refuses `< 80` chars (server fallback tried `< 120`); popup shows the section at `> 50` and scores whatever it has with no server fallback. Same page can score in the popup and show no pill. | Falls out of #8. Single threshold (≈120 chars) + fallback in one place. |
| 10 | Cache key (both add-on sides) | Non-LinkedIn hosts key on `window.location.href` **including query/tracking params** (`?from=serp&vjs=3`, `utm_*`, Indeed `&advn=`), so the same posting re-scores (and re-debits the trial) on each variant. LinkedIn is canonicalised; Indeed/HelloWork/WTTJ are not. | One `canonicalJobUrl()` helper: strip hash + known tracking params, keep `jk`/`currentJobId`/path id. Use it for the cache key, `CHECK_APPLIED`, and the URL sent to the app. |
| 11 | `scanScoreCards` | CV truncated to **4000 chars** (a two-page CV is 5–8k, so the second page and often the skills block are cut); LinkedIn enrichment fills `snippet` to 600 chars but the prompt slices it to 300; 25 results × 12-word reasons fits 1500 tokens only barely, and a truncated JSON silently leaves the whole batch unscored (`score: null`). | Use a compact profile summary (title, years, top skills, last 2 roles) instead of raw CV truncation, snippet 600, `max_tokens` 2500, chunk cards in two calls of ≤13 and merge. |
| 12 | Prompts (all) | Output language is unspecified: `summary`/`strengths`/`gaps` come back in English or in the JD's language for FR/JP users; the listing `reason` is hardcoded French. | Pass the UI language (`detectLanguage` / i18n lang) into the prompt; add-on reads `uiLang` from the synced profile. |
| 13 | `content.js` pill | Any error (`402` trial exhausted, `429`, network) **silently removes the pill**; the user never learns why scoring stopped. | Render a grey pill with a short reason + "add your key in SmartJobTracker" link for `402`. |

### P3 — polish

- `TrackerHomeE.jsx:590` renders `{job.score}` unrounded (badge elsewhere rounds); fix with the clamp in #4.
- `ScoreJob.jsx` has a dead private `getScoreColor`/`getVerdictIcon` duplicating the exported helpers.
- `ScoreJob` surfaces the internal error text "cvText and jobDescription required" when the job has no JD; disable the button and show "Add a job description first".
- `scoredAt` is stored but never shown as "scored N days ago / with CV X"; a stale badge looks authoritative.
- `jtBootScorePill` polls `location.href` every 1.5 s forever on every host; use `popstate` + a MutationObserver on `<title>` and keep the interval only as a fallback.

## Suggested order

1. #1 + #3 + #4 (half a day): stops the trial burn, stops the overwrite, makes the number trustworthy.
2. #2 (score against base CV; keep ATS score for the tailored CV).
3. #8 + #9 + #10 in the add-on (popup → background; canonical URL).
4. #5 + #6 + #7 (carry scores across, backfill JD, priority queue).
5. #11 + #12 + #13, then P3.

---

## Re-review after the add-on merge (commit `6bbd4af`, 2026-10-19)

The standalone add-on (v1.7.0: popup redesign, CV-file sync, LinkedIn Easy Apply
auto-pilot, Chrome MV3 manifest) was 3-way merged into `jobtrackr-extension/`. Checked
against the merged `background.js` / `content.js` / `popup.js` / `sync.js`:

**Intact after the merge** — `COMPUTE_SCORE` single implementation, canonical cache id
(`scoreCacheId`), `normalizeScoreResult` twin, UI-language output (`uiLang` ← the app's
`jobtrackr_language`, same key `useLanguage.js` writes), listing-scan chunking/profile block,
grey error pill (`jtScoreError` / `jtOpenApp`), score carried on `ADD_JOB`, `LOAD_JD`
(`{ text, score }`) and `ADD_JOB_BATCH` rows. `node --check` passes on all three scripts; the
MV3 service worker loads the `browser` shim via `importScripts`.

### New findings

| # | Sev | Where | Problem | Fix |
|---|---|---|---|---|
| 14 | P2 | `popup.js` add path (`addBtn` click) | The redesigned popup has **no score section**, so `calculateJobScore` never runs and `lastScoreResult` is always `null`: a job added from the popup reaches the app with `score: null` even when the pill already scored (and cached) that very posting seconds earlier. The app then re-scores it (own key) or shows nothing (trial). | Add a `cacheOnly: true` flag to `COMPUTE_SCORE` (return the cached record or `{ miss: true }`, never call Claude) and have the popup add path attach it to the `jdKey` payload. Same call can render a read-only "Score ★ 72 · Bon match" line in the popup at zero cost. |
| 15 | P3 | `popup.js` lines ~851–990 + 4 call sites | ~140 lines of dead score UI (`renderScore`, `calculateJobScore`, `updateScoreSection`, `score-*` element lookups) kept only as a guarded no-op. | Delete; keep only the cache read from #14. |
| 16 | P2 | `content.js` `jtCvPresent` vs `background.js` `scanScoreCards` | The pill requires `cvText`, but the listing scan happily scores from the **profile alone** (`scanCandidateBlock`). A user who filled the profile but never uploaded a CV gets listing scores and no pill, and `COMPUTE_SCORE` answers `noCv`. | Let `computeMatchScore` fall back to `scanCandidateBlock(profile, null)` when `cvText` is missing (label `cvName: 'Profil'`), and gate the pill on `cvText || !isProfileEmpty(profile)`. |
| 17 | P2 | App: `ScoreBadge`, `CandidatureDrawer`, `TrackerHomeE` | `scoreDetails.provisional` (listing-scan score, card-only input) is stored but **never shown**: a 25-card triage score wears the same badge as a full-JD score. For a trial user nothing ever replaces it. | Render provisional scores with a dashed border / `~` prefix and a tooltip ("Score provisoire — basé sur l'aperçu de l'annonce"); `ScoreBreakdown` shows the source line. |
| 18 | P3 | `content.js` pill + 1.7.0 Easy Apply pill | Both are fixed overlays; the score pill sits bottom-right at `z-index 2147483000`, the new ⚡ "Candidature auto" pill lives inside the LinkedIn modal. Overlap when the modal is open is plausible and **not verified** here. | Hide the score pill while the Easy Apply modal is open (`jtRemoveScorePill()` on modal detect, re-run `runScoreFlow` on close). |
| 19 | P3 | Release | `manifest.json` is still **1.7.0** while every score fix above is post-1.7.0; users keep the old popup-side scoring until a signed build ships. | Bump to 1.7.1, build + sign the `.xpi` (Firefox) and the MV3 zip (Chrome), and bump `src/constants/extension.js` so the in-app update modal fires. |

### Still open from the first pass

P3 items (unrounded score in `TrackerHomeE`, `scoredAt` never shown as age, pill polling
`location.href` every 1.5 s).
