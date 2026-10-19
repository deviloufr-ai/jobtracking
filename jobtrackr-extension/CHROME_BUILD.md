# Chrome build (Manifest V3)

Chrome removed support for Manifest V2, so it cannot load the Firefox build
(`manifest.json`, MV2) directly. This repo now ships **one cross-browser code
base** with two manifests:

| File                  | Browser            | Background            |
|-----------------------|--------------------|-----------------------|
| `manifest.json`       | Firefox (MV2)      | persistent page       |
| `manifest.chrome.json`| Chrome/Edge (MV3)  | service worker        |

For **Firefox for Android** (the only mobile target — it reuses `manifest.json`),
see [`ANDROID_BUILD.md`](ANDROID_BUILD.md).

All the JavaScript (`background.js`, `content.js`, `popup.js`, `sync.js`,
`popup.html`) is shared and runs on both engines. The differences are handled at
runtime:

- `browser-polyfill.js` aliases `browser` → `chrome` on Chrome (Firefox already
  has `browser`). It is loaded first in the popup, in the content scripts, and
  via `importScripts` in the Chrome service worker.
- `background.js` feature-detects `action`/`browserAction` and
  `scripting`/`tabs.executeScript`.
- `content.js` replies to messages with `sendResponse` + `return true` (works on
  both; returning a Promise is Firefox-only).

## Load it unpacked (development)

1. Copy `manifest.chrome.json` over `manifest.json` (or build a dist folder, see
   below). Chrome only reads a file literally named `manifest.json`.
2. Go to `chrome://extensions`, enable **Developer mode**, click **Load
   unpacked**, and select the folder.

## Build a clean Chrome zip (PowerShell)

```powershell
$dist = "dist-chrome"
Remove-Item -Recurse -Force $dist -ErrorAction SilentlyContinue
New-Item -ItemType Directory $dist | Out-Null
# Shared runtime files (note: supabase.js is intentionally omitted — it is unused)
Copy-Item background.js,content.js,popup.js,popup.html,sync.js,browser-polyfill.js,icon48.png,icon96.png $dist
Copy-Item -Recurse icons $dist
# MV3 manifest, renamed
Copy-Item manifest.chrome.json "$dist/manifest.json"
Compress-Archive -Path "$dist/*" -DestinationPath jobtrackr-chrome.zip -Force
```

## Notes for the Chrome Web Store

- The `<all_urls>` host permission + `all_frames` content script will draw
  review scrutiny. Be ready to justify it (autofill must work on any ATS/job
  board) or scope `host_permissions`/`matches` to the supported job sites.
- The privacy disclosure must state that page text, the CV and the profile are
  sent to `www.smartjobtracker.com/api/claude` for AI processing.
