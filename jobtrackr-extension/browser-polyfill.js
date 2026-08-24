// Minimal cross-browser shim.
// Firefox exposes the promise-based `browser.*` namespace natively. Chrome only
// exposes `chrome.*`, but in Manifest V3 every API JobTrackr uses
// (storage, tabs, windows, runtime, scripting, contextMenus, action) already
// returns a Promise when called without a callback — so aliasing `browser` to
// `chrome` is enough. The one place Chrome differs (a content-script
// onMessage listener returning a Promise to reply) is handled directly in
// content.js with the sendResponse + `return true` pattern, which both engines
// support. That keeps us off the full 40 KB webextension-polyfill.
;(function () {
  if (typeof globalThis.browser === 'undefined' && typeof globalThis.chrome !== 'undefined') {
    globalThis.browser = globalThis.chrome
  }
})()
