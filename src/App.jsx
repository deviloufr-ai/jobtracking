import { useState, useEffect, useMemo } from 'react'
import { useJobs } from './hooks/useJobs'
import { useExtensionImport } from './hooks/useExtensionImport'
import Stats from './components/Stats'
import Filters from './components/Filters'
import JobRow from './components/JobRow'
import JobModal from './components/JobModal'
import ConfirmDelete from './components/ConfirmDelete'
import GmailImport from './components/GmailImport'
import NextAction from './components/NextAction'
import { useAutoRefresh } from './hooks/useAutoRefresh'
import { connectGmail, disconnectGmail, isConnected, isGmailConfigured, getGmailUserInfo, getCachedUser } from './services/gmail'
import JobSearch from './components/JobSearch'
import CVManager from './components/CVManager'
import ImageImport from './components/ImageImport'
import UpcomingMeetings from './components/UpcomingMeetings'
import Goals from './components/Goals'
import CalendarWidget from './components/CalendarWidget'
import NotificationBell from './components/NotificationBell'
import { useNotifications } from './hooks/useNotifications'

const DEFAULT_FILTERS = { search: '', statuses: {}, period: 'all' }
const DEFAULT_SORT = { col: 'date', dir: 'desc' }

function sortJobs(jobs, sort) {
  const sorted = [...jobs]
  const { col, dir } = sort
  sorted.sort((a, b) => {
    let va, vb
    if (col === 'date')    { va = new Date(a.date); vb = new Date(b.date) }
    if (col === 'company') { va = a.company.toLowerCase(); vb = b.company.toLowerCase() }
    if (col === 'status')  { va = a.status; vb = b.status }
    if (col === 'position'){ va = a.position.toLowerCase(); vb = b.position.toLowerCase() }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })
  return sorted
}

function SortIcon({ col, sort }) {
  if (sort.col !== col) return <span className="ml-1 text-gray-300 text-xs">↕</span>
  return <span className="ml-1 text-indigo-500 text-xs">{sort.dir === 'asc' ? '↑' : '↓'}</span>
}


// Detect if JobTrackr Firefox extension is installed
// The extension injects a custom attribute on <html> or responds to a postMessage
function ExtensionButton() {
  const [installed, setInstalled] = useState(null) // null = checking

  useEffect(() => {
    // Method 1: extension sets data-jobtrackr-ext on <html>
    if (document.documentElement.hasAttribute('data-jobtrackr-ext')) {
      setInstalled(true)
      return
    }
    // Method 2: ping via custom event
    const timeout = setTimeout(() => setInstalled(false), 800)
    const handler = () => { clearTimeout(timeout); setInstalled(true) }
    window.addEventListener('jobtrackr-ext-pong', handler, { once: true })
    window.dispatchEvent(new CustomEvent('jobtrackr-ext-ping'))
    return () => { clearTimeout(timeout); window.removeEventListener('jobtrackr-ext-pong', handler) }
  }, [])

  if (installed === null) return null // still checking

  if (installed) return (
    <div
      title="Extension Firefox JobTrackr active"
      className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-sm font-medium px-3 py-2 rounded-lg"
    >
      <span>🦊</span>
      <span className="hidden sm:inline">Extension active ✓</span>
    </div>
  )

  return (
    <a
      href="https://addons.mozilla.org/firefox/addon/jobtrackr/"
      target="_blank"
      rel="noopener noreferrer"
      title="Installer l'extension Firefox JobTrackr"
      className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-orange-100 transition-all"
    >
      <span>🦊</span>
      <span className="hidden sm:inline">Installer l'extension</span>
    </a>
  )
}

