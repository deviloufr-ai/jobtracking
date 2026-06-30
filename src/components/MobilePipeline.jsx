import { useRef, useState } from 'react'
import { getStatus, getStatusLabel } from '../hooks/useJobs'
import CompanyAvatar from './CompanyAvatar'

const isEN = typeof navigator !== 'undefined' && navigator.language.startsWith('en')

// Core active pipeline, in flow order. Terminal statuses (rejected/done/etc.) are
// left out so the swipe stays focused on the live funnel — matching the kanban's
// default-hidden columns.
const STAGES = ['todo', 'sent', 'reviewing', 'interview', 'waiting', 'offer']

/**
 * Mobile pipeline — the phone form of the kanban. One stage is shown at a time;
 * swipe left/right (or tap a chip) to move between stages. Tapping a card opens
 * the full-screen detail sheet, where status can be changed.
 */
export default function MobilePipeline({ jobs, onOpen, onToggleFavorite, t = (k) => k }) {
  const stages = STAGES.map(key => ({ key, jobs: jobs.filter(j => j.status === key) }))
  const [idx, setIdx] = useState(() => {
    const firstNonEmpty = stages.findIndex(s => s.jobs.length > 0)
    return firstNonEmpty < 0 ? 0 : firstNonEmpty
  })
  const start = useRef({ x: 0, y: 0, mode: null })

  const onTouchStart = (e) => {
    const tch = e.touches[0]
    start.current = { x: tch.clientX, y: tch.clientY, mode: null }
  }
  const onTouchMove = (e) => {
    const tch = e.touches[0]
    const ddx = tch.clientX - start.current.x
    const ddy = tch.clientY - start.current.y
    if (start.current.mode === null) {
      if (Math.abs(ddx) > 30 && Math.abs(ddx) > Math.abs(ddy)) start.current.mode = 'swipe'
      else if (Math.abs(ddy) > 10) start.current.mode = 'scroll'
    }
  }
  const onTouchEnd = (e) => {
    if (start.current.mode !== 'swipe') return
    const ddx = e.changedTouches[0].clientX - start.current.x
    if (ddx < -40) setIdx(i => Math.min(stages.length - 1, i + 1))
    else if (ddx > 40) setIdx(i => Math.max(0, i - 1))
  }

  const cur = stages[idx]

  return (
    <div>
      {/* Stage chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
        {stages.map((s, i) => {
          const st = getStatus(s.key)
          return (
            <button key={s.key} onClick={() => setIdx(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${
                i === idx ? st.color + ' border-transparent shadow-sm' : 'bg-white border-gray-200 text-gray-500'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
              {getStatusLabel(s.key, t)}
              <span className="opacity-60">{s.jobs.length}</span>
            </button>
          )
        })}
      </div>

      {/* Swipeable stage body */}
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{ touchAction: 'pan-y' }} className="min-h-[220px]">
        {cur.jobs.length === 0 ? (
          <div className="text-center text-sm text-gray-300 py-16 select-none">—</div>
        ) : (
          <div className="space-y-2.5">
            {cur.jobs.map(job => (
              <div key={job.id} onClick={() => onOpen?.(job)}
                className={`flex items-center gap-3 p-3.5 rounded-2xl border active:scale-[0.99] transition-transform ${
                  job.favorite ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-gray-200'
                }`}>
                <CompanyAvatar company={job.company} sizeClass="w-10 h-10" textClass="text-sm" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-[15px] truncate">{job.company}</div>
                  <div className="text-[13px] text-gray-500 truncate">{job.position}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(job.id) }}
                  aria-label="favorite"
                  className={`text-lg leading-none p-1 -m-1 active:scale-125 transition-transform ${job.favorite ? 'text-yellow-400' : 'text-gray-300'}`}>★</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stage position dots */}
      <div className="flex justify-center gap-1.5 mt-3">
        {stages.map((s, i) => (
          <span key={s.key} className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-5 bg-indigo-500' : 'w-1.5 bg-gray-300'}`} />
        ))}
      </div>
      <p className="text-center text-[11px] text-gray-400 mt-2">
        {isEN ? 'Swipe to change stage' : 'Glissez pour changer d’étape'}
      </p>
    </div>
  )
}
