# Changelog

All notable changes to JobTrackr Extension are documented here.

## [1.7.0] - 2026-09-13

### ✨ Added
- **LinkedIn « Candidature auto » (Easy Apply auto-pilot).** One click walks the
  whole Easy Apply modal end to end:
  - fills every field on each step — identity (name/email/phone/LinkedIn) locally,
    everything else in one batched Claude call with the job description as context;
  - uploads the synced CV into LinkedIn's (hidden) resume `<input type=file>` via a
    `DataTransfer` — no synthetic click on the picker, so the modal doesn't reload;
  - auto-clicks the footer's primary button (**Suivant → Vérifier**, FR + EN),
    waiting for each step to re-render, with a progress guard that stops if a step
    doesn't advance (a required field left empty / validation error).
  - **Stops at « Envoyer la candidature »** and highlights it for you to review and
    submit — submitting is irreversible. Full auto-submit is opt-in via
    `storage.local.linkedinAutoSubmit === true`.
  - Triggers from a floating **⚡ Candidature auto** pill inside the modal, or the
    **Candidature LinkedIn auto** button in the popup (shown only on `linkedin.com`).
- **CV file sync.** `sync.js` now also mirrors the CV *binary* (as a data URL) from
  the web app into `storage.local.cvFile`, so the CV can be attached to real upload
  fields — not just fed to the AI as text. Degrades gracefully: when no file is
  exposed, the CV step is left to the user with a notice.

### 🔧 Changed
- Autofill's field-filling logic is factored into a shared `jtFillFields()` used by
  both the popup **Autofill** action and the new LinkedIn auto-pilot.

## [1.6.2] - 2026-09-01

### 🔧 Fixed
- **Critical:** Popup **Autofill** button reported "Aucun champ détecté" and refused
  to run on real application forms (e.g. Ashby). Two causes:
  - `TRIGGER_AUTOFILL` reported `fieldState.size` (empty when the ✦ buttons are
    toggled off, and populated asynchronously) instead of the real field count.
    It now counts via `detectFormFields()`.
  - **Frame race:** with `all_frames`, empty sub-frames (reCAPTCHA, `about:blank`)
    also answered the popup and could win the response race with a count of 0.
    `TRIGGER_AUTOFILL` / `AUTO_GENERATE_ALL` now use a frame guard so a frame with
    fields answers immediately, empty frames stay silent, and only the top frame
    answers 0 (delayed) — letting an iframe-embedded form still win.
- **High:** Ashby's default name field label "Name (first name + last name)" is now
  recognised as the identity `name` field and filled locally, instead of depending
  on an AI round-trip. "First name" / "Last name" still map correctly.
- Hidden anti-bot textareas (`g-recaptcha-response`, hCaptcha, Turnstile) are no
  longer detected as fillable fields or sent to the AI.

## [1.5.1] - 2026-06-14

### 🔧 Fixed
- **Critical:** Fixed autofill toggle not working - now properly syncs between top bar and settings
- **Critical:** Fixed "join is not a function" error in Claude prompt building
- **High:** Fixed popover event listeners memory leak
- **High:** Fixed global activePopover race condition
- **High:** Fixed MutationObserver never cleaning up on page unload
- Fixed job description caching - now fetches fresh data on addon click
- Fixed company parsing to handle " | " delimiter (LinkedIn format)
- Fixed Supabase destructuring crash in auth functions
- Fixed identity data now fetches from JobTrackr sync instead of hardcoded values

### 🎯 Improved
- **Security:** Removed hardcoded personal data from source code
- **Performance:** Added API call timeouts (5-10s) to prevent hanging
- **Code Quality:** Extracted duplicate Claude API calls into shared helper
- **Efficiency:** Consolidated 5 storage.get() calls into 1 on popup load
- **Reliability:** Simplified Supabase client initialization with helper function
- **UX:** Added warning when job extraction is incomplete
- **UX:** Made header sticky so it's always visible when scrolling
- **UX:** Added scroll-to-top on popup open to prevent cutoff

