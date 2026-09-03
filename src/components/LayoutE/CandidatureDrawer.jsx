// CandidatureDrawer — candidature detail for the E layout's drawer.
//
// Clean single column following the mockup, now with the full feature set back:
// identity header (+ score breakdown, job-description link), tabs
// (Overview / CV / Cover letter / Interview). Overview = stat cards (match score,
// ATS coverage, applied, emails) + recruiter contact + commute + a timeline with
// per-step edit/delete + primary actions. CV / Cover letter / Interview keep the
// real generators. Self-contained (classic JobRow/JobCandidaturePanel untouched).
import { useState, useEffect, useRef, Fragment } from 'react'
import { STATUSES, getStatus, getStatusLabel, historyEntryKey } from '../../hooks/useJobs'
import { gmailMessageUrl } from '../../services/gmail'
import { scoreColorClasses, ScoreBreakdown } from '../ScoreJob'
import CVViewer from '../CVViewer'
import CVGenerationSettings from '../CVGenerationSettings'
import CommuteInfo from '../CommuteInfo'
import MotivationLetterGenerator from '../MotivationLetterGenerator'
import MockInterviewChatbot from '../MockInterviewChatbot'
import { isNoReply } from '../EmailDraft'
import { getCompanyAddress, setCompanyAddress } from '../../services/commuteStore'
import { searchCompanyAddress } from '../../services/googlePlaces'
import { noteLines } from '../../utils/noteFormat'

const PALETTE = ['#4f46e5', '#2563eb', '#0d9488', '#d97706', '#db2777', '#7c3aed', '#dc2626', '#059669']
const colorFor = (s = '') => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length]
const initials = (s = '') => s.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
const shortDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')
const fullDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const nowStep = (status) => {
  const n = new Date()
  return { status, note: '', date: n.toISOString().split('T')[0], time: `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}` }
}
const TABS = [['overview', 'Overview'], ['cv', 'CV'], ['letter', 'Cover letter'], ['star', 'STAR'], ['interview', 'Interview']]

const btn = 'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors'
const btnP = 'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white hover:brightness-105 transition'
const iconBtn = 'w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors'

const decisionLabel = (d) => d === 'Yes' ? '✅ Move forward' : d === 'No' ? '❌ Not ready' : '⏳ On the fence'
const decisionColor = (d) => d === 'Yes' ? 'text-green-700' : d === 'No' ? 'text-red-700' : 'text-orange-700'

// Renders one mock-interview session's recruiter feedback inline (same layout as
// the live MockInterviewChatbot result). `session.feedback` holds the AI analysis
// { score, hire_decision, strengths[], concerns[], weak_example, better_answer } or
// { raw } when the model didn't return clean JSON.
function InterviewFeedback({ session }) {
  const fb = session?.feedback || {}
  const score = fb.score ?? session?.score
  const decision = fb.hire_decision || session?.hire_decision
  const hasDetail = fb.strengths || fb.concerns || fb.weak_example || fb.better_answer || fb.raw
  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="text-5xl font-bold text-indigo-600">{score ?? '—'}</div>
        <p className="text-xs text-gray-500">Recruiter score</p>
        {decision && <p className={`text-xs font-bold mt-1 ${decisionColor(decision)}`}>{decisionLabel(decision)}</p>}
      </div>
      {fb.strengths && (
        <div>
          <p className="text-xs font-bold text-green-700 mb-1">✅ What impressed</p>
          <ul className="text-xs text-gray-700 space-y-1">
            {(Array.isArray(fb.strengths) ? fb.strengths : [fb.strengths]).map((s, i) => <li key={i}>• {s}</li>)}
          </ul>
        </div>
      )}
      {fb.concerns && (
        <div>
          <p className="text-xs font-bold text-red-700 mb-1">⚠️ Concerns</p>
          <ul className="text-xs text-gray-700 space-y-1">
            {(Array.isArray(fb.concerns) ? fb.concerns : [fb.concerns]).map((c, i) => <li key={i}>• {c}</li>)}
          </ul>
        </div>
      )}
      {fb.weak_example && (
        <div>
          <p className="text-xs font-bold text-orange-700 mb-1">📍 Weak moment</p>
          <p className="text-xs text-gray-700 italic">&ldquo;{fb.weak_example}&rdquo;</p>
        </div>
      )}
      {fb.better_answer && (
        <div>
          <p className="text-xs font-bold text-blue-700 mb-1">💡 Better way to say it</p>
          <p className="text-xs text-gray-700">{fb.better_answer}</p>
        </div>
      )}
      {fb.raw && <p className="text-xs text-gray-600 whitespace-pre-wrap">{fb.raw}</p>}
      {!hasDetail && <p className="text-xs text-gray-400 text-center">No detailed feedback saved for this session.</p>}
    </div>
  )
}

