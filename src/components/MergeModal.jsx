import { useState, useMemo } from 'react'
import { STATUSES, getStatus } from '../hooks/useJobs'

export default function MergeModal({ jobs, onConfirm, onCancel, t = (key) => key }) {
  const [primaryJobId, setPrimaryJobId] = useState(jobs[0]?.id)
  const [selectedFields, setSelectedFields] = useState({})

  const primaryJob = jobs.find(j => j.id === primaryJobId)
  const secondaryJobs = jobs.filter(j => j.id !== primaryJobId)

  const mergedJob = useMemo(() => {
    if (!primaryJob) return null

    const merged = { ...primaryJob }

    // Combine histories chronologically
    const allHistories = jobs.flatMap(j => j.history || [])
    merged.history = allHistories.sort((a, b) => new Date(a.date) - new Date(b.date))

    // Apply field selections (user can override which job's field to use)
    if (selectedFields.status && selectedFields.status !== primaryJobId) {
      const sourceJob = jobs.find(j => j.id === selectedFields.status)
      if (sourceJob) merged.status = sourceJob.status
    }

    return merged
  }, [primaryJob, jobs, selectedFields])

  const handleConfirm = () => {
    if (mergedJob) {
      onConfirm(mergedJob)
    }
  }

  const getFieldSourceLabel = (fieldName, sourceId) => {
    const sourceJob = jobs.find(j => j.id === sourceId)
    if (!sourceJob) return 'N/A'
    return `${sourceJob.company} - ${sourceJob.position}`
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
          <h2 className="text-xl font-bold text-gray-900">
            🔗 {t('merge.title') || 'Merge Candidatures'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t('merge.subtitle') || `Combine ${jobs.length} job applications`}
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Primary job selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              {t('merge.keepAs') || 'Keep as primary:'}
            </label>
            <div className="space-y-2">
              {jobs.map(job => (
                <label key={job.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    name="primaryJob"
                    value={job.id}
                    checked={primaryJobId === job.id}
                    onChange={(e) => setPrimaryJobId(e.target.value)}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm">{job.company}</div>
                    <div className="text-xs text-gray-500">{job.position}</div>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-semibold ${getStatus(job.status).color}`}>
                    {t(`status.${job.status}`) || getStatus(job.status).label}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Merged preview */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              {t('merge.preview') || 'Merged Result:'}
            </h3>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-600 font-semibold uppercase mb-1">Company</div>
                  <div className="font-semibold text-gray-900">{mergedJob?.company}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 font-semibold uppercase mb-1">Position</div>
                  <div className="font-semibold text-gray-900">{mergedJob?.position}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-600 font-semibold uppercase mb-1">Status</div>
                  <div className="flex items-center gap-2">
                    <div className={`px-2 py-1 rounded text-xs font-semibold ${getStatus(mergedJob?.status).color}`}>
                      {t(`status.${mergedJob?.status}`) || getStatus(mergedJob?.status).label}
                    </div>
                    {jobs.length > 1 && (
                      <select
                        value={selectedFields.status || primaryJobId}
                        onChange={(e) => setSelectedFields({ ...selectedFields, status: e.target.value })}
                        className="text-xs border border-gray-300 rounded px-2 py-1"
                      >
                        {jobs.map(job => (
                          <option key={job.id} value={job.id}>
                            {job.company} ({t(`status.${job.status}`) || getStatus(job.status).label})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 font-semibold uppercase mb-1">Total History</div>
                  <div className="font-semibold text-gray-900">{mergedJob?.history?.length || 0} entries</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-600 font-semibold uppercase mb-2">Combined History</div>
                <div className="bg-white rounded border border-gray-200 max-h-32 overflow-y-auto space-y-1 p-2">
                  {mergedJob?.history && mergedJob.history.length > 0 ? (
                    mergedJob.history.map((entry, i) => (
                      <div key={i} className="text-xs text-gray-700">
                        <span className="font-semibold text-gray-600">{entry.date}</span>
                        {' — '}
                        <span className="text-gray-600">{entry.note?.substring(0, 50)}...</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-gray-400 italic">No history entries</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-900">
              ℹ️ {t('merge.info') || 'The other applications will be deleted. All history entries will be combined chronologically.'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('common.cancel') || 'Cancel'}
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {t('merge.confirm') || 'Merge'}
          </button>
        </div>
      </div>
    </div>
  )
}
