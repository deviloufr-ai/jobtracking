import ErrorBoundary from './ErrorBoundary'

// Isolates an AI feature panel (CV generator, mock interview, STAR, cover letter):
// a render-time throw — e.g. shaping UI from malformed AI JSON — degrades just this
// panel with a Retry, instead of unmounting the whole app to the full-screen error
// screen. Async errors are already caught inside the panels; this covers render.
export default function AIPanelBoundary({ children, label = 'Cette section', onClose }) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div className="p-6 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-gray-700 font-medium mb-1">{label} a rencontré une erreur.</p>
          <p className="text-xs text-gray-400 mb-4 break-words">{error?.message || String(error)}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={reset}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              Réessayer
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Fermer
              </button>
            )}
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
