import { useState } from 'react'
import { STATUSES, getStatus } from '../hooks/useJobs'

export default function JobRow({ job, onEdit, onDelete, onStatusChange }) {
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const status = getStatus(job.status)

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <tr className={`border-b border-gray-50 hover:bg-gray-50/60 transition-colors group ${job.status === 'cancelled' ? 'opacity-50' : ''}`}>
      {/* Company + Position */}
      <td className="py-3.5 px-4">
        <div className="font-medium text-gray-800 text-sm">{job.company}</div>
        <div className="text-xs text-gray-500 mt-0.5">{job.position}</div>
      </td>

      {/* Status */}
      <td className="py-3.5 px-4">
        <div className="relative">
          <button
            onClick={() => setShowStatusMenu(v => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer ${status.color} hover:opacity-80 transition-opacity`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
            <span className="text-xs opacity-60">▾</span>
          </button>
          {showStatusMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
              <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 min-w-[180px]">
                {STATUSES.map(s => (
                  <button
                    key={s.key}
                    onClick={() => { onStatusChange(job.id, s.key); setShowStatusMenu(false) }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-left ${s.key === job.status ? 'font-semibold' : ''}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                    {s.label}
                    {s.key === job.status && <span className="ml-auto text-indigo-500">✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </td>

      {/* Date */}
      <td className="py-3.5 px-4 text-xs text-gray-500 whitespace-nowrap">
        {formatDate(job.date)}
      </td>

      {/* Notes */}
      <td className="py-3.5 px-4 max-w-xs">
        {job.notes
          ? <span className="text-xs text-gray-500 line-clamp-1">{job.notes}</span>
          : <span className="text-xs text-gray-300">—</span>
        }
      </td>

      {/* URL */}
      <td className="py-3.5 px-4">
        {job.url
          ? <a href={job.url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline">
              Voir l'offre ↗
            </a>
          : <span className="text-xs text-gray-300">—</span>
        }
      </td>

      {/* Actions */}
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(job)}
            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Modifier"
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(job)}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Supprimer"
          >
            🗑️
          </button>
        </div>
      </td>
    </tr>
  )
}
