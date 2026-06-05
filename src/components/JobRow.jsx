import { useState } from 'react'
import { enrichJobTimeline } from '../services/enrichTimeline'
import AdvicePanel from './AdvicePanel'
import { STATUSES, getStatus } from '../hooks/useJobs'

function StepTips({ status }) {
  const tips = STEP_TIPS[status] || []
  if (!tips.length) return null
  return (
    <div className="relative inline-block mt-1 group/tips">
      <span className="text-[11px] text-amber-500 cursor-default select-none px-1 py-0.5 rounded hover:bg-amber-50 transition-colors">
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

const STEP_TIPS = {
  sent:         ["Connecte-toi sur LinkedIn avec un employé de l'entreprise", "Prépare un message de relance pour J+14 si pas de réponse"],
  reviewing:    ["Consulte Glassdoor pour connaître la culture de l'entreprise", "Prépare 3-5 questions pertinentes à poser lors d'un éventuel entretien"],
  interview:    ["Prépare des réponses STAR pour chaque expérience clé", "Recherche les dernières actualités de l'entreprise", "Envoie un email de remerciement dans les 24h après l'entretien"],
  done:         ["Note les points forts et faibles de cet échange", "Envoie un email de remerciement si ce n'est pas encore fait", "Continue de candidater — ne bloque pas sur une seule opportunité"],
  waiting:      ["Relance poliment après 5-7 jours ouvrés si pas de retour", "Continue de candidater activement"],
  offer:        ["Ne jamais accepter sans avoir négocié", "Demande un délai de réflexion de 48-72h", "Négocie salaire, télétravail, date de prise de poste"],
  rejected:     ["Envoie un email de remerciement — ça te différencie", "Demande un feedback constructif"],
  rejected_ats: ["Analyse les mots-clés de l'offre et intègre-les dans ton CV", "Évite les CV en tableau — les ATS les lisent mal"],
}

export default function JobRow({ job, onEdit, onDelete, onStatusChange, onAddStep, onUpdateHistory, onGenerateCV, onToggleFavorite }) {
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showAddStep, setShowAddStep] = useState(false)
  const [enriching, setEnriching] = useState(false)

  // Get display label for history entry source
  const getSourceLabel = (entry) => {
    if (entry.source === 'calendar') return null // handled separately
    if (entry.source === 'email') {
      if (entry.fromMe) return 'Vous'
      if (entry.from) {
        // Extract name from "Name <email>" format
        const match = entry.from.match(/^([^<]+)/)
        return match ? match[1].trim().split(' ')[0] : entry.from.split('@')[0]
      }
      return job.company
    }
    return null
  }
  const [enrichResult, setEnrichResult] = useState(null)
  const [editingStep, setEditingStep] = useState(null) // index of step being edited
  const [editForm, setEditForm] = useState({})
  const [newStep, setNewStep] = useState({ status: job.status, note: '', date: new Date().toISOString().split('T')[0] })
  const status = getStatus(job.status)
  const history = job.history || []

  // Extract recruiter name from history — first inbound email with a sender
  const recruiter = (() => {
    for (const h of history) {
      if (h.fromMe || !h.from) continue
      const raw = h.from
      // "First Last <email@domain.com>" → extract name part
      const nameMatch = raw.match(/^([^<]+)</)
      const name = nameMatch ? nameMatch[1].trim() : raw.split('@')[0]
      if (name && name.length > 1) return name
    }
    return null
  })()

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const handleAddStep = () => {
    if (!newStep.note.trim()) return
    onAddStep(job.id, newStep)
    setNewStep({ status: job.status, note: '', date: new Date().toISOString().split('T')[0] })
    setShowAddStep(false)
  }

  // History is displayed reversed — convert display index back to original array index
  const toOriginalIdx = (displayIdx) => history.length - 1 - displayIdx

  const handleSaveEdit = (displayIdx) => {
    const idx = toOriginalIdx(displayIdx)
    const updated = [...history]
    updated[idx] = { ...updated[idx], ...editForm }
    onUpdateHistory(job.id, updated)
    setEditingStep(null)
    setEditForm({})
  }

  const handleDeleteStep = (displayIdx) => {
    if (!window.confirm('Supprimer cette étape ?')) return
    const idx = toOriginalIdx(displayIdx)
    const updated = history.filter((_, i) => i !== idx)
    onUpdateHistory(job.id, updated)
  }

  const handleEnrich = async () => {
    setEnriching(true)
    setEnrichResult(null)
    try {
      // Auto-enrichir = Calendar only (emails are already fetched during Gmail import)
      const result = await enrichJobTimeline(job, { calendarOnly: true })
      if (result) {
        onUpdateHistory(job.id, result.history)
        setEnrichResult({ success: true, count: result.newCount })
      } else {
        setEnrichResult({ success: false })
      }
    } catch (e) {
      setEnrichResult({ success: false, error: e.message })
    }
    setEnriching(false)
    setTimeout(() => setEnrichResult(null), 3000)
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
              <div className="font-semibold text-gray-800 text-sm truncate leading-tight">{job.company}</div>
              <div className="text-xs text-gray-400 truncate mt-0.5">{job.position}</div>
            </div>
          </div>
        </td>

        {/* Status */}
        <td className="py-3.5 px-4" onClick={e => e.stopPropagation()}>
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(v => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap ${status.color} hover:opacity-80 transition-opacity`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {status.label}
              <span className="text-xs opacity-60">▾</span>
            </button>
            {showStatusMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
                <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 min-w-[180px]">
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
          </div>
        </td>

        {/* Date */}
        <td className="py-3.5 px-4 text-xs text-gray-500 whitespace-nowrap">{formatDate(job.date)}</td>

        {/* Notes */}
        <td className="py-3.5 px-4 max-w-xs">
          {job.notes
            ? <span className="text-xs text-gray-500 line-clamp-1">{job.notes}</span>
            : <span className="text-xs text-gray-300">—</span>}
        </td>

        {/* URL */}
        <td className="py-3.5 px-4" onClick={e => e.stopPropagation()}>
          {job.url
            ? <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline whitespace-nowrap">Voir l'offre ↗</a>
            : <span className="text-xs text-gray-300">—</span>}
        </td>

        {/* Actions */}
        <td className="py-3.5 px-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(job)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Modifier">✏️</button>
            <button onClick={() => onDelete(job)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Supprimer">🗑️</button>
          </div>
        </td>
      </tr>

      {/* Expanded history row */}
      {expanded && (
        <tr className="bg-indigo-50/30 border-b border-indigo-100">
          <td colSpan={6} className="px-4 py-3">
            <div className="ml-7">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Historique</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleEnrich}
                    disabled={enriching}
                    className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1 hover:bg-purple-100 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                    title="Synchroniser avec Google Calendar"
                  >
                    {enriching ? '⏳' : '📅'} {enriching ? 'Synchro...' : 'Sync Calendar'}
                  </button>
                  {enrichResult && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${enrichResult.success ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {enrichResult.success ? `+${enrichResult.count} événement${enrichResult.count > 1 ? 's' : ''}` : 'Rien de nouveau'}
                    </span>
                  )}
                  <button
                    onClick={() => setShowAddStep(v => !v)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors"
                  >
                    {showAddStep ? '✕ Annuler' : '+ Ajouter une étape'}
                  </button>
                </div>
              </div>

              {/* Timeline */}
              <div className="relative">
                {[...history].reverse().map((entry, i, arr) => {
                  const st = getStatus(entry.status)
                  const isLast = i === arr.length - 1
                  return (
                    <div key={i} className="flex gap-3 relative group/step">
                      {/* Line */}
                      {!isLast && (
                        <div className="absolute left-[7px] top-5 bottom-0 w-px bg-indigo-200" />
                      )}
                      {/* Dot */}
                      <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 mt-1 border-2 border-white shadow-sm ${st.dot}`} />
                      {/* Content */}
                      <div className="pb-3 flex-1">
                        {editingStep === i ? (
                          /* Edit mode */
                          <div className="bg-white border border-indigo-200 rounded-xl p-3 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                value={editForm.status || entry.status}
                                onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                              >
                                {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                              </select>
                              <input
                                type="date"
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                value={editForm.date || entry.date}
                                onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                              />
                            </div>
                            <input
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                              placeholder="Note"
                              value={editForm.note !== undefined ? editForm.note : (entry.note || '')}
                              onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                            />
                            <input
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                              placeholder="🔗 Lien visio (optionnel)"
                              value={editForm.meetingLink !== undefined ? editForm.meetingLink : (entry.meetingLink || '')}
                              onChange={e => setEditForm(f => ({ ...f, meetingLink: e.target.value || undefined }))}
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => { setEditingStep(null); setEditForm({}) }} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100">Annuler</button>
                              <button onClick={() => handleSaveEdit(i)} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700">Sauvegarder</button>
                            </div>
                          </div>
                        ) : (
                          /* View mode */
                          <>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                                {st.label}
                              </span>
                              <span className="text-xs text-gray-400">{formatDate(entry.date)}</span>
                              {/* Edit/Delete buttons - visible on hover */}
                              <div className="ml-auto opacity-0 group-hover/step:opacity-100 transition-opacity flex gap-1">
                                <button
                                  onClick={() => { setEditingStep(i); setEditForm({ status: entry.status, date: entry.date, note: entry.note || '', meetingLink: entry.meetingLink || '' }) }}
                                  className="text-gray-300 hover:text-indigo-500 text-xs p-0.5 rounded"
                                  title="Modifier"
                                >✏️</button>
                                <button
                                  onClick={() => handleDeleteStep(i)}
                                  className="text-gray-300 hover:text-red-400 text-xs p-0.5 rounded"
                                  title="Supprimer"
                                >🗑️</button>
                              </div>
                            </div>
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
                            <p className="text-xs text-gray-600 mt-0.5">{entry.note}</p>
                          ) : null}
                            {entry.meetingLink && (
                              <a
                                href={entry.meetingLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 mt-1 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 px-2.5 py-1 rounded-lg transition-colors"
                                onClick={e => e.stopPropagation()}
                              >
                                <span>{entry.meetingEmoji || '📹'}</span>
                                Rejoindre {entry.meetingPlatform || 'la visio'} ↗
                              </a>
                            )}
                            {entry.source === 'calendar' && !entry.meetingLink && (
                              <span className="text-xs text-gray-400 mt-0.5 inline-block">📅 Google Calendar</span>
                            )}
                        {entry.gmailId && (
                          <a
                            href={`https://mail.google.com/mail/u/0/#inbox/${entry.gmailId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1 mt-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                            title="Ouvrir dans Gmail"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.909 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
                            </svg>
                            Voir l'email
                          </a>
                        )}
                        {/* Per-step tips */}
                        {STEP_TIPS[entry.status]?.length > 0 && (
                          <StepTips status={entry.status} />
                        )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Add step form */}
              {showAddStep && (
                <div className="mt-2 bg-white rounded-xl p-3 border border-indigo-100 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      value={newStep.status}
                      onChange={e => setNewStep(s => ({ ...s, status: e.target.value }))}
                    >
                      {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    <input
                      type="date"
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      value={newStep.date}
                      onChange={e => setNewStep(s => ({ ...s, date: e.target.value }))}
                    />
                  </div>
                  <input
                    className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    placeholder="Note (ex: Entretien RH - 45min avec Marie)"
                    value={newStep.note}
                    onChange={e => setNewStep(s => ({ ...s, note: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddStep() }}
                  />
                  <input
                    className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    placeholder="🔗 Lien visio (Meet, Zoom, Teams...)"
                    value={newStep.meetingLink || ''}
                    onChange={e => setNewStep(s => ({ ...s, meetingLink: e.target.value || undefined }))}
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleAddStep}
                      disabled={!newStep.note.trim()}
                      className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                    >
                      Ajouter
                    </button>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
