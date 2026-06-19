import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * Mobile bottom sheet — slides up from the bottom edge, dims the page behind it.
 * The backbone of the mobile UX (add menu, filters, status picker, card actions,
 * account). Closes on backdrop tap, Escape, or the drag-handle area. Locks body
 * scroll while open. Renders through a portal so it always sits above everything.
 */
export default function BottomSheet({
  open,
  onClose,
  title = null,
  subtitle = null,
  children,
  maxHeight = '85vh',
  className = '',
}) {
  const panelRef = useRef(null)

  // Lock body scroll while the sheet is open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[300] flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-backdrop-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`relative bg-white rounded-t-3xl shadow-2xl w-full max-w-screen-sm mx-auto flex flex-col animate-sheet-up ${className}`}
        style={{ maxHeight }}
      >
        {/* Drag handle (tap to close) */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex-shrink-0 w-full flex justify-center pt-3 pb-1 active:opacity-60"
        >
          <span className="w-10 h-1.5 rounded-full bg-gray-300" />
        </button>

        {/* Optional header */}
        {(title || subtitle) && (
          <div className="flex-shrink-0 px-5 pb-3 pt-1 border-b border-gray-100">
            {title && <h3 className="text-base font-bold text-gray-900 tracking-tight">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        )}

        {/* Scrollable content + safe-area padding */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 safe-area-bottom">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
