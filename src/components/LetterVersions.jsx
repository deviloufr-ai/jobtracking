import { useState } from 'react'
import { restoreLetterVersion } from '../utils/letterVersions'

// Cover-letter version history. Lists previously saved letters (job.letterVersions,
// newest first) with preview + restore. Restoring promotes a stored version back to
// the current letter via onUpdateJob. Renders nothing when there's no history beyond
// the current letter.
export default function LetterVersions({ job, onUpdateJob, t = (k) => k }) {
  const tx = (k, f) => { const v = t(k); return v && v !== k ? v : f }
  const versions = Array.isArray(job.letterVersions) ? job.letterVersions : []
  const [open, setOpen] = useState(false)
  const [viewId, setViewId] = useState(null)

  // Hide the version that is identical to the current letter (it's already shown
  // above), so history only surfaces genuinely older drafts.
  const currentContent = (job.letterSaved?.content || '').trim()
  const older = versions.filter(v => (v.content || '').trim() !== currentContent)
  if (older.length === 0) return null

  const restore = (id) => {
    const patch = restoreLetterVersion(job, id)
    if (patch) onUpdateJob?.(job.id, patch)
    setViewId(null)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors">
        <span>🕑 {tx('letterVersions.title', 'Version history')} ({older.length})</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul className="px-4 pb-3 space-y-2">
          {older.map(v => (
            <li key={v.id} className="border border-gray-100 rounded-lg p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">{v.savedAt ? new Date(v.savedAt).toLocaleString() : ''}</span>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setViewId(viewId === v.id ? null : v.id)} className="text-xs font-medium text-gray-500 hover:text-gray-700">
                    {viewId === v.id ? tx('common.hide', 'Hide') : tx('common.view', 'View')}
                  </button>
                  <button onClick={() => restore(v.id)} className="text-xs font-semibold text-indigo-600 hover:underline">
                    {tx('letterVersions.restore', 'Restore')}
                  </button>
                </div>
              </div>
              {viewId === v.id
                ? <p className="mt-2 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed max-h-64 overflow-auto">{v.content}</p>
                : <p className="mt-1 text-xs text-gray-400 line-clamp-2">{v.content}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
