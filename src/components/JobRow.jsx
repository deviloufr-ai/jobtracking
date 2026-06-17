import { useState, useRef, useEffect, memo } from 'react'
import { enrichJobTimeline } from '../services/enrichTimeline'
import AdvicePanel from './AdvicePanel'
import { STATUSES, getStatus, getStatusLabel } from '../hooks/useJobs'
import { gmailMessageUrl } from '../services/gmail'
import { isNoReply } from './EmailDraft'
import UseCasePanel from './UseCasePanel'
import RowActions from './RowActions'
import MotivationLetterGenerator from './MotivationLetterGenerator'
import MockInterviewChatbot from './MockInterviewChatbot'
import JobCandidaturePanel from './JobCandidaturePanel'
import { ScoreBadge } from './ScoreJob'
import CompanyAvatar from './CompanyAvatar'
import CommuteInfo from './CommuteInfo'
import { getCompanyAddress, setCompanyAddress } from '../services/commuteStore'
import { searchCompanyAddress } from '../services/googlePlaces'

// Fix #7 — NOTE_TIPS moved above getTipsFromNote (was referenced before definition)
const NOTE_TIPS = {
  interview: {
    keywords: ['entretien', 'interview', 'visio', 'call', 'meeting', 'rdv', 'rendez-vous', 'zoom', 'teams', 'meet'],
    tips: ["Prépare des réponses STAR pour chaque expérience clé", "Recherche les dernières actualités de l'entreprise", "Envoie un email de remerciement dans les 24h après"],
  },
  test: {
    keywords: ['test technique', 'technical test', 'case study', 'assessment', 'exercice', 'mise en situation'],
    tips: ["Lis attentivement les consignes avant de commencer", "Commente ton code / raisonnement", "Respecte le délai et soigne la présentation"],
  },
  relance: {
    keywords: ['relance', 'follow-up', 'aucune réponse', 'sans réponse', 'pas de retour'],
    tips: ["Email court et poli : rappelle ton entretien + réaffirme ton intérêt", "Attends 5-7 jours ouvrés avant de relancer à nouveau"],
  },
  negocia: {
    keywords: ['négociation', 'salaire', 'rémunération', 'prétentions', 'offre', 'proposition'],
    tips: ["Ne jamais accepter sans avoir négocié", "Négocie salaire, télétravail, avantages, date de prise de poste", "Demande un délai de réflexion de 48-72h"],
  },
  refus: {
    keywords: ['refus', 'rejected', 'not selected', 'non retenu', 'sans suite', 'ne correspond pas'],
    tips: ["Envoie un email de remerciement — ça te différencie", "Demande un feedback constructif pour les prochaines fois"],
  },
  sent: {
    keywords: ['envoyé', 'postulé', 'candidature envoyée', 'applied', 'application sent'],
    tips: ["Connecte-toi sur LinkedIn avec un employé de l'entreprise", "Prépare un message de relance pour J+14 si pas de réponse"],
  },
  reviewing: {
    keywords: ['examen', 'review', 'consulté', 'profil', 'reçu', 'received'],
    tips: ["Consulte Glassdoor pour connaître la culture de l'entreprise", "Prépare 3-5 questions pertinentes"],
  },
}

function getTipsFromNote(note = '') {
  const n = note.toLowerCase()
  for (const [, { keywords, tips }] of Object.entries(NOTE_TIPS)) {
    if (keywords.some(k => n.includes(k))) return tips
  }
  return []
}

