import { useState, useRef, useEffect } from 'react'
import { enrichJobTimeline } from '../services/enrichTimeline'
import AdvicePanel from './AdvicePanel'
import { STATUSES, getStatus } from '../hooks/useJobs'
import { gmailMessageUrl } from '../services/gmail'
import { isNoReply } from './EmailDraft'
import UseCasePanel from './UseCasePanel'
import RowActions from './RowActions'
import MotivationLetterGenerator from './MotivationLetterGenerator'

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

function StepTips({ note }) {
  const tips = getTipsFromNote(note)
  if (!tips.length) return null
  return (
    <div className="relative inline-block mt-1 group/tips">
      <span className="text-[11px] text-gray-300 cursor-default select-none px-1 py-0.5 rounded hover:text-amber-400 hover:bg-amber-50 transition-colors">
        💡 Conseils
      </span>
      {/* Tooltip */}
      <div className="absolute left-0 bottom-full mb-1.5 z-30 hidden group-hover/tips:block w-64
        bg-white border border-amber-100 rounded-xl shadow-lg p-3">
        <p className="text-[10px] font-semibold text-amber-600 mb-1.5 uppercase tracking-wide">Conseils</p>
        <ul className="space-y-1">
          {tips.map((t, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] text-gray-700">
              <span className="text-amber-400 flex-shrink-0 mt-0.5">•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
        {/* Arrow */}
        <div className="absolute left-3 top-full w-2 h-2 bg-white border-r border-b border-amber-100 rotate-45 -mt-1" />
      </div>
    </div>
  )
}

// Fix #20 — getSourceLabel moved outside component (pure function, no need for closure)
function getSourceLabel(entry, companyName) {
  if (entry.source === 'calendar') return null
  if (entry.source === 'email') {
    if (entry.fromMe) return 'Vous'
    if (entry.from) {
      const match = entry.from.match(/^([^<]+)/)
      return match ? match[1].trim().split(' ')[0] : entry.from.split('@')[0]
    }
    return companyName
  }
  return null
}

export default function JobRow({ job, onEdit, onDelete, onStatusChange, onAddStep, onUpdateHistory, onUpdateJob, onGenerateCV, onToggleFavorite, onViewSavedCV, forceExpand, onForceExpandDone }) {
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const [showUseCase, setShowUseCase] = useState(false)
  const [showMotivationLetter, setShowMotivationLetter] = useState(false)
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState(null) // Fix #18
  const statusBtnRef = useRef(null)
  const enrichTimerRef = useRef(null) // Fix #6
  const rowRef = useRef(null)

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
  const [newStep, setNewStep] = useState(() => {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    return {
      status: job.status,
      note: '',
      date: now.toISOString().split('T')[0],
      time: `${hh}:${mm}`
    }
  })
  const status = getStatus(job.status)
  const history = job.history || []

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
    onUpdateHistory(job.id, updated)
    setEditingStep(null)
    setEditForm({})
  }

  const handleDeleteStep = (displayIdx) => {
    // Fix #18 — confirmation is now handled inline (two-step UI), no window.confirm
    const idx = toOriginalIdx(displayIdx)
    const updated = history.filter((_, i) => i !== idx)
    onUpdateHistory(job.id, updated)
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

  // Deterministic avatar color from company name
  const avatarColors = [
    'bg-violet-100 text-violet-700','bg-blue-100 text-blue-700','bg-teal-100 text-teal-700',
    'bg-orange-100 text-orange-700','bg-pink-100 text-pink-700','bg-cyan-100 text-cyan-700',
    'bg-lime-100 text-lime-700','bg-amber-100 text-amber-700','bg-indigo-100 text-indigo-700',
  ]
  const avatarColor = avatarColors[job.company.charCodeAt(0) % avatarColors.length]
  const initials = job.company.split(/\s+/).slice(0,2).map(w => w[0]?.toUpperCase()).join('')

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
            <input type="checkbox" className="flex-shrink-0 accent-indigo-600 w-3.5 h-3.5 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()} />
            {/* Favorite star */}
            <button
              onClick={e => { e.stopPropagation(); onToggleFavorite && onToggleFavorite(job.id) }}
              className={`flex-shrink-0 text-sm leading-none transition-all hover:scale-110 -ml-1 ${job.favorite ? 'text-yellow-400' : 'text-gray-200 hover:text-yellow-300'}`}
            >★</button>
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${avatarColor}`}>
              {initials}
            </div>
            {/* Company + Position */}
            <div className="min-w-0">
              <div className="font-semibold text-gray-800 text-sm truncate leading-tight flex items-center gap-1.5">
                {job.company}
                {job.cvSaved && (
                  <span title={`CV généré le ${new Date(job.cvSaved.savedAt).toLocaleDateString('fr-FR')}`} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-600 flex-shrink-0">CV</span>
                )}
              </div>
              <div className="text-xs text-gray-400 truncate mt-0.5">{job.position}</div>
            </div>
          </div>
        </td>

        {/* Status */}
        <td className="py-3.5 px-4" onClick={e => e.stopPropagation()}>
          <button
            ref={statusBtnRef}
            onClick={openStatusMenu}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap ${status.color} hover:opacity-80 transition-opacity`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
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
                    {s.label}
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
              ? job.history[job.history.length - 1].date
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

        {/* Actions */}
        <td className="py-3.5 px-4" onClick={e => e.stopPropagation()}>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <RowActions
              expanded={expanded}
              onAddStep={() => setShowAddStep(v => !v)}
              onSync={handleEnrich}
              onUseCase={() => { setShowUseCase(v => !v); setShowAddStep(false) }}
              onEdit={() => onEdit(job)}
              onDelete={() => onDelete(job.id)}
              enriching={enriching}
              hasUseCase={!!job.useCase?.title}
            />
          </div>
        </td>
      </tr>

      {/* Expanded row — 2 columns */}
      {expanded && (
        <tr className="bg-slate-50/60 border-b border-indigo-100">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 ml-7">

              {/* ── LEFT: Timeline ──────────────────────────────────────── */}
              <div>
                {/* Timeline title */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Historique</h3>
                  {enrichResult && (
                    <span className={`text-xs px-2 py-1 rounded-full ${enrichResult.success ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {enrichResult.success ? `✓ +${enrichResult.count}` : '—'}
                    </span>
                  )}
                </div>

                {showAddStep && (
                  <div className="mb-3 bg-white rounded-xl p-3 border border-indigo-100 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <select className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        value={newStep.status} onChange={e => setNewStep(s => ({ ...s, status: e.target.value }))}>
                        {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                      <input type="date" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        value={newStep.date} onChange={e => setNewStep(s => ({ ...s, date: e.target.value }))} />
                      <input type="time" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        value={newStep.time || ''} onChange={e => setNewStep(s => ({ ...s, time: e.target.value }))} />
                    </div>
                    <input className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      placeholder="Note (ex: Entretien RH - 45min avec Marie)"
                      value={newStep.note} onChange={e => setNewStep(s => ({ ...s, note: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddStep() }} autoFocus />
                    <input className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      placeholder="🔗 Lien visio (Meet, Zoom, Teams...)"
                      value={newStep.meetingLink || ''} onChange={e => setNewStep(s => ({ ...s, meetingLink: e.target.value || undefined }))} />
                    <div className="flex justify-end">
                      <button onClick={handleAddStep} disabled={!newStep.note.trim()}
                        className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                        Ajouter
                      </button>
                    </div>
                  </div>
                )}

                <div className="relative">
                  {[...history].reverse().map((entry, i, arr) => {
                    const st = getStatus(entry.status)
                    const isLast = i === arr.length - 1
                    // Fix #19 — stable key: date + status + note prefix (not just index)
                    const entryKey = `${entry.date}-${entry.status}-${(entry.note || '').slice(0, 20)}-${i}`
                    return (
                      <div key={entryKey} className="flex gap-3 relative group/step">
                        {!isLast && <div className="absolute left-[7px] top-5 bottom-0 w-px bg-indigo-200" />}
                        {(() => {
                          const isMeeting = entry.source === 'calendar' || !!entry.meetingLink
                          // Fix: use rawStart if available (precise time), otherwise check if date is in the past
                          const isPastMeeting = isMeeting && (() => {
                            if (entry.rawStart) {
                              return new Date(entry.rawStart) < new Date()
                            }
                            // For date-only: meeting is past only if the date is before today
                            const today = new Date()
                            today.setHours(0, 0, 0, 0)
                            return new Date(entry.date) < today
                          })()
                          const isUpcomingMeeting = isMeeting && !isPastMeeting
                          // Fix #8 — proper email extraction before isNoReply check
                          const rawFrom = (entry.from || '').trim()
                          const angleMatch = rawFrom.match(/<([^>]+@[^>]+)>/)
                          const fromEmail = angleMatch ? angleMatch[1].trim() : (rawFrom.includes('@') && !rawFrom.includes(' ') ? rawFrom : null)
                          const showSender = entry.source === 'email' && !entry.fromMe && fromEmail && !isNoReply(fromEmail)
                          return (
                        <>
                        <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 mt-1 border-2 border-white shadow-sm ${isPastMeeting ? 'bg-gray-300' : isUpcomingMeeting ? 'bg-amber-400' : st.dot}`} />
                        <div className={`pb-3 flex-1 ${isPastMeeting ? 'opacity-50' : ''}`}>
                          {editingStep === i ? (
                            <div className="bg-white border border-indigo-200 rounded-xl p-3 space-y-2">
                              <div className="grid grid-cols-3 gap-2">
                                <select className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                  value={editForm.status || entry.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                                  {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                                </select>
                                <input type="date" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                  value={(editForm.date || entry.date)?.split('T')[0] || ''} onChange={e => setEditForm(f => {
                                    const currentDate = editForm.date || entry.date
                                    const time = currentDate?.split('T')[1] || ''
                                    return { ...f, date: time ? `${e.target.value}T${time}` : e.target.value }
                                  })} />
                                <input type="time" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                  value={((editForm.date || entry.date)?.split('T')[1] || '').slice(0, 5)} onChange={e => setEditForm(f => {
                                    const currentDate = editForm.date || entry.date
                                    const datePart = currentDate?.split('T')[0] || ''
                                    return { ...f, date: e.target.value ? `${datePart}T${e.target.value}:00` : datePart }
                                  })} />
                              </div>
                              <input className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                placeholder="Note" value={editForm.note !== undefined ? editForm.note : (entry.note || '')}
                                onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} />
                              <input className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                placeholder="🔗 Lien visio (optionnel)"
                                value={editForm.meetingLink !== undefined ? editForm.meetingLink : (entry.meetingLink || '')}
                                onChange={e => setEditForm(f => ({ ...f, meetingLink: e.target.value || undefined }))} />
                              <div className="flex justify-end gap-2">
                                <button onClick={() => { setEditingStep(null); setEditForm({}) }} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100">Annuler</button>
                                <button onClick={() => handleSaveEdit(i)} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700">Sauvegarder</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* Header: Status, Date, Sender, Actions */}
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <div className="flex items-center gap-2 flex-wrap flex-1">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isPastMeeting ? 'bg-gray-100 text-gray-400' : isUpcomingMeeting ? 'bg-amber-100 text-amber-700' : st.color}`}>{isPastMeeting ? '✓ Passé' : isUpcomingMeeting ? '📅 À venir' : st.label}</span>
                                  <span className={`text-xs text-gray-400 ${isPastMeeting ? 'line-through' : ''}`}>{entry.date && entry.date.includes('T') ? formatDateTime(entry.date) : formatDate(entry.date)}</span>
                                  {showSender && (
                                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                                      {angleMatch ? rawFrom.match(/^([^<]+)/)?.[1]?.trim().split(' ')[0] : fromEmail.split('@')[0]}
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-1 items-center flex-shrink-0">
                                  {confirmDeleteIdx === i ? (
                                    <>
                                      <button onClick={() => { handleDeleteStep(i); setConfirmDeleteIdx(null) }}
                                        className="text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded transition-colors">Supprimer</button>
                                      <button onClick={() => setConfirmDeleteIdx(null)}
                                        className="text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded">✕</button>
                                    </>
                                  ) : (
                                    <>
                                      <button onClick={() => { setEditingStep(i); setEditForm({ status: entry.status, date: entry.date, note: entry.note || '', meetingLink: entry.meetingLink || '' }) }}
                                        className="text-[10px] font-medium text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 px-2 py-0.5 rounded transition-colors">✏️ </button>
                                      <button onClick={() => setConfirmDeleteIdx(i)}
                                        className="text-[10px] font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 px-2 py-0.5 rounded transition-colors">🗑️</button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Notes: Full width single column */}
                              {entry.note && entry.note.includes(' · ') ? (
                                <ul className="mt-1 space-y-0.5">
                                  {entry.note.split(' · ').filter(Boolean).map((line, li) => (
                                    <li key={li} className="flex gap-1.5 text-xs text-gray-600">
                                      <span className="text-gray-300 flex-shrink-0 mt-0.5">•</span>
                                      <span>{line.trim()}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : entry.note ? (
                                <p className={`text-xs mt-0.5 ${entry.source === 'calendar' ? 'text-gray-400 italic' : 'text-gray-600'}`}>{entry.note}</p>
                              ) : null}
                              {/* Action links row — Fix #10: render extra gmailIds too */}
                              {(entry.meetingLink || entry.gmailId || entry.gmailIds?.length || (entry.source === 'calendar' && !entry.meetingLink)) && (
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  {entry.meetingLink && !isPastMeeting && (
                                    <a href={entry.meetingLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                      className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 px-2.5 py-1 rounded-lg transition-colors">
                                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                      Rejoindre {entry.meetingPlatform || 'la visio'} ↗
                                    </a>
                                  )}
                                  {entry.source === 'calendar' && !entry.meetingLink && (
                                    <span className="text-xs text-gray-400">📅 Google Calendar</span>
                                  )}
                                  {(() => {
                                    const ids = entry.gmailIds || (entry.gmailId ? [entry.gmailId] : [])
                                    if (ids.length === 0) return null
                                    const firstId = ids[0]
                                    const { url, account, uncertain } = gmailMessageUrl(firstId, entry.receivedBy)
                                    return (
                                      <a href={url} target="_blank" rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        className={`inline-flex items-center gap-1 text-xs transition-colors ${uncertain ? 'text-amber-400 hover:text-amber-600' : 'text-gray-400 hover:text-red-500'}`}
                                        title={uncertain ? '⚠ Compte incertain' : `${ids.length > 1 ? `${ids.length} emails` : 'Ouvrir'} dans ${account || 'Gmail'}`}>
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.909 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
                                        Voir l'email
                                        {ids.length > 1 && <span className="ml-0.5 px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-[10px] font-semibold">{ids.length}</span>}
                                        {account && <span className="text-[9px] opacity-60">({account.split('@')[0]})</span>}
                                        {uncertain && <span className="text-[9px]">⚠</span>}
                                      </a>
                                    )
                                  })()}
                                </div>
                              )}
                              {getTipsFromNote(entry.note).length > 0 && <StepTips note={entry.note} />}
                            </>
                          )}
                        </div>
                        </>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── RIGHT: Info Panel ────────────────────────────────────── */}
              <div className="space-y-3">

                {/* Upcoming events — top priority */}
                {upcomingEvents.length > 0 && (
                  <div className="bg-amber-50 rounded-xl border border-amber-100 p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">À venir</p>
                    {upcomingEvents.slice(0, 2).map((e, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-base">📅</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-amber-800 font-medium truncate">{e.note}</p>
                          <p className="text-[10px] text-amber-600">{formatDate(e.date)}</p>
                        </div>
                        {e.meetingLink && (
                          <a href={e.meetingLink} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()}
                            className="shrink-0 text-[10px] font-semibold bg-amber-500 text-white px-2 py-0.5 rounded-lg hover:bg-amber-600">
                            Rejoindre
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Recruiter / contacts */}
                {allContacts.length > 0 ? (
                  <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Contact{allContacts.length > 1 ? 's' : ''}</p>
                    {allContacts.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {c.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-800 truncate">{c.name}</p>
                          <p className="text-[10px] text-gray-400 truncate">{c.email}</p>
                          {c.receivedBy && (
                            <p className="text-[10px] text-indigo-500 truncate mt-0.5" title={`Reçu sur ${c.receivedBy}`}>
                              📬 {c.receivedBy}
                            </p>
                          )}
                        </div>
                        <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()}
                          className="shrink-0 flex items-center justify-center w-7 h-7 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-gray-100"
                          title={`Écrire à ${c.email}`}>
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-dashed border-gray-200 p-3 text-center">
                    <p className="text-xs text-gray-400">Aucun contact détecté</p>
                    <p className="text-[10px] text-gray-300 mt-0.5">Importé via Gmail lors du prochain scan</p>
                  </div>
                )}

                {/* Job details */}
                <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Candidature</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Poste</span>
                      <span className="text-gray-700 font-medium text-right max-w-[160px] truncate">{job.position}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Date</span>
                      <span className="text-gray-700">{formatDate(job.date)}</span>
                    </div>
                    {emailCount > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Emails</span>
                        <span className="text-gray-700">{emailCount} échange{emailCount > 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {history.length > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Étapes</span>
                        <span className="text-gray-700">{history.length}</span>
                      </div>
                    )}
                  </div>
                  {job.letterSaved && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px]">📝</span>
                        <span className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider">Lettre générée</span>
                      </div>
                      <span className="text-[10px] text-gray-400">{new Date(job.letterSaved.savedAt).toLocaleDateString('fr-FR')}</span>
                    </div>
                  )}
                  {job.url && (
                    // Fix #1 — try/catch: new URL() throws if url is malformed
                    <a href={job.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      className="mt-2 flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 hover:underline truncate">
                      <span>🔗</span>
                      <span className="truncate">{(() => { try { return new URL(job.url).hostname.replace('www.', '') } catch { return job.url } })()}</span>
                    </a>
                  )}
                  {/* CV or Motivation Letter Sections */}
                  {(job.cvSaved || (job.cvSaved && job.letterSaved)) && (
                    <div className="mt-2 pt-2 space-y-2 border-t border-gray-100">
                      {/* CV Section */}
                      {job.cvSaved && (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px]">📄</span>
                              <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider">CV adapté</span>
                            </div>
                            <span className="text-[10px] text-gray-400">{new Date(job.cvSaved.savedAt).toLocaleDateString('fr-FR')}</span>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={e => { e.stopPropagation(); onViewSavedCV && onViewSavedCV(job) }}
                              className="flex-1 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors text-center"
                            >
                              Voir le CV
                            </button>
                            {onGenerateCV && (
                              <button
                                onClick={e => { e.stopPropagation(); onGenerateCV(job) }}
                                className="flex-1 text-xs font-medium text-violet-600 bg-white border border-violet-100 px-3 py-1.5 rounded-lg hover:bg-violet-50 transition-colors text-center"
                              >
                                Regénérer
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Motivation Letter Section */}
                      {job.letterSaved && (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px]">📝</span>
                              <span className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider">Lettre générée</span>
                            </div>
                            <span className="text-[10px] text-gray-400">{new Date(job.letterSaved.savedAt).toLocaleDateString('fr-FR')}</span>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={e => { e.stopPropagation(); setShowMotivationLetter(true) }}
                              className="flex-1 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-100 px-3 py-1.5 rounded-lg hover:bg-orange-100 transition-colors text-center"
                            >
                              Voir la lettre
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setShowMotivationLetter(true) }}
                              className="flex-1 text-xs font-medium text-orange-600 bg-white border border-orange-100 px-3 py-1.5 rounded-lg hover:bg-orange-50 transition-colors text-center"
                            >
                              Regénérer
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>


                {/* Quick actions */}
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => onEdit(job)}
                    className="w-full text-xs font-medium text-gray-600 bg-white border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    ✏️ Modifier la candidature
                  </button>

                  {/* Generate CV button - only when no CV exists yet */}
                  {onGenerateCV && job.status === 'todo' && !job.cvSaved && (
                    <button onClick={() => onGenerateCV(job)}
                      className="w-full text-xs font-medium text-violet-600 bg-white border border-violet-100 px-3 py-2 rounded-lg hover:bg-violet-50 transition-colors text-left">
                      📄 Générer un CV adapté
                    </button>
                  )}

                  {/* Generate Motivation Letter button - only when no letter exists yet */}
                  {job.cvSaved && (job.status === 'todo' || job.status === 'sent') && !job.letterSaved && (
                    <button onClick={() => setShowMotivationLetter(true)}
                      className="w-full text-xs font-medium text-orange-600 bg-white border border-orange-100 px-3 py-2 rounded-lg hover:bg-orange-50 transition-colors text-left">
                      ✍️ Générer une lettre
                    </button>
                  )}
                </div>

              </div>
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
    </>
  )
}