export default function App() {
  const { jobs, addJob, updateJob, deleteJob, updateStatus, addHistoryEntry, mergeDuplicates, toggleFavorite, reprocessJobs } = useJobs()
  const [modal, setModal] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [sort, setSort] = useState(DEFAULT_SORT)
  const [toast, setToast] = useState(null)
  const [showGmail, setShowGmail] = useState(false)
  const [gmailUser, setGmailUser] = useState(() => getCachedUser())
  const [gmailConnected, setGmailConnected] = useState(() => isConnected())
  const [activeTab, setActiveTab] = useState('tracker')

  // On load: if token exists but no cached profile, fetch it so the header shows the account
  useEffect(() => {
    if (!gmailUser && isConnected()) {
      getGmailUserInfo().then(user => { if (user) setGmailUser(user) })
    }
  }, [])
  const [showFavOnly, setShowFavOnly] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [selectedJobForCV, setSelectedJobForCV] = useState(null) // 'tracker' | 'search' | 'cv'
  const [showImageImport, setShowImageImport] = useState(false)

  const { notifications, push: pushNotif, markAllRead, clear: clearNotifs, unreadCount } = useNotifications()

  const showToast = (msg, duration = 2500) => {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }

  // Wrap addJob/updateJob to emit notifications
  const addJobWithNotif = (data) => {
    const job = addJob(data)
    pushNotif('new_job', `Nouvelle candidature ajoutée — ${data.company}`, { company: data.company })
    return job
  }

  const updateJobWithNotif = (id, data) => {
    updateJob(id, data)
    const job = jobs.find(j => j.id === id)
    if (job && data.history && data.history.length > (job.history?.length || 0)) {
      const newCount = data.history.length - (job.history?.length || 0)
      pushNotif('update', `${job.company} — ${newCount} nouvelle${newCount > 1 ? 's' : ''} entrée${newCount > 1 ? 's' : ''} dans l'historique`, { company: job.company, jobId: id })
    }
  }

  const { refreshing, lastRefresh, doRefresh } = useAutoRefresh(jobs, addJobWithNotif, updateJobWithNotif, (msg, duration) => {
    showToast(msg, duration)
  }, reprocessJobs)
  useExtensionImport(addJobWithNotif, showToast)

  const handleSort = (col) => {
    setSort(prev => ({
      col,
      dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc'
    }))
  }

  const archivedCount = useMemo(() => jobs.filter(j => j.status === 'archived').length, [jobs])
  const favCount = useMemo(() => jobs.filter(j => j.favorite).length, [jobs])

  const filtered = useMemo(() => {
    const list = jobs.filter(j => {
      if (filters.search) {
        const q = filters.search.toLowerCase()
        if (!j.company.toLowerCase().includes(q) && !j.position.toLowerCase().includes(q)) return false
      }
      const statusEntries = Object.entries(filters.statuses || {})
      const included = statusEntries.filter(([,v]) => v === 'include').map(([k]) => k)
      const excluded = statusEntries.filter(([,v]) => v === 'exclude').map(([k]) => k)
      if (included.length > 0 && !included.includes(j.status)) return false
      if (excluded.includes(j.status)) return false
      if (filters.period !== 'all') {
        const d = new Date(j.date)
        const now = new Date()
        const days = (now - d) / (1000 * 60 * 60 * 24)
        if (filters.period === 'week' && days > 7) return false
        if (filters.period === 'month' && days > 30) return false
      }
      return true
    }).filter(j => !showFavOnly || j.favorite).filter(j => showArchived || j.status !== 'archived')
    return sortJobs(list, sort)
  }, [jobs, filters, sort, showFavOnly, showArchived])

  const handleSave = (form) => {
    if (modal === 'add') {
      addJobWithNotif(form)
      showToast('Candidature ajoutée !')
    } else {
      updateJob(modal.id, form)
      pushNotif('update', `${form.company} — candidature mise à jour`, { company: form.company, jobId: modal.id })
      showToast('Candidature mise à jour')
    }
  }

  const handleDelete = () => {
    pushNotif('info', `Candidature supprimée — ${toDelete.company}`, { company: toDelete.company })
    deleteJob(toDelete.id)
    setToDelete(null)
    showToast('Candidature supprimée')
  }

  const handleGenerateCV = (job) => {
    setSelectedJobForCV(job)
    setActiveTab('cv')
  }

  const handleBulkImport = (newJobs) => {
    newJobs.forEach(j => addJobWithNotif(j))
    if (newJobs.length > 0)
      pushNotif('new_job', `${newJobs.length} candidature${newJobs.length > 1 ? 's' : ''} importée${newJobs.length > 1 ? 's' : ''} depuis Gmail`, { count: newJobs.length })
    showToast(`${newJobs.length} candidature${newJobs.length > 1 ? 's' : ''} importée${newJobs.length > 1 ? 's' : ''} !`, 3500)
    // Dedup/merge immediately so duplicates don't linger
    setTimeout(() => reprocessJobs(), 100)
  }

  const handleUpdateHistory = (id, history) => {
    const job = jobs.find(j => j.id === id)
    updateJob(id, { history })
    if (job && history.length > (job.history?.length || 0))
      pushNotif('update', `${job.company} — historique mis à jour`, { company: job.company, jobId: id })
  }

  const handleClearAll = () => {
    if (!window.confirm(`Effacer toutes les ${jobs.length} candidatures ? Cette action est irreversible.`)) return
    jobs.forEach(j => deleteJob(j.id))
    showToast('Toutes les candidatures ont ete effacees')
  }

  const ThHeader = ({ col, label }) => (
    <th
      onClick={() => handleSort(col)}
      className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-indigo-600 select-none whitespace-nowrap"
    >
      {label}<SortIcon col={col} sort={sort} />
    </th>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-30">
        <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">J</div>
            <div>
              <h1 className="font-bold text-gray-800 leading-tight">JobTrackr</h1>
              <p className="text-xs text-gray-400">Suivi de candidatures</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Screenshot */}
            <button onClick={() => setShowImageImport(true)}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-lg hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 transition-all">
              <span>🖼️</span><span className="hidden sm:inline">Screenshot</span>
            </button>

            {/* Extension */}
            <ExtensionButton />

            {/* Refresh (only when connected) */}
            {(gmailUser || gmailConnected) && (
              <button
                onClick={() => doRefresh(false)}
                disabled={refreshing}
                title={lastRefresh ? `Dernière sync : ${lastRefresh}` : 'Synchroniser Gmail & Calendar'}
                className="relative flex items-center justify-center w-9 h-9 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className={`w-4 h-4 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}

            {/* Notifications */}
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkAllRead={markAllRead}
              onClear={clearNotifs}
            />

            {/* + Nouvelle candidature */}
            <button onClick={() => setModal('add')}
              className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-sm">
              <span className="text-lg leading-none">+</span>
              <span className="hidden sm:inline">Nouvelle candidature</span>
              <span className="sm:hidden">Ajouter</span>
            </button>

            {/* Login / Account — always top-right */}
            {gmailUser ? (
              <button
                onClick={() => setShowGmail(true)}
                title={gmailUser.email}
                className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium pl-1 pr-3 py-1 rounded-full hover:bg-gray-50 hover:border-gray-300 transition-all"
              >
                {gmailUser.picture
                  ? <img src={gmailUser.picture} alt="" className="w-7 h-7 rounded-full" />
                  : <div className="w-7 h-7 rounded-full bg-indigo-500 text-white text-xs flex items-center justify-center font-bold">{gmailUser.email?.[0]?.toUpperCase()}</div>
                }
                <div className="hidden sm:block text-left leading-tight">
                  <div className="text-xs font-semibold max-w-[120px] truncate">{gmailUser.name || gmailUser.email}</div>
                  <div className="text-[10px] text-gray-400 max-w-[120px] truncate">{gmailUser.email}</div>
                </div>
              </button>
            ) : gmailConnected ? (
              <button onClick={() => setShowGmail(true)}
                className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-green-100 transition-all">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                <span className="hidden sm:inline">Connecté</span>
              </button>
            ) : (
              <button onClick={() => setShowGmail(true)}
                className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-100 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline">Connexion</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-screen-2xl mx-auto px-6 flex gap-1">
          <button
            onClick={() => setActiveTab('tracker')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'tracker'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            📋 Mes candidatures
            {jobs.length > 0 && (
              <span className="ml-2 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">{jobs.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'search'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            🔎 Recherche d'offres
          </button>
          <button
            onClick={() => setShowArchived(v => !v)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              showArchived
                ? 'border-gray-400 text-gray-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            📦 Archives
            {archivedCount > 0 && (
              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                {archivedCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowFavOnly(v => !v)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              showFavOnly
                ? 'border-yellow-400 text-yellow-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {showFavOnly ? '⭐' : '☆'} Favoris
            {favCount > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${showFavOnly ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                {favCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('cv')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'cv'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            📄 Mon CV
          </button>
        </div>
      </div>

      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        {activeTab === 'cv' ? (
          <CVManager jobs={jobs} preselectedJob={selectedJobForCV} />
        ) : activeTab === 'search' ? (
          <JobSearch onAddJob={(job) => { addJob(job); showToast(`${job.company} ajouté !`); setActiveTab('tracker') }} existingJobs={jobs} />
        ) : (
          <>
        <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
        <Stats jobs={jobs} />
        <NextAction jobs={jobs} onGenerateCV={handleGenerateCV} onOpenJob={(job) => { setFilters(f => ({ ...f, search: job.company })) }} />
        <Filters filters={filters} onChange={setFilters} onReset={() => setFilters(DEFAULT_FILTERS)} total={jobs.length} filtered={filtered.length} />

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              {jobs.length === 0 ? (
                <>
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-gray-500 font-medium">Aucune candidature pour l instant</p>
                  <p className="text-gray-400 text-sm mt-1 mb-6">Ajoutez-en une manuellement, importez depuis Gmail ou via screenshot</p>
                  <div className="flex gap-3 justify-center flex-wrap">
                    <button onClick={() => setShowImageImport(true)} className="border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-purple-50 transition-colors">🖼️ Screenshot</button>
                    <button onClick={() => setShowGmail(true)} className="border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">📧 Gmail</button>
                    <button onClick={() => setModal('add')} className="bg-indigo-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-indigo-700 transition-colors">+ Ajouter manuellement</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-4xl mb-3">🔍</div>
                  <p className="text-gray-500 font-medium">Aucune candidature trouvee</p>
                  <button onClick={() => setFilters(DEFAULT_FILTERS)} className="mt-3 text-sm text-indigo-600 hover:underline">Reinitialiser les filtres</button>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <ThHeader col="company" label="Entreprise / Poste" />
                    <ThHeader col="status" label="Statut" />
                    <ThHeader col="date" label="Date" />
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Offre</th>
                    <th className="py-3 px-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(job => (
                    <JobRow key={job.id} job={job} onEdit={setModal} onDelete={setToDelete} onStatusChange={updateStatus} onAddStep={addHistoryEntry} onUpdateHistory={handleUpdateHistory} onGenerateCV={handleGenerateCV} onToggleFavorite={toggleFavorite} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-6">
          <p className="text-xs text-gray-300">JobTrackr v0.4 <span title={`commit ${__COMMIT_HASH__}`}>· #{__COMMIT_COUNT__}</span></p>
          {jobs.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={mergeDuplicates}
                className="text-xs text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-indigo-200">
                🔀 Fusionner les doublons
              </button>
              <button onClick={handleClearAll}
                className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-200">
                🗑️ Effacer toutes les données
              </button>
            </div>
          )}
        </div>
        </div>{/* end flex-1 */}

        {/* Right sidebar — meetings à venir (top-aligned with stats) */}
        <div className="w-80 flex-shrink-0 hidden xl:block">
          <div className="sticky top-24">
            <UpcomingMeetings jobs={jobs} />
            <Goals jobs={jobs} />
          </div>
        </div>
        </div>{/* end flex row */}
          </>
        )}
      </main>

      {modal && <JobModal job={modal === 'add' ? null : modal} onSave={handleSave} onClose={() => setModal(null)} />}
      {toDelete && <ConfirmDelete job={toDelete} onConfirm={handleDelete} onCancel={() => setToDelete(null)} />}
      {showGmail && <GmailImport onImport={handleBulkImport} onUpdate={updateJobWithNotif} onClose={() => { setShowGmail(false); setGmailUser(getCachedUser()); setGmailConnected(isConnected()) }} onUserChange={(u) => { setGmailUser(u); setGmailConnected(!!u || isConnected()) }} existingJobs={jobs} />}
      {showImageImport && <ImageImport onImport={handleBulkImport} onClose={() => setShowImageImport(false)} existingJobs={jobs} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
