import { useState, useEffect } from 'react'
import CommuteInfo from './CommuteInfo'
import { getStatus, getStatusLabel, STATUSES } from '../hooks/useJobs'
import { gmailMessageUrl, openGmailNative } from '../services/gmail'
import { ScoreBreakdown, scoreColorClasses } from './ScoreJob'
import CVGenerationSettings from './CVGenerationSettings'

// ATS keyword-coverage badge colors — mirrors the thresholds in CVGenerator's
// badge (≥90 green, ≥75 blue, else amber). Distinct from scoreColorClasses,
// which colors the recruiter *fit* score.
const atsColorClasses = (s) =>
  s >= 90 ? 'bg-green-100 text-green-700 border-green-300'
  : s >= 75 ? 'bg-blue-100 text-blue-700 border-blue-300'
  : 'bg-amber-100 text-amber-700 border-amber-300'

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
  onGenerateCoverLetter = null,
  onGenerateSTAR = null,
  CVViewerComponent = null,
}) {
  const [activeTab, setActiveTab] = useState('overview')
  const [showCVViewer, setShowCVViewer] = useState(false)
  const [editingStep, setEditingStep] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [showScoreDetails, setShowScoreDetails] = useState(false)

  // Auto-show PDF viewer when CV tab is active and CV exists
  useEffect(() => {
    if (activeTab === 'cv' && job.cvSaved) {
      setShowCVViewer(true)
    }
  }, [activeTab, job.cvSaved])

  // Reset editing state when history changes (e.g. after delete)
  useEffect(() => {
    setEditingStep(null)
    setEditForm({})
  }, [history?.length])
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
    { id: 'star', label: 'STAR', icon: '🎯' },
    { id: 'interview', label: 'Interview', icon: '🎤' },
  ]

  const emailCount = history?.filter(h => h.source === 'email').length || 0

  // The tailored-CV generator needs something to adapt to. Block generation when
  // the job has no description, no source URL and no notes.
  const hasJobDetails = !!(job.jobDescription || job.url || (job.notes && job.notes.trim()))

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
                      {STATUSES.map(s => <option key={s.key} value={s.key}>{getStatusLabel(s.key, t)}</option>)}
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
                <div className="relative overflow-visible">
                  {[...history].reverse().map((entry, idx) => {
                    const st = getStatus(entry.status)
                    const entryKey = `${entry.date}-${entry.status}-${(entry.note || '').slice(0, 20)}-${idx}`
                    const originalIdx = history.length - 1 - idx

                    const handleDeleteEntry = () => {
                      const updated = history.filter((_, i) => i !== originalIdx)
                      onUpdateHistory(job.id, updated)
                    }

                    const handleSaveEdit = () => {
                      const merged = { ...entry, ...editForm }
                      const updated = [...history]
                      updated[originalIdx] = merged
                      onUpdateHistory(job.id, updated)
                      setEditingStep(null)
                      setEditForm({})
                    }

                    const isMeeting = entry.source === 'calendar' || !!entry.meetingLink
                    // A meeting is "done" 1h after its start, at which point it greys out.
                    const isPastMeeting = isMeeting && (() => {
                      const start = entry.rawStart || (String(entry.date).includes('T') ? entry.date : null)
                      if (start) return new Date(start).getTime() + 60 * 60 * 1000 < Date.now()
                      const today = new Date(); today.setHours(0, 0, 0, 0)
                      return new Date(entry.date) < today
                    })()
                    const isUpcomingMeeting = isMeeting && !isPastMeeting
                    const sourceLabel = entry.source === 'calendar' ? '📅 Calendar' : entry.source === 'email' ? '📧 Email' : ''

                    return (
                      <div key={entryKey} className="flex gap-0 relative group/step mb-3">
                        {/* LEFT PANEL: Metadata */}
                        <div className="w-24 flex-shrink-0 bg-indigo-50/50 border border-r-0 border-indigo-100 rounded-l-xl px-3 py-2.5 flex flex-col items-center justify-start gap-1">
                          <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 border-2 border-white shadow-sm ${isPastMeeting ? 'bg-gray-300' : isUpcomingMeeting ? 'bg-amber-400' : st.dot}`} />
                          {isMeeting && <span className="text-lg">📅</span>}
                          <span className="text-[10px] font-semibold text-gray-700 text-center">{formatDate(entry.date)}</span>
                          {sourceLabel && <span className="text-[9px] text-gray-500 text-center truncate max-w-full">{sourceLabel}</span>}
                        </div>

                        {/* RIGHT PANEL: Content */}
                        <div className={`flex-1 bg-white border border-indigo-100 rounded-r-xl px-3 py-2.5 ${isPastMeeting ? 'opacity-50' : ''}`}>
                          {editingStep === originalIdx ? (
                            <div className="bg-gray-50 border border-indigo-200 rounded-lg p-3 space-y-2">
                              <div className="grid grid-cols-3 gap-2">
                                <select className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                  value={(editForm.status || entry.status)}
                                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                                  <option value="">Status</option>
                                  {STATUSES.map(s => <option key={s.key} value={s.key}>{getStatusLabel(s.key, t)}</option>)}
                                </select>
                                <input type="date" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                  value={((editForm.date || entry.date)?.split('T')[0] || '')}
                                  onChange={e => setEditForm(f => {
                                    const currentDate = editForm.date || entry.date
                                    const time = currentDate?.split('T')[1] || ''
                                    return { ...f, date: time ? `${e.target.value}T${time}` : e.target.value }
                                  })} />
                                <input type="time" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                  value={((editForm.date || entry.date)?.split('T')[1] || '').slice(0, 5)}
                                  onChange={e => setEditForm(f => {
                                    const currentDate = editForm.date || entry.date
                                    const datePart = currentDate?.split('T')[0] || ''
                                    return { ...f, date: e.target.value ? `${datePart}T${e.target.value}:00` : datePart }
                                  })} />
                              </div>
                              <input className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                placeholder="Note"
                                value={editForm.note !== undefined ? editForm.note : (entry.note || '')}
                                onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} />
                              <input className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                placeholder="🔗 Meeting link (optional)"
                                value={editForm.meetingLink !== undefined ? editForm.meetingLink : (entry.meetingLink || '')}
                                onChange={e => setEditForm(f => ({ ...f, meetingLink: e.target.value }))} />
                              <div className="flex justify-end gap-2">
                                <button onClick={() => { setEditingStep(null); setEditForm({}) }}
                                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100">Cancel</button>
                                <button onClick={handleSaveEdit}
                                  className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700">Save</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* Status Badge + Edit/Delete Actions */}
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isPastMeeting ? 'bg-gray-100 text-gray-400' : isUpcomingMeeting ? 'bg-amber-100 text-amber-700' : st.color}`}>
                                  {isPastMeeting ? '✓ Done' : isUpcomingMeeting ? '📅 Upcoming' : getStatusLabel(entry.status, t)}
                                </span>
                                <div className="flex gap-1 items-center flex-shrink-0">
                                  <button
                                    title="Edit this entry"
                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all"
                                    onClick={() => {
                                      setEditingStep(originalIdx)
                                      setEditForm({ status: entry.status, date: entry.date, note: entry.note || '', meetingLink: entry.meetingLink || '' })
                                    }}
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    title="Delete this entry"
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      handleDeleteEntry()
                                    }}
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              </div>

                              {/* Notes — split multi-part notes into bullets */}
                              {entry.note && (entry.note.includes(' · ') || entry.note.includes(' — ')) ? (
                                <ul className="mb-1.5 space-y-0.5">
                                  {entry.note.split(/ · | — /).filter(Boolean).map((line, li) => (
                                    <li key={li} className="flex gap-1.5 text-xs text-gray-600">
                                      <span className="text-gray-300 flex-shrink-0 mt-0.5">•</span>
                                      <span>{line.trim()}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : entry.note ? (
                                <p className={`text-xs mb-1.5 ${entry.source === 'calendar' ? 'text-gray-400 italic' : 'text-gray-600'}`}>{entry.note}</p>
                              ) : null}

                              {/* Action Links */}
                              {(entry.meetingLink || entry.gmailId || entry.gmailIds?.length || (entry.source === 'calendar' && !entry.meetingLink)) && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  {entry.meetingLink && !isPastMeeting && (
                                    <a href={entry.meetingLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                      className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 px-2.5 py-1 rounded-lg transition-colors">
                                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                      Join {entry.meetingPlatform || 'meeting'} ↗
                                    </a>
                                  )}
                                  {entry.source === 'calendar' && !entry.meetingLink && (
                                    <span className="text-xs text-gray-400">📅 Google Calendar</span>
                                  )}
                                  {(() => {
                                    const ids = entry.gmailIds || (entry.gmailId ? [entry.gmailId] : [])
                                    if (ids.length === 0) return null
                                    const { url, account, uncertain } = gmailMessageUrl(ids[0], entry.receivedBy)
                                    return (
                                      <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => { e.stopPropagation(); if (openGmailNative(url)) e.preventDefault() }}
                                        className={`inline-flex items-center gap-1 text-xs transition-colors ${uncertain ? 'text-amber-400 hover:text-amber-600' : 'text-gray-400 hover:text-red-500'}`}
                                        title={uncertain ? '⚠ Uncertain account' : `${ids.length > 1 ? `${ids.length} emails` : 'Email'} in ${account || 'Gmail'}`}>
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.909 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
                                        Email
                                        {ids.length > 1 && <span className="ml-0.5 px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-[10px] font-semibold">{ids.length}</span>}
                                        {account && <span className="text-[9px] opacity-60">({account.split('@')[0]})</span>}
                                        {uncertain && <span className="text-[9px]">⚠</span>}
                                      </a>
                                    )
                                  })()}
                                </div>
                              )}
                            </>
                          )}
                        </div>
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
            {/* Generation settings (base CV, ATS level, rules) — read by the
                generator at generation time. Collapsed once a CV exists. */}
            <CVGenerationSettings t={t} defaultOpen={!job.cvSaved} />
            {job.cvSaved ? (
              <>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-indigo-900">Adapted CV</h4>
                    <p className="text-xs text-indigo-600">{new Date(job.cvSaved.savedAt).toLocaleDateString('en-US')}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {onViewSavedCV && (
                      <button
                        onClick={() => onViewSavedCV(job)}
                        title="Open the full CV generator to edit the template, content and skills"
                        className="text-xs font-semibold text-white bg-indigo-600 border border-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all duration-200"
                      >
                        ✏️ Edit CV
                      </button>
                    )}
                    {onGenerateCV && (
                      <button
                        onClick={() => onGenerateCV(job)}
                        disabled={!hasJobDetails}
                        title={hasJobDetails ? '' : 'Add a job description, URL or notes to generate a tailored CV'}
                        className="text-xs font-semibold text-indigo-600 bg-white border border-indigo-300 px-4 py-2 rounded-lg hover:bg-indigo-50 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Regenerate
                      </button>
                    )}
                  </div>
                </div>
                {/* PDF Viewer - Embedded directly in tab */}
                {CVViewerComponent ? (
                  <div className="border border-gray-300 rounded-lg overflow-hidden bg-white" style={{ height: '750px' }}>
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
                    disabled={!hasJobDetails}
                    title={hasJobDetails ? '' : 'Add a job description, URL or notes to generate a tailored CV'}
                    className="text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-indigo-600 px-8 py-3 rounded-lg hover:from-indigo-600 hover:to-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-indigo-500 disabled:hover:to-indigo-600"
                  >
                    📄 Generate Tailored CV
                  </button>
                )}
                {!hasJobDetails && (
                  <p className="text-xs text-gray-400 mt-3">Add a job description, URL or notes first to generate a tailored CV.</p>
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
                      onClick={() => onGenerateCoverLetter?.()}
                      className="flex-1 text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 px-3 py-2.5 rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 shadow-sm"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => onGenerateCoverLetter?.()}
                      className="flex-1 text-xs font-semibold text-orange-600 bg-white border border-orange-300 px-3 py-2.5 rounded-lg hover:bg-orange-50 transition-all duration-200"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
                {/* Letter content shown inline in the tab (mirrors the embedded CV viewer above) */}
                <div className="border border-gray-300 rounded-lg overflow-auto bg-white p-6" style={{ height: '750px' }}>
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700 leading-relaxed">
                    {job.letterSaved.content}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-sm text-gray-500 mb-6">No cover letter yet for this application</p>
                <button
                  onClick={() => onGenerateCoverLetter?.()}
                  className="text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 px-8 py-3 rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  ✍️ Generate Cover Letter
                </button>
              </div>
            )}
          </div>
        )}

        {/* Interview Tab */}
        {activeTab === 'star' && (
          <div className="space-y-4">
            {job.starSaved?.stars?.length > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-800">🎯 STAR Answers</h4>
                    {job.starSaved.savedAt && <p className="text-xs text-gray-400">{new Date(job.starSaved.savedAt).toLocaleDateString()}</p>}
                  </div>
                  {onGenerateSTAR && (
                    <button onClick={onGenerateSTAR} className="text-xs font-semibold text-indigo-600 bg-white border border-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                      ↻ Regenerate
                    </button>
                  )}
                </div>
                {job.starSaved.stars.map((s, i) => {
                  const isEn = job.starSaved.lang === 'en'
                  return (
                    <div key={i} className="border border-gray-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-gray-800 mb-2">{i + 1}. {s.question}</p>
                      <div className="space-y-1.5">
                        {[['S', 'Situation', 'bg-blue-50 text-blue-700'], ['T', isEn ? 'Task' : 'Tâche', 'bg-violet-50 text-violet-700'], ['A', 'Action', 'bg-amber-50 text-amber-700'], ['R', isEn ? 'Result' : 'Résultat', 'bg-green-50 text-green-700']].map(([k, label, cls]) => (
                          <div key={k} className="flex gap-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${cls}`}>{label}</span>
                            <p className="text-sm text-gray-700 leading-relaxed">{s[k]}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-sm text-gray-500 mb-6">No STAR answers saved yet for this application</p>
                {onGenerateSTAR && (
                  <button onClick={onGenerateSTAR} className="text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 px-8 py-3 rounded-lg hover:brightness-105 transition-all duration-200 shadow-md">
                    🎯 Generate STAR Answers
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'interview' && (
          <div className="space-y-4">
            {/* Past Sessions */}
            {job.interviewSessions && job.interviewSessions.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-gray-800">📊 Practice History</h4>
                {job.interviewSessions.map((session, idx) => (
                  <div key={idx} className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-sm text-gray-800">
                          {new Date(session.date).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(session.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-purple-600">{session.score}</div>
                        <p className={`text-xs font-bold ${
                          session.hire_decision === 'Yes' ? 'text-green-700' :
                          session.hire_decision === 'No' ? 'text-red-700' :
                          'text-orange-700'
                        }`}>
                          {session.hire_decision === 'Yes' ? '✅ Move Forward' :
                           session.hire_decision === 'No' ? '❌ Not Ready' :
                           '⏳ On The Fence'}
                        </p>
                      </div>
                    </div>
                    {session.feedback?.strengths && (
                      <p className="text-xs text-gray-600 mb-1">
                        <strong className="text-green-700">Strengths:</strong> {Array.isArray(session.feedback.strengths) ? session.feedback.strengths.join('; ') : session.feedback.strengths}
                      </p>
                    )}
                    {session.feedback?.concerns && (
                      <p className="text-xs text-gray-600">
                        <strong className="text-red-700">Concerns:</strong> {Array.isArray(session.feedback.concerns) ? session.feedback.concerns.join('; ') : session.feedback.concerns}
                      </p>
                    )}
                    {session.feedback?.weak_example && (
                      <p className="text-xs text-gray-600 mt-1">
                        <strong className="text-orange-700">Weak moment:</strong> <span className="italic">&ldquo;{session.feedback.weak_example}&rdquo;</span>
                      </p>
                    )}
                    {session.feedback?.better_answer && (
                      <p className="text-xs text-gray-600 mt-1">
                        <strong className="text-blue-700">Better answer:</strong> {session.feedback.better_answer}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Start New Interview */}
            <div className={`text-center ${job.interviewSessions?.length > 0 ? 'py-6' : 'py-12'}`}>
              <p className="text-sm text-gray-500 mb-4">🎤 Practice your interview responses</p>
              <p className="text-xs text-gray-400 mb-6">AI-powered mock interview training tailored to this position</p>
              <button
                onClick={() => onStartMockInterview?.()}
                className="text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 px-8 py-3 rounded-lg hover:from-cyan-600 hover:to-blue-700 transition-all duration-200 shadow-md hover:shadow-lg"
              >
                🎤 {job.interviewSessions?.length > 0 ? 'Practice Again' : 'Start Interview Training'}
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

            {/* Match Score — expandable breakdown */}
            {(job.score !== null && job.score !== undefined) && (
              <div className="mb-3 pb-3 border-b border-gray-100">
                <button
                  onClick={() => setShowScoreDetails(v => !v)}
                  disabled={!job.scoreDetails}
                  className="w-full flex items-center justify-between gap-2 group disabled:cursor-default"
                >
                  <span className="text-xs text-gray-500" title={t('scoreJob.matchHint')}>{t('scoreJob.title') || 'Match score'}</span>
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${scoreColorClasses(job.score)}`}>
                      {Math.round(job.score)}
                    </span>
                    {job.scoreDetails && (
                      <svg
                        className={`w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 transition-transform ${showScoreDetails ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </span>
                </button>
                {/* ATS keyword-coverage of the generated CV — the number the CV
                    optimization actually moves (vs. the fit score above). */}
                {job.cvSaved?.atsScore != null && (
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500" title={t('scoreJob.atsHint')}>🎯 {t('scoreJob.atsTitle')}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${atsColorClasses(job.cvSaved.atsScore)}`}>
                      {Math.round(job.cvSaved.atsScore)}
                    </span>
                  </div>
                )}
                {showScoreDetails && job.scoreDetails && (
                  <div className="mt-3">
                    <ScoreBreakdown job={job} t={t} />
                  </div>
                )}
              </div>
            )}

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

            {/* Job URL — "Apply" while still a lead, "See job description" once sent */}
            {job.url && (() => {
              const notSentYet = displayStatus === 'todo'
              // Some stored URLs have no scheme (extension/manual entry); a
              // protocol-less href is treated as relative and won't open the JD.
              const href = /^https?:\/\//i.test(job.url) ? job.url : `https://${job.url}`
              return (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                    className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                      notSentYet
                        ? 'text-white bg-indigo-600 hover:bg-indigo-700'
                        : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200'
                    }`}>
                    <span>{notSentYet ? t('candidature.apply') : t('candidature.viewOffer')}</span>
                    <span>↗</span>
                  </a>
                </div>
              )
            })()}

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
