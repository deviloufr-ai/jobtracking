import { useCallback, useEffect, useRef, useState } from 'react'

// Reusable "make this panel a freely draggable, edge-snapping window" behaviour,
// shared by every modal. Drag the panel by its header; drag it within SNAP_PX of
// the left/right viewport edge to dock it as a full-height side panel; drag it
// back toward the middle to detach it into a floating window again.
//
// Positioning is applied entirely through inline style (`panelStyle`) so wiring a
// modal up is non-destructive: spread the style onto the existing panel and add
// the drag handle — no need to rewrite its classes. `snapPreview` is a ghost
// element to render (a dashed outline on the side it will dock to).
const SNAP_PX = 48
const RADIUS = 16

export function useDragDock({ width = 560, topRatio = 0.08 } = {}) {
  // Center horizontally / near the top on first mount — synchronously, so the
  // panel never flashes at (0,0) before an effect runs.
  const [pos, setPos] = useState(() => {
    const w = Math.min(width, window.innerWidth - 24)
    return {
      x: Math.max(12, (window.innerWidth - w) / 2),
      y: Math.max(12, Math.round(window.innerHeight * topRatio)),
      w,
    }
  })
  const [dock, setDock] = useState(null)        // null | 'left' | 'right'
  const [snapHint, setSnapHint] = useState(null) // preview side while dragging
  const drag = useRef({ active: false, sx: 0, sy: 0, ox: 0, oy: 0, hint: null })

  const clamp = useCallback((x, y, w) => ({
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - w - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - 48)),
  }), [])

  useEffect(() => {
    const move = (e) => {
      if (!drag.current.active) return
      const hint = e.clientX <= SNAP_PX ? 'left' : e.clientX >= window.innerWidth - SNAP_PX ? 'right' : null
      drag.current.hint = hint
      setSnapHint(hint)
      if (!hint) {
        const nx = drag.current.ox + (e.clientX - drag.current.sx)
        const ny = drag.current.oy + (e.clientY - drag.current.sy)
        setDock(null)
        setPos(p => ({ ...p, ...clamp(nx, ny, p.w) }))
      }
    }
    const up = () => {
      if (drag.current.active && (drag.current.hint === 'left' || drag.current.hint === 'right')) {
        setDock(drag.current.hint)
      }
      drag.current.active = false
      drag.current.hint = null
      setSnapHint(null)
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [clamp])

  const startDrag = useCallback((e) => {
    // Don't hijack clicks that land on interactive controls inside the header.
    if (e.target.closest?.('button, a, input, select, textarea, [role="button"]')) return
    const ox = dock === 'left' ? 0 : dock === 'right' ? Math.max(0, window.innerWidth - pos.w) : pos.x
    const oy = dock ? 0 : pos.y
    drag.current = { active: true, sx: e.clientX, sy: e.clientY, ox, oy, hint: dock }
    document.body.style.userSelect = 'none'
  }, [dock, pos])

  const docked = dock === 'left' || dock === 'right'
  const panelStyle = docked
    ? {
        position: 'fixed', top: 0, [dock]: 0, height: '100vh', width: pos.w,
        margin: 0, maxWidth: 'none', maxHeight: 'none',
        borderRadius: dock === 'left' ? `0 ${RADIUS}px ${RADIUS}px 0` : `${RADIUS}px 0 0 ${RADIUS}px`,
      }
    : { position: 'fixed', left: pos.x, top: pos.y, width: pos.w, maxWidth: 'none', margin: 0 }

  const snapPreview = snapHint ? (
    <div
      className="fixed top-0 h-screen z-[5] pointer-events-none bg-indigo-500/10 border-2 border-dashed border-indigo-400/50"
      style={{ width: pos.w, [snapHint]: 0, borderRadius: snapHint === 'left' ? `0 ${RADIUS}px ${RADIUS}px 0` : `${RADIUS}px 0 0 ${RADIUS}px` }}
    />
  ) : null

  return { pos, dock, docked, snapHint, startDrag, dragHandleProps: { onPointerDown: startDrag }, panelStyle, snapPreview }
}
