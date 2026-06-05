import { useState } from 'react'
import { connectGmail, disconnectGmail, fetchJobEmails, isConnected, isGmailConfigured, getGmailUserInfo, getCachedUser } from '../services/gmail'
import { fetchCalendarEvents } from '../services/calendar'
import { buildJobsFromEmails } from '../hooks/useAutoRefresh'
import { getStatus, isAtsRejection } from '../hooks/useJobs'

const STEPS = { idle: 'idle', connecting: 'connecting', fetching: 'fetching', parsing: 'parsing', review: 'review' }

const MONTH_OPTIONS = [
  { value: 1,  label: '1 mois' },
  { value: 3,  label: '3 mois' },
  { value: 6,  label: '6 mois' },
  { value: 12, label: '12 mois' },
  { value: 24, label: '24 mois' },
]

export default function GmailImport({ onImport, onUpdate, onClose, existingJobs, onUserChange }) {
  const [step, setStep] = useState(STEPS.idle)
  const [gmailUser, setGmailUser] = useState(() => getCachedUser())
  const [connected, setConnected] = useState(isConnected())
  const [forceImport, setForceImport] = useState(false)
  const [debugInfo, setDebugInfo] = useState(null)
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [error, setError] = useState(null)
  const [emailCount, setEmailCount] = useState(0)
  const [months, setMonths] = useState(3)

  const handleDisconnect = () => {
    disconnectGmail()
    setConnected(false)
    setGmailUser(null)
    onUserChange?.(null)
    setStep(STEPS.idle)
    setResults([])
  }

  const handleConnect = async () => {
    if (!isGmailConfigured()) {
      setError('Clé Google Client ID manquante. Ajoutez VITE_GOOGLE_CLIENT_ID dans votre fichier .env')
      return
    }
    try {
      setStep(STEPS.connecting)
      setError(null)
      await connectGmail()
      setConnected(true)
      setStep(STEPS.idle)
      // connectGmail fetches and caches user info; fall back to a direct fetch if it failed
      const user = getCachedUser() || await getGmailUserInfo()
      setGmailUser(user)
      onUserChange?.(user)
    } catch (e) {
      setError('Connexion Gmail annulée ou échouée : ' + e.message)
      setStep(STEPS.idle)
    }
  }

  const handleScan = async () => {
    try {
      setStep(STEPS.fetching)
      setError(null)
      const emails = await fetchJobEmails(100, months)
      setEmailCount(emails.length)

      if (emails.length === 0) {
        setError(`Aucun email trouvé sur ${months} mois. Essayez d'augmenter la période ou vérifiez vos autorisations Gmail.`)
        setStep(STEPS.idle)
        return
      }

      // Debug info
      setDebugInfo({
        emailsFound: emails.length,
        subjects: emails.slice(0, 10).map(e => `${e.from?.split('<')[0]?.trim() || e.from} → ${e.subject}`),
      })

      setStep(STEPS.parsing)
      // Fetch emails→jobs (with meeting links) + Calendar in parallel
      const [grouped, calendarEvents] = await Promise.all([
        buildJobsFromEmails(emails, []),
        fetchCalendarEvents('', months).catch(() => []),
      ])
      // Merge calendar events per company into existing history
      if (calendarEvents.length > 0) {
        for (const job of grouped) {
          const co = job.company.toLowerCase()
          const calEntries = calendarEvents
            .filter(e => e.title.toLowerCase().includes(co) || (e.description || '').toLowerCase().includes(co))
            .map(e => ({
              date: e.date,
              status: e.type === 'interview' ? 'interview' : e.type === 'offer' ? 'offer' : 'waiting',
              note: `📅 ${e.title}${e.isUpcoming ? ' (à venir)' : ''}`,
              source: 'calendar', isUpcoming: e.isUpcoming,
            }))
          const existingCalKeys = new Set(job.history.map(h => `${h.date}-${h.status}`))
          const newCal = calEntries.filter(e => !existingCalKeys.has(`${e.date}-${e.status}`))
          if (newCal.length) job.history = [...job.history, ...newCal].sort((a, b) => new Date(a.date) - new Date(b.date))
        }
      }
      const normalize = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      const jobByKey = new Map(existingJobs.map(j => [`${normalize(j.company)}_${normalize(j.position)}`, j]))

      // Split into new jobs + updates to existing jobs
      const newJobs = grouped.filter(p => !jobByKey.has(`${normalize(p.company)}_${normalize(p.position)}`))
      const updates = forceImport ? [] : grouped
        .filter(p => jobByKey.has(`${normalize(p.company)}_${normalize(p.position)}`))
        .map(p => {
          const existing = jobByKey.get(`${normalize(p.company)}_${normalize(p.position)}`)
          const normNote = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 80)
          const existingHistKeys = new Set((existing.history || []).map(h => `${h.date}_${normNote(h.note)}`))
          const newEntries = (p.history || []).filter(h => !existingHistKeys.has(`${h.date}_${normNote(h.note)}`))
          return newEntries.length > 0 ? { ...p, _existingId: existing.id, _newEntries: newEntries, _isUpdate: true } : null
        })
        .filter(Boolean)

      const displayList = forceImport ? grouped : [...newJobs, ...updates]
      console.log('After grouping + calendar:', displayList)
      setDebugInfo(prev => ({ ...prev, parsed: grouped.length, afterDedup: displayList.length, rawParsed: grouped.slice(0,5) }))
      setResults(displayList)
      setSelected(new Set(displayList.map((_, i) => i)))
      setStep(STEPS.review)
    } catch (e) {
      setError('Erreur lors du scan : ' + e.message)
      setStep(STEPS.idle)
    }
  }

  const handleImport = () => {
    const selected_ = results.filter((_, i) => selected.has(i))

    // New jobs → addJob via onImport
    const toImport = selected_
      .filter(r => !r._isUpdate)
      .map(r => ({
        company: r.company || 'Inconnu',
        position: r.position || 'Poste non précisé',
        url: '', status: r.status || 'sent',
        date: r.date || new Date().toISOString().split('T')[0],
        notes: r.notes || '',
        _gmailId: r.gmailId, _fromEmail: r.fromEmail, _fromMe: r.fromMe,
        _history: r.history?.length > 0 ? r.history : undefined,
      }))

    // Updates → merge new history entries into existing job
    const toUpdate = selected_.filter(r => r._isUpdate)
    toUpdate.forEach(r => {
      const existing = existingJobs.find(j => j.id === r._existingId)
      if (!existing || !onUpdate) return
      const STATUS_ORDER = ['todo','sent','reviewing','interview','waiting','offer','rejected','rejected_ats','cancelled','archived']
      const mergedHistory = [...(existing.history || []), ...r._newEntries]
        .sort((a, b) => new Date(a.date) - new Date(b.date))
      const newStatus = STATUS_ORDER.indexOf(r.status) > STATUS_ORDER.indexOf(existing.status)
        ? r.status : existing.status
      onUpdate(existing.id, { history: mergedHistory, status: newStatus })
    })

    if (toImport.length > 0) onImport(toImport)
    onClose()
  }

  const toggleSelect = (i) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const isLoading = [STEPS.connecting, STEPS.fetching, STEPS.parsing].includes(step)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!isLoading ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl z-10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-lg">📧</div>
            <div>
              <h2 className="font-semibold text-gray-800 text-sm">Import depuis Gmail</h2>
              <p className="text-xs text-gray-400">Détection automatique des candidatures</p>
            </div>
          </div>
          {!isLoading && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          )}
        </div>

        <div className="px-6 py-5">
          {/* Not connected */}
          {!connected && step !== STEPS.connecting && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">🔐</div>
              <p className="text-gray-700 font-medium mb-1">Connectez votre Gmail</p>
              <p className="text-sm text-gray-400 mb-6">Lecture seule — aucune donnée stockée sur nos serveurs.</p>
              {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-3 mb-4">{error}</p>}
              <button
                onClick={handleConnect}
                className="flex items-center gap-2 mx-auto bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 font-medium px-5 py-2.5 rounded-xl text-sm transition-all shadow-sm hover:shadow"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Se connecter avec Google
              </button>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 mb-4">
                <svg className="w-6 h-6 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
              <p className="font-medium text-gray-700 mb-1">
                {step === STEPS.connecting && 'Connexion à Gmail...'}
                {step === STEPS.fetching && `Scan multi-sources sur ${months} mois...`}
                {step === STEPS.parsing && `Analyse IA de ${emailCount} email${emailCount > 1 ? 's' : ''} uniques...`}
              </p>
              <p className="text-xs text-gray-400">
                {step === STEPS.parsing && 'Claude identifie les candidatures et leurs statuts'}
              </p>
            </div>
          )}

          {/* Connected idle */}
          {connected && step === STEPS.idle && (
            <div className="text-center py-4">
              {/* Account info */}
              <div className="flex items-center justify-center gap-3 mb-5">
                <div className="flex items-center gap-2 bg-green-50 border border-green-100 text-green-700 text-xs font-medium px-3 py-1.5 rounded-full">
                  {gmailUser?.picture
                    ? <img src={gmailUser.picture} alt="" className="w-4 h-4 rounded-full" />
                    : <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  }
                  <span>{gmailUser?.email || 'Gmail connecté'}</span>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  title="Déconnecter"
                >
                  Déconnecter
                </button>
              </div>

              {/* Month selector */}
              <div className="mb-6">
                <p className="text-sm text-gray-600 mb-3">Combien de mois voulez-vous scanner ?</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  {MONTH_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setMonths(o.value)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                        months === o.value
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-3 mb-4">{error}</p>}
              <div className="flex items-center justify-center gap-2 mb-4">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                  <div
                    onClick={() => setForceImport(v => !v)}
                    className={`w-9 h-5 rounded-full transition-colors relative ${forceImport ? 'bg-indigo-600' : 'bg-gray-200'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${forceImport ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  Forcer l'import (ignorer les doublons)
                </label>
              </div>
              {forceImport && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5 mb-3 text-center">
                  ⚠️ Toutes les candidatures détectées seront importées, même si déjà présentes
                </p>
              )}
              {debugInfo && (
                <div className="mb-3 bg-gray-50 rounded-xl p-3 text-left">
                  <p className="text-xs font-semibold text-gray-600 mb-1">🔍 Debug dernier scan :</p>
                  <p className="text-xs text-gray-500">📧 {debugInfo.emailsFound} emails trouvés</p>
                  {debugInfo.parsed !== undefined && <p className="text-xs text-gray-500">🤖 {debugInfo.parsed} parsés par Claude</p>}
                  {debugInfo.afterDedup !== undefined && <p className="text-xs text-gray-500">✅ {debugInfo.afterDedup} après filtre doublons</p>}
                  {debugInfo.subjects?.length > 0 && (
                    <div className="mt-1.5">
                      <p className="text-xs font-medium text-gray-500">Emails scannés :</p>
                      {debugInfo.subjects.map((s, i) => (
                        <p key={i} className="text-xs text-gray-400 truncate">• {s}</p>
                      ))}
                    </div>
                  )}
                  {debugInfo.rawParsed?.length > 0 && (
                    <div className="mt-1.5">
                      <p className="text-xs font-medium text-gray-500">Parsés par Claude :</p>
                      {debugInfo.rawParsed.map((r, i) => (
                        <p key={i} className="text-xs text-indigo-400 truncate">• {r.company} — {r.position} ({r.status}, {r.confidence}%)</p>
                      ))}
                    </div>
                  )}
                  {debugInfo.parsed === 0 && (
                    <p className="text-xs text-red-400 mt-1">⚠️ Claude n'a détecté aucune candidature dans ces emails</p>
                  )}
                </div>
              )}
              <div className="flex gap-3 justify-center">
                <button onClick={handleDisconnect} className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
                  Déconnecter
                </button>
                <button onClick={handleScan} className="bg-indigo-600 text-white text-sm font-medium px-6 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors">
                  🔍 Scanner {months} mois
                </button>
              </div>
            </div>
          )}

          {/* Review */}
          {step === STEPS.review && (
            <div>
              {results.length === 0 ? (
                <div className="text-center py-6">
                  <div className="text-3xl mb-3">🤷</div>
                  <p className="text-gray-600 font-medium">Aucune nouvelle candidature détectée</p>
                  <p className="text-xs text-gray-400 mt-1">Toutes les candidatures trouvées sont déjà dans votre liste.</p>
                  {!forceImport && (
                    <button
                      onClick={() => { setForceImport(true); setStep(STEPS.idle) }}
                      className="mt-3 text-xs text-indigo-600 hover:underline"
                    >
                      Réessayer en ignorant les doublons →
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gray-700">
                      {results.filter(r => !r._isUpdate).length > 0 && `${results.filter(r => !r._isUpdate).length} nouvelle${results.filter(r => !r._isUpdate).length > 1 ? 's' : ''}`}
                      {results.filter(r => !r._isUpdate).length > 0 && results.filter(r => r._isUpdate).length > 0 && ' · '}
                      {results.filter(r => r._isUpdate).length > 0 && `${results.filter(r => r._isUpdate).length} mise${results.filter(r => r._isUpdate).length > 1 ? 's' : ''} à jour`}
                    </p>
                    <p className="text-xs text-gray-400">{selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</p>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {results.map((r, i) => {
                      const st = getStatus(r.status)
                      const isSelected = selected.has(i)
                      return (
                        <div key={i} onClick={() => toggleSelect(i)}
                          className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            isSelected ? 'border-indigo-200 bg-indigo-50/50' : 'border-gray-100 bg-gray-50/50 opacity-60'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border-2 transition-colors ${
                            isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                          }`}>
                            {isSelected && <span className="text-white text-xs">✓</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm text-gray-800">{r.company}</span>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                {st.label}
                              </span>
                              {r._isUpdate
                                ? <span className="text-xs bg-blue-100 text-blue-700 font-medium px-1.5 py-0.5 rounded-full">↻ {r._newEntries?.length} nouv.</span>
                                : r.confidence && <span className="text-xs text-gray-400">{r.confidence}% sûr</span>
                              }
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{r.position}</p>
                            {r._isUpdate && r._newEntries?.length > 0 && (
                              <p className="text-xs text-blue-600 mt-0.5 italic">{r._newEntries[r._newEntries.length - 1]?.note}</p>
                            )}
                            {!r._isUpdate && r.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{r.notes}</p>}
                          </div>
                          <span className="text-xs text-gray-400 flex-shrink-0">{r.date}</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {step === STEPS.review && results.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">Annuler</button>
            <button onClick={handleImport} disabled={selected.size === 0}
              className="px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              Importer {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
