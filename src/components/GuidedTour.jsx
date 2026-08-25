// GuidedTour — an interactive, spotlight-driven product tour (coach marks).
//
// Given an ordered list of steps, it dims the whole page and cuts a rounded
// "spotlight" hole around the DOM element each step points at, then floats a
// tooltip card (title + body + Back / Next / Skip + progress) next to it.
//
// Design notes:
//  - Steps target elements by CSS selector (usually `[data-tour="…"]`). A step
//    may list several comma-separated selectors; the first *visible* match wins,
//    so the same step works across the responsive header / nav-rail / mobile
//    variants that render duplicate controls.
//  - Steps whose target isn't present or visible right now are skipped
//    automatically, so the tour adapts to the user's state (e.g. a brand-new
//    user with no jobs never sees the "your pipeline" step).
//  - A step with no selector renders as a centered card (used for the intro and
//    the closing "you're all set" step).
//  - The dim overlay is a single SVG rect with a mask cutout — crisp rounded
//    hole in both light and dark themes — and it swallows page clicks so the
//    user can't wander off mid-tour. Advancing is via the card or the keyboard
//    (→ / ← / Esc).
//
// It is fully self-contained (no deps) and bilingual via the injected `t`.
import { useState, useLayoutEffect, useEffect, useRef, useCallback } from 'react'

const PAD = 8        // spotlight padding around the target
const GAP = 14       // gap between the target and the tooltip card
const MARGIN = 12    // keep the card this far from the viewport edges
const TIP_W = 340    // tooltip max width (px)

