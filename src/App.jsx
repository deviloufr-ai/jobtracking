import { useState, useEffect, useMemo, useRef } from 'react'
import { useJobs, getStatus } from './hooks/useJobs'
import { useExtensionImport } from './hooks/useExtensionImport'
import { useExtensionDetect } from './hooks/useExtensionDetect'
import { useSettings } from './hooks/useSettings'
import { useLanguage } from './hooks/useLanguage'
import './styles/themes.css'
import ErrorBoundary from './components/ErrorBoundary'
import Stats from './components/Stats'
import Filters from './components/Filters'
import JobRow from './components/JobRow'
import JobCard from './components/JobCard'
import JobModal from './components/JobModal'
import ConfirmDelete from './components/ConfirmDelete'
import GmailImport from './components/GmailImport'
import NextAction from './components/NextAction'
import STARGenerator from './components/STARGenerator'
import EmailDraft from './components/EmailDraft'
import MergeModal from './components/MergeModal'
import { useAutoRefresh } from './hooks/useAutoRefresh'
import { usePolling } from './hooks/usePolling'
import { connectGmail, disconnectGmail, isConnected, isGmailConfigured, getGmailUserInfo, getCachedUser, autoReuseStoredTokens, getSyncUserIdForSupabase, resolveSyncUserId } from './services/gmail'
import { initializeSyncCoordinator } from './services/syncCoordinator'
import JobSearch from './components/JobSearch'
import CVManager from './components/CVManager'
import CVViewer from './components/CVViewer'
import { renderCV, ONE_PAGE_SCALE_FN, BASE_PRINT_CSS } from './components/CVGenerator'
import Settings from './components/Settings'
import ImageImport from './components/ImageImport'
import UpcomingMeetings from './components/UpcomingMeetings'
import Goals from './components/Goals'
import CalendarWidget from './components/CalendarWidget'
import NotificationBell from './components/NotificationBell'
import { useNotifications } from './hooks/useNotifications'
import NotificationPermissionBanner from './components/NotificationPermissionBanner'
import { useNotificationPermission } from './hooks/useNotificationPermission'
import { useNotificationScenarios } from './hooks/useNotificationScenarios'
import LandingPage from './components/LandingPage'

const DEFAULT_FILTERS = { search: '', statuses: {}, period: 'all' }
const DEFAULT_SORT = { col: 'date', dir: 'desc' }

