import { useState, useRef, useEffect, useCallback } from 'react'

// A non-modal, draggable, minimizable window. It renders as a `fixed` panel only
// as large as itself (no full-screen backdrop), so clicks outside it reach the
// app behind — the user can keep working while content here runs. The children
// stay mounted when minimized (body is hidden via CSS, not unmounted), so any
// in-flight work (e.g. a CV generation request) continues uninterrupted.
export default function FloatingWindow({ title, onClose, children, width = 1120 }) {
  const [pos, setPos] = useState(null)        // {x,y,w,h} — null until measured/centered
  const [minimized, setMinimized] = useState(false)
  const drag = useRef({ active: false, sx: 0, sy: 0, ox: 0, oy: 0 })

  const clamp = useCallback((x, y, w, h) => ({
    x: Math.min(Math.max(8, x), window.innerWidth - Math.min(w, window.innerWidth) - 8 + (w > window.innerWidth ? w - window.innerWidth : 0)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - 48)),
  }), [])

  // Center on first mount, sized to the viewport.
  useEffect(() => {
    const w = Math.min(width, window.innerWidth - 24)
    const h = Math.min(Math.round(window.innerHeight * 0.9), window.innerHeight - 24)
    setPos({ x: Math.max(12, (window.innerWidth - w) / 2), y: Math.max(12, (window.innerHeight - h) / 2), w, h })
  }, [width])

  // Drag handling (pointer events on window, so a fast drag never gets lost).
  useEffect(() => {
    const move = (e) => {
      if (!drag.current.active) return
      const nx = drag.current.ox + (e.clientX - drag.current.sx)
      const ny = drag.current.oy + (e.clientY - drag.current.sy)
      setPos(p => p ? { ...p, ...clamp(nx, ny, p.w, p.h) } : p)
    }
    const up = () => { drag.current.active = false; document.body.style.userSelect = '' }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [clamp])

  const startDrag = (e) => {
    if (!pos || minimized) return
    drag.current = { active: true, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
    document.body.style.userSelect = 'none'
  }

  if (!pos) return null

  const Controls = (
    <div className="flex items-center gap-1 flex-shrink-0">
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={() => setMinimized(m => !m)}
        title={minimized ? 'Agrandir' : 'Réduire'}
        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors text-sm leading-none"
      >
        {minimized ? '▢' : '—'}
      </button>
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={onClose}
        title="Fermer"
        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-red-100 hover:text-red-600 transition-colors text-sm leading-none"
      >
        ✕
      </button>
    </div>
  )

  // Minimized: a compact bar pinned bottom-right. Children stay mounted (hidden).
  const style = minimized
    ? { right: 16, bottom: 16, width: 320 }
    : { left: pos.x, top: pos.y, width: pos.w, height: pos.h }

  return (
    <div
      className={`fixed z-[60] flex flex-col bg-slate-100 rounded-xl shadow-2xl border border-gray-300 overflow-hidden ${minimized ? 'left-auto top-auto' : ''}`}
      style={style}
    >
      <div
        onPointerDown={startDrag}
        className={`flex items-center justify-between gap-3 px-3 py-2 bg-white border-b border-gray-200 flex-shrink-0 ${minimized ? '' : 'cursor-move'}`}
      >
        <span className="text-sm font-semibold text-gray-800 truncate">{title}</span>
        {Controls}
      </div>
      <div
        className="flex-1 overflow-y-auto p-3"
        style={{ display: minimized ? 'none' : 'block' }}
      >
        {children}
      </div>
    </div>
  )
}
