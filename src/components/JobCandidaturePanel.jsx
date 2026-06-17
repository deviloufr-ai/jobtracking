import { useState } from 'react'
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
}) {
  const [activeTab, setActiveTab] = useState('overview')
  const [homeAddress] = useState(() => {
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

  const emailCount = history?.filter(h => h.source === 'email').length || 0

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
            <div className="inline-block bg-indigo-600 text-white px-3 py-1.5 rounded-full text-sm font-semibold">
              {job.score || '—'}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-indigo-200 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
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

          {/* CV/Letter Status */}
          {job.cvSaved && (
            <div className="bg-indigo-50 rounded-lg border border-indigo-200 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">📄</span>
                <span className="text-xs font-semibold text-indigo-700">CV adapté</span>
                <span className="text-[9px] text-indigo-600 ml-auto">{new Date(job.cvSaved.savedAt).toLocaleDateString('fr-FR')}</span>
              </div>
              <button
                onClick={() => onViewSavedCV?.(job)}
                className="w-full text-xs font-medium text-indigo-600 bg-white border border-indigo-200 px-2.5 py-1.5 rounded hover:bg-indigo-50 transition-colors"
              >
                View CV
              </button>
            </div>
          )}

          {job.letterSaved && (
            <div className="bg-orange-50 rounded-lg border border-orange-200 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">✍️</span>
                <span className="text-xs font-semibold text-orange-700">Letter</span>
                <span className="text-[9px] text-orange-600 ml-auto">{new Date(job.letterSaved.savedAt).toLocaleDateString('fr-FR')}</span>
              </div>
              <button
                onClick={() => {}}
                className="w-full text-xs font-medium text-orange-600 bg-white border border-orange-200 px-2.5 py-1.5 rounded hover:bg-orange-50 transition-colors"
              >
                View Letter
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
