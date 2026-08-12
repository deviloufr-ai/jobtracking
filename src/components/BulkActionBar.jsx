import { useEffect, useRef, useState } from 'react'
import { STATUSES, getStatusLabel } from '../hooks/useJobs'

// Floating bulk-action bar for the Candidatures table. Appears (desktop only)
// as soon as at least one row is ticked and offers batch operations over the
// selection: generate CVs, change status, archive, favorite, merge (2+) and
// delete. Merge/delete/status logic lives in App.jsx — this is presentation +
// a lightweight inline delete confirmation.
export default function BulkActionBar({
  count = 0,
  allFavorite = false,
  onGenerateCVs,
  onSetStatus,
  onArchive,
  onToggleFavorite,
  onMerge,
  onDelete,
  onClear,
  t = (k) => k,
}) {
  const [statusOpen, setStatusOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const statusRef = useRef(null)

  // Reset transient UI whenever the selection changes/clears.
  useEffect(() => { setStatusOpen(false); setConfirmDelete(false) }, [count])

  // Close the status menu on outside click.
  useEffect(() => {
    if (!statusOpen) return
    const onDoc = (e) => { if (statusRef.current && !statusRef.current.contains(e.target)) setStatusOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [statusOpen])

  if (count < 1) return null

  const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap'

  return (
    <div className="hidden md:block fixed bottom-5 left-1/2 -translate-x-1/2 z-40 animate-[fadeIn_.15s_ease-out]">
      <div className="flex items-center gap-1 bg-white rounded-xl shadow-2xl ring-1 ring-black/5 border border-gray-100 px-2 py-1.5">
        {/* Selection count + clear */}
        <div className="flex items-center gap-2 pl-2 pr-1">
          <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-xs font-bold bg-indigo-600 text-white rounded-full">{count}</span>
          <span className="text-sm text-gray-500 hidden lg:inline">{t('bulkBar.selected')}</span>
        </div>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        {/* Generate CVs */}
        <button onClick={onGenerateCVs} className={`${btn} text-indigo-700 hover:bg-indigo-50`}>
          <span>✨</span>{t('bulkBar.generateCVs')}
        </button>

        {/* Status menu */}
        <div className="relative" ref={statusRef}>
          <button onClick={() => setStatusOpen(v => !v)} className={`${btn} text-gray-600 hover:bg-gray-100`}>
            <span>🏷️</span>{t('bulkBar.setStatus')}
            <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {statusOpen && (
            <div className="absolute bottom-full mb-2 left-0 w-52 max-h-72 overflow-y-auto bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-10">
              {STATUSES.filter(s => s.key !== 'archived').map(s => (
                <button
                  key={s.key}
                  onClick={() => { setStatusOpen(false); onSetStatus?.(s.key) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                  {getStatusLabel(s.key, t)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Archive */}
        <button onClick={onArchive} className={`${btn} text-gray-600 hover:bg-gray-100`} title={t('bulkBar.archive')}>
          <span>📦</span><span className="hidden lg:inline">{t('bulkBar.archive')}</span>
        </button>

        {/* Favorite toggle */}
        <button onClick={onToggleFavorite} className={`${btn} ${allFavorite ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-600 hover:bg-gray-100'}`} title={allFavorite ? t('bulkBar.unfavorite') : t('bulkBar.favorite')}>
          <span>{allFavorite ? '⭐' : '☆'}</span><span className="hidden lg:inline">{allFavorite ? t('bulkBar.unfavorite') : t('bulkBar.favorite')}</span>
        </button>

        {/* Merge — only meaningful for 2+ */}
        {count >= 2 && (
          <button onClick={onMerge} className={`${btn} text-blue-600 hover:bg-blue-50`}>
            <span>🔗</span>{t('bulkBar.merge')}
          </button>
        )}

        <div className="w-px h-6 bg-gray-200 mx-1" />

        {/* Delete (inline confirm) */}
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 pl-1 pr-1">
            <span className="text-sm text-gray-600 hidden lg:inline">{t('bulkBar.confirmDelete').replace('{n}', count)}</span>
            <button onClick={() => { setConfirmDelete(false); onDelete?.() }} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors">
              {t('bulkBar.confirmYes')}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className={`${btn} text-gray-500 hover:text-red-600 hover:bg-red-50`} title={t('bulkBar.delete')}>
            <span>🗑️</span><span className="hidden lg:inline">{t('bulkBar.delete')}</span>
          </button>
        )}

        <div className="w-px h-6 bg-gray-200 mx-1" />

        {/* Deselect all */}
        <button onClick={onClear} className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title={t('bulkBar.deselectAll')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  )
}
