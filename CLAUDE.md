# JobTrackr — Claude Code Context

## Project Overview
Job application tracker with AI features. Built as a technical test for Publidata (recruiter: Rémi Wetteren).

**Production**: https://jobtracking-three.vercel.app  
**GitHub**: https://github.com/deviloufr-ai/jobtracking (private, deviloufr@gmail.com)  
**Notion**: https://www.notion.so/373cc77e6ec181219e83f3eb51390690

## Stack
- **Frontend**: React + Tailwind (Vite)
- **Backend**: Vercel Serverless Functions (`/api/`)
- **AI**: Claude Haiku via proxy `/api/claude`
- **Storage**: localStorage (Supabase planned for v1.0)
- **Deploy**: Vercel (auto-deploy on push to main)

## Key Environment Variables (Vercel)
- `ANTHROPIC_API_KEY` — Claude API
- `VITE_GOOGLE_CLIENT_ID` — Gmail OAuth
- `VITE_ADZUNA_APP_ID` + `VITE_ADZUNA_APP_KEY` — Job search

## Project Structure
```
src/
  App.jsx                    # Main app, tabs, global state
  hooks/
    useJobs.js               # CRUD + statuses + history + favorites + archive + dedup
    useCVs.js                # CV upload/storage
    useExtensionImport.js    # Firefox extension URL param import
    useAutoRefresh.js        # Auto Gmail sync on load
  components/
    JobRow.jsx               # Table row + expandable timeline + edit/delete steps
    JobModal.jsx             # Add/edit modal
    Stats.jsx                # 4 stat cards
    Filters.jsx              # Search + period + status chips
    NextAction.jsx           # ⚡ Urgent actions + 🗺️ Next steps (use case rules)
    GmailImport.jsx          # Gmail OAuth import + debug panel + force import toggle
    CVManager.jsx            # PDF upload + CV list + generator trigger
    CVGenerator.jsx          # Before/after split view + markdown editor + PDF export
    JobSearch.jsx            # Adzuna job search tab
    AdvicePanel.jsx          # Fixed tips by status + AI personalized advice
  services/
    gmail.js                 # OAuth Gmail + 6 parallel query batches + body extraction
    claude.js                # Email parsing in batches of 15 + JSON extraction
    enrichTimeline.js        # Auto-enrich timeline Gmail+Calendar + meeting links
    adzuna.js                # Adzuna proxy via /api/adzuna
api/
  claude.js                  # Anthropic proxy (avoids CORS)
  adzuna.js                  # Adzuna proxy (avoids CORS)
  parse-pdf.js               # PDF parsing via Claude document API
  fetch-jd.js                # Job description scraping
  generate-cv.js             # CV generation via Claude
```

## Available Job Statuses
`todo` | `sent` | `reviewing` | `interview` | `waiting` | `offer` | `rejected` | `rejected_ats` | `cancelled` | `archived`

## Key Business Rules
- `sent/reviewing/waiting` with no response after 60 days → auto-archived
- `rejected/rejected_ats/cancelled` after 90 days → auto-archived  
- Notes with ` | ` → split into separate history entries on load (`splitPipeNotes`)
- Same-date history entries → merged on load (`mergeSameDateEntries`)
- ATS rejection auto-detected (ashbyhq, greenhouse, lever, workable, teamtailor...)

## Build & Deploy
```bash
npm run dev      # Local dev (Vite)
npm run build    # Build check before push
git add -A && git commit -m "message" && git push origin main --force
```
Note: `&&` doesn't work in PowerShell, use `;` instead or separate commands.

## Known Issues / In Progress
- Gmail import: email dates sometimes grouped on same date — fix in claude.js prompt
- Gmail token expires after ~1h (token persisted in localStorage as workaround)
- localStorage sync: local Cursor files often out of sync with Claude's container

## Firefox Extension
- Location: `/jobtrackr-extension/` folder at project root
- Install: `about:debugging` → Load Temporary Add-on → `manifest.json`
- Reads full page text via content script → Claude Vision analysis
- Passes job data to app via URL params

## Notion Workspace
- Main page: `373cc77e6ec181219e83f3eb51390690`
- Backlog DB: `3ece7e0cda494ab3b1891c4a842e52b9`
- User Stories DB: `ae2a2d9dd4cd49c19088a320c45c83ac`
- Roadmap: `373cc77e6ec18161aaa7e79e512962db`

## Owner
Alexandre Leblanc — PM Senior, 18 years experience, trilingual FR/EN/JP  
Currently in active job search, test technique for Publidata in progress.
