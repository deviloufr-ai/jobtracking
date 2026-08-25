// CandidatureDrawer — simplified candidature detail for the E layout's drawer.
//
// Follows the mockup: a clean single column — identity header, tabs
// (Overview / CV / Cover letter / Interview), then per-tab content. Overview is
// two stat cards + a plain vertical timeline + primary actions. Drops the classic
// panel's dense metadata sidebar (contacts / ATS / commute) in favour of clarity,
// while still wiring the real generators (CV, cover letter, mock interview) and
// the timeline add-step. Kept self-contained so the classic layout is untouched.
import { useState } from 'react'
import { STATUSES, getStatus, getStatusLabel } from '../../hooks/useJobs'
import { gmailMessageUrl } from '../../services/gmail'
import { scoreColorClasses } from '../ScoreJob'
import CVViewer from '../CVViewer'
import MotivationLetterGenerator from '../MotivationLetterGenerator'
import MockInterviewChatbot from '../MockInterviewChatbot'

const PALETTE = ['#4f46e5', '#2563eb', '#0d9488', '#d97706', '#db2777', '#7c3aed', '#dc2626', '#059669']
const colorFor = (s = '') => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length]
const initials = (s = '') =>
  s.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
const shortDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')
const fullDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const nowStep = (status) => {
  const n = new Date()
  return { status, note: '', date: n.toISOString().split('T')[0], time: `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}` }
}

const TABS = [['overview', 'Overview'], ['cv', 'CV'], ['letter', 'Cover letter'], ['interview', 'Interview']]

function Stat({ label, value }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-base font-semibold text-gray-900 mt-0.5 truncate">{value}</div>
    </div>
  )
}

const btn = 'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors'
const btnP = 'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white hover:brightness-105 transition'