function sortJobs(jobs, sort) {
  const sorted = [...jobs]
  const { col, dir } = sort
  sorted.sort((a, b) => {
    let va, vb
    if (col === 'date') {
      // Sort by last activity date (last history entry), same as what's displayed in the Date column
      const lastDate = j => j.history?.length ? j.history[j.history.length - 1].date : j.date
      va = new Date(lastDate(a)); vb = new Date(lastDate(b))
    }
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
function ExtensionButton({ t }) {
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
      title={t('extension.title')}
      className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
    >
      <span>🦊</span>
      <span className="hidden sm:inline">{t('extension.label')}</span>
    </div>
  )
}

export default function App() {
  const { jobs, addJob, updateJob, deleteJob, clearAllJobs, updateStatus, addHistoryEntry, mergeDuplicates, toggleFavorite, reprocessJobs, checkAllPositions, findDuplicateInList } = useJobs()
  const { settings } = useSettings()
  const { t } = useLanguage()
  const extensionInstalled = useExtensionDetect()
  const { permission: notificationPermission } = useNotificationPermission()
  useNotificationScenarios(jobs, notificationPermission)

  // Load demo data if ?demo=true
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === 'true' && jobs.length === 0) {
      const demoJobs = [
        { id: "job1", company: "Stripe", position: "Senior Full Stack Engineer", status: "todo", date: "2026-05-20", salary: "$150k-$220k", location: "San Francisco", isFavorite: false, notes: "", history: [] },
        { id: "job2", company: "Figma", position: "Product Engineer", status: "todo", date: "2026-05-25", salary: "$140k-$210k", location: "Remote", isFavorite: false, notes: "", history: [] },
        { id: "job3", company: "Vercel", position: "Engineering Manager", status: "sent", date: "2026-05-28", salary: "$160k-$230k", location: "San Francisco", isFavorite: true, notes: "Great opportunity for leadership", history: [{ date: "2026-05-28", note: "Application submitted" }] },
        { id: "job4", company: "Notion", position: "Frontend Engineer", status: "sent", date: "2026-06-02", salary: "$130k-$200k", location: "Remote", isFavorite: false, notes: "", history: [{ date: "2026-06-02", note: "Cover letter customized and sent" }] },
        { id: "job5", company: "Anthropic", position: "AI/ML Engineer", status: "reviewing", date: "2026-06-08", salary: "$170k-$240k", location: "San Francisco", isFavorite: true, notes: "Very interested in this role", history: [{ date: "2026-06-08", note: "Application submitted" }, { date: "2026-05-23", note: "Status changed to reviewing by recruiter" }] },
        { id: "job6", company: "Shopify", position: "Backend Engineer", status: "reviewing", date: "2026-06-07", salary: "$140k-$210k", location: "Remote", isFavorite: false, notes: "Portfolio samples sent", history: [{ date: "2026-06-07", note: "Application submitted" }, { date: "2026-05-30", note: "Recruiter requested portfolio samples" }, { date: "2026-05-27", note: "Samples sent" }] },
        { id: "job7", company: "GitHub", position: "Senior Software Engineer", status: "interview", date: "2026-06-12", salary: "$160k-$230k", location: "Remote", isFavorite: true, notes: "System design interview scheduled", history: [{ date: "2026-06-12", note: "Application submitted" }, { date: "2026-06-05", note: "Passed initial screening" }, { date: "2026-05-31", note: "Phone screen with hiring manager completed" }, { date: "2026-06-15", note: "📅 Scheduled: System design interview - June 15 at 2pm PT" }] },
        { id: "job8", company: "Slack", position: "Technical Lead", status: "interview", date: "2026-06-10", salary: "$155k-$225k", location: "San Francisco", isFavorite: true, notes: "Onsite interviews scheduled", history: [{ date: "2026-06-10", note: "Application submitted" }, { date: "2026-06-01", note: "Technical assessment completed" }, { date: "2026-06-07", note: "📅 Invited to onsite: June 20-21" }] },
        { id: "job9", company: "Airbnb", position: "Product Manager", status: "waiting", date: "2026-06-09", salary: "$150k-$220k", location: "San Francisco", isFavorite: true, notes: "Waiting for team feedback on assignment", history: [{ date: "2026-06-09", note: "Application submitted" }, { date: "2026-06-03", note: "Phone screen completed - very positive" }, { date: "2026-05-31", note: "Take-home assignment submitted" }, { date: "2026-06-09", note: "⏳ Waiting for team feedback" }] },
        { id: "job10", company: "Zapier", position: "Engineering Manager", status: "offer", date: "2026-06-10", salary: "$160k-$230k", location: "Remote", isFavorite: true, notes: "Negotiating terms", history: [{ date: "2026-06-10", note: "Application submitted" }, { date: "2026-05-20", note: "Initial screening passed" }, { date: "2026-05-13", note: "Phone screens completed - 2 rounds" }, { date: "2026-06-02", note: "Final round interview completed" }, { date: "2026-06-10", note: "🎉 OFFER RECEIVED: $150k-180k base + 0.5% equity + benefits" }, { date: "2026-06-11", note: "Negotiating terms" }] },
        { id: "job11", company: "Linear", position: "Senior Full Stack Engineer", status: "done", date: "2026-06-11", salary: "$165k-$235k", location: "Remote", isFavorite: true, notes: "Accepted! Starting July 1st", history: [{ date: "2026-06-11", note: "Application submitted" }, { date: "2026-05-22", note: "Phone screen completed - great fit" }, { date: "2026-05-15", note: "Technical assessment passed" }, { date: "2026-06-01", note: "Final round completed" }, { date: "2026-06-11", note: "🎉 OFFER ACCEPTED - Starting July 1st!" }] },
        { id: "job12", company: "Retool", position: "Full Stack Engineer", status: "rejected", date: "2026-05-15", salary: "$130k-$200k", location: "Remote", isFavorite: false, notes: "Learning experience - need more React depth", history: [{ date: "2026-05-15", note: "Application submitted" }, { date: "2026-04-30", note: "Phone screen completed" }, { date: "2026-05-15", note: "❌ Rejection: They went with a candidate with more React experience" }] }
      ];
      demoJobs.forEach(job => addJob(job));
    }
  }, [jobs.length, addJob]);

  const [modal, setModal] = useState(null)
  const prevArchiveSettingsRef = useRef(null)
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
  const [expandedJobId, setExpandedJobId] = useState(null)
  const [showLandingPage, setShowLandingPage] = useState(true)
  const [syncUserId, setSyncUserId] = useState(null)
  const [initialSyncDone, setInitialSyncDone] = useState(false)
  const [currentTheme, setCurrentTheme] = useState(settings.theme || 'light')
  const [selectedJobIds, setSelectedJobIds] = useState(new Set())
  const [mergeModal, setMergeModal] = useState(null)

  // On load: check for cached Gmail user
  useEffect(() => {
    autoReuseStoredTokens()
    if (!gmailUser && isConnected()) {
      getGmailUserInfo().then(user => { if (user) setGmailUser(user) })
    }
  }, [])

  // Apply theme on load and when settings change
  useEffect(() => {
    const applyTheme = (theme) => {
      console.log('🎨 Applying theme:', theme)
      document.body.classList.remove('theme-dark', 'theme-midnight', 'theme-ocean', 'theme-forest', 'theme-sunset', 'theme-minimal')
      if (theme !== 'light') {
        document.body.classList.add(`theme-${theme}`)
      }
      setCurrentTheme(theme)
    }

    // Load from localStorage on mount
    const savedTheme = localStorage.getItem('jobtrackr_theme')
    if (savedTheme) {
      applyTheme(savedTheme)
    }

    // Listen for theme changes
    const handleThemeChange = (e) => {
      console.log('🎨 Theme changed event:', e.detail)
      applyTheme(e.detail.theme)
    }
    window.addEventListener('theme-changed', handleThemeChange)

    return () => window.removeEventListener('theme-changed', handleThemeChange)
  }, [])

  // Initialize sync only when user leaves landing page (actively logs in)
  useEffect(() => {
    if (showLandingPage || !gmailUser || syncUserId) return // Don't sync if on landing page

    console.log('🔐 User logged in, initializing SyncCoordinator...')

    // Resolve sync user ID asynchronously (waits for Supabase lookup)
    // This ensures multi-device sync uses the same UUID for the same Gmail account
    resolveSyncUserId().then(id => {
      setSyncUserId(id)
      initializeSyncCoordinator(id)
    }).catch(err => {
      console.error('Failed to resolve sync ID, using fallback:', err)
      const fallbackId = getSyncUserIdForSupabase()
      setSyncUserId(fallbackId)
      initializeSyncCoordinator(fallbackId)
    })
  }, [showLandingPage, gmailUser, syncUserId])

  // Start polling once we have the correct sync ID
  usePolling(syncUserId)

  // Attach listener IMMEDIATELY when gmailUser logs in (before sync event fires)
  useEffect(() => {
    if (!gmailUser || initialSyncDone) return

    console.log('📡 Attaching sync listener immediately for:', gmailUser)

    const handleSyncComplete = (e) => {
      console.log('✅ Sync complete - hiding loading screen', e.detail)
      setInitialSyncDone(true)
    }

    // Attach listener BEFORE sync might complete
    window.addEventListener('jobtrackr:datasync', handleSyncComplete)

    // Debug: also listen for window messages
    const debugListener = () => {
      console.log('🎯 Window event detected')
    }
    window.addEventListener('jobtrackr:datasync', debugListener)

    console.log('✓ Listeners attached, waiting for sync event...')

    return () => {
      window.removeEventListener('jobtrackr:datasync', handleSyncComplete)
      window.removeEventListener('jobtrackr:datasync', debugListener)
    }
  }, [gmailUser]) // Only depend on gmailUser, not initialSyncDone

  // Hide loading screen when jobs load
  useEffect(() => {
    if (gmailUser && jobs.length > 0 && !initialSyncDone) {
      console.log('📊 Jobs loaded, hiding loading screen')
      setInitialSyncDone(true)
    }
  }, [jobs.length, gmailUser, initialSyncDone])

  // Hide landing page when user logs in
  useEffect(() => {
    if (gmailUser) {
      setShowLandingPage(false)
    }
  }, [gmailUser])
  const [showFavOnly, setShowFavOnly] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [selectedJobForCV, setSelectedJobForCV] = useState(null) // 'tracker' | 'search' | 'cv'
  const [showImageImport, setShowImageImport] = useState(false)
  const [viewingCV, setViewingCV] = useState(null) // job with cvSaved to view

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
  }, reprocessJobs, settings)
  useExtensionImport(addJobWithNotif, showToast)

  // Re-evaluate jobs when archive settings change
  useEffect(() => {
    if (!prevArchiveSettingsRef.current) {
      prevArchiveSettingsRef.current = {
        archiveSentDays: settings.archiveSentDays,
        archiveRejectedDays: settings.archiveRejectedDays
      }
      return
    }

    const archiveSettingsChanged = (
      prevArchiveSettingsRef.current.archiveSentDays !== settings.archiveSentDays ||
      prevArchiveSettingsRef.current.archiveRejectedDays !== settings.archiveRejectedDays
    )

    if (archiveSettingsChanged) {
      prevArchiveSettingsRef.current = {
        archiveSentDays: settings.archiveSentDays,
        archiveRejectedDays: settings.archiveRejectedDays
      }
      console.log('Archive settings changed, reprocessing jobs...', { sent: settings.archiveSentDays, rejected: settings.archiveRejectedDays })
      reprocessJobs()
    }
  }, [settings.archiveSentDays, settings.archiveRejectedDays, reprocessJobs])

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
        // Fixed: Use ORIGINAL application date (j.date), not last history entry
        // This avoids re-imports from changing the date filter results
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

  // Fix #15 — toast feedback on status change
  const handleStatusChange = (id, newStatus) => {
    const job = jobs.find(j => j.id === id)
    updateStatus(id, newStatus)
    if (job) showToast(`${job.company} → ${getStatus(newStatus).label}`)
  }

  const handleGenerateCV = (job) => {
    setSelectedJobForCV(job)
    setActiveTab('cv')
  }

  const handleViewSavedCV = (job) => {
    setViewingCV(job)
  }

  const handleBulkImport = (newJobs) => {
    // Fix #13 — use addJob (no per-job notif) then push ONE summary notification
    newJobs.forEach(j => addJob(j))
    if (newJobs.length > 0) {
      const s = newJobs.length > 1 ? 's' : ''
      pushNotif('new_job', `${newJobs.length} candidature${s} importée${s} depuis Gmail`, { count: newJobs.length })
      showToast(`${newJobs.length} candidature${s} importée${s} !`, 3500)
    }
    // After successful import or login, hide landing page and Gmail modal to show the board
    setShowLandingPage(false)
    setShowGmail(false)
    setTimeout(() => reprocessJobs(), 100)
  }

  const handleUpdateHistory = (id, history) => {
    const job = jobs.find(j => j.id === id)
    // Sort history by date (chronological order)
    const sorted = [...history].sort((a, b) => new Date(a.date) - new Date(b.date))
    updateJob(id, { history: sorted })
    if (job && history.length > (job.history?.length || 0))
      pushNotif('update', `${job.company} — historique mis à jour`, { company: job.company, jobId: id })
  }

  const handleEmailSent = (type, to) => {
    if (!emailDraft?.job) return
    const job = emailDraft.job
    const today = new Date().toISOString().split('T')[0]

    let note = ''
    if (type === 'remerciement') {
      note = `Email de remerciement envoyé à ${to}`
    } else if (type === 'relance') {
      note = `Email de relance envoyé à ${to}`
    }

    const newEntry = {
      date: today,
      status: job.status,
      note,
      fromMe: true,
      source: 'email',
    }

    const updated = {
      ...job,
      history: [...(job.history || []), newEntry]
    }

    addHistoryEntry(job.id, newEntry)
    showToast(type === 'remerciement' ? 'Email de remerciement envoyé ✓' : 'Email de relance envoyé ✓')
  }

  const handleClearAll = async () => {
    const msg = t('footer.clearConfirm').replace('{{count}}', jobs.length)
    if (!window.confirm(msg)) return
    await clearAllJobs()
    showToast(t('notifications.allApplicationsCleared'))
  }

  const toggleJobSelection = (jobId) => {
    setSelectedJobIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(jobId)) {
        newSet.delete(jobId)
      } else {
        newSet.add(jobId)
      }
      return newSet
    })
  }

  const handleMergeSelected = () => {
    if (selectedJobIds.size < 2) return
    const selectedJobs = jobs.filter(j => selectedJobIds.has(j.id))
    setMergeModal(selectedJobs)
  }

  const handleMergeConfirm = (mergedJob) => {
    updateJob(mergedJob)
    // Delete the other selected jobs
    selectedJobIds.forEach(id => {
      if (id !== mergedJob.id) {
        deleteJob(id)
      }
    })
    setSelectedJobIds(new Set())
    setMergeModal(null)
    showToast(t('notifications.jobsMerged') || 'Jobs merged successfully!')
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
    { id: 'tracker',  label: t('nav.tabs.tracker'), icon: '📋', badge: jobs.length || null },
    { id: 'search',   label: t('nav.tabs.search'),    icon: '🔎', badge: null },
    { id: 'cv',       label: t('nav.tabs.cv'),       icon: '📄', badge: null },
    { id: 'settings', label: t('nav.tabs.settings'),     icon: '⚙️',  badge: null },
  ]

  const goTab = (id) => { setActiveTab(id); setMobileMenuOpen(false) }

  // Show landing page if no user
  if (showLandingPage) {
    return (
      <ErrorBoundary>
        {!showGmail ? (
          <LandingPage onLogin={() => setShowGmail(true)} />
        ) : (
          <GmailImport onImport={handleBulkImport} onUpdate={updateJobWithNotif} onClose={() => { setShowGmail(false); const connected = isConnected(); setGmailConnected(connected); setGmailUser(connected ? getCachedUser() : null) }} onUserChange={(u) => { setGmailUser(u); setGmailConnected(!!u) }} existingJobs={jobs} t={t} />
        )}
      </ErrorBoundary>
    )
  }

  // Show loading screen while Supabase syncs data for first time
  if (gmailUser && jobs.length === 0 && !initialSyncDone) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
              <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{t('header.loading')}</h2>
            <p className="text-sm text-gray-500">{t('header.loadingDesc')}</p>
          </div>
        </div>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <div
        className="min-h-screen transition-colors duration-300"
      >

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
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">{t('mobileMenu.navigation')}</p>
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
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">{t('mobileMenu.add')}</p>
              {[
                { icon: '📧', label: t('mobileMenu.gmail'), sub: t('mobileMenu.gmailSub'), action: () => { setMobileMenuOpen(false); setShowGmail(true) } },
                { icon: '🖼️', label: t('mobileMenu.screenshot'), sub: t('mobileMenu.screenshotSub'), action: () => { setMobileMenuOpen(false); setShowImageImport(true) } },
                { icon: '✏️', label: t('mobileMenu.manual'), sub: t('mobileMenu.manualSub'), action: () => { setMobileMenuOpen(false); setModal('add') } },
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
                  {t('mobileMenu.connectGmail')}
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
            <ExtensionButton t={t} />

            {/* Refresh — desktop only (mobile is in drawer) */}
            {(gmailUser || gmailConnected) && (
              <button onClick={() => doRefresh(false)} disabled={refreshing}
                title={lastRefresh ? `${t('nav.lastSync')}: ${lastRefresh}` : t('nav.refresh')}
                className="hidden sm:flex items-center justify-center w-8 h-8 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30">
                <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}

            {/* Notifications */}
            <NotificationBell
              notifications={notifications} unreadCount={unreadCount}
              onMarkAllRead={markAllRead} onClear={clearNotifs}
              onNavigate={({ jobId, company }) => {
                setActiveTab('tracker')
                if (company) setFilters(f => ({ ...f, search: company }))
              }}
            />

            <div className="h-5 w-px bg-gray-200 mx-0.5 hidden sm:block" />

            {/* + Add dropdown */}
            <div className="relative">
              <button onClick={() => setShowAddMenu(v => !v)} title={t('nav.add')}
                className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white hover:opacity-90 active:scale-95 transition-all shadow-sm shadow-indigo-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              </button>
              {showAddMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                  <div className="absolute right-0 top-10 z-50 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden py-1.5">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-4 pt-1 pb-2">{t('addMenu.import')}</p>
                    <button onClick={() => { setShowAddMenu(false); setShowGmail(true) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
                      <span className="text-base">📧</span>
                      <div className="text-left"><div className="font-medium">{t('addMenu.gmail')}</div><div className="text-[11px] text-gray-400">{t('addMenu.gmailDesc')}</div></div>
                    </button>
                    <button onClick={() => { setShowAddMenu(false); setShowImageImport(true) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors">
                      <span className="text-base">🖼️</span>
                      <div className="text-left"><div className="font-medium">{t('addMenu.screenshot')}</div><div className="text-[11px] text-gray-400">{t('addMenu.screenshotDesc')}</div></div>
                    </button>
                    {extensionInstalled === false && (
                      <>
                        <a href="/jobtracker-addon-1.5.0.xpi"
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-orange-700 hover:bg-orange-50 transition-colors">
                          <span className="text-base">🦊</span>
                          <div className="text-left"><div className="font-medium">{t('addMenu.installExt')}</div><div className="text-[11px] text-gray-400">{t('addMenu.installExtDesc')}</div></div>
                        </a>
                        <div className="mx-4 my-1.5 border-t border-gray-100" />
                      </>
                    )}
                    {extensionInstalled === true && (
                      <>
                        <button disabled
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-green-700 bg-green-50 cursor-default">
                          <span className="text-base">🦊</span>
                          <div className="text-left"><div className="font-medium">{t('addMenu.extActive')}</div><div className="text-[11px] text-gray-400">{t('addMenu.extActiveDesc')}</div></div>
                        </button>
                        <div className="mx-4 my-1.5 border-t border-gray-100" />
                      </>
                    )}
                    <button onClick={() => { setShowAddMenu(false); setModal('add') }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors">
                      <span className="text-base">✏️</span>
                      <div className="text-left"><div className="font-medium">{t('addMenu.manual')}</div><div className="text-[11px] text-gray-400">{t('addMenu.manualDesc')}</div></div>
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
                <span>{t('nav.connected')}</span>
              </button>
            ) : (
              <button onClick={() => setShowGmail(true)}
                className="hidden sm:flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-100 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span>{t('nav.connectGmail')}</span>
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
          <Settings jobs={jobs} syncUserId={syncUserId} onMergeDuplicates={mergeDuplicates} />
        ) : activeTab === 'cv' ? (
          <CVManager jobs={jobs} preselectedJob={selectedJobForCV} onUpdateJob={updateJob} t={t} />
        ) : activeTab === 'search' ? (
          <JobSearch onAddJob={(job) => { addJob(job); showToast(`${job.company} ajouté !`); setActiveTab('tracker') }} existingJobs={jobs} t={t} />
        ) : (
          <>
        <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
        {/* Top 2-col: Stats left, Prochaines étapes right — only when data exists */}
        {jobs.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-stretch">
            <Stats jobs={jobs} t={t} />
            <NextAction
              jobs={jobs}
              onGenerateCV={handleGenerateCV}
              onOpenJob={(job) => { setActiveTab('tracker'); setFilters(DEFAULT_FILTERS); setExpandedJobId(job.id) }}
              onSTAR={(job) => setStarJob(job)}
              onDraftEmail={(job, type) => setEmailDraft({ job, type })}
              t={t}
            />
          </div>
        )}
        <Filters
          filters={filters} onChange={setFilters} onReset={() => setFilters(DEFAULT_FILTERS)}
          total={jobs.length} filtered={filtered.length}
          showFavOnly={showFavOnly} onToggleFav={() => setShowFavOnly(v => !v)} favCount={favCount}
          showArchived={showArchived} onToggleArchived={() => setShowArchived(v => !v)} archivedCount={archivedCount}
          t={t}
        />

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              {jobs.length === 0 ? (
                <>
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-gray-500 font-medium">{t('empty.noApplications')}</p>
                  <p className="text-gray-400 text-sm mt-1 mb-6">{t('empty.noApplicationsDesc')}</p>
                  <div className="flex gap-3 justify-center flex-wrap">
                    <button onClick={() => setShowImageImport(true)} className="border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-purple-50 transition-colors">{t('empty.screenshot')}</button>
                    <button onClick={() => setShowGmail(true)} className="border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">{t('empty.gmail')}</button>
                    <button onClick={() => setModal('add')} className="bg-indigo-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-indigo-700 transition-colors">{t('empty.addManually')}</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-4xl mb-3">🔍</div>
                  <p className="text-gray-500 font-medium">{t('empty.noResults')}</p>
                  <button onClick={() => setFilters(DEFAULT_FILTERS)} className="mt-3 text-sm text-indigo-600 hover:underline">{t('empty.resetFilters')}</button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* ── MOBILE: Card layout ──────────────────────────────────────────── */}
              <div className="md:hidden space-y-4">
                {/* Favorites section */}
                {filtered.some(j => j.favorite) && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-yellow-600">⭐ {t('stats.favorites')} ({filtered.filter(j => j.favorite).length})</span>
                    </div>
                    <div className="space-y-2.5">
                      {filtered.filter(j => j.favorite).map(job => (
                        <JobCard key={job.id} job={job} onEdit={setModal} onDelete={setToDelete} onStatusChange={handleStatusChange} onAddStep={addHistoryEntry} onUpdateHistory={handleUpdateHistory} onUpdateJob={updateJob} onGenerateCV={handleGenerateCV} onToggleFavorite={toggleFavorite} forceExpand={expandedJobId === job.id} onForceExpandDone={() => setExpandedJobId(null)} checkAllPositions={checkAllPositions} t={t} />
                      ))}
                    </div>
                  </>
                )}

                {/* Other applications section */}
                {filtered.some(j => !j.favorite) && (
                  <>
                    {filtered.some(j => j.favorite) && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-sm font-semibold text-gray-600">{t('stats.otherApplications')} ({filtered.filter(j => !j.favorite).length})</span>
                      </div>
                    )}
                    <div className="space-y-2.5">
                      {filtered.filter(j => !j.favorite).map(job => (
                        <JobCard key={job.id} job={job} onEdit={setModal} onDelete={setToDelete} onStatusChange={handleStatusChange} onAddStep={addHistoryEntry} onUpdateHistory={handleUpdateHistory} onUpdateJob={updateJob} onGenerateCV={handleGenerateCV} onToggleFavorite={toggleFavorite} forceExpand={expandedJobId === job.id} onForceExpandDone={() => setExpandedJobId(null)} checkAllPositions={checkAllPositions} t={t} />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* ── DESKTOP: Table layout ──────────────────────────────────────── */}
              <div className="hidden md:block space-y-6">
                {/* Favorites table */}
                {filtered.some(j => j.favorite) && (
                  <div className="overflow-x-auto">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-semibold text-yellow-600">⭐ {t('stats.favorites')} ({filtered.filter(j => j.favorite).length})</span>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-yellow-100 bg-yellow-50/60">
                          <th className="py-3 px-4"></th>
                          <ThHeader col="company" label={t('table.company')} />
                          <ThHeader col="status" label={t('table.status')} />
                          <ThHeader col="date" label={t('table.date')} />
                          <th className="hidden md:table-cell py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('table.notes')}</th>
                          <th className="py-3 px-4 w-20"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.filter(j => j.favorite).map(job => (
                          <JobRow key={job.id} job={job} onEdit={setModal} onDelete={setToDelete} onStatusChange={handleStatusChange} onAddStep={addHistoryEntry} onUpdateHistory={handleUpdateHistory} onUpdateJob={updateJob} onGenerateCV={handleGenerateCV} onToggleFavorite={toggleFavorite} onViewSavedCV={handleViewSavedCV} forceExpand={expandedJobId === job.id} onForceExpandDone={() => setExpandedJobId(null)} checkAllPositions={checkAllPositions} t={t} isSelected={selectedJobIds.has(job.id)} onSelect={toggleJobSelection} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Main table */}
                <div className="overflow-x-auto">
                  {filtered.some(j => j.favorite) && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-semibold text-gray-600">{t('stats.otherApplications')} ({filtered.filter(j => !j.favorite).length})</span>
                    </div>
                  )}
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        <th className="py-3 px-4"></th>
                        <ThHeader col="company" label={t('table.company')} />
                        <ThHeader col="status" label={t('table.status')} />
                        <ThHeader col="date" label={t('table.date')} />
                        <th className="hidden md:table-cell py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('table.notes')}</th>
                        <th className="py-3 px-4 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.filter(j => !j.favorite).map(job => (
                        <JobRow key={job.id} job={job} onEdit={setModal} onDelete={setToDelete} onStatusChange={handleStatusChange} onAddStep={addHistoryEntry} onUpdateHistory={handleUpdateHistory} onUpdateJob={updateJob} onGenerateCV={handleGenerateCV} onToggleFavorite={toggleFavorite} onViewSavedCV={handleViewSavedCV} forceExpand={expandedJobId === job.id} onForceExpandDone={() => setExpandedJobId(null)} checkAllPositions={checkAllPositions} t={t} isSelected={selectedJobIds.has(job.id)} onSelect={toggleJobSelection} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-6">
          <p className="text-xs text-gray-300">JobTrackr v0.4 <span title={`commit ${__COMMIT_HASH__}`}>· #{__COMMIT_COUNT__}</span></p>
          {jobs.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {selectedJobIds.size >= 2 && (
                <button onClick={handleMergeSelected}
                  className="text-xs text-blue-400 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-blue-200 hover:border-blue-400">
                  🔗 {t('footer.mergeSelected') || `Merge ${selectedJobIds.size} selected`}
                </button>
              )}
              <button onClick={mergeDuplicates}
                className="text-xs text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-indigo-200">
                {t('footer.mergeDuplicates')}
              </button>
              <button onClick={handleClearAll}
                className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-200">
                {t('footer.clearAll')}
              </button>
            </div>
          )}
        </div>
        </div>{/* end flex-1 */}

        {/* Right sidebar — meetings à venir (top-aligned with stats) */}
        <div className="w-80 flex-shrink-0 hidden xl:block">
          <div className="sticky top-24">
            <UpcomingMeetings jobs={jobs} t={t} />
            <Goals jobs={jobs} t={t} />
          </div>
        </div>
        </div>{/* end flex row */}
          </>
        )}
      </main>

      {/* ── Notification Permission Banner ────────────────────────────────────── */}
      <NotificationPermissionBanner />

      {/* ── Mobile bottom nav bar ─────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white border-t border-gray-100 shadow-[0_-2px_12px_0_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-around px-2 py-1 safe-area-bottom">
          {NAV_TABS.map(tab => (
            // Fix #17 — relative needed so absolute badge positions correctly
            <button key={tab.id} onClick={() => goTab(tab.id)}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-0 flex-1 ${
                activeTab === tab.id ? 'text-indigo-600' : 'text-gray-400'
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className="text-[10px] font-medium truncate w-full text-center">{tab.label.split(' ')[0]}</span>
              {tab.badge > 0 && activeTab !== tab.id && (
                <span className="absolute top-0.5 right-2 w-4 h-4 text-[9px] font-bold bg-indigo-500 text-white rounded-full flex items-center justify-center">{tab.badge > 99 ? '99' : tab.badge}</span>
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

      {modal && <JobModal job={modal === 'add' ? null : modal} onSave={handleSave} onClose={() => setModal(null)} findDuplicate={findDuplicateInList} t={t} />}
      {toDelete && <ConfirmDelete job={toDelete} onConfirm={handleDelete} onCancel={() => setToDelete(null)} t={t} />}
      {showGmail && <GmailImport onImport={handleBulkImport} onUpdate={updateJobWithNotif} onClose={() => { setShowGmail(false); const connected = isConnected(); setGmailConnected(connected); setGmailUser(connected ? getCachedUser() : null) }} onUserChange={(u) => { setGmailUser(u); setGmailConnected(!!u) }} existingJobs={jobs} t={t} />}
      {showImageImport && <ImageImport onImport={handleBulkImport} onClose={() => setShowImageImport(false)} existingJobs={jobs} />}
      {starJob && <STARGenerator job={starJob} onClose={() => setStarJob(null)} />}
      {emailDraft && <EmailDraft job={emailDraft.job} type={emailDraft.type} onClose={() => setEmailDraft(null)} onEmailSent={handleEmailSent} />}
      {viewingCV && <CVViewer job={viewingCV} onClose={() => setViewingCV(null)} />}
      {mergeModal && <MergeModal jobs={mergeModal} onConfirm={handleMergeConfirm} onCancel={() => setMergeModal(null)} t={t} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
      </div>
    </ErrorBoundary>
  )
}
