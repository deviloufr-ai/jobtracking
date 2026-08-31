import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'

/**
 * Wire the Android hardware Back button to in-app navigation.
 *
 * By default Capacitor's Back button walks the webview history and, once at the
 * root, closes the app — useless for this state-driven SPA whose "pages" (tabs,
 * modals, bottom sheets) live in React state and never touch the URL, so the
 * webview history is empty and Back exits instantly. This hook takes the button
 * over:
 *
 *   1. Close the top-most open overlay — the first `open` layer in `layers` — or
 *   2. fall through to `onExit()`, which typically walks back through the tab
 *      history and only calls App.exitApp() once there's nothing left to undo.
 *
 * No-op on the web build: the listener is only registered inside the native
 * Capacitor shell.
 *
 * `layers`/`onExit` are rebuilt every render, so they're read through a ref and
 * the native listener is registered exactly once (never torn down mid-session,
 * which would race a fast Back press).
 *
 * @param {Array<{ open: boolean, close: () => void }>} layers  top-most first
 * @param {() => void} onExit  runs when no overlay is open
 */
export function useAndroidBackButton(layers, onExit) {
  const stateRef = useRef({ layers, onExit })
  stateRef.current = { layers, onExit }

  useEffect(() => {
    if (!Capacitor?.isNativePlatform?.()) return

    let cancelled = false
    let remove = () => {}

    import('@capacitor/app').then(async ({ App }) => {
      if (cancelled) return
      // Registering a `backButton` listener overrides Capacitor's default
      // hardware-back behavior, so we're now fully responsible for it —
      // including exiting the app when appropriate (see onExit).
      const handle = await App.addListener('backButton', () => {
        const { layers, onExit } = stateRef.current
        const top = (layers || []).find(l => l && l.open)
        if (top) top.close()
        else onExit()
      })
      if (cancelled) { handle.remove(); return }
      remove = () => handle.remove()
    })

    return () => { cancelled = true; remove() }
  }, [])
}
