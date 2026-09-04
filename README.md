# SmartJobTracker

AI-assisted job application tracker. Centralises applications across job boards and email,
keeps their status current without manual entry, and helps you act on the ones that need you.

**Live**: https://smartjobtracker.com

---

## What it does

- **Unified dashboard** — every application in one place, with status and a full timeline
- **Gmail import** — recruiter emails parsed automatically (rules first, Claude as fallback), multi-account
- **Calendar enrichment** — interviews, meeting links and invites matched back to the right application
- **Firefox extension** — capture a posting in one click from LinkedIn, Indeed, APEC, WTTJ and others
- **Android app** — same product, with native push notifications
- **Job search across five sources** — Adzuna, France Travail, jSearch, RemoteOK, Welcome to the Jungle, with scoring
- **Position checking** — detects when a posting disappears or is reposted
- **CV and cover letter generation** — tailored per posting, STAR-formatted, PDF export
- **STAR generator** — interview preparation from your own history
- **Notifications** — follow-up due, interview tomorrow, offer received, auto-archive
- **Multi-device sync** — sign in on any device and see the same data, offline-first
- **French and English** interface

---

## Stack

React 19 + Vite + Tailwind · Supabase (Postgres, Auth, Row-Level Security) · IndexedDB
offline cache · Vercel serverless functions · Claude Haiku · Capacitor (Android) ·
Firefox WebExtension · Vitest

Full technical documentation lives in Notion under **Documentation technique** —
architecture, data model, setup and changelog. `CLAUDE.md` carries the working context.

---

## Getting started

```bash
npm install
cp .env.example .env          # fill in the client-side values
npm install -g supabase
supabase migration up         # applies the schema
npm run dev                   # http://localhost:5173
```

Add `http://localhost:5173` to Authorized JavaScript origins in the Google Cloud console,
or OAuth will fail locally with no useful error.

Server-side keys (`ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`)
belong in the Vercel project settings, never in a local `.env`. See `.env.example` for the
full list and what each one is for.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build — run before every push |
| `npm run preview` | Serve the build locally |
| `npm run lint` | ESLint |
| `npm test` | Vitest, single run |
| `npm run test:watch` | Vitest, watch mode |

Developed from PowerShell, where `&&` does not chain commands — use `;` instead.

## Firefox extension

```
about:debugging  ->  This Firefox  ->  Load Temporary Add-on  ->  jobtrackr-extension/manifest.json
```

The folder keeps the project's former name.

## Android

```bash
npm run build
npx cap sync android
npx cap open android
```

The Android app is a Capacitor shell pointed at the live site, so a web deploy updates it
without a store release.

---

## Status and origin

In production. Built by Alexandre Leblanc, originally as a technical test for Publidata,
and since developed well beyond that scope.

Note: the project has no semantic version and no git tags. `package.json` reads `0.0.0`;
the `versionName` in `android/app/build.gradle` tracks the APK only. Version numbers found
in older documents are prose, not releases.
