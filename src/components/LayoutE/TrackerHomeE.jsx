// TrackerHomeE — the Tracker home for the new "E — Focus + List" layout.
//
// Composes: FocusBand (auto-hidden when caught up) + one unified job list
// (favorites pinned) + a right master-detail DRAWER. The list stays clickable
// while the drawer is open: clicking another candidature switches it in place
// (active row highlighted), the content reflows left of the drawer on desktop,
// and the drawer closes on ✕ / Esc / re-clicking the open row. The drawer body
// reuses JobCard (variant="sheet") — the same detail UI as the mobile sheet.
import { useState, useEffect } from 'react'
import { getStatus, getStatusLabel } from '../../hooks/useJobs'
import JobCard from '../JobCard'
import FocusBand from './FocusBand'

const PALETTE = ['#4f46e5', '#2563eb', '#0d9488', '#d97706', '#db2777', '#7c3aed', '#dc2626', '#059669']
const colorFor = (s = '') => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length]
const initials = (s = '') =>
  s.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'

export default function TrackerHomeE({
  jobs = [],
  userName,
  onEdit,
  onDelete,
  onStatusChange,
  onAddStep,
  onUpdateHistory,
  onUpdateJob,
  onGenerateCV,
  onViewSavedCV,
  onToggleFavorite,
  checkAllPositions,
  onSTAR,
  onDraftEmail,
  t = (k) => k,
}) {
  const [openId, setOpenId] = useState(null)
  const openJob = jobs.find(j => j.id === openId) || null

  // Close the drawer if its job disappears (deleted / archived out of view).
  useEffect(() => {
    if (openId && !jobs.some(j => j.id === openId)) setOpenId(null)
  }, [jobs, openId])

  // Esc closes the drawer.
  useEffect(() => {
    if (!openJob) return
    const onKey = e => { if (e.key === 'Escape') setOpenId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openJob])

  const activate = (id) => setOpenId(cur => (cur === id ? null : id))
  const close = () => setOpenId(null)

  // Favorites pinned first; otherwise keep incoming order.
  const sorted = [...jobs].sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0))

  return (
    <div className={`w-full min-w-0 transition-[padding] duration-300 ${openJob ? 'md:pr-[440px]' : ''}`}>
      <FocusBand
        jobs={jobs}
        userName={userName}
        onOpenJob={j => setOpenId(j.id)}
        onGenerateCV={onGenerateCV}
        onSTAR={onSTAR}
        t={t}
      />

      {/* List header */}
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-sm font-semibold text-gray-800">{t('nav.tabs.tracker')}</h3>
        <span className="text-xs font-semibold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{jobs.length}</span>
      </div>

      {/* Unified list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {sorted.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-gray-400">{t('empty.noJobs') || 'Aucune candidature'}</div>
        )}
        {sorted.map(job => {
          const status = getStatus(job.status)
          const active = openId === job.id
          return (
            <button
              key={job.id}
              onClick={() => activate(job.id)}
              aria-current={active ? 'true' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors first:rounded-t-2xl last:rounded-b-2xl ${
                active ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : 'hover:bg-gray-50'
              }`}
            >
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: colorFor(job.company) }}
              >
                {initials(job.company)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-gray-900 truncate">
                  {job.favorite && <span className="text-amber-400">★ </span>}{job.company}
                </span>
                <span className="block text-xs text-gray-400 truncate">{job.position}</span>
              </span>
              {typeof job.score === 'number' && (
                <span className="text-xs font-bold text-gray-500 tabular-nums shrink-0">{job.score}</span>
              )}
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${status?.color || 'bg-gray-100 text-gray-500'}`}>
                {getStatusLabel(job.status, t)}
              </span>
            </button>
          )
        })}
      </div>

      {/* Master-detail drawer */}
      {openJob && (
        <>
          {/* backdrop — mobile only, so desktop rows stay clickable */}
          <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={close} />
          <aside className="fixed top-0 right-0 bottom-0 z-40 w-full md:w-[440px] bg-white border-l border-gray-100 shadow-2xl flex flex-col animate-slide-up md:animate-none">
            <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 shrink-0">
              <span className="text-sm font-semibold text-gray-800 truncate">{openJob.company}</span>
              <button
                onClick={close}
                aria-label={t('common.close') || 'Fermer'}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <JobCard
                variant="sheet"
                defaultExpanded
                job={openJob}
                onEdit={onEdit}
                onDelete={(j) => { close(); onDelete?.(j) }}
                onStatusChange={onStatusChange}
                onAddStep={onAddStep}
                onUpdateHistory={onUpdateHistory}
                onUpdateJob={onUpdateJob}
                onGenerateCV={onGenerateCV}
                onViewSavedCV={onViewSavedCV}
                onToggleFavorite={onToggleFavorite}
                checkAllPositions={checkAllPositions}
                t={t}
              />
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
