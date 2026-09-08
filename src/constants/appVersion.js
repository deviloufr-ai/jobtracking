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
export const APP_VERSION = '0.6.2'

// Minimum Android APK build (versionCode) the current web app needs. With
// server.url the app loads the live web, so pure web changes never require a new
// APK — but a native change (new Capacitor plugin, permission, or config) does,
// because the plugin's JS proxy must match the native code frozen in the APK.
// When that happens, bump BOTH this and `versionCode` in android/app/build.gradle
// together; out-of-date installs then get an "update the app" prompt. Web-only
// releases leave this alone.
export const MIN_NATIVE_VERSION = 4

// Absolute URL of the deployed version manifest. MUST be absolute: the native
// app has its own bundled /version.json, so a relative fetch would only ever
// read its own baked version. This points at the live site so it learns the
// latest deployed version. Kept on the canonical www host.
export const VERSION_MANIFEST_URL = 'https://www.smartjobtracker.com/version.json'

// Where the installable Android APK lives (served by Vercel from public/).
export const ANDROID_APK_URL = 'https://www.smartjobtracker.com/smartjobtracker.apk'

// APK URL used specifically for the in-app "Download update" action on Android.
// It MUST be on a different host than capacitor.config server.url (www...), because
// Capacitor's Bridge.launchIntent only hands a URL to the system browser (ACTION_VIEW,
// which has a real download manager) when its host differs from the app host; a
// same-host URL stays in the WebView, which can't download, and a Chrome Custom Tab
// (@capacitor/browser) silently blocks APK downloads. The apex host is a different
// host and 308-redirects to the canonical www APK, so the system browser downloads it.
export const ANDROID_APK_DOWNLOAD_URL = 'https://smartjobtracker.com/smartjobtracker.apk'