// First element matching `selector` that is actually rendered (non-zero box).
// Handles responsive duplicates where the hidden variant is display:none.
function findVisible(selector) {
  if (!selector) return null
  let els
  try { els = document.querySelectorAll(selector) } catch { return null }
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

export default function GuidedTour({ steps = [], onFinish, t = (k) => k }) {
  // Resolve the step set once, at open time: keep centered (selector-less) steps
  // and any whose anchor is on screen right now. The anchors live in the app
  // shell, already rendered before this overlay mounts, so the DOM read is
  // valid — and it gives accurate progress dots / counters instead of skipping
  // numbers. The runtime skip below still handles anchors that vanish mid-tour.
  const [activeSteps] = useState(() => steps.filter(s => !s.selector || findVisible(s.selector)))

  const [index, setIndex] = useState(0)
  const [spot, setSpot] = useState(null)   // {top,left,width,height} in viewport coords, or null (centered step)
  const [tipSize, setTipSize] = useState({ w: TIP_W, h: 180 })
  const tipRef = useRef(null)
  const dirRef = useRef(1)                  // last travel direction, for skipping absent steps

  const total = activeSteps.length
  const step = activeSteps[index]

  const end = useCallback(() => { onFinish?.() }, [onFinish])

  // Resolve + measure the current step's target. A step that points at a
  // selector with no visible match right now (e.g. the "daily focus" panel for a
  // brand-new user with zero jobs) is skipped in the current travel direction,
  // so the tour stays coherent. Selector-less steps (intro/outro) always show
  // as a centered card. Also scrolls an off-screen target into view and keeps
  // the spotlight glued to it on scroll / resize.
  useLayoutEffect(() => {
    if (!step) return

    // Auto-skip a targeted step whose anchor isn't on screen.
    if (step.selector && !findVisible(step.selector)) {
      const next = index + dirRef.current
      if (next < 0 || next >= total) { end() }
      else setIndex(next)
      return
    }

    let raf = 0
    const measure = () => {
      const el = findVisible(step.selector)
      if (!el) { setSpot(null); return }
      const r = el.getBoundingClientRect()
      setSpot({
        top: r.top - PAD,
        left: r.left - PAD,
        width: r.width + PAD * 2,
        height: r.height + PAD * 2,
      })
    }

    const el = findVisible(step.selector)
    if (el) {
      const r = el.getBoundingClientRect()
      const offscreen = r.top < 0 || r.bottom > window.innerHeight
      if (offscreen) el.scrollIntoView({ block: 'center', inline: 'nearest' })
    } else {
      setSpot(null) // selector-less centered step
    }
    // Measure on the next frame so any scroll has settled.
    raf = requestAnimationFrame(measure)

    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step, index, total, end])

  // Measure the tooltip card so we can place it precisely.
  useLayoutEffect(() => {
    if (!tipRef.current) return
    const { offsetWidth, offsetHeight } = tipRef.current
    setTipSize(prev => (prev.w === offsetWidth && prev.h === offsetHeight ? prev : { w: offsetWidth, h: offsetHeight }))
  }, [index, spot])

  const go = useCallback((dir) => {
    dirRef.current = dir
    setIndex(i => {
      const next = i + dir
      if (next < 0) return 0
      if (next >= total) { end(); return i }
      return next
    })
  }, [total, end])

  // Keyboard: → / Enter next, ← back, Esc skip.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      else if (e.key === 'Escape') { e.preventDefault(); end() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, end])

  if (!step) return null

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768

  // ── Tooltip placement ──────────────────────────────────────────────────────
  let tipStyle
  let caret = null
  if (!spot) {
    // Centered card (intro / outro, or a step whose target vanished).
    tipStyle = { left: (vw - tipSize.w) / 2, top: (vh - tipSize.h) / 2 }
  } else {
    const spaceBelow = vh - (spot.top + spot.height)
    const spaceAbove = spot.top
    const spaceRight = vw - (spot.left + spot.width)
    const spaceLeft = spot.left

    let placement = 'bottom'
    if (spaceBelow >= tipSize.h + GAP + MARGIN) placement = 'bottom'
    else if (spaceAbove >= tipSize.h + GAP + MARGIN) placement = 'top'
    else if (spaceRight >= tipSize.w + GAP + MARGIN) placement = 'right'
    else if (spaceLeft >= tipSize.w + GAP + MARGIN) placement = 'left'
    else placement = spaceBelow >= spaceAbove ? 'bottom' : 'top'

    const cx = spot.left + spot.width / 2
    const cy = spot.top + spot.height / 2
    let left, top
    if (placement === 'bottom') { top = spot.top + spot.height + GAP; left = cx - tipSize.w / 2 }
    else if (placement === 'top') { top = spot.top - GAP - tipSize.h; left = cx - tipSize.w / 2 }
    else if (placement === 'right') { left = spot.left + spot.width + GAP; top = cy - tipSize.h / 2 }
    else { left = spot.left - GAP - tipSize.w; top = cy - tipSize.h / 2 }

    left = Math.min(Math.max(MARGIN, left), vw - tipSize.w - MARGIN)
    top = Math.min(Math.max(MARGIN, top), vh - tipSize.h - MARGIN)
    tipStyle = { left, top }

    // Little caret pointing at the target.
    const caretBase = 'absolute w-3 h-3 bg-white rotate-45 border-gray-200'
    if (placement === 'bottom') caret = <span className={`${caretBase} border-l border-t`} style={{ top: -6, left: Math.min(Math.max(16, cx - left - 6), tipSize.w - 28) }} />
    else if (placement === 'top') caret = <span className={`${caretBase} border-r border-b`} style={{ bottom: -6, left: Math.min(Math.max(16, cx - left - 6), tipSize.w - 28) }} />
    else if (placement === 'right') caret = <span className={`${caretBase} border-l border-b`} style={{ left: -6, top: Math.min(Math.max(16, cy - top - 6), tipSize.h - 28) }} />
    else caret = <span className={`${caretBase} border-r border-t`} style={{ right: -6, top: Math.min(Math.max(16, cy - top - 6), tipSize.h - 28) }} />
  }

  const isLast = index === total - 1
  const isFirst = index === 0
  const holeId = 'tour-hole'

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={t('tour.aria')}>
      {/* Dim overlay with a spotlight cutout. The SVG rect swallows clicks so the
          page underneath can't be interacted with mid-tour. */}
      <svg width="100%" height="100%" className="absolute inset-0" style={{ pointerEvents: 'auto' }} onClick={() => go(1)}>
        <defs>
          <mask id={holeId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spot && (
              <rect x={spot.left} y={spot.top} width={spot.width} height={spot.height} rx="12" ry="12" fill="black" />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(15,23,42,0.62)" mask={`url(#${holeId})`} />
        {spot && (
          <rect
            x={spot.left} y={spot.top} width={spot.width} height={spot.height} rx="12" ry="12"
            fill="none" stroke="#818cf8" strokeWidth="2.5"
            className="animate-[tourpulse_1.8s_ease-in-out_infinite]"
          />
        )}
      </svg>

      {/* Tooltip card */}
      <div
        ref={tipRef}
        className="absolute bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 sm:p-5"
        style={{ ...tipStyle, width: `min(${TIP_W}px, calc(100vw - 24px))`, pointerEvents: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {caret}

        <div className="flex items-start gap-3">
          {step.icon && (
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-lg shrink-0">{step.icon}</div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-gray-900 leading-tight">{t(step.title)}</h3>
            <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{t(step.body)}</p>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mt-4">
          {activeSteps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-indigo-600' : 'w-1.5 bg-gray-200'}`}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-2 mt-4">
          <div className="flex items-center gap-2.5">
            <button
              onClick={end}
              className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
            >
              {t('tour.skip')}
            </button>
            <span className="text-[11px] font-medium text-gray-300 tabular-nums">{index + 1} / {total}</span>
          </div>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={() => go(-1)}
                className="px-3 py-2 text-xs font-semibold text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {t('tour.back')}
              </button>
            )}
            <button
              onClick={() => (isLast ? end() : go(1))}
              className="px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-sm shadow-indigo-200"
            >
              {isLast ? t('tour.finish') : t('tour.next')}
            </button>
          </div>
        </div>
      </div>

      {/* Spotlight pulse keyframes (scoped, injected once) */}
      <style>{`@keyframes tourpulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
    </div>
  )
}