function StepTips({ note, t = (key) => key }) {
  const tips = getTipsFromNote(note)
  if (!tips.length) return null
  return (
    <div className="relative group/tips">
      <button className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 hover:bg-amber-200 transition-colors cursor-help"
        title={`${tips.length} conseil${tips.length > 1 ? 's' : ''}`}>
        <span className="text-sm">💡</span>
      </button>
      {/* Tooltip */}
      <div className="absolute right-0 top-full mt-1.5 z-30 hidden group-hover/tips:block w-72
        bg-amber-50 border border-amber-200 rounded-lg shadow-lg p-3">
        <p className="text-[10px] font-semibold text-amber-700 mb-2 uppercase tracking-wide">{t('jobActions.tips') || 'Conseils pour cette étape'}</p>
        <ul className="space-y-1.5">
          {tips.map((tip, i) => (
            <li key={i} className="flex gap-2 text-[11px] text-amber-900">
              <span className="text-amber-500 flex-shrink-0 mt-0.5">•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
        {/* Arrow */}
        <div className="absolute right-4 -top-1 w-2 h-2 bg-amber-50 border-l border-t border-amber-200 rotate-45" />
      </div>
    </div>
  )
}

// Fix #20 — getSourceLabel moved outside component (pure function, no need for closure)
function getSourceLabel(entry, companyName, t) {
  if (entry.source === 'calendar') return null
  if (entry.source === 'email') {
    if (entry.fromMe) return t('jobActions.you')
    if (entry.from) {
      const match = entry.from.match(/^([^<]+)/)
      return match ? match[1].trim().split(' ')[0] : entry.from.split('@')[0]
    }
    return companyName
  }
  return null
}

function JobRow({ job, onEdit, onDelete, onStatusChange, onAddStep, onUpdateHistory, onUpdateJob, onGenerateCV, onToggleFavorite, onViewSavedCV, forceExpand, onForceExpandDone, checkAllPositions, t = (key) => key, isSelected = false, onSelect = null }) {
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const [showUseCase, setShowUseCase] = useState(false)
  const [showMotivationLetter, setShowMotivationLetter] = useState(false)
  const [showMockInterview, setShowMockInterview] = useState(false)
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState(null) // Fix #18
  const statusBtnRef = useRef(null)
  const enrichTimerRef = useRef(null) // Fix #6
  const rowRef = useRef(null)
  const [checkingPosition, setCheckingPosition] = useState(false)
  const [homeAddress, setHomeAddress] = useState(() => {
    try {
      const profile = JSON.parse(localStorage.getItem('jobtrackr_profile') || '{}')
      return profile.homeAddress || ''
    } catch {
      return ''
    }
  })
  // Commute company address (durable store, falls back to the job object)
  const [companyAddr, setCompanyAddr] = useState(() => getCompanyAddress(job.id) || job.companyAddress || '')
  const [fetchingAddr, setFetchingAddr] = useState(false)
  const [addrError, setAddrError] = useState(null)

  const handleFetchAddress = async () => {
    setFetchingAddr(true)
    setAddrError(null)
    try {
      const { address } = await searchCompanyAddress(job.company)
      if (address) {
        setCompanyAddress(job.id, address)
        setCompanyAddr(address)
        onUpdateJob?.(job.id, { companyAddress: address })
      } else {
        setAddrError('Adresse introuvable')
      }
    } catch (e) {
      setAddrError(e.message || 'Échec de la recherche')
    } finally {
      setFetchingAddr(false)
    }
  }

  // Open + scroll when triggered from Prochaines étapes
  useEffect(() => {
    if (!forceExpand) return
    setExpanded(true)
    setTimeout(() => {
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    onForceExpandDone?.()
  }, [forceExpand]) // eslint-disable-line react-hooks/exhaustive-deps

  const openStatusMenu = (e) => {
    e.stopPropagation()
    const rect = statusBtnRef.current?.getBoundingClientRect()
    if (rect) {
      // Fix #2 — flip dropdown up when near bottom of viewport
      const dropdownH = 11 * 34 // ~11 statuses × 34px each
      const spaceBelow = window.innerHeight - rect.bottom
      // position:fixed → coordinates are viewport-relative, no scrollY offset needed
      const top = spaceBelow < dropdownH + 12
        ? rect.top - dropdownH - 4
        : rect.bottom + 4
      setMenuPos({ top, left: rect.left })
    }
    setShowStatusMenu(v => !v)
  }

  // Close status menu on scroll
  useEffect(() => {
    if (!showStatusMenu) return
    const close = () => setShowStatusMenu(false)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [showStatusMenu])

  // Fix #6 — cleanup enrichResult timer on unmount
  useEffect(() => () => { if (enrichTimerRef.current) clearTimeout(enrichTimerRef.current) }, [])

  const [expanded, setExpanded] = useState(false)
  const [showAddStep, setShowAddStep] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [enrichResult, setEnrichResult] = useState(null)
  const [editingStep, setEditingStep] = useState(null) // index of step being edited
  const [editForm, setEditForm] = useState({})
  // Start with a fresh default on each render, deriving status from current history
  const getCurrentDisplayStatus = () => {
    if ((job.history || []).length > 0) {
      const mostRecent = job.history[job.history.length - 1]
      return mostRecent.status || job.status
    }
    return job.status
  }

  const [newStep, setNewStep] = useState(() => {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    return {
      status: getCurrentDisplayStatus(),
      note: '',
      date: now.toISOString().split('T')[0],
      time: `${hh}:${mm}`
    }
  })
  const history = job.history || []

  // Derive status from the most recent history entry, fallback to job.status
  const getDisplayStatus = () => {
    if (history.length > 0) {
      const mostRecent = history[history.length - 1]
      return mostRecent.status || job.status
    }
    return job.status
  }
  const displayStatusKey = getDisplayStatus()
  const status = getStatus(displayStatusKey)

  // Extract recruiter contact from history — first inbound email with a sender
  const recruiterContact = (() => {
    for (const h of history) {
      if (h.fromMe || !h.from) continue
      const raw = h.from.trim()
      const fullMatch = raw.match(/^([^<]+)<([^>]+)>/)
      if (fullMatch) return { name: fullMatch[1].trim(), email: fullMatch[2].trim() }
      if (raw.includes('@')) return { name: raw.split('@')[0], email: raw }
    }
    return null
  })()
  const recruiter = recruiterContact?.name || null

  // All inbound email contacts (deduplicated by email), with which account received them
  const allContacts = (() => {
    const seen = new Map() // email → contact
    for (const h of history) {
      if (h.fromMe || !h.from) continue
      const raw = h.from.trim()
      const fullMatch = raw.match(/^([^<]+)<([^>]+)>/)
      const email = fullMatch ? fullMatch[2].trim() : (raw.includes('@') ? raw : null)
      if (!email || isNoReply(email)) continue
      if (!seen.has(email)) {
        seen.set(email, { name: fullMatch ? fullMatch[1].trim() : raw.split('@')[0], email, date: h.date, receivedBy: h.receivedBy || null })
      } else if (h.receivedBy && !seen.get(email).receivedBy) {
        seen.get(email).receivedBy = h.receivedBy
      }
    }
    return [...seen.values()]
  })()

  // Upcoming calendar events
  const upcomingEvents = history.filter(h =>
    h.source === 'calendar' && h.isUpcoming && new Date(h.date) >= new Date()
  ).sort((a, b) => new Date(a.date) - new Date(b.date))

  // Email exchange count
  const emailCount = history.filter(h => h.source === 'email').length

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const formatDateTime = (d) => {
    if (!d) return '—'
    const date = new Date(d)
    const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    return `${dateStr} à ${timeStr}`
  }

  const handleAddStep = () => {
    if (!newStep.note.trim()) return
    const stepToAdd = {
      ...newStep,
      date: newStep.time ? `${newStep.date}T${newStep.time}:00` : newStep.date
    }
    onAddStep(job.id, stepToAdd)
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    setNewStep({ status: job.status, note: '', date: now.toISOString().split('T')[0], time: `${hh}:${mm}` })
    setShowAddStep(false)
  }

  // History is displayed reversed — convert display index back to original array index
  const toOriginalIdx = (displayIdx) => history.length - 1 - displayIdx

  const handleSaveEdit = (displayIdx) => {
    const idx = toOriginalIdx(displayIdx)
    const merged = { ...history[idx], ...editForm }
    // Auto-resolve interview → done when date is in the past
    if (merged.status === 'interview' && new Date(merged.date) < new Date()) merged.status = 'done'
    const updated = [...history]
    updated[idx] = merged
    // Re-sort by date after editing (create new sorted array, don't mutate)
    const sorted = [...updated].sort((a, b) => new Date(a.date) - new Date(b.date))
    onUpdateHistory(job.id, sorted)
    setEditingStep(null)
    setEditForm({})
  }

  const handleDeleteStep = (displayIdx) => {
    // Fix #18 — confirmation is now handled inline (two-step UI), no window.confirm
    const idx = toOriginalIdx(displayIdx)
    const updated = history.filter((_, i) => i !== idx)
    onUpdateHistory(job.id, updated)
    setConfirmDeleteIdx(null)
  }

  const handleEnrich = async () => {
    setEnriching(true)
    setEnrichResult(null)
    const syncStartTime = new Date().toISOString()
    try {
      // Smart sync: fetch only NEW emails since lastSyncTime, plus calendar events
      const result = await enrichJobTimeline(job, { calendarOnly: false })
      if (result && result.newCount > 0) {
        // Update history and lastSyncTime for incremental sync
        onUpdateHistory(job.id, result.history)
        onUpdateJob?.(job.id, { lastSyncTime: syncStartTime })
        setEnrichResult({ success: true, count: result.newCount })
        enrichTimerRef.current = setTimeout(() => setEnrichResult(null), 3000) // Fix #6
      }
      // No notification if nothing new found (already imported before)
    } catch (e) {
      setEnrichResult({ success: false, error: e.message })
      enrichTimerRef.current = setTimeout(() => setEnrichResult(null), 3000)
    }
    setEnriching(false)
  }

  const handleCheckPosition = async () => {
    if (!checkAllPositions || !job.positionLinks?.length) return
    setCheckingPosition(true)
    try {
      await checkAllPositions(job.id, 1)
    } catch (e) {
      console.error('Position check failed:', e.message)
    }
    setCheckingPosition(false)
  }

  // Get position status from most recent check
  const getPositionStatus = () => {
    if (!job.positionChecks || !job.positionLinks?.length) return null
    const checks = Object.values(job.positionChecks).filter(c => c)
    if (!checks.length) return null
    const latest = checks[0] // Most recent check
    return latest.available
  }


  return (
    <>
      <tr
        ref={rowRef}
        className={`border-b transition-colors group cursor-pointer ${
          job.favorite ? 'bg-amber-50/40 hover:bg-amber-50/70 border-amber-100' : 'border-gray-50 hover:bg-indigo-50/30'
        } ${job.status === 'cancelled' ? 'opacity-40' : ''}`}
        onClick={() => setExpanded(v => !v)}
      >
        {/* Checkbox + Avatar + Company — clicking company/avatar triggers row expand */}
        <td className="py-3.5 px-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Checkbox */}
            <input type="checkbox" className="flex-shrink-0 accent-indigo-600 w-4 h-4 cursor-pointer" checked={isSelected} onChange={(e) => { e.stopPropagation(); onSelect?.(job.id) }} />
            {/* Favorite star */}
            <button
              onClick={e => { e.stopPropagation(); onToggleFavorite && onToggleFavorite(job.id) }}
              className={`flex-shrink-0 text-sm leading-none transition-all hover:scale-110 -ml-1 ${job.favorite ? 'text-yellow-400' : 'text-gray-200 hover:text-yellow-300'}`}
            >★</button>
            {/* Avatar */}
            <CompanyAvatar company={job.company} sizeClass="w-8 h-8" />
            {/* Company + Position */}
            <div className="min-w-0">
              <div className="font-semibold text-gray-800 text-sm truncate leading-tight flex items-center gap-1.5">
                {job.company}
                {job.companyFromAts && (
                  <span title={t?.table?.viaAtsHint || 'Company not provided by this ATS — showing the source platform name'} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-600 flex-shrink-0">{t?.table?.viaAts || 'ATS'}</span>
                )}
                {job.cvSaved && (
                  <span title={`CV généré le ${new Date(job.cvSaved.savedAt).toLocaleDateString('fr-FR')}`} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-600 flex-shrink-0">CV</span>
                )}
              </div>
              <div className="text-xs text-gray-400 truncate mt-0.5">{job.position}</div>
            </div>
          </div>
        </td>

        {/* Score */}
        <td className="py-3.5 px-4">
          <ScoreBadge job={job} t={t} />
        </td>

        {/* Status */}
        <td className="py-3.5 px-4" onClick={e => e.stopPropagation()}>
          <button
            ref={statusBtnRef}
            onClick={openStatusMenu}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap ${status.color} hover:opacity-80 transition-opacity`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {getStatusLabel(job.status, t)}
            <span className="text-xs opacity-60">▾</span>
          </button>
          {showStatusMenu && typeof document !== 'undefined' && (
            <>
              <div className="fixed inset-0 z-[90]" onClick={() => setShowStatusMenu(false)} />
              <div
                className="fixed bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-[200] min-w-[180px]"
                style={{ top: menuPos.top, left: menuPos.left }}
              >
                {STATUSES.map(s => (
                  <button
                    key={s.key}
                    onClick={() => { onStatusChange(job.id, s.key); setShowStatusMenu(false) }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-left ${s.key === job.status ? 'font-semibold' : ''}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                    {getStatusLabel(s.key, t)}
                    {s.key === job.status && <span className="ml-auto text-indigo-500">✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </td>

        {/* Date */}
        <td className="py-3.5 px-4 text-xs text-gray-500 whitespace-nowrap">
          {(() => {
            const lastEntry = job.history?.length
              ? job.history.reduce((latest, h) =>
                  new Date(h.date) > new Date(latest) ? h.date : latest, job.history[0].date)
              : null
            const lastDate = lastEntry || job.updatedAt || job.date
            const showBoth = lastEntry && lastEntry !== job.date
            return showBoth ? (
              <span title={`Candidature : ${formatDate(job.date)}`}>
                {formatDate(lastDate)}
              </span>
            ) : formatDate(job.date)
          })()}
        </td>

        {/* Notes — hidden on mobile, shows latest history entry */}
        <td className="hidden md:table-cell py-3.5 px-4 max-w-sm">
          {(() => {
            const lastStep = history?.length ? history[history.length - 1] : null
            const noteText = lastStep?.note || job.notes
            return noteText ? (
              <span className="text-xs text-gray-600 line-clamp-2">{noteText}</span>
            ) : (
              <span className="text-xs text-gray-300">—</span>
            )
          })()}
        </td>

        {/* Actions — floats over the row on hover so icons are never clipped by the fixed column width */}
        <td className="py-3.5 px-4 relative" onClick={e => e.stopPropagation()}>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap rounded-lg bg-white/95 shadow-sm ring-1 ring-gray-100 px-1 py-0.5">
            <RowActions
              expanded={expanded}
              onAddStep={() => setShowAddStep(v => !v)}
              onSync={handleEnrich}
              onUseCase={() => { setShowUseCase(v => !v); setShowAddStep(false) }}
              onEdit={() => onEdit(job)}
              onDelete={() => onDelete(job)}
              onCheckPosition={job.positionLinks?.length ? handleCheckPosition : null}
              enriching={enriching}
              hasUseCase={!!job.useCase?.title}
              checkingPosition={checkingPosition}
              positionStatus={getPositionStatus()}
              t={t}
            />
          </div>
        </td>
      </tr>

      {/* Expanded row — tabbed candidature panel */}
      {expanded && (
        <tr className="bg-slate-50/60 border-b border-indigo-100">
          <td colSpan={6} className="px-4 py-4">
            <div className="ml-7">
              <JobCandidaturePanel
                job={job}
                onGenerateCV={() => onGenerateCV(job)}
                onViewSavedCV={onViewSavedCV}
                onEdit={() => onEdit(job)}
                onDelete={() => onDelete(job)}
                onUpdateJob={onUpdateJob}
                onAddStep={onAddStep}
                onUpdateHistory={onUpdateHistory}
                enriching={enriching}
                enrichResult={enrichResult}
                onSync={handleEnrich}
                history={history}
                showAddStep={showAddStep}
                onToggleAddStep={() => setShowAddStep(v => !v)}
                newStep={newStep}
                setNewStep={setNewStep}
                onAddStepSubmit={handleAddStep}
                onCheckPosition={job.positionLinks?.length ? handleCheckPosition : null}
                positionStatus={getPositionStatus()}
                checkingPosition={checkingPosition}
                onUseCase={() => { setShowUseCase(v => !v); setShowAddStep(false) }}
                showUseCase={showUseCase}
                formatDate={formatDate}
                upcomingEvents={upcomingEvents}
                recruiterContact={recruiterContact}
                allContacts={allContacts}
                companyAddr={companyAddr}
                onFetchAddress={handleFetchAddress}
                fetchingAddr={fetchingAddr}
                addrError={addrError}
                onStartMockInterview={() => setShowMockInterview(true)}
                t={t}
              />
            </div>

            {/* ── Use Case Panel ────────────────────────────────────────── */}
            {(showUseCase || job.useCase?.title) && onUpdateJob && (
              <UseCasePanel job={job} onUpdate={onUpdateJob} />
            )}
          </td>
        </tr>
      )}

      {/* Motivation Letter Generator Modal */}
      {showMotivationLetter && (
        <MotivationLetterGenerator
          job={job}
          cvText={job.cvSaved?.markdown || ''}
          initialContent={job.letterSaved?.content || ''}
          onClose={() => setShowMotivationLetter(false)}
          onSaveLetter={onUpdateJob}
        />
      )}

      {/* Mock Interview Chatbot Modal */}
      {showMockInterview && (
        <MockInterviewChatbot
          job={job}
          cv={job.cvSaved?.markdown || ''}
          onClose={() => setShowMockInterview(false)}
        />
      )}
    </>
  )
}

// Memoize but always re-render if job object changed (includes history changes)
export default memo(JobRow, (prevProps, nextProps) => {
  // Always re-render if the job object itself changed
  // (setJobs creates new object, so this catches all updates including history changes)
  if (prevProps.job !== nextProps.job) return false // job changed, re-render

  // For other props, check if they changed
  for (const key in prevProps) {
    if (key === 'job') continue // already checked above
    if (prevProps[key] !== nextProps[key]) return false // prop changed, re-render
  }
  return true // all props same, skip re-render
})
