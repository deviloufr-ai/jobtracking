// Receives text shared INTO the app from the Android share sheet and routes it
// to a subscriber (App.jsx opens the LinkedIn-import flow with it).
//
// How the shared text reaches us:
//   • Native (Capacitor/Android): the share sheet launches MainActivity with an
//     ACTION_SEND intent. MainActivity forwards the shared text by calling the
//     global window.__sjtReceiveSharedUrl(text) we install here, retrying on a
//     short timer until this function exists (it may not on a cold start yet).
//   • It also mirrors the text into localStorage under SHARE_KEY as a belt-and-
//     braces path, which we drain on boot.
//
// initShareIntake() runs once at boot (before React mounts) so a value shared on
// a cold start is captured; the React layer subscribes a moment later via
// onSharedUrl() and picks up whatever was buffered in the meantime.

import { extractUrl } from './linkedinShare.js'

const SHARE_KEY = 'sjt_shared_url'

let subscriber = null
let pending = null
let installed = false

function deliver(raw) {
  const url = extractUrl(raw) || (typeof raw === 'string' ? raw.trim() : '')
  if (!url) return
  if (subscriber) {
    subscriber(url)
  } else {
    // No listener yet (React not mounted) — buffer the most recent share.
    pending = url
  }
}

export function initShareIntake() {
  if (installed) return
  installed = true

  // Native bridge entry point. Returns true so MainActivity knows the hand-off
  // landed and can stop retrying.
  window.__sjtReceiveSharedUrl = (text) => {
    deliver(text)
    return true
  }

  // Warm-start / same-session shares also fan out through a DOM event.
  window.addEventListener('sjt-shared-url', (e) => deliver(e?.detail))

  // Drain anything the native layer stashed before this code ran.
  try {
    const stored = localStorage.getItem(SHARE_KEY)
    if (stored) {
      localStorage.removeItem(SHARE_KEY)
      deliver(stored)
    }
  } catch { /* private mode / disabled storage — ignore */ }
}

// Subscribe to incoming shared URLs. Immediately replays a URL that arrived
// before the subscriber attached. Returns an unsubscribe function.
export function onSharedUrl(fn) {
  subscriber = fn
  if (pending) {
    const url = pending
    pending = null
    fn(url)
  }
  return () => { if (subscriber === fn) subscriber = null }
}
