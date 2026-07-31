import { useMemo } from 'react'
import { getStatus, getStatusLabel } from '../hooks/useJobs'
import { groupJobsByPlatform } from '../services/jobPlatform'
import CompanyAvatar from './CompanyAvatar'

// Last-activity date of a job: the chronologically latest history entry, falling
// back to the application date. Mirrors the sort key used in the table view.
function lastActivity(job) {
  if (!job.history?.length) return job.date
  return job.history.reduce((latest, h) => (new Date(h.date) > new Date(latest) ? h.date : latest), job.history[0].date)
}

function fmtDate(dateStr, language) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return ''
  return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: '2-digit', month: 'short' })
}

// One candidature line inside a platform card.
function CandidatureRow({ job, onOpen, language }) {
  const status = getStatus(job.status)
  return (
    <button
      onClick={() => onOpen(job)}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-gray-50 active:scale-[0.99] transition-all text-left"
    >
      <CompanyAvatar company={job.company} sizeClass="w-7 h-7" textClass="text-[10px]" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900 truncate">{job.position || '—'}</div>
        <div className="text-xs text-gray-400 truncate">{job.company}</div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${status.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          {getStatusLabel(job.status)}
        </span>
        <span className="text-[10px] text-gray-300">{fmtDate(lastActivity(job), language)}</span>
      </div>
    </button>
  )
}

// One platform card: header (badge + name + count + share bar) then the list
// of candidatures that came through this platform.
function PlatformCard({ platform, jobs, total, onOpen, language, t }) {
  const share = total > 0 ? Math.round((jobs.length / total) * 100) : 0
  const sorted = useMemo(
    () => [...jobs].sort((a, b) => new Date(lastActivity(b)) - new Date(lastActivity(a))),
    [jobs]
  )
  const label = platform.id === 'direct' ? (t('platformView.direct') || platform.label) : platform.label

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      <div className="p-4 pb-3 border-b border-gray-50">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-lg flex-shrink-0">
            {platform.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-900 truncate">{label}</div>
            <div className="text-xs text-gray-400">
              {jobs.length} {jobs.length > 1 ? (t('platformView.candidatures') || 'applications') : (t('platformView.candidature') || 'application')}
              <span className="text-gray-300"> · {share}%</span>
            </div>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${share}%` }} />
        </div>
      </div>
      <div className="p-1.5 space-y-0.5 max-h-96 overflow-y-auto">
        {sorted.map(job => (
          <CandidatureRow key={job.id} job={job} onOpen={onOpen} language={language} />
        ))}
      </div>
    </div>
  )
}

// "Platforms" tracker view — groups the (already-filtered) candidatures by the
// platform they came through (LinkedIn, Jobgether, HelloWork, an ATS, …), so the
// user can see at a glance how their applications are spread across job boards.
export default function PlatformView({ jobs = [], onOpen, language = 'en', t = (k) => k }) {
  const groups = useMemo(() => groupJobsByPlatform(jobs), [jobs])
  const total = jobs.length

  if (total === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-16">
        <div className="text-4xl mb-3">🌐</div>
        <p className="text-gray-500 font-medium">{t('platformView.empty') || 'No applications to group by platform yet'}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
        <span className="font-semibold text-gray-700">{groups.length}</span>
        <span>{groups.length > 1 ? (t('platformView.platforms') || 'platforms') : (t('platformView.platform') || 'platform')}</span>
        <span className="text-gray-300">·</span>
        <span className="font-semibold text-gray-700">{total}</span>
        <span>{total > 1 ? (t('platformView.candidatures') || 'applications') : (t('platformView.candidature') || 'application')}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        {groups.map(({ platform, jobs: groupJobs }) => (
          <PlatformCard
            key={platform.id}
            platform={platform}
            jobs={groupJobs}
            total={total}
            onOpen={onOpen}
            language={language}
            t={t}
          />
        ))}
      </div>
    </div>
  )
}
