import { useState } from 'react'

export default function JobCandidaturePanel({
  job,
  onGenerateCV,
  onViewSavedCV,
  onEdit,
  onDelete,
  onUpdateJob,
  onAddStep,
  onUpdateHistory,
  enriching,
  enrichResult,
  onSync,
  history,
  showAddStep,
  onToggleAddStep,
  newStep,
  setNewStep,
  onAddStepSubmit,
  onCheckPosition,
  positionStatus,
  checkingPosition,
  onUseCase,
  showUseCase,
  formatDate,
  t = (key) => key,
}) {
  const [activeTab, setActiveTab] = useState('overview')
  const [homeAddress, setHomeAddress] = useState(() => {
    try {
      const profile = JSON.parse(localStorage.getItem('jobtrackr_profile') || '{}')
      return profile.homeAddress || ''
    } catch {
      return ''
    }
  })

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'cv', label: 'CV', icon: '📄' },
    { id: 'letter', label: 'Cover Letter', icon: '✍️' },
    { id: 'interview', label: 'Interview', icon: '🎤' },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Header with job info */}
      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 px-6 py-4 border-b border-indigo-100">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{job.company}</h2>
            <p className="text-sm text-gray-600">{job.position}</p>
          </div>
          <div className="text-right">
            <div className="inline-block bg-indigo-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
              {job.score || '—'}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-indigo-200">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-700 bg-white/50'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Status</p>
                <p className="text-sm font-medium text-gray-900">{job.status}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Applied</p>
                <p className="text-sm font-medium text-gray-900">{formatDate(job.date)}</p>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Timeline</h3>
              {showAddStep && (
                <div className="mb-4 bg-indigo-50 rounded-xl p-4 border border-indigo-200 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      className="text-xs border border-gray-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newStep.status}
                      onChange={e => setNewStep(s => ({ ...s, status: e.target.value }))}
                    >
                      <option value="">Status</option>
                    </select>
                    <input
                      type="date"
                      className="text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newStep.date}
                      onChange={e => setNewStep(s => ({ ...s, date: e.target.value }))}
                    />
                    <input
                      type="time"
                      className="text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newStep.time || ''}
                      onChange={e => setNewStep(s => ({ ...s, time: e.target.value }))}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Note (e.g., HR Interview - 45min with Marie)"
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newStep.note}
                    onChange={e => setNewStep(s => ({ ...s, note: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') onAddStepSubmit() }}
                    autoFocus
                  />
                  <input
                    type="text"
                    placeholder="🔗 Meeting link (Meet, Zoom, Teams...)"
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newStep.meetingLink || ''}
                    onChange={e => setNewStep(s => ({ ...s, meetingLink: e.target.value }))}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => onToggleAddStep()}
                      className="text-xs text-gray-600 hover:text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={onAddStepSubmit}
                      disabled={!newStep.note.trim()}
                      className="text-xs bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              {history && history.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {[...history].reverse().map((entry, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-700">{formatDate(entry.date)}</span>
                        <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">{entry.status}</span>
                      </div>
                      <p className="text-sm text-gray-700">{entry.note}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No timeline entries yet</p>
              )}

              <button
                onClick={() => onToggleAddStep()}
                className="w-full mt-3 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                + Add step
              </button>
            </div>

            {/* Job link */}
            {job.url && (
              <div className="pt-4 border-t border-gray-200">
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1.5"
                >
                  <span>🔗</span>
                  <span>{(() => { try { return new URL(job.url).hostname.replace('www.', '') } catch { return job.url } })()}</span>
                </a>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-4 border-t border-gray-200">
              <button
                onClick={() => onEdit(job)}
                className="w-full text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                ✏️ Edit application
              </button>
              <button
                onClick={() => onDelete(job)}
                className="w-full text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-lg hover:bg-red-100 transition-colors"
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        )}

        {/* CV Tab */}
        {activeTab === 'cv' && (
          <div className="space-y-4">
            {job.cvSaved ? (
              <>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-indigo-900">Adapted CV</h4>
                      <p className="text-xs text-indigo-600">{new Date(job.cvSaved.savedAt).toLocaleDateString('en-US')}</p>
                    </div>
                    <span className="text-2xl">📄</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onViewSavedCV && onViewSavedCV(job)}
                      className="flex-1 text-xs font-medium text-indigo-600 bg-white border border-indigo-300 px-3 py-2.5 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      View CV
                    </button>
                    {onGenerateCV && (
                      <button
                        onClick={() => onGenerateCV(job)}
                        className="flex-1 text-xs font-medium text-violet-600 bg-white border border-violet-300 px-3 py-2.5 rounded-lg hover:bg-violet-50 transition-colors"
                      >
                        Regenerate
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500 mb-4">No CV yet for this application</p>
                {onGenerateCV && (
                  <button
                    onClick={() => onGenerateCV(job)}
                    className="text-sm font-medium text-white bg-indigo-600 px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    📄 Generate Tailored CV
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Cover Letter Tab */}
        {activeTab === 'letter' && (
          <div className="space-y-4">
            {job.letterSaved ? (
              <>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-orange-900">Cover Letter</h4>
                      <p className="text-xs text-orange-600">{new Date(job.letterSaved.savedAt).toLocaleDateString('en-US')}</p>
                    </div>
                    <span className="text-2xl">✍️</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {}}
                      className="flex-1 text-xs font-medium text-orange-600 bg-white border border-orange-300 px-3 py-2.5 rounded-lg hover:bg-orange-50 transition-colors"
                    >
                      View Letter
                    </button>
                    <button
                      onClick={() => {}}
                      className="flex-1 text-xs font-medium text-orange-600 bg-white border border-orange-300 px-3 py-2.5 rounded-lg hover:bg-orange-50 transition-colors"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500 mb-4">No cover letter yet for this application</p>
                <button
                  onClick={() => {}}
                  className="text-sm font-medium text-white bg-orange-600 px-6 py-2.5 rounded-lg hover:bg-orange-700 transition-colors"
                >
                  ✍️ Generate Cover Letter
                </button>
              </div>
            )}
          </div>
        )}

        {/* Interview Tab */}
        {activeTab === 'interview' && (
          <div className="space-y-4">
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 mb-4">Prepare for your interview</p>
              <button
                onClick={() => {}}
                className="text-sm font-medium text-white bg-cyan-600 px-6 py-2.5 rounded-lg hover:bg-cyan-700 transition-colors"
              >
                🎤 Start Interview Training
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
