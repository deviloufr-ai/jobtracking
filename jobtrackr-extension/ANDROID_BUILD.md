# Android build (Firefox for Android)

**Firefox for Android is the only mobile target.** Chrome, Edge, Brave and Opera
on Android do not support extensions at all, and Kiwi (the old Chromium-extension
browser) is discontinued. So the Chrome MV3 build (`manifest.chrome.json`) does
**not** run on any phone — Android uses the Firefox MV2 `manifest.json`, the same
file desktop Firefox loads.

## What's different on Android

Firefox for Android runs on Gecko, so most of the extension works unchanged
(`tabs`, `storage`, `activeTab`, `<all_urls>`, `all_frames` content scripts, the
MV2 persistent background page). The mobile-specific handling already in the code:

| Concern            | Handling                                                                 |
|--------------------|--------------------------------------------------------------------------|
| `contextMenus` API | **Undefined on Android.** All `browser.contextMenus.*` calls are guarded with `if (browser.contextMenus)` in `background.js` and `popup.js`. Right-click autofill is unavailable on mobile, but the popup's **Autofill** button runs the same `TRIGGER_AUTOFILL` → `AUTO_GENERATE_ALL` flow, so nothing is lost. The now-inert "Clic droit" toggle auto-hides. |
| Popup sizing       | Firefox for Android renders the browser-action popup as a full page. `popup.html` has a `viewport` meta and the body is `width: 380px; max-width: 100%`, so it fills a phone screen while keeping the desktop panel size. |
| `windows` API      | Android is single-window; `browser.windows.update(...)` is a no-op there and is already wrapped in try/catch. |
| Android support    | `manifest.json` declares `browser_specific_settings.gecko_android` (min Firefox 120, when open add-ons went GA on Android). |

There is **no separate build step** — the Firefox package (root folder +
`manifest.json`) is the Android package.

## Test on a device (development)

Release Firefox for Android only installs **AMO-signed** add-ons; you cannot
sideload an unpacked folder the way you can on desktop. Two dev options:

### Option A — `web-ext` over ADB (recommended)

1. Enable USB debugging on the phone and connect it; confirm `adb devices` lists it.
2. Install **Firefox Nightly** (or Beta) on the device.
3. From the repo root:

   ```bash
   web-ext run --target=firefox-android --android-device=<adb-device-id> --firefox-apk=org.mozilla.fenix
   ```

   (`web-ext run --target=firefox-android` with no device id will list attached
   devices and APKs.) This side-loads the current folder into Nightly and live-reloads on file changes.

### Option B — custom add-on collection in Nightly

1. Firefox Nightly → **Settings → About Firefox Nightly**, tap the logo 5× to
   unlock the debug menu.
2. **Settings → Custom Add-on collection**, enter your AMO collection owner id
   and collection name.
3. The extension (once uploaded to that collection on AMO) appears under
   **Add-ons**.

### Inspect / debug

- Desktop Firefox → `about:debugging` → **This Firefox** won't show the phone;
  use **Setup → Enable remote debugging via USB**, then the connected device
  appears in the left pane. From there **Inspect** the extension to see
  `background.js` console output and confirm no `contextMenus` errors.

## Ship to AMO

The same signed AMO listing serves desktop and Android. Because `manifest.json`
now includes `gecko_android`, AMO marks the listing Android-compatible
automatically — no separate submission. See `SUBMISSION_GUIDE.md` /
`SUBMISSION_CHECKLIST.md` for the listing steps.

## On-device smoke test

- Popup opens from the toolbar/menu, is readable, and the score badge renders.
- **Ajouter à JobTrackr** opens/reuses a smartjobtracker.com tab.
- **Autofill** detects fields and injects on a real application form.
- `about:debugging` → Inspect shows no errors from `background.js`.
- Icon buttons and the 2×2 action grid are usable one-handed.
