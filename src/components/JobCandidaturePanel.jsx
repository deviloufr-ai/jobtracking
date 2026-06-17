import { useState, useEffect } from 'react'
import CommuteInfo from './CommuteInfo'

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
  upcomingEvents = [],
  recruiterContact = null,
  allContacts = [],
  companyAddr = '',
  onFetchAddress = null,
  fetchingAddr = false,
  addrError = null,
  onStartMockInterview = null,
  CVViewerComponent = null,
}) {
  const [activeTab, setActiveTab] = useState('overview')
  const [showCVViewer, setShowCVViewer] = useState(false)

  // Auto-show PDF viewer when CV tab is active and CV exists
  useEffect(() => {
    if (activeTab === 'cv' && job.cvSaved) {
      setShowCVViewer(true)
    }
  }, [activeTab, job.cvSaved])
  const [homeAddress] = useState(() => {
    try {
      const profile = JSON.parse(localStorage.getItem('jobtrackr_profile') || '{}')
      return profile.homeAddress || ''
    } catch {
      return ''
    }
  })

  // Derive status from the most recent history entry, fallback to job.status
  const getDisplayStatus = () => {
    if (history && history.length > 0) {
      // Find the most recent entry (history is in chronological order)
      const mostRecent = history[history.length - 1]
      return mostRecent.status || job.status
    }
    return job.status
  }
  const displayStatus = getDisplayStatus()

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'cv', label: 'CV', icon: '📄' },
    { id: 'letter', label: 'Cover Letter', icon: '✍️' },
    { id: 'interview', label: 'Interview', icon: '🎤' },
  ]

  const emailCount = history?.filter(h => h.source === 'email').length || 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Modern Header with job info and actions */}
      <div className="bg-gradient-to-br from-slate-50 via-indigo-50 to-violet-50 px-6 py-5 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">{job.company}</h2>
            <p className="text-sm text-gray-600 mt-0.5">{job.position}</p>
          </div>
          <div className="flex items-center gap-3 ml-4">
            <div className="inline-block bg-gradient-to-br from-indigo-500 to-violet-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md">
              {job.score || '—'}
            </div>
            {/* Edit and Delete buttons - Modern icon buttons */}
            <button
              onClick={() => onEdit()}
              title="Edit application"
              className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => onDelete()}
              title="Delete application"
              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modern Tabs */}
        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-all duration-200 rounded-t-lg ${
                activeTab === tab.id
                  ? 'text-indigo-600 bg-white border-b-2 border-indigo-500'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/40'
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2-Column Layout: Tabs + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 p-6">
        {/* Main Content - Tabs */}
        <div>
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Status</p>
                <p className="text-sm font-medium text-gray-900">{displayStatus}</p>
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
                <div className="space-y-2">
                  {[...history].reverse().map((entry, idx) => {
                    const reverseIdx = history.length - 1 - idx

                    // Status-based background colors (pale colors)
                    const getStatusBgColor = (status) => {
                      const statusColorMap = {
                        'interview': 'bg-blue-50 border-blue-200 hover:border-blue-300',
                        'reviewing': 'bg-orange-50 border-orange-200 hover:border-orange-300',
                        'sent': 'bg-green-50 border-green-200 hover:border-green-300',
                        'todo': 'bg-gray-50 border-gray-200 hover:border-gray-300',
                        'waiting': 'bg-yellow-50 border-yellow-200 hover:border-yellow-300',
                        'offer': 'bg-emerald-50 border-emerald-200 hover:border-emerald-300',
                        'rejected': 'bg-red-50 border-red-200 hover:border-red-300',
                        'done': 'bg-teal-50 border-teal-200 hover:border-teal-300',
                      }
                      return statusColorMap[status] || 'bg-gray-50 border-gray-200 hover:border-gray-300'
                    }

                    return (
                      <div key={idx} className={`rounded-lg p-3 border transition-colors ${getStatusBgColor(entry.status)}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-xs font-semibold text-gray-700">{formatDate(entry.date)}</span>
                            {(() => {
                              const statusBadgeMap = {
                                'interview': 'bg-blue-100 text-blue-700',
                                'reviewing': 'bg-orange-100 text-orange-700',
                                'sent': 'bg-green-100 text-green-700',
                                'todo': 'bg-gray-100 text-gray-700',
                                'waiting': 'bg-yellow-100 text-yellow-700',
                                'offer': 'bg-emerald-100 text-emerald-700',
                                'rejected': 'bg-red-100 text-red-700',
                                'done': 'bg-teal-100 text-teal-700',
                              }
                              const badgeClass = statusBadgeMap[entry.status] || 'bg-gray-100 text-gray-700'
                              return <span className={`text-xs px-2 py-1 rounded-full font-medium ${badgeClass}`}>{entry.status}</span>
                            })()}
                          </div>
                          <div className="flex gap-1.5 ml-2">
                            <button
                              title="Edit this entry"
                              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all"
                              onClick={() => {
                                // Edit functionality would go here
                                // For now, just a placeholder
                              }}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              title="Delete this entry"
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                              onClick={() => {
                                // Delete functionality would go here
                                // For now, just a placeholder
                              }}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700">{entry.note}</p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No timeline entries yet</p>
              )}

              <button
                onClick={() => onToggleAddStep()}
                className="w-full mt-3 text-xs font-semibold text-indigo-600 bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 px-3 py-2.5 rounded-lg hover:from-indigo-100 hover:to-violet-100 transition-all duration-200"
              >
                + Add step
              </button>
            </div>

          </div>
        )}

        {/* CV Tab */}
        {activeTab === 'cv' && (
          <div className="space-y-4 h-full flex flex-col">
            {job.cvSaved ? (
              <>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-indigo-900">Adapted CV</h4>
                    <p className="text-xs text-indigo-600">{new Date(job.cvSaved.savedAt).toLocaleDateString('en-US')}</p>
                  </div>
                  {onGenerateCV && (
                    <button
                      onClick={() => onGenerateCV(job)}
                      className="text-xs font-semibold text-indigo-600 bg-white border border-indigo-300 px-4 py-2 rounded-lg hover:bg-indigo-50 transition-all duration-200"
                    >
                      Regenerate
                    </button>
                  )}
                </div>
                {/* PDF Viewer - Embedded directly in tab */}
                {CVViewerComponent ? (
                  <div className="border border-gray-300 rounded-lg overflow-hidden bg-white flex-1">
                    {CVViewerComponent}
                  </div>
                ) : (
                  <div className="border border-gray-300 rounded-lg overflow-hidden bg-white flex-1" style={{ height: '650px' }}>
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <div className="text-center space-y-4">
                        <div className="text-5xl">📄</div>
                        <p className="text-gray-700 font-semibold">PDF CV Viewer</p>
                        <button
                          onClick={() => onViewSavedCV?.(job)}
                          className="text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-indigo-600 px-8 py-3 rounded-lg hover:from-indigo-600 hover:to-indigo-700 transition-all duration-200 shadow-md"
                        >
                          Open PDF Reader
                        </button>
                        <p className="text-xs text-gray-500">Full formatting and styling preserved</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-sm text-gray-500 mb-6">No CV yet for this application</p>
                {onGenerateCV && (
                  <button
                    onClick={() => onGenerateCV(job)}
                    className="text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-indigo-600 px-8 py-3 rounded-lg hover:from-indigo-600 hover:to-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg"
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
                      className="flex-1 text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 px-3 py-2.5 rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 shadow-sm"
                    >
                      View Letter
                    </button>
                    <button
                      onClick={() => {}}
                      className="flex-1 text-xs font-semibold text-orange-600 bg-white border border-orange-300 px-3 py-2.5 rounded-lg hover:bg-orange-50 transition-all duration-200"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-sm text-gray-500 mb-6">No cover letter yet for this application</p>
                <button
                  onClick={() => {}}
                  className="text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 px-8 py-3 rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 shadow-md hover:shadow-lg"
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
            <div className="text-center py-12">
              <p className="text-sm text-gray-500 mb-6">🎤 Practice your interview responses</p>
              <p className="text-xs text-gray-400 mb-6">AI-powered mock interview training tailored to this position</p>
              <button
                onClick={() => onStartMockInterview?.()}
                className="text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 px-8 py-3 rounded-lg hover:from-cyan-600 hover:to-blue-700 transition-all duration-200 shadow-md hover:shadow-lg"
              >
                🎤 Start Interview Training
              </button>
            </div>
          </div>
        )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Upcoming Events */}
          {upcomingEvents && upcomingEvents.length > 0 && (
            <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
              <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">À venir</h4>
              {upcomingEvents.slice(0, 2).map((event, i) => (
                <div key={i} className="flex items-start gap-2 mb-2 last:mb-0">
                  <span className="text-sm mt-0.5">📅</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-amber-900">{event.note}</p>
                    <p className="text-[11px] text-amber-600">{formatDate(event.date)}</p>
                  </div>
                  {event.meetingLink && (
                    <a href={event.meetingLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      className="shrink-0 text-[10px] font-semibold bg-amber-500 text-white px-2 py-1 rounded hover:bg-amber-600 transition-colors">
                      Rejoindre
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Contacts */}
          {allContacts && allContacts.length > 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contact{allContacts.length > 1 ? 's' : ''}</h4>
              <div className="space-y-2.5">
                {allContacts.map((contact, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {contact.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-800 truncate">{contact.name}</p>
                      <p className="text-[10px] text-gray-500 truncate">{contact.email}</p>
                      {contact.receivedBy && (
                        <p className="text-[10px] text-indigo-500 truncate">📬 {contact.receivedBy}</p>
                      )}
                    </div>
                    <a href={`mailto:${contact.email}`} onClick={e => e.stopPropagation()}
                      className="shrink-0 flex items-center justify-center w-5 h-5 text-gray-400 hover:text-indigo-600 rounded transition-colors"
                      title={`Email ${contact.email}`}>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Candidature Details */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Candidature</h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                <span className="text-gray-500">Position</span>
                <span className="font-medium text-gray-700 text-right max-w-[140px] truncate">{job.position}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                <span className="text-gray-500">Applied</span>
                <span className="font-medium text-gray-700">{formatDate(job.date)}</span>
              </div>
              {emailCount > 0 && (
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-gray-500">Emails</span>
                  <span className="font-medium text-gray-700">{emailCount}</span>
                </div>
              )}
              {history && history.length > 0 && (
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-gray-500">Steps</span>
                  <span className="font-medium text-gray-700">{history.length}</span>
                </div>
              )}
            </div>

            {/* Job URL */}
            {job.url && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <a href={job.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1.5 truncate">
                  <span>🔗</span>
                  <span className="truncate">{(() => { try { return new URL(job.url).hostname.replace('www.', '') } catch { return job.url } })()}</span>
                </a>
              </div>
            )}

            {/* Commute Time */}
            {companyAddr && homeAddress ? (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <CommuteInfo
                  homeAddress={homeAddress}
                  companyAddress={companyAddr}
                  companyName={job.company}
                />
              </div>
            ) : companyAddr && !homeAddress ? (
              <p className="text-[10px] text-gray-400 mt-3 pt-3 border-t border-gray-100">
                🚗 Add your address in Settings → Profile to see commute time
              </p>
            ) : (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={e => { e.stopPropagation(); onFetchAddress?.() }}
                  disabled={fetchingAddr}
                  className="inline-flex items-center gap-1.5 text-[10px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 rounded hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                >
                  {fetchingAddr
                    ? <><span className="w-2.5 h-2.5 border border-indigo-300 border-t-indigo-600 rounded-full animate-spin" /> Searching…</>
                    : <>🚗 Calculate commute</>}
                </button>
                {addrError && <p className="text-[10px] text-red-500 mt-1">{addrError}</p>}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