export default function CandidatureDrawer({
  job, onClose, onEdit, onDelete, onUpdateJob, onAddStep, onUpdateHistory,
  onGenerateCV, onViewSavedCV, onSTAR, onDraftEmail, t = (k) => k,
}) {
  const history = job.history || []
  const displayStatus = history.length ? (history[history.length - 1].status || job.status) : job.status
  const source = job.source || job.platform || job.site || null
  const emailCount = history.filter(h => h.source === 'email').length
  const appliedEntry = history.find(h => h.source === 'email' && !h.fromMe) || history.find(h => h.status === 'sent') || null
  const appliedDate = appliedEntry?.date || job.date
  const jdHref = job.url ? (/^https?:\/\//i.test(job.url) ? job.url : `https://${job.url}`) : null
  const hasJobDetails = !!(job.jobDescription || job.url || (job.notes && job.notes.trim()))

  const recruiterContact = (() => {
    for (const h of history) {
      if (h.fromMe || !h.from) continue
      const raw = h.from.trim()
      const m = raw.match(/^([^<]+)<([^>]+)>/)
      if (m && !isNoReply(m[2].trim())) return { name: m[1].trim(), email: m[2].trim() }
      if (raw.includes('@') && !isNoReply(raw)) return { name: raw.split('@')[0], email: raw }
    }
    return null
  })()

  const [tab, setTab] = useState('overview')
  const [showLetter, setShowLetter] = useState(false)
  const [showMock, setShowMock] = useState(false)
  const [sessionIdx, setSessionIdx] = useState(null)   // which interview session is shown inline (null = latest)
  const [showTranscript, setShowTranscript] = useState(false)
  const [showScore, setShowScore] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [step, setStep] = useState(() => nowStep(displayStatus))
  const [editIdx, setEditIdx] = useState(null)   // historyEntryKey of the step being edited
  const [editForm, setEditForm] = useState({})
  const [confirmDel, setConfirmDel] = useState(null)  // historyEntryKey pending delete-confirm
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])
  const [homeAddress] = useState(() => { try { return JSON.parse(localStorage.getItem('jobtrackr_profile') || '{}').homeAddress || '' } catch { return '' } })
  const [companyAddr, setCompanyAddr] = useState(() => getCompanyAddress(job.id) || job.companyAddress || '')
  const [fetchingAddr, setFetchingAddr] = useState(false)
  const [addrError, setAddrError] = useState(null)

  const submitStep = () => {
    if (!step.note.trim()) return
    onAddStep?.(job.id, { ...step, date: step.time ? `${step.date}T${step.time}:00` : step.date })
    setStep(nowStep(job.status))
    setAddOpen(false)
  }
  // Resolve the underlying history index from a step's identity, so a background
  // refresh that inserts/reorders entries mid-edit can't make save/delete land on
  // the wrong step (the old code mapped a captured display index by position).
  const findIdxByKey = (key) => history.findIndex(e => historyEntryKey(e) === key)
  const saveEdit = () => {
    const idx = findIdxByKey(editIdx)
    if (idx < 0) { setEditIdx(null); setEditForm({}); return }  // step moved/removed under us — abort
    const merged = { ...history[idx], ...editForm }
    if (merged.status === 'interview' && new Date(merged.date) < new Date()) merged.status = 'done'
    const updated = [...history]; updated[idx] = merged
    onUpdateHistory?.(job.id, [...updated].sort((a, b) => new Date(a.date) - new Date(b.date)))
    setEditIdx(null); setEditForm({})
  }
  const deleteStep = () => {
    const idx = findIdxByKey(confirmDel)
    if (idx < 0) { setConfirmDel(null); return }
    onUpdateHistory?.(job.id, history.filter((_, i) => i !== idx))
    setConfirmDel(null)
  }
  const fetchAddress = async () => {
    setFetchingAddr(true); setAddrError(null)
    try {
      const { address } = await searchCompanyAddress(job.company)
      if (!mountedRef.current) return
      if (address) { setCompanyAddress(job.id, address); setCompanyAddr(address); onUpdateJob?.(job.id, { companyAddress: address }) }
      else setAddrError('Adresse introuvable')
    } catch (e) { if (mountedRef.current) setAddrError(e.message || 'Échec de la recherche') } finally { if (mountedRef.current) setFetchingAddr(false) }
  }

  return (
    <div className="flex flex-col">
      {/* ── Sticky identity header + tabs ─────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white px-5 pt-4 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: colorFor(job.company) }}>{initials(job.company)}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 tracking-tight truncate">{job.company}</h2>
                <p className="text-sm text-gray-400 truncate">{job.position}</p>
              </div>
              {typeof job.score === 'number' && (
                <button onClick={() => job.scoreDetails && setShowScore(v => !v)} title={job.scoreDetails ? 'Score details' : ''}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border shrink-0 ${scoreColorClasses(job.score)} ${job.scoreDetails ? 'hover:brightness-95' : 'cursor-default'}`}>
                  {Math.round(job.score)}
                </button>
              )}
              <button onClick={() => onEdit?.(job)} aria-label="edit" className={`${iconBtn} shrink-0`}>✎</button>
              <button onClick={() => onDelete?.(job)} aria-label="delete" className={`${iconBtn} hover:text-red-600 hover:bg-red-50 shrink-0`}>🗑</button>
              <button onClick={onClose} aria-label="close" className={`${iconBtn} shrink-0`}>✕</button>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${getStatus(displayStatus)?.color || 'bg-gray-100 text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${getStatus(displayStatus)?.dot || 'bg-gray-400'}`} />
                {getStatusLabel(displayStatus, t)}
              </span>
              {source && <span className="text-xs text-gray-400">via {source}</span>}
              {appliedDate && <span className="text-xs text-gray-400">{source ? '· ' : ''}{shortDate(appliedDate)}</span>}
            </div>
          </div>
        </div>

        {/* Prominent apply / job-description CTA — primary when there's still an
            application to send (todo), outline once applied */}
        {jdHref && (
          <a
            href={jdHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-3 flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-semibold rounded-xl transition ${
              displayStatus === 'todo'
                ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm hover:brightness-105'
                : 'border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            {displayStatus === 'todo' ? (t('candidature.apply') || 'Apply') : (t('candidature.viewOffer') || 'See job description')}
            <span aria-hidden>↗</span>
          </a>
        )}

        <div className="flex gap-1 mt-3 -mb-px">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3 py-2 text-sm font-semibold border-b-2 transition-colors ${tab === id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <div className="px-5 py-5">
        {tab === 'overview' && (
          <>
            {/* inline metric strip — no boxes */}
            <div className="flex items-center gap-5 mb-5 flex-wrap">
              {[
                { label: 'Match', value: typeof job.score === 'number' ? Math.round(job.score) : '—' },
                ...(job.cvSaved?.atsScore != null ? [{ label: 'ATS', value: Math.round(job.cvSaved.atsScore) }] : []),
                { label: 'Applied', value: appliedDate ? shortDate(appliedDate) : '—' },
                { label: 'Emails', value: emailCount },
              ].map((m, i) => (
                <Fragment key={m.label}>
                  {i > 0 && <span className="w-px h-8 hidden sm:block" style={{ background: 'var(--theme-border, #e8ebf1)' }} />}
                  <div className="min-w-0">
                    <div className="text-xl font-bold text-gray-900 tabular-nums leading-none">{m.value}</div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 mt-1.5">{m.label}</div>
                  </div>
                </Fragment>
              ))}
              {job.scoreDetails && (
                <button onClick={() => setShowScore(v => !v)} className="text-xs font-medium text-indigo-600 hover:underline ml-auto self-center">
                  {showScore ? 'Hide breakdown' : 'Score breakdown'}
                </button>
              )}
            </div>

            {showScore && job.scoreDetails && <div className="mb-5"><ScoreBreakdown job={job} t={t} /></div>}

            {/* contact + commute — subtle line under a hairline */}
            {(recruiterContact || !(companyAddr && homeAddress)) && (
              <div className="flex items-center justify-between gap-4 flex-wrap mb-6 pt-3 border-t border-gray-100">
                {recruiterContact ? (
                  <div className="flex items-center gap-2 text-sm min-w-0">
                    <span className="text-gray-400 shrink-0">Contact</span>
                    <span className="font-medium text-gray-800 truncate">{recruiterContact.name}</span>
                    <a href={`mailto:${recruiterContact.email}`} className="text-xs text-indigo-600 hover:underline truncate">{recruiterContact.email}</a>
                  </div>
                ) : <span />}
                {!(companyAddr && homeAddress) && (
                  <div className="shrink-0">
                    {companyAddr && !homeAddress ? (
                      <span className="text-xs text-gray-400">🚗 Add your address in Settings → Profile</span>
                    ) : (
                      <button onClick={fetchAddress} disabled={fetchingAddr} className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline disabled:opacity-50">
                        {fetchingAddr ? <><span className="w-3 h-3 border border-indigo-300 border-t-indigo-600 rounded-full animate-spin" /> Searching…</> : <>🚗 Calculate commute</>}
                      </button>
                    )}
                    {addrError && <p className="text-xs text-red-500 mt-1">{addrError}</p>}
                  </div>
                )}
              </div>
            )}
            {companyAddr && homeAddress && (
              <div className="mb-6 pt-3 border-t border-gray-100">
                <CommuteInfo homeAddress={homeAddress} companyAddress={companyAddr} companyName={job.company} />
              </div>
            )}

            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Timeline</h3>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400">No steps yet.</p>
            ) : (
              <ul className="mb-2">
                {[...history].reverse().map((h, i, arr) => {
                  const entryKey = historyEntryKey(h)
                  const editing = editIdx === entryKey
                  return (
                    <li key={entryKey || i} className="relative pl-6 pb-4 last:pb-0 group">
                      {i < arr.length - 1 && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-gray-200" />}
                      <span className={`absolute left-0 top-1 w-3 h-3 rounded-full ring-4 ring-white ${getStatus(h.status)?.dot || 'bg-gray-400'}`} />
                      {editing ? (
                        <div className="rounded-xl bg-indigo-50/60 border border-indigo-100 p-3 space-y-2.5">
                          <div className="flex gap-2">
                            <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })} className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white">
                              {STATUSES.map(s => <option key={s.key} value={s.key}>{getStatusLabel(s.key, t)}</option>)}
                            </select>
                            <input type="date" value={(editForm.date || '').slice(0, 10)} onChange={e => setEditForm({ ...editForm, date: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white" />
                          </div>
                          <textarea value={editForm.note || ''} onChange={e => setEditForm({ ...editForm, note: e.target.value })} rows={2} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white resize-none" />
                          <div className="flex gap-2">
                            <button onClick={saveEdit} className={btnP}>Save</button>
                            <button onClick={() => { setEditIdx(null); setEditForm({}) }} className={btn}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${getStatus(h.status)?.color || 'bg-gray-100 text-gray-500'}`}>{getStatusLabel(h.status, t)}</span>
                            <span className="text-xs text-gray-400">{fullDate(h.date)}</span>
                            <div className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => { setEditIdx(entryKey); setEditForm({ status: h.status, date: h.date, note: h.note || '' }) }} aria-label="edit step" className={`${iconBtn} w-6 h-6`}>✎</button>
                              <button onClick={() => setConfirmDel(entryKey)} aria-label="delete step" className={`${iconBtn} w-6 h-6 hover:text-red-600`}>🗑</button>
                            </div>
                          </div>
                          {h.note && (() => {
                            const lines = noteLines(h.note)
                            return lines.length > 1 ? (
                              <ul className="mt-1.5 space-y-1">
                                {lines.map((line, li) => (
                                  <li key={li} className="flex gap-1.5 text-sm text-gray-600 leading-relaxed">
                                    <span className="text-gray-300 select-none leading-relaxed">•</span>
                                    <span className="whitespace-pre-line">{line}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-line leading-relaxed">{lines[0] || h.note}</p>
                            )
                          })()}
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
                          {confirmDel === entryKey && (
                            <div className="flex items-center gap-2 mt-2 text-xs">
                              <span className="text-gray-500">Delete this step?</span>
                              <button onClick={deleteStep} className="font-semibold text-red-600 hover:underline">Delete</button>
                              <button onClick={() => setConfirmDel(null)} className="text-gray-400 hover:underline">Cancel</button>
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {addOpen ? (
              <div className="rounded-xl bg-indigo-50/60 border border-indigo-100 p-3 space-y-2.5 mt-2">
                <div className="flex gap-2">
                  <select value={step.status} onChange={e => setStep({ ...step, status: e.target.value })} className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white">
                    {STATUSES.map(s => <option key={s.key} value={s.key}>{getStatusLabel(s.key, t)}</option>)}
                  </select>
                  <input type="date" value={step.date} onChange={e => setStep({ ...step, date: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white" />
                </div>
                <textarea value={step.note} onChange={e => setStep({ ...step, note: e.target.value })} rows={2} placeholder="Note…" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white resize-none" />
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
            {/* Generation options (base CV, ATS level, rules) — read by the generator */}
            <CVGenerationSettings t={t} defaultOpen={!job.cvSaved} />
            {job.cvSaved ? (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">Adapted CV</div>
                    <div className="text-xs text-gray-400">{job.cvSaved.savedAt ? new Date(job.cvSaved.savedAt).toLocaleDateString() : ''}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button className={btnP} onClick={() => onViewSavedCV?.(job)}>✏️ Edit CV</button>
                    <button className={`${btn} disabled:opacity-40 disabled:cursor-not-allowed`} disabled={!hasJobDetails}
                      title={hasJobDetails ? '' : 'Add a job description, URL or notes to generate a tailored CV'}
                      onClick={() => onGenerateCV?.(job)}>Regenerate</button>
                  </div>
                </div>
                <div className="cv-paper rounded-xl border border-gray-200 overflow-auto" style={{ height: 700 }}>
                  <CVViewer job={job} inline onClose={() => {}} onUpdate={onUpdateJob} t={t} />
                </div>
              </>
            ) : (
              <div className="text-center py-10">
                <p className="text-sm text-gray-500 mb-4">No tailored CV yet — generate one adapted to this offer.</p>
                <button className={`${btnP} disabled:opacity-40 disabled:cursor-not-allowed`} disabled={!hasJobDetails}
                  title={hasJobDetails ? '' : 'Add a job description, URL or notes to generate a tailored CV'}
                  onClick={() => onGenerateCV?.(job)}>📄 Generate tailored CV</button>
                {!hasJobDetails && <p className="text-xs text-gray-400 mt-3">Add a job description, URL or notes first to generate a tailored CV.</p>}
              </div>
            )}
          </div>
        )}

        {tab === 'letter' && (
          <div className="space-y-4">
            {job.letterSaved ? (
              // Show the saved letter INLINE (mirrors the CV tab); the Edit /
              // Regenerate buttons open the full generator modal.
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">Cover letter</div>
                    <div className="text-xs text-gray-400">{job.letterSaved.savedAt ? new Date(job.letterSaved.savedAt).toLocaleDateString() : ''}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button className={btnP} onClick={() => setShowLetter(true)}>✏️ Edit</button>
                    <button className={btn} onClick={() => setShowLetter(true)}>↻ Regenerate</button>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white overflow-auto p-6" style={{ height: 700 }}>
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700 leading-relaxed">
                    {job.letterSaved.content}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-10">
                <p className="text-sm text-gray-500 mb-4">No cover letter yet — generate one tailored to this application.</p>
                <button className={btnP} onClick={() => setShowLetter(true)}>✍️ Generate cover letter</button>
              </div>
            )}
          </div>
        )}

        {tab === 'star' && (() => {
          const saved = job.starSaved
          if (!saved?.stars?.length) {
            return (
              <div className="text-center py-10">
                <p className="text-sm text-gray-500 mb-4">No STAR answers yet — generate a set tailored to this role, then save them here.</p>
                <button className={btnP} onClick={() => onSTAR?.(job)}>🎯 Generate STAR answers</button>
              </div>
            )
          }
          const isEn = saved.lang === 'en'
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">STAR answers</div>
                  <div className="text-xs text-gray-400">{saved.savedAt ? new Date(saved.savedAt).toLocaleDateString() : ''}</div>
                </div>
                <button className={btnP} onClick={() => onSTAR?.(job)}>↻ Regenerate</button>
              </div>
              {/* Saved STAR answers shown inline (mirrors the CV / letter / interview tabs) */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-auto p-4 space-y-3" style={{ maxHeight: 700 }}>
                {saved.stars.map((s, i) => (
                  <div key={i} className="border border-gray-100 rounded-xl p-3">
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
                ))}
              </div>
            </div>
          )
        })()}

        {tab === 'interview' && (() => {
          const sessions = job.interviewSessions || []
          if (sessions.length === 0) {
            return (
              <div className="text-center py-10">
                <p className="text-sm text-gray-500 mb-4">Practice with an AI mock interview (voice), then review your results here.</p>
                <button className={btnP} onClick={() => setShowMock(true)}>🎤 Start mock interview</button>
              </div>
            )
          }
          const activeIdx = (sessionIdx == null || sessionIdx >= sessions.length) ? sessions.length - 1 : sessionIdx
          const active = sessions[activeIdx]
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">Mock interview</div>
                  <div className="text-xs text-gray-400">{active?.date ? new Date(active.date).toLocaleDateString() : ''}</div>
                </div>
                <button className={btnP} onClick={() => setShowMock(true)}>🎤 New interview</button>
              </div>

              {/* Session picker when there is more than one */}
              {sessions.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {sessions.map((s, i) => (
                    <button key={i} onClick={() => { setSessionIdx(i); setShowTranscript(false) }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${i === activeIdx ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                      {shortDate(s.date)} · {s.score ?? '—'}
                    </button>
                  ))}
                </div>
              )}

              {/* Selected session's feedback shown inline (mirrors the CV / letter tabs) */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-auto p-5" style={{ maxHeight: 700 }}>
                <InterviewFeedback session={active} />
                {Array.isArray(active?.transcript) && active.transcript.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <button className="text-xs font-semibold text-indigo-600 hover:underline" onClick={() => setShowTranscript(v => !v)}>
                      {showTranscript ? 'Hide transcript' : `Show transcript (${active.transcript.length})`}
                    </button>
                    {showTranscript && (
                      <div className="mt-3 space-y-2">
                        {active.transcript.map((m, i) => (
                          <div key={i} className={`text-xs rounded-lg px-3 py-2 ${m.role === 'interviewer' ? 'bg-gray-50 text-gray-700' : 'bg-indigo-50 text-gray-800'}`}>
                            <span className="font-semibold">{m.role === 'interviewer' ? 'Interviewer' : 'You'}: </span>{m.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Generator modals ──────────────────────────────────────────────── */}
      {showLetter && (
        <MotivationLetterGenerator job={job} cvText={job.cvSaved?.markdown || ''} initialContent={job.letterSaved?.content || ''} onClose={() => setShowLetter(false)} onSaveLetter={onUpdateJob} />
      )}
      {showMock && (
        <MockInterviewChatbot job={job} cv={job.cvSaved?.markdown || ''} onClose={() => setShowMock(false)}
          onInterviewComplete={(result) => {
            const session = { type: 'interview', date: new Date().toISOString(), score: result.score, hire_decision: result.hire_decision, feedback: result.feedback, transcript: result.transcript }
            // onUpdateJob is updateJob(id, data) — pass id + patch, not a whole job object,
            // or jobs.find(id) never matches and the session is silently discarded.
            onUpdateJob?.(job.id, { interviewSessions: [...(job.interviewSessions || []), session], updated_at: new Date().toISOString() })
            setShowMock(false)
          }} />
      )}
    </div>
  )
}
