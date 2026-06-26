import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root.jsx'

// Recover from stale lazy chunks. When the app is redeployed while a tab is
// still open, the loaded index references chunk hashes that no longer exist on
// the server; the next dynamic import() (html2pdf, jspdf, transformers…) 404s
// and fails with a "disallowed MIME type" / "error loading dynamically imported
// module" error. Reloading pulls the fresh index.html with the current hashes.
// Guarded by sessionStorage so a genuinely missing chunk can't loop forever.
function reloadOnStaleChunk(reason) {
  if (sessionStorage.getItem('chunk-reload')) return
  sessionStorage.setItem('chunk-reload', '1')
  console.warn('Reloading to recover from stale chunk:', reason)
  window.location.reload()
}
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  reloadOnStaleChunk(e.payload?.message || 'preloadError')
})
// Clear the guard once a load completes cleanly so future deploys can recover too.
window.addEventListener('load', () => sessionStorage.removeItem('chunk-reload'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
