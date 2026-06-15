import { useState } from 'react'
import { STATUSES, getStatusLabel } from '../hooks/useJobs'

// Relative "time ago" from the most recent activity (last history entry or application date)
function timeAgo(job, t = (k) => k) {
  const raw = job.history?.length ? job.history[job.history.length - 1].date : job.date
  if (!raw) return ''
  const then = new Date(raw)
  if (isNaN(then)) return ''
  const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24))
  if (days <= 0) {
    const hours = Math.floor((Date.now() - then) / (1000 * 60 * 60))
    if (hours <= 0) {
      const mins = Math.max(1, Math.floor((Date.now() - then) / (1000 * 60)))
      return `${mins}m`
    }
    return `${hours}h`
  }
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

// Columns shown in the kanban, honoring the status include/exclude filters + archived toggle
function visibleColumns(filters, showArchived) {
  const statusFilters = filters?.statuses || {}
  const includes = Object.entries(statusFilters).filter(([, v]) => v === 'include').map(([k]) => k)
  const excludes = Object.entries(statusFilters).filter(([, v]) => v === 'exclude').map(([k]) => k)
  return STATUSES.filter(s => {
    if (s.key === 'archived' && !showArchived) return false
    if (excludes.includes(s.key)) return false
    if (includes.length > 0 && !includes.includes(s.key)) return false
    return true
  })
}

function KanbanCard({ job, onEdit, onToggleFavorite, onDragStart, onDragEnd, accent, t }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, job)}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(job)}
      className="group bg-white border border-gray-200 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-indigo-300 hover:shadow-sm transition-all select-none"
      style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm text-gray-800 leading-tight truncate">{job.company}</p>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(job.id) }}
          className={`shrink-0 text-sm leading-none transition-colors ${job.favorite ? 'text-amber-400' : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-amber-400'}`}
          title={job.favorite ? 'Unfavorite' : 'Favorite'}
        >
          {job.favorite ? '⭐' : '☆'}
        </button>
      </div>
      {job.position && (
        <p className="text-xs text-gray-500 mt-0.5 mb-2 truncate">{job.position}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
          <span>🕒</span>{timeAgo(job, t)}
        </span>
        {job.location && (
          <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400 truncate max-w-[110px]">
            📍 {job.location}
          </span>
        )}
      </div>
    </div>
  )
}

export default function KanbanBoard({ jobs, filters, showArchived, onStatusChange, onEdit, onToggleFavorite, t = (k) => k }) {
  const [dragJob, setDragJob] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)

  const columns = visibleColumns(filters, showArchived)

  const handleDragStart = (e, job) => {
    setDragJob(job)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragEnd = () => { setDragJob(null); setDragOverKey(null) }

  const handleDrop = (statusKey) => {
    if (dragJob && dragJob.status !== statusKey) {
      onStatusChange(dragJob.id, statusKey)
    }
    setDragJob(null)
    setDragOverKey(null)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
      {columns.map(col => {
        const colJobs = jobs.filter(j => j.status === col.key)
        const isTarget = dragOverKey === col.key && dragJob && dragJob.status !== col.key
        const accent = col.key === 'interview' ? '#a855f7'
          : col.key === 'offer' || col.key === 'done' ? '#22c55e'
          : null
        return (
          <div
            key={col.key}
            onDragOver={(e) => { e.preventDefault(); setDragOverKey(col.key) }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOverKey(null) }}
            onDrop={() => handleDrop(col.key)}
            className={`flex flex-col w-[270px] shrink-0 rounded-xl border transition-colors ${
              isTarget ? 'border-indigo-400 bg-indigo-50/60' : 'border-gray-100 bg-gray-50/70'
            }`}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
              <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
              <span className="text-sm font-semibold text-gray-700">{getStatusLabel(col.key, t)}</span>
              <span className="ml-auto text-xs font-medium text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                {colJobs.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 p-2 min-h-[120px] flex-1">
              {colJobs.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[11px] text-gray-300 py-6 select-none">
                  {isTarget ? t('kanban.dropHere') || 'Drop here' : '—'}
                </div>
              ) : (
                colJobs.map(job => (
                  <KanbanCard
                    key={job.id}
                    job={job}
                    accent={accent}
                    onEdit={onEdit}
                    onToggleFavorite={onToggleFavorite}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    t={t}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
