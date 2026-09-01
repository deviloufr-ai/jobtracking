// Single source of truth for the app version shown to users and used by the
// in-app "a new version is available" check.
//
// ── RELEASE CHECKLIST ────────────────────────────────────────────────────────
//   Bump APP_VERSION on every real release. That's it: the build emits it into
//   version.json (served at /version.json), the footer displays it, and running
//   apps (a stale web tab, or a sideloaded Android APK that can't auto-update)
//   compare their baked value against the deployed one and prompt to update.
//
//   Do NOT tie this to the git commit count — the CI APK-refresh commits bump
//   the count without being a real release, which would nag users falsely.
export const APP_VERSION = '0.4.8'

// Absolute URL of the deployed version manifest. MUST be absolute: the native
// app has its own bundled /version.json, so a relative fetch would only ever
// read its own baked version. This points at the live site so it learns the
// latest deployed version. Kept on the canonical www host.
export const VERSION_MANIFEST_URL = 'https://www.smartjobtracker.com/version.json'

// Where the installable Android APK lives (served by Vercel from public/).
export const ANDROID_APK_URL = 'https://www.smartjobtracker.com/smartjobtracker.apk'