export default function CandidatureDrawer({
  job,
  onClose,
  onEdit,
  onDelete,
  onUpdateJob,
  onAddStep,
  onGenerateCV,
  onViewSavedCV,
  onSTAR,
  onDraftEmail,
  t = (k) => k,
}) {
  const history = job.history || []
  const displayStatus = history.length ? (history[history.length - 1].status || job.status) : job.status
  const source = job.source || job.platform || job.site || null
  const emailCount = history.filter(h => h.source === 'email').length

  const [tab, setTab] = useState('overview')
  const [showLetter, setShowLetter] = useState(false)
  const [showMock, setShowMock] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [step, setStep] = useState(() => nowStep(displayStatus))

  const submitStep = () => {
    if (!step.note.trim()) return
    onAddStep?.(job.id, { ...step, date: step.time ? `${step.date}T${step.time}:00` : step.date })
    setStep(nowStep(job.status))
    setAddOpen(false)
  }

  return (
    <div className="flex flex-col">
      {/* ── Sticky identity header + tabs ─────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white px-5 pt-4 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: colorFor(job.company) }}>
            {initials(job.company)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 tracking-tight truncate">{job.company}</h2>
                <p className="text-sm text-gray-400 truncate">{job.position}</p>
              </div>
              {typeof job.score === 'number' && (
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border shrink-0 ${scoreColorClasses(job.score)}`}>{job.score}</span>
              )}
              <button onClick={() => onEdit?.(job)} aria-label="edit" className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center shrink-0">✎</button>
              <button onClick={() => onDelete?.(job)} aria-label="delete" className="w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center shrink-0">🗑</button>
              <button onClick={onClose} aria-label="close" className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center shrink-0">✕</button>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${getStatus(displayStatus)?.color || 'bg-gray-100 text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${getStatus(displayStatus)?.dot || 'bg-gray-400'}`} />
                {getStatusLabel(displayStatus, t)}
              </span>
              {source && <span className="text-xs text-gray-400">via {source}</span>}
              {job.date && <span className="text-xs text-gray-400">{source ? '· ' : ''}{shortDate(job.date)}</span>}
            </div>
          </div>
        </div>

        <div className="flex gap-1 mt-3 -mb-px">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3 py-2 text-sm font-semibold border-b-2 transition-colors ${tab === id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <div className="px-5 py-5">
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <Stat label="Match score" value={typeof job.score === 'number' ? `${job.score}%` : '—'} />
              <Stat label="Applied" value={job.date ? fullDate(job.date) : '—'} />
              <Stat label="Emails" value={emailCount} />
            </div>

            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Timeline</h3>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400">No steps yet.</p>
            ) : (
              <ul className="mb-2">
                {[...history].reverse().map((h, i, arr) => (
                  <li key={i} className="relative pl-6 pb-4 last:pb-0">
                    {i < arr.length - 1 && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-gray-200" />}
                    <span className={`absolute left-0 top-1 w-3 h-3 rounded-full ring-4 ring-white ${getStatus(h.status)?.dot || 'bg-gray-400'}`} />
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${getStatus(h.status)?.color || 'bg-gray-100 text-gray-500'}`}>
                        {getStatusLabel(h.status, t)}
                      </span>
                      <span className="text-xs text-gray-400">{fullDate(h.date)}</span>
                    </div>
                    {h.note && <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-line leading-relaxed">{h.note}</p>}
                    {(() => {
                      const ids = h.gmailIds || (h.gmailId ? [h.gmailId] : [])
                      if (!ids.length) return null
                      const { url, account, uncertain } = gmailMessageUrl(ids[0], h.receivedBy)
                      return (
                        <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          className={`inline-flex items-center gap-1 text-xs mt-1.5 font-medium transition-colors ${uncertain ? 'text-amber-500 hover:text-amber-600' : 'text-gray-400 hover:text-red-500'}`}
                          title={account ? `Open in ${account}` : 'Open email'}>
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.909 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" /></svg>
                          Open email{ids.length > 1 ? ` (${ids.length})` : ''}
                        </a>
                      )
                    })()}
                  </li>
                ))}
              </ul>
            )}

            {addOpen ? (
              <div className="rounded-xl bg-indigo-50/60 border border-indigo-100 p-3 space-y-2.5 mt-2">
                <div className="flex gap-2">
                  <select value={step.status} onChange={e => setStep({ ...step, status: e.target.value })}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white">
                    {STATUSES.map(s => <option key={s.key} value={s.key}>{getStatusLabel(s.key, t)}</option>)}
                  </select>
                  <input type="date" value={step.date} onChange={e => setStep({ ...step, date: e.target.value })}
                    className="text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white" />
                </div>
                <textarea value={step.note} onChange={e => setStep({ ...step, note: e.target.value })} rows={2} placeholder="Note…"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white resize-none" />
                <div className="flex gap-2">
                  <button onClick={submitStep} disabled={!step.note.trim()} className={`${btnP} disabled:opacity-40`}>Add</button>
                  <button onClick={() => setAddOpen(false)} className={btn}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddOpen(true)} className="text-sm font-medium text-indigo-600 hover:underline mt-1">+ Add step</button>
            )}

            <div className="flex gap-2 flex-wrap mt-6 pt-5 border-t border-gray-100">
              <button className={btnP} onClick={() => onGenerateCV?.(job)}>Generate CV</button>
              <button className={btn} onClick={() => onSTAR?.(job)}>STAR prep</button>
              <button className={btn} onClick={() => onDraftEmail?.(job, 'relance')}>Draft email</button>
            </div>
          </>
        )}

        {tab === 'cv' && (
          <div className="space-y-4">
            {job.cvSaved ? (
              <>
                <div className="flex gap-2">
                  <button className={btnP} onClick={() => onViewSavedCV?.(job)}>View CV</button>
                  <button className={btn} onClick={() => onGenerateCV?.(job)}>Regenerate</button>
                </div>
                <div className="cv-paper rounded-xl border border-gray-200 overflow-hidden">
                  <CVViewer job={job} inline onClose={() => {}} onUpdate={onUpdateJob} t={t} />
                </div>
              </>
            ) : (
              <div className="text-center py-10">
                <p className="text-sm text-gray-500 mb-4">No tailored CV yet — generate one adapted to this offer.</p>
                <button className={btnP} onClick={() => onGenerateCV?.(job)}>Generate CV</button>
              </div>
            )}
          </div>
        )}

        {tab === 'letter' && (
          <div className="text-center py-10">
            <p className="text-sm text-gray-500 mb-4">
              {job.letterSaved ? 'Cover letter saved for this application.' : 'No cover letter yet.'}
            </p>
            <button className={btnP} onClick={() => setShowLetter(true)}>
              {job.letterSaved ? 'Edit cover letter' : 'Generate cover letter'}
            </button>
          </div>
        )}

        {tab === 'interview' && (
          <div className="space-y-5">
            <div className="text-center py-6">
              <p className="text-sm text-gray-500 mb-4">Practice with an AI mock interview (voice).</p>
              <button className={btnP} onClick={() => setShowMock(true)}>Start mock interview</button>
            </div>
            {job.interviewSessions?.length > 0 && (
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Past sessions</h4>
                <div className="space-y-2">
                  {job.interviewSessions.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm">
                      <span className="font-bold text-gray-900">{s.score ?? '—'}</span>
                      <span className="text-gray-500 flex-1 truncate">{s.hire_decision || ''}</span>
                      <span className="text-xs text-gray-400">{shortDate(s.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Generator modals ──────────────────────────────────────────────── */}
      {showLetter && (
        <MotivationLetterGenerator
          job={job}
          cvText={job.cvSaved?.markdown || ''}
          initialContent={job.letterSaved?.content || ''}
          onClose={() => setShowLetter(false)}
          onSaveLetter={onUpdateJob}
        />
      )}
      {showMock && (
        <MockInterviewChatbot
          job={job}
          cv={job.cvSaved?.markdown || ''}
          onClose={() => setShowMock(false)}
          onInterviewComplete={(result) => {
            const session = { type: 'interview', date: new Date().toISOString(), score: result.score, hire_decision: result.hire_decision, feedback: result.feedback, transcript: result.transcript }
            onUpdateJob?.({ ...job, interviewSessions: [...(job.interviewSessions || []), session], updated_at: new Date().toISOString() })
            setShowMock(false)
          }}
        />
      )}
    </div>
  )
}
