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
import STARGenerator from './components/STARGenerator'
import EmailDraft from './components/EmailDraft'
import { useAutoRefresh } from './hooks/useAutoRefresh'
import { connectGmail, disconnectGmail, isConnected, isGmailConfigured, getGmailUserInfo, getCachedUser } from './services/gmail'
import JobSearch from './components/JobSearch'
import CVManager from './components/CVManager'
import Settings from './components/Settings'
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

  if (!installed) return null // not installed — no badge, download is in the + menu

  return (
    <div
      title="Extension Firefox JobTrackr active"
      className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
    >
      <span>🦊</span>
      <span className="hidden sm:inline">Extension ✓</span>
    </div>
  )
}

export default function App() {
  const { jobs, addJob, updateJob, deleteJob, updateStatus, addHistoryEntry, mergeDuplicates, toggleFavorite, reprocessJobs } = useJobs()
  const [modal, setModal] = useState(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [starJob, setStarJob] = useState(null)
  const [emailDraft, setEmailDraft] = useState(null) // { job, type }
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

  // ── nav tabs config ─────────────────────────────────────────────────────────
  const NAV_TABS = [
    { id: 'tracker',  label: 'Candidatures', icon: '📋', badge: jobs.length || null },
    { id: 'search',   label: 'Recherche',    icon: '🔎', badge: null },
    { id: 'cv',       label: 'Mon CV',       icon: '📄', badge: null },
    { id: 'settings', label: 'Réglages',     icon: '⚙️',  badge: null },
  ]

  const goTab = (id) => { setActiveTab(id); setMobileMenuOpen(false) }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Mobile drawer overlay ──────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          {/* Drawer */}
          <div className="relative w-72 max-w-[85vw] h-full bg-white shadow-2xl flex flex-col">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                  <span className="text-white font-bold text-sm">J</span>
                </div>
                <span className="font-bold text-gray-900 text-[15px] tracking-tight">JobTrackr</span>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto py-3 px-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">Navigation</p>
              {NAV_TABS.map(tab => (
                <button key={tab.id} onClick={() => goTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors mb-0.5 ${
                    activeTab === tab.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-lg w-6 text-center">{tab.icon}</span>
                  <span className="flex-1 text-left">{tab.label}</span>
                  {tab.badge > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600">{tab.badge}</span>
                  )}
                </button>
              ))}

              <div className="my-3 border-t border-gray-100" />
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">Ajouter</p>
              {[
                { icon: '📧', label: 'Gmail', sub: 'Sync automatique', action: () => { setMobileMenuOpen(false); setShowGmail(true) } },
                { icon: '🖼️', label: 'Screenshot', sub: 'Capture d\'écran', action: () => { setMobileMenuOpen(false); setShowImageImport(true) } },
                { icon: '✏️', label: 'Manuel', sub: 'Saisie manuelle', action: () => { setMobileMenuOpen(false); setModal('add') } },
              ].map(item => (
                <button key={item.label} onClick={item.action}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors mb-0.5">
                  <span className="text-lg w-6 text-center">{item.icon}</span>
                  <div className="text-left">
                    <div className="font-medium">{item.label}</div>
                    <div className="text-[11px] text-gray-400">{item.sub}</div>
                  </div>
                </button>
              ))}
            </nav>

            {/* Account section at bottom */}
            <div className="border-t border-gray-100 px-4 py-4">
              {gmailUser ? (
                <button onClick={() => { setMobileMenuOpen(false); setShowGmail(true) }}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors">
                  {gmailUser.picture
                    ? <img src={gmailUser.picture} alt="" className="w-9 h-9 rounded-full" />
                    : <div className="w-9 h-9 rounded-full bg-indigo-500 text-white text-sm flex items-center justify-center font-bold">{gmailUser.email?.[0]?.toUpperCase()}</div>
                  }
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">{gmailUser.name || gmailUser.email}</div>
                    <div className="text-xs text-gray-400 truncate">{gmailUser.email}</div>
                  </div>
                  {(gmailUser || gmailConnected) && (
                    <button onClick={(e) => { e.stopPropagation(); doRefresh(false) }} disabled={refreshing}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-30">
                      <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  )}
                </button>
              ) : (
                <button onClick={() => { setMobileMenuOpen(false); setShowGmail(true) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Connecter Gmail
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-[0_1px_8px_0_rgba(0,0,0,0.06)]">
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 flex items-center justify-between gap-2 h-14">

          {/* Left: hamburger (mobile) + logo + desktop nav */}
          <div className="flex items-center gap-1 sm:gap-6 h-full min-w-0">

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden flex items-center justify-center w-9 h-9 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Logo */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-sm">J</span>
              </div>
              <span className="font-bold text-gray-900 text-[15px] tracking-tight hidden sm:block">JobTrackr</span>
            </div>

            {/* Divider — desktop only */}
            <div className="h-5 w-px bg-gray-200 shrink-0 hidden md:block" />

            {/* Desktop nav tabs */}
            <nav className="hidden md:flex items-center gap-0.5 h-full">
              {NAV_TABS.map(tab => (
                <button key={tab.id} onClick={() => goTab(tab.id)}
                  className={`relative flex items-center gap-1.5 px-3 h-full text-sm font-medium transition-colors ${
                    activeTab === tab.id ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <span className="text-[13px]">{tab.icon}</span>
                  <span className="hidden lg:inline">{tab.label}</span>
                  {tab.badge > 0 && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                      {tab.badge}
                    </span>
                  )}
                  {activeTab === tab.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full" />}
                </button>
              ))}
            </nav>

            {/* Mobile: active tab label */}
            <span className="md:hidden text-sm font-semibold text-gray-800 truncate">
              {NAV_TABS.find(t => t.id === activeTab)?.label}
            </span>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <ExtensionButton />

            {/* Refresh — desktop only (mobile is in drawer) */}
            {(gmailUser || gmailConnected) && (
              <button onClick={() => doRefresh(false)} disabled={refreshing}
                title={lastRefresh ? `Dernière sync : ${lastRefresh}` : 'Synchroniser Gmail & Calendar'}
                className="hidden sm:flex items-center justify-center w-8 h-8 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30">
                <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}

            {/* Notifications */}
            <NotificationBell notifications={notifications} unreadCount={unreadCount} onMarkAllRead={markAllRead} onClear={clearNotifs} />

            <div className="h-5 w-px bg-gray-200 mx-0.5 hidden sm:block" />

            {/* + Add dropdown */}
            <div className="relative">
              <button onClick={() => setShowAddMenu(v => !v)} title="Ajouter une candidature"
                className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white hover:opacity-90 active:scale-95 transition-all shadow-sm shadow-indigo-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              </button>
              {showAddMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                  <div className="absolute right-0 top-10 z-50 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden py-1.5">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-4 pt-1 pb-2">Importer via</p>
                    <button onClick={() => { setShowAddMenu(false); setShowGmail(true) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
                      <span className="text-base">📧</span>
                      <div className="text-left"><div className="font-medium">Gmail</div><div className="text-[11px] text-gray-400">Sync automatique des emails</div></div>
                    </button>
                    <button onClick={() => { setShowAddMenu(false); setShowImageImport(true) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors">
                      <span className="text-base">🖼️</span>
                      <div className="text-left"><div className="font-medium">Screenshot</div><div className="text-[11px] text-gray-400">Colle une capture d'écran</div></div>
                    </button>
                    <button onClick={() => { setShowAddMenu(false); const a = document.createElement('a'); a.href = '/jobtracker-addon-1.4.1.xpi'; a.download = ''; a.click() }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 transition-colors">
                      <span className="text-base">🦊</span>
                      <div className="text-left"><div className="font-medium">Extension Firefox</div><div className="text-[11px] text-gray-400">Import depuis n'importe quelle offre</div></div>
                    </button>
                    <div className="mx-4 my-1.5 border-t border-gray-100" />
                    <button onClick={() => { setShowAddMenu(false); setModal('add') }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors">
                      <span className="text-base">✏️</span>
                      <div className="text-left"><div className="font-medium">Manuel</div><div className="text-[11px] text-gray-400">Saisie manuelle</div></div>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Account — desktop */}
            {gmailUser ? (
              <button onClick={() => setShowGmail(true)} title={gmailUser.email}
                className="hidden sm:flex items-center gap-2 bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium pl-1 pr-3 py-1 rounded-full hover:bg-gray-100 hover:border-gray-300 transition-all">
                {gmailUser.picture
                  ? <img src={gmailUser.picture} alt="" className="w-7 h-7 rounded-full" />
                  : <div className="w-7 h-7 rounded-full bg-indigo-500 text-white text-xs flex items-center justify-center font-bold">{gmailUser.email?.[0]?.toUpperCase()}</div>
                }
                <div className="hidden lg:block text-left leading-tight">
                  <div className="text-xs font-semibold max-w-[120px] truncate">{gmailUser.name || gmailUser.email}</div>
                  <div className="text-[10px] text-gray-400 max-w-[120px] truncate">{gmailUser.email}</div>
                </div>
              </button>
            ) : gmailConnected ? (
              <button onClick={() => setShowGmail(true)}
                className="hidden sm:flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-green-100 transition-all">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                <span>Connecté</span>
              </button>
            ) : (
              <button onClick={() => setShowGmail(true)}
                className="hidden sm:flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-100 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span>Connexion</span>
              </button>
            )}

            {/* Account avatar — mobile only (tappable, opens drawer) */}
            {gmailUser && (
              <button onClick={() => setMobileMenuOpen(true)} className="sm:hidden">
                {gmailUser.picture
                  ? <img src={gmailUser.picture} alt="" className="w-8 h-8 rounded-full border-2 border-white shadow-sm" />
                  : <div className="w-8 h-8 rounded-full bg-indigo-500 text-white text-xs flex items-center justify-center font-bold">{gmailUser.email?.[0]?.toUpperCase()}</div>
                }
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────────── */}
      <main className="max-w-screen-2xl mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-24 md:pb-6">
        {activeTab === 'settings' ? (
          <Settings jobs={jobs} onMergeDuplicates={mergeDuplicates} />
        ) : activeTab === 'cv' ? (
          <CVManager jobs={jobs} preselectedJob={selectedJobForCV} />
        ) : activeTab === 'search' ? (
          <JobSearch onAddJob={(job) => { addJob(job); showToast(`${job.company} ajouté !`); setActiveTab('tracker') }} existingJobs={jobs} />
        ) : (
          <>
        <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
        {/* Top 2-col: Stats left, Prochaines étapes right — only when data exists */}
        {jobs.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-stretch">
            <Stats jobs={jobs} />
            <NextAction
              jobs={jobs}
              onGenerateCV={handleGenerateCV}
              onOpenJob={(job) => { setFilters(f => ({ ...f, search: job.company })) }}
              onSTAR={(job) => setStarJob(job)}
              onDraftEmail={(job, type) => setEmailDraft({ job, type })}
            />
          </div>
        )}
        <Filters
          filters={filters} onChange={setFilters} onReset={() => setFilters(DEFAULT_FILTERS)}
          total={jobs.length} filtered={filtered.length}
          showFavOnly={showFavOnly} onToggleFav={() => setShowFavOnly(v => !v)} favCount={favCount}
          showArchived={showArchived} onToggleArchived={() => setShowArchived(v => !v)} archivedCount={archivedCount}
        />

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
                    <th className="hidden md:table-cell py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
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
            <div className="flex items-center gap-2 flex-wrap justify-end">
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

      {/* ── Mobile bottom nav bar ─────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white border-t border-gray-100 shadow-[0_-2px_12px_0_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-around px-2 py-1 safe-area-bottom">
          {NAV_TABS.map(tab => (
            <button key={tab.id} onClick={() => goTab(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-0 flex-1 ${
                activeTab === tab.id ? 'text-indigo-600' : 'text-gray-400'
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className="text-[10px] font-medium truncate w-full text-center">{tab.label.split(' ')[0]}</span>
              {tab.badge > 0 && activeTab !== tab.id && (
                <span className="absolute -top-0.5 ml-5 w-4 h-4 text-[9px] font-bold bg-indigo-500 text-white rounded-full flex items-center justify-center">{tab.badge > 99 ? '99' : tab.badge}</span>
              )}
            </button>
          ))}
          {/* + button in bottom bar */}
          <button onClick={() => setShowAddMenu(v => !v)}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-0 flex-1">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            </span>
            <span className="text-[10px] font-medium text-gray-400">Ajouter</span>
          </button>
        </div>
      </nav>

      {modal && <JobModal job={modal === 'add' ? null : modal} onSave={handleSave} onClose={() => setModal(null)} />}
      {toDelete && <ConfirmDelete job={toDelete} onConfirm={handleDelete} onCancel={() => setToDelete(null)} />}
      {showGmail && <GmailImport onImport={handleBulkImport} onUpdate={updateJobWithNotif} onClose={() => { setShowGmail(false); const connected = isConnected(); setGmailConnected(connected); setGmailUser(connected ? getCachedUser() : null) }} onUserChange={(u) => { setGmailUser(u); setGmailConnected(!!u) }} existingJobs={jobs} />}
      {showImageImport && <ImageImport onImport={handleBulkImport} onClose={() => setShowImageImport(false)} existingJobs={jobs} />}
      {starJob && <STARGenerator job={starJob} onClose={() => setStarJob(null)} />}
      {emailDraft && <EmailDraft job={emailDraft.job} type={emailDraft.type} onClose={() => setEmailDraft(null)} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
