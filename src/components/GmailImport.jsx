import { useState } from 'react'
import { connectGmail, disconnectGmail, refreshToken, fetchJobEmails, fetchJobEmailsForAccount, isConnected, isGmailConfigured, getGmailUserInfo, getCachedUser, getConnectedAccounts } from '../services/gmail'
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
  const [connectedAccounts, setConnectedAccounts] = useState(() => getConnectedAccounts())
  const [scanAccount, setScanAccount] = useState(null) // null = all accounts
  const [forceImport, setForceImport] = useState(false)
  const [debugInfo, setDebugInfo] = useState(null)
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [error, setError] = useState(null)
  const [emailCount, setEmailCount] = useState(0)
  const [months, setMonths] = useState(3)

  // backward compat
  const gmailUser = connectedAccounts[0] || null
  const connected = connectedAccounts.length > 0

  function refreshAccountList() {
    const accounts = getConnectedAccounts()
    setConnectedAccounts(accounts)
    onUserChange?.(accounts[0] || null)
  }

  const handleDisconnect = (email) => {
    disconnectGmail(email)
    refreshAccountList()
    if (!isConnected()) {
      setStep(STEPS.idle)
      setResults([])
    }
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
      refreshAccountList()
      setStep(STEPS.idle)
    } catch (e) {
      setError('Connexion Gmail annulée ou échouée : ' + e.message)
      setStep(STEPS.idle)
    }
  }

  const handleScan = async () => {
    try {
      setStep(STEPS.fetching)
      setError(null)

      // If token expired, silently refresh before scanning
      if (!isConnected()) {
        try {
          setError(null)
          await refreshToken()
        } catch {
          setError('Session expirée — veuillez vous reconnecter.')
          setConnected(false)
          setStep(STEPS.idle)
          return
        }
      }

      // Fetch from selected account or ALL connected accounts
      let emails = []
      if (scanAccount) {
        emails = await fetchJobEmailsForAccount(scanAccount, null, months)
      } else if (connectedAccounts.length > 1) {
        // Fetch from all accounts in parallel, deduplicate by id
        setStep(STEPS.fetching)
        const perAccount = await Promise.all(
          connectedAccounts.map(acct =>
            fetchJobEmailsForAccount(acct.email, null, months)
              .then(res => res.map(e => ({ ...e, _account: acct.email })))
              .catch(() => [])
          )
        )
        const seen = new Set()
        for (const batch of perAccount) {
          for (const e of batch) {
            if (!seen.has(e.id)) { seen.add(e.id); emails.push(e) }
          }
        }
      } else {
        emails = await fetchJobEmails(null, months)
      }
      setEmailCount(emails.length)

      if (emails.length === 0) {
        setError(`Aucun email trouvé sur ${months} mois. Essayez d'augmenter la période ou vérifiez vos autorisations Gmail.`)
        setStep(STEPS.idle)
        return
      }

      // Debug info — show ALL emails so user can verify what was fetched
      setDebugInfo({
        emailsFound: emails.length,
        subjects: emails.map(e => `${e.from?.split('<')[0]?.trim() || e.from} → ${e.subject}`),
      })

      setStep(STEPS.parsing)
      // Fetch emails→jobs (with meeting links) + Calendar in parallel
      const [grouped, calendarEvents] = await Promise.all([
        buildJobsFromEmails(emails, []),
        fetchCalendarEvents('', months).catch(() => []),
      ])
      // Build a gmailId → account map from the raw emails (populated when scanning multiple accounts)
      const emailAccountMap = {}
      for (const e of emails) {
        if (e._account && e.id) emailAccountMap[e.id] = e._account
      }
      const fallbackAccount = scanAccount || (connectedAccounts.length === 1 ? connectedAccounts[0]?.email : null)

      // Stamp every email history entry with the account that received it
      for (const job of grouped) {
        job.history = (job.history || []).map(h => {
          if (h.source !== 'email') return h
          const acct = (h.gmailId && emailAccountMap[h.gmailId]) || h.receivedBy || fallbackAccount
          return acct ? { ...h, receivedBy: acct } : h
        })
      }
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
      const jobByCompany = new Map(existingJobs.map(j => [normalize(j.company), j]))

      // Exact match first, then company-only fallback — job boards often give
      // a different position title than what was originally imported
      const findExisting = p => {
        const key = `${normalize(p.company)}_${normalize(p.position)}`
        if (jobByKey.has(key)) return jobByKey.get(key)
        return jobByCompany.get(normalize(p.company)) || null
      }

      // Split into new jobs + updates to existing jobs
      const newJobs = grouped.filter(p => !findExisting(p))
      const updates = forceImport ? [] : grouped
        .filter(p => !!findExisting(p))
        .map(p => {
          const existing = findExisting(p)
          const normNote = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 80)
          // Expand merged "note1 · note2" entries so individual notes match too
          const expandKeys = hist => new Set(hist.flatMap(h => (h.note || '').split(' · ').map(n => `${h.date}_${normNote(n)}`)))
          const existingHistKeys = expandKeys(existing.history || [])
          const newEntries = (p.history || []).filter(h => !existingHistKeys.has(`${h.date}_${normNote(h.note)}`))
          return newEntries.length > 0 ? { ...p, _existingId: existing.id, _newEntries: newEntries, _isUpdate: true } : null
        })
        .filter(Boolean)

      const displayList = forceImport ? grouped : [...newJobs, ...updates]

      // Grouped results that matched an existing job but had NO new entries (already up-to-date)
      const alreadyUpToDate = grouped.filter(p => {
        const existing = findExisting(p)
        if (!existing) return false
        const normNote = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 80)
        const expandKeys = hist => new Set(hist.flatMap(h => (h.note || '').split(' · ').map(n => `${h.date}_${normNote(n)}`)))
        const existingHistKeys = expandKeys(existing.history || [])
        return !(p.history || []).some(h => !existingHistKeys.has(`${h.date}_${normNote(h.note)}`))
      })

      setDebugInfo(prev => ({
        ...prev,
        parsed: grouped.length,
        afterDedup: displayList.length,
        newJobs: newJobs.length,
        updatesFound: updates.length,
        alreadyUpToDate: alreadyUpToDate.length,
        rawParsed: grouped.map(p => ({
          company: p.company,
          position: p.position,
          status: p.status,
          historyCount: p.history?.length,
          matched: !!findExisting(p) ? 'update' : 'new',
        })),
      }))
      setResults(displayList)
      setSelected(new Set(displayList.map((_, i) => i)))
      setStep(STEPS.review)
    } catch (e) {
      if (e.message?.includes('401') || e.message === 'Non connecté à Gmail') {
        setConnected(false)
        setError('Session expirée — cliquez sur "Reconnecter" puis relancez le scan.')
      } else {
        setError('Erreur lors du scan : ' + e.message)
      }
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
            <div className="py-6 space-y-5">
              {/* Steps */}
              {[
                {
                  id: STEPS.connecting,
                  icon: '🔐',
                  label: 'Connexion Gmail',
                  detail: 'Authentification OAuth en cours…',
                },
                {
                  id: STEPS.fetching,
                  icon: '📬',
                  label: `Lecture des emails (${months} mois)`,
                  detail: connectedAccounts.length > 1
                    ? `Scan de ${connectedAccounts.length} comptes en parallèle — 7 requêtes par compte…`
                    : 'Scan multi-sources : recruteurs, ATS, LinkedIn, WTTJ…',
                },
                {
                  id: STEPS.parsing,
                  icon: '🤖',
                  label: `Analyse IA — ${emailCount} email${emailCount > 1 ? 's' : ''} trouvé${emailCount > 1 ? 's' : ''}`,
                  detail: (() => {
                    const batches = Math.ceil(emailCount / 8)
                    const estSecs = batches * 3 + batches * 2 // delay + API time
                    const estMin = Math.ceil(estSecs / 60)
                    return `Claude extrait entreprise, poste, statut et dates. Environ ${estMin > 1 ? `${estMin} minutes` : `${estSecs} secondes`} (${batches} lots de 8 emails, avec pauses anti-rate-limit).`
                  })(),
                },
              ].map((s, i) => {
                const stepOrder = [STEPS.connecting, STEPS.fetching, STEPS.parsing]
                const currentIdx = stepOrder.indexOf(step)
                const stepIdx = stepOrder.indexOf(s.id)
                const isDone = stepIdx < currentIdx
                const isActive = stepIdx === currentIdx

                return (
                  <div key={s.id} className={`flex items-start gap-3 transition-all ${isActive ? 'opacity-100' : isDone ? 'opacity-50' : 'opacity-25'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-base transition-all ${
                      isDone ? 'bg-green-100' : isActive ? 'bg-indigo-100 ring-2 ring-indigo-300 ring-offset-1' : 'bg-gray-100'
                    }`}>
                      {isDone ? '✓' : isActive ? (
                        <svg className="w-4 h-4 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      ) : s.icon}
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <p className={`text-sm font-semibold ${isActive ? 'text-indigo-700' : isDone ? 'text-green-700' : 'text-gray-400'}`}>
                        {s.label}
                      </p>
                      {isActive && (
                        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{s.detail}</p>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Friendly timing hint */}
              {step === STEPS.parsing && (
                <div className="bg-indigo-50 rounded-xl px-4 py-3 text-xs text-indigo-600 leading-relaxed">
                  ⏱ Des pauses sont ajoutées entre les lots pour respecter les limites de l'API Claude. Laisse la fenêtre ouverte.
                </div>
              )}
              {step === STEPS.fetching && (
                <div className="bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-600 leading-relaxed">
                  📡 Récupération des emails depuis les serveurs Google… Cela peut prendre quelques secondes.
                </div>
              )}
            </div>
          )}

          {/* Connected idle */}
          {connected && step === STEPS.idle && (
            <div className="text-center py-4">
              {/* Connected accounts — click to select which to scan */}
              <div className="mb-5 space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 text-left mb-2">Compte à scanner</p>

                {/* "Tous" option — shown when multiple accounts */}
                {connectedAccounts.length > 1 && (
                  <button
                    onClick={() => setScanAccount(null)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left ${
                      !scanAccount ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:border-indigo-200'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${!scanAccount ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'}`}>
                      {!scanAccount && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className={`text-xs font-medium ${!scanAccount ? 'text-indigo-700' : 'text-gray-600'}`}>
                      Tous les comptes ({connectedAccounts.length})
                    </span>
                  </button>
                )}

                {connectedAccounts.map(acct => (
                  <div key={acct.email}
                    onClick={() => setScanAccount(acct.email)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-all ${
                      scanAccount === acct.email ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:border-indigo-200'
                    }`}
                  >
                    {/* Radio dot */}
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${scanAccount === acct.email ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'}`}>
                      {scanAccount === acct.email && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    {acct.picture
                      ? <img src={acct.picture} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
                      : <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{acct.email[0].toUpperCase()}</span>
                    }
                    <div className="flex-1 min-w-0 text-left">
                      <p className={`text-xs font-semibold truncate ${scanAccount === acct.email ? 'text-indigo-800' : 'text-gray-700'}`}>{acct.name || acct.email}</p>
                      <p className="text-[10px] text-gray-400 truncate">{acct.email}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDisconnect(acct.email) }}
                      className="text-[10px] text-gray-300 hover:text-red-400 transition-colors ml-1 p-1"
                      title="Déconnecter"
                    >✕</button>
                  </div>
                ))}

                <button
                  onClick={handleConnect}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 border border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl py-2 mt-1 transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Ajouter un compte Gmail
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
                <div className="mb-3 bg-gray-50 rounded-xl p-3 text-left max-h-64 overflow-y-auto">
                  <p className="text-xs font-semibold text-gray-600 mb-1">🔍 Debug dernier scan :</p>
                  <p className="text-xs text-gray-500">📧 {debugInfo.emailsFound} emails récupérés</p>
                  {debugInfo.parsed !== undefined && <>
                    <p className="text-xs text-gray-500">🤖 {debugInfo.parsed} candidatures groupées par Claude</p>
                    <p className="text-xs text-green-600">✨ {debugInfo.newJobs ?? 0} nouvelles · ↻ {debugInfo.updatesFound ?? 0} mises à jour · ✓ {debugInfo.alreadyUpToDate ?? 0} déjà à jour</p>
                  </>}
                  {debugInfo.rawParsed?.length > 0 && (
                    <div className="mt-2 border-t border-gray-200 pt-2">
                      <p className="text-xs font-medium text-gray-500 mb-1">Résultats Claude :</p>
                      {debugInfo.rawParsed.map((r, i) => (
                        <p key={i} className={`text-xs truncate ${r.matched === 'update' ? 'text-blue-500' : 'text-indigo-400'}`}>
                          {r.matched === 'update' ? '↻' : '+'} {r.company} — {r.status} ({r.historyCount} emails) [{r.matched}]
                        </p>
                      ))}
                    </div>
                  )}
                  {debugInfo.subjects?.length > 0 && (
                    <div className="mt-2 border-t border-gray-200 pt-2">
                      <p className="text-xs font-medium text-gray-500 mb-1">Emails récupérés ({debugInfo.subjects.length}) :</p>
                      {debugInfo.subjects.map((s, i) => (
                        <p key={i} className="text-xs text-gray-400 truncate">• {s}</p>
                      ))}
                    </div>
                  )}
                  {debugInfo.parsed === 0 && (
                    <p className="text-xs text-red-400 mt-1">⚠️ Claude n'a détecté aucune candidature</p>
                  )}
                </div>
              )}
              <div className="flex gap-3 justify-center">
                <button onClick={() => handleDisconnect()} className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
                  Tout déconnecter
                </button>
                <button onClick={handleScan} className="bg-indigo-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2">
                  <span>🔍</span>
                  <span>
                    Scanner {months} mois
                    {' '}
                    <span className="font-normal opacity-80 text-xs">
                      ({scanAccount ? scanAccount.split('@')[0] : connectedAccounts.length > 1 ? `${connectedAccounts.length} comptes` : connectedAccounts[0]?.email?.split('@')[0]})
                    </span>
                  </span>
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