### 🗑️ Removed
- **Removed entire Supabase integration** - was redundant with JobTrackr app
  - Removed Supabase UI panels (150+ lines)
  - Removed all auth/sync functions
  - Removed CDN dependency (~200KB)
  - Simplified to single source of truth: JobTrackr app
- Removed hardcoded user profile (Alexandre Leblanc)
- Removed hardcoded contact info (email, phone, LinkedIn)

### 🔍 Technical Details

#### Bug Fixes
| Bug | Severity | Fix |
|-----|----------|-----|
| Autofill toggle stayed on | CRITICAL | Synced top toggle with settings toggle |
| Memory leak in popovers | CRITICAL | Proper listener cleanup & removal |
| Race condition: activePopover | HIGH | Added visibility checks |
| Fetch calls hung indefinitely | HIGH | Added AbortController timeout |
| Job data cached indefinitely | MEDIUM | Clear cache on addon click |
| Code duplication (3 API calls) | MEDIUM | Extracted shared helper |
| Redundant storage reads | MEDIUM | Consolidated init |

#### Architecture Changes
- **Identity data flow:** Hardcoded → Browser storage (synced from JobTrackr)
- **API calls:** 3 duplicated implementations → 1 shared helper with timeout
- **Storage:** 5 separate reads → 1 consolidated read on popup open
- **Supabase:** Removed (was confusing, redundant with JobTrackr)
- **Profile:** Empty template → Populated from JobTrackr sync

### ✅ Testing Done
- [x] Autofill toggle ON/OFF works bidirectionally
- [x] Job description fetches fresh on each addon click
- [x] Company parsing handles "Position | Company" format
- [x] Identity fields auto-populate from synced profile
- [x] Popover cleanup prevents memory leaks
- [x] MutationObserver stops on page unload
- [x] API calls timeout after 10s
- [x] Settings URL validation works
- [x] Incomplete job extraction shows warning

---

## [1.5.0] - 2026-06-01

### ✨ Features
- AI-powered form autofill with Claude
- Per-field response generation with context
- Identity field auto-fill from profile
- Job info extraction on click
- Form field detection (text, email, tel, textarea)
- Support for multiple job sites
- Sync profile from JobTrackr app
- Settings panel with toggles
- Right-click context menu autofill
- API key management

### 🐛 Initial Release
- Basic functionality working
- Supabase integration included (later removed)
- Hardcoded profile data (later fixed)
- Known issues with autofill toggle (fixed in 1.5.1)

---

## [1.4.0] - 2026-05-15
- Previous version (pre-GitHub)

---

## Versioning

This project follows [Semantic Versioning](https://semver.org/):
- **MAJOR** (X.0.0): Breaking changes
- **MINOR** (0.X.0): New features, backwards compatible
- **PATCH** (0.0.X): Bug fixes

## Migration Guide

### From 1.5.0 to 1.5.1
**No migration needed!** All changes are backwards compatible.

Key changes:
- Autofill toggle now works (was broken before)
- Profile data now syncs from JobTrackr instead of hardcoded
- Supabase UI removed but data access still works via JobTrackr

---

## Future Versions

### 1.6.0 (Planned)
- [ ] Support Stack Overflow Jobs
- [ ] Support GitHub Jobs
- [ ] Bulk autofill (fill all fields at once)
- [ ] Application history in popup
- [ ] Resume snippet injection

### 2.0.0 (Planned)
- [ ] Manifest v3 support (Firefox & Chrome)
- [ ] Desktop app version
- [ ] Multiple profile management
- [ ] Interview prep integration

---

## How to Report Issues

Found a bug? Please report it with:
1. **What happened:** Description of the bug
2. **Expected behavior:** What should happen
3. **Steps to reproduce:** How to trigger the bug
4. **Environment:** Firefox/Chrome, version, OS
5. **Screenshots:** If applicable

Go to: [GitHub Issues](https://github.com/yourusername/jobtrackr-extension/issues)

---

*Last updated: June 14, 2026*
