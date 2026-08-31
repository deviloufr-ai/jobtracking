import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { useJobs, getStatus, historyEntryKey } from './hooks/useJobs'
import { useExtensionImport } from './hooks/useExtensionImport'
import { useExtensionDetect } from './hooks/useExtensionDetect'
import { useExtensionUpdate } from './hooks/useExtensionUpdate'
import { EXTENSION_XPI_PATH } from './constants/extension'
import { useSettings } from './hooks/useSettings'
import { useLanguage } from './hooks/useLanguage'
import './styles/themes.css'
import { applyTheme as applyThemeTokens } from './utils/themes'
import ErrorBoundary from './components/ErrorBoundary'
import KpiStrip from './components/KpiStrip'
import Analytics from './components/Analytics'
import Filters from './components/Filters'
import JobRow from './components/JobRow'
import JobCard from './components/JobCard'
import JobFluxRow from './components/JobFluxRow'
import MobileHome from './components/MobileHome'
import MobilePipeline from './components/MobilePipeline'
import KanbanBoard from './components/KanbanBoard'
import PlatformView from './components/PlatformView'
import JobModal from './components/JobModal'
import ConfirmDelete from './components/ConfirmDelete'
import GmailImport from './components/GmailImport'
import NextAction from './components/NextAction'
import STARGenerator from './components/STARGenerator'
import EmailDraft from './components/EmailDraft'
import MergeModal from './components/MergeModal'
import { useAutoRefresh } from './hooks/useAutoRefresh'
import { useAndroidBackButton } from './hooks/useAndroidBackButton'
import { useAutoScore } from './hooks/useAutoScore'
import { useAutoCheckPositions } from './hooks/useAutoCheckPositions'
import { usePolling } from './hooks/usePolling'
import { connectGmail, disconnectGmail, isConnected, isGmailConfigured, getGmailUserInfo, getCachedUser, autoReuseStoredTokens } from './services/gmail'
import { supabase, signInWithGoogle, isSupabaseConfigured } from './services/supabase'
import { migrateToAuthIdentity } from './services/authMigration'
import { initializeSyncCoordinator } from './services/syncCoordinator'
import JobSearch from './components/JobSearch'
import { getFlag, FLAGS, FLAGS_EVENT } from './services/featureFlags'
import NavRail from './components/LayoutE/NavRail'
import TrackerHomeE from './components/LayoutE/TrackerHomeE'
import CVGenerator from './components/CVGenerator'
import BatchCVModal from './components/BatchCVModal'
import BulkActionBar from './components/BulkActionBar'
import FloatingWindow from './components/FloatingWindow'
import { useCVs } from './hooks/useCVs'
import Settings from './components/Settings'
import ImageImport from './components/ImageImport'
import UpcomingMeetings from './components/UpcomingMeetings'
import Goals from './components/Goals'
import CalendarWidget from './components/CalendarWidget'
import NotificationBell from './components/NotificationBell'
import { useNotifications } from './hooks/useNotifications'
import NotificationPermissionBanner from './components/NotificationPermissionBanner'
import AppUpdateBanner from './components/AppUpdateBanner'
import { APP_VERSION } from './constants/appVersion'
import { useNotificationPermission } from './hooks/useNotificationPermission'
import { useNotificationScenarios } from './hooks/useNotificationScenarios'
import { useDebugLogs } from './hooks/useDebugLogs'
import LandingPage from './components/LandingPage'
import LandingPageEN from './components/LandingPageEN'
import OnboardingModal from './components/OnboardingModal'
import ExtensionUpdateModal from './components/ExtensionUpdateModal'
import GuidedTour from './components/GuidedTour'
import BottomSheet from './components/BottomSheet'

const ONBOARDED_KEY = 'jobtrackr_onboarded'
const TOUR_DONE_KEY = 'jobtrackr_tour_done'
const API_KEY_STORAGE = 'jobtrackr_claude_api_key'

// Interactive product tour steps. Each points at a DOM element via a
// `[data-tour="…"]` anchor (see the JSX below); steps whose target isn't
// visible in the user's current state are skipped automatically, so a brand-new
// user with no jobs still gets a coherent, shorter walkthrough. Steps with no
// selector render as a centered card (intro + outro). Title/body are i18n keys.
const TOUR_STEPS = [
  { title: 'tour.welcomeTitle', body: 'tour.welcomeBody', icon: '👋' },
  { selector: '[data-tour="add"]', title: 'tour.addTitle', body: 'tour.addBody', icon: '➕' },
  { selector: '[data-tour="gmail"]', title: 'tour.gmailTitle', body: 'tour.gmailBody', icon: '📧' },
  { selector: '[data-tour="nav"]', title: 'tour.navTitle', body: 'tour.navBody', icon: '🧭' },
  { selector: '[data-tour="views"]', title: 'tour.viewsTitle', body: 'tour.viewsBody', icon: '🗂️' },
  { selector: '[data-tour="focus"]', title: 'tour.focusTitle', body: 'tour.focusBody', icon: '⚡' },
  { selector: '[data-tour="refresh"]', title: 'tour.refreshTitle', body: 'tour.refreshBody', icon: '🔄' },
  { selector: '[data-tour="settings"]', title: 'tour.settingsTitle', body: 'tour.settingsBody', icon: '⚙️' },
  { title: 'tour.doneTitle', body: 'tour.doneBody', icon: '🎉' },
]

const DEFAULT_FILTERS = { search: '', statuses: {}, period: 'all' }
const DEFAULT_SORT = { col: 'date', dir: 'desc' }

function sortJobs(jobs, sort) {
  const sorted = [...jobs]
  const { col, dir } = sort
  sorted.sort((a, b) => {
    let va, vb
    if (col === 'date') {
      // Sort by last activity, date AND time. History entries carry their time
      // inside `date` as an ISO datetime (e.g. 2026-06-02T14:30:00), so we key
      // off the chronologically latest entry (max timestamp) — not the last
      // array slot — so same-day rows order by their time.
      const lastDate = j => {
        if (!j.history?.length) return j.date
        return j.history.reduce((latest, h) =>
          new Date(h.date) > new Date(latest) ? h.date : latest, j.history[0].date)
      }
      va = new Date(lastDate(a)); vb = new Date(lastDate(b))
    }
    if (col === 'company') { va = a.company.toLowerCase(); vb = b.company.toLowerCase() }
    if (col === 'status')  { va = a.status; vb = b.status }
    if (col === 'position'){ va = a.position.toLowerCase(); vb = b.position.toLowerCase() }
    if (col === 'score')   { va = a.score ?? -1; vb = b.score ?? -1 }
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

// Shared column widths so the Favorites and Other applications tables line up
// (table-fixed). Company is the only flexible column; the rest are fixed.
function JobTableColgroup() {
  return (
    <colgroup>
      <col />{/* Company / Position — flexible */}
      <col className="w-20" />{/* Score */}
      <col className="w-40" />{/* Status */}
      <col className="w-32" />{/* Date */}
      <col className="hidden md:table-column w-1/3" />{/* Notes */}
      <col className="w-20" />{/* Actions */}
    </colgroup>
  )
}


// Always-visible extension affordance in the header toolbar.
// `installed` comes from the shared useExtensionDetect() in App:
//   true + updateAvailable → amber "Update" button (opens the update modal)
//   true  → green "Installed" pill
//   false → orange 🦊 download button + an ⓘ info popover explaining what & why
//   null  → still checking, render nothing
function ExtensionButton({ installed, updateAvailable, onUpdate, t }) {
  const [info, setInfo] = useState(false)
  const isFirefox = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent)

  if (installed === null) return null // still checking

  if (installed === true) {
    if (updateAvailable) {
      return (
        <button
          onClick={onUpdate}
          title={t('extensionUpdate.badge')}
          className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-orange-100 active:scale-95 transition-all"
        >
          <span className="relative flex">
            <span>🦊</span>
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 ring-2 ring-white" />
          </span>
          <span className="hidden sm:inline">{t('extensionUpdate.badge')}</span>
        </button>
      )
    }
    return (
      <div
        title={t('extension.title')}
        className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
      >
        <span>🦊</span>
        <span className="hidden sm:inline">{t('extension.installed')}</span>
      </div>
    )
  }

  const bullets = [
    { title: t('onboarding.extFeat1Title'), desc: t('onboarding.extFeat1Desc') },
    { title: t('onboarding.extFeat2Title'), desc: t('onboarding.extFeat2Desc') },
    { title: t('onboarding.extFeat3Title'), desc: t('onboarding.extFeat3Desc') },
  ]

  return (
    <div className="relative flex items-center gap-0.5">
      <a
        href={EXTENSION_XPI_PATH}
        title={t('extension.download')}
        className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-orange-100 active:scale-95 transition-all"
      >
        <span>🦊</span>
        <span className="hidden sm:inline">{t('extension.download')}</span>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
      </a>
      <button
        onClick={() => setInfo(v => !v)}
        aria-label={t('extension.whatIsIt')}
        title={t('extension.whatIsIt')}
        className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      </button>

      {info && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setInfo(false)} />
          <div className="absolute right-0 top-9 z-50 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="px-4 pt-4 pb-3 bg-gradient-to-br from-orange-500 to-amber-500 text-white">
              <div className="flex items-center gap-2">
                <span className="text-lg">🦊</span>
                <h3 className="font-bold text-sm leading-tight">{t('onboarding.extTitle')}</h3>
              </div>
              <p className="text-[11px] text-orange-50 mt-1.5 leading-relaxed">{t('onboarding.extIntro')}</p>
            </div>
            <div className="px-4 py-3 space-y-2.5">
              {bullets.map((b, i) => (
                <div key={i}>
                  <p className="text-xs font-semibold text-gray-800">{b.title}</p>
                  <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{b.desc}</p>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4">
              <a
                href={EXTENSION_XPI_PATH}
                onClick={() => setInfo(false)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-orange-500 text-white rounded-xl hover:bg-orange-600 active:scale-95 transition-all"
              >
                <span>🦊</span>{t('onboarding.extDownload')}
              </a>
              <p className="text-[10px] text-gray-400 text-center mt-2">{isFirefox ? t('onboarding.extFirefoxReady') : t('onboarding.extFirefoxNote')}</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function App() {
  const { jobs, addJob, updateJob, deleteJob, clearAllJobs, updateStatus, addHistoryEntry, mergeDuplicates, mergeJobs, toggleFavorite, reprocessJobs, checkAllPositions, findDuplicateInList, loading } = useJobs()
  const { cvs } = useCVs()
  const { settings } = useSettings()

  // Most recent uploaded CV — the source the tailored-CV generator adapts from.
  const baseCV = useMemo(() => {
    if (!cvs?.length) return null
    return [...cvs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
  }, [cvs])
  useDebugLogs() // Control console.log visibility based on debugLogsEnabled setting
  const { t, language } = useLanguage()
  const extensionInstalled = useExtensionDetect()
  const extUpdate = useExtensionUpdate()
  const { permission: notificationPermission } = useNotificationPermission()
  useNotificationScenarios(jobs, notificationPermission)

  // Auto-compute CV↔job match scores in the background (no user action needed)
  useAutoScore(jobs, updateJob)

  // Auto-check whether postings are still open, on the "check after X days" setting
  useAutoCheckPositions(jobs, checkAllPositions, settings)

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
  const [addSheet, setAddSheet] = useState(false)       // mobile FAB → add bottom sheet
  const [accountSheet, setAccountSheet] = useState(false) // mobile avatar → account bottom sheet
  const [starJob, setStarJob] = useState(null)
  const [emailDraft, setEmailDraft] = useState(null) // { job, type }
  const [toDelete, setToDelete] = useState(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [sort, setSort] = useState(DEFAULT_SORT)
  const [trackerView, setTrackerView] = useState(() => localStorage.getItem('jobtrackr_view') || 'table')
  const [toast, setToast] = useState(null)
  const [showGmail, setShowGmail] = useState(false)
  const [gmailUser, setGmailUser] = useState(() => getCachedUser())
  const [gmailConnected, setGmailConnected] = useState(() => isConnected())
  // Mobile lands on the Home dashboard; desktop keeps the Tracker (there's no
  // Home tab in the desktop nav). Viewport-checked once at first render.
  const [activeTab, setActiveTab] = useState(
    () => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'home' : 'tracker')
  )
  // Job search is an experimental, hidden-by-default feature (opt-in from
  // Settings → Debug). Track the flag and keep it live across toggles.
  const [searchEnabled, setSearchEnabled] = useState(() => getFlag(FLAGS.JOB_SEARCH))
  // New "E — Focus + List" layout (nav rail + drawer). Opt-in behind a flag while
  // it's built in parallel; off = current UI. Desktop (md+) only for now.
  const [layoutE, setLayoutE] = useState(() => getFlag(FLAGS.LAYOUT_E))
  const [expandedJobId, setExpandedJobId] = useState(null)
  const [detailJob, setDetailJob] = useState(null) // mobile: job open in the full-screen detail sheet
  const [showLandingPage, setShowLandingPage] = useState(true)
  const [syncUserId, setSyncUserId] = useState(null)
  const [initialSyncDone, setInitialSyncDone] = useState(false)
  // Supabase auth session — the real identity (auth.uid()) that RLS keys on.
  // null = not loaded yet, false = loaded & signed out, object = signed in.
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [currentTheme, setCurrentTheme] = useState(settings.theme || 'light')
  const [selectedJobIds, setSelectedJobIds] = useState(new Set())
  const [bulkCvOpen, setBulkCvOpen] = useState(false)
  const [mergeModal, setMergeModal] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showExtUpdate, setShowExtUpdate] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState(null)
  const [tourActive, setTourActive] = useState(false)
  const tourAutoStartedRef = useRef(false)

  // Keep the experimental job-search flag live when toggled from Settings.
  useEffect(() => {
    const onFlags = () => {
      const enabled = getFlag(FLAGS.JOB_SEARCH)
      setSearchEnabled(enabled)
      // Don't strand the user on a tab that just disappeared.
      if (!enabled) setActiveTab(tab => (tab === 'search' ? 'tracker' : tab))
      setLayoutE(getFlag(FLAGS.LAYOUT_E))
    }
    window.addEventListener(FLAGS_EVENT, onFlags)
    return () => window.removeEventListener(FLAGS_EVENT, onFlags)
  }, [])

  // First-time user onboarding: when a brand-new user logs in without a Claude
  // API key configured (and hasn't dismissed onboarding before), show the
  // explainer modal instead of dropping them into the Gmail scan.
  useEffect(() => {
    if (!gmailUser) return
    const onboarded = localStorage.getItem(ONBOARDED_KEY)
    const hasApiKey = !!localStorage.getItem(API_KEY_STORAGE)
    if (!onboarded && !hasApiKey) {
      setShowOnboarding(true)
      setShowGmail(false) // don't show the Gmail scan first
    }
  }, [gmailUser])

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARDED_KEY, '1')
    setShowOnboarding(false)
  }

  // Prompt to update the browser extension when a newer signed build is out and
  // the user hasn't skipped this version. `?extupdate=preview` force-opens the
  // modal for QA regardless of the installed version. Stays out of the way of the
  // first-run onboarding modal.
  const extUpdatePreview = new URLSearchParams(window.location.search).get('extupdate') === 'preview'
  useEffect(() => {
    if (showOnboarding) return
    if (extUpdatePreview || (extUpdate.updateAvailable && !extUpdate.dismissed)) {
      setShowExtUpdate(true)
    }
  }, [extUpdate.updateAvailable, extUpdate.dismissed, showOnboarding, extUpdatePreview])

  const dismissExtUpdate = () => {
    extUpdate.dismiss()
    setShowExtUpdate(false)
  }

  // Auto-launch the interactive tour once, for users who haven't taken it. It
  // waits until the main app is on screen (past the landing / loading screens)
  // and the first-time API-key modal is dismissed, so the two never overlap.
  // The short delay lets the header / nav finish mounting before the tour
  // measures its first target.
  const appVisible =
    !(isSupabaseConfigured() && authLoading) &&
    !(isSupabaseConfigured() && !session) &&
    !showLandingPage &&
    !(gmailUser && jobs.length === 0 && !initialSyncDone)
  useEffect(() => {
    if (!appVisible || showOnboarding || tourAutoStartedRef.current) return
    if (localStorage.getItem(TOUR_DONE_KEY)) return
    tourAutoStartedRef.current = true
    const id = setTimeout(() => setTourActive(true), 700)
    return () => clearTimeout(id)
  }, [appVisible, showOnboarding])

  const handleOnboardingAddKey = () => {
    dismissOnboarding()
    setSettingsInitialTab('api')
    setActiveTab('settings')
  }

  // Interactive guided tour controls.
  const finishTour = () => {
    localStorage.setItem(TOUR_DONE_KEY, '1')
    setTourActive(false)
  }
  const startTour = () => {
    // Replay always begins on the Tracker home where the anchors live.
    setActiveTab('tracker')
    setAccountSheet(false)
    setTourActive(true)
  }

  // When the shared-key free trial runs out, AI endpoints reply 402; the client
  // signals it here. Nudge the user to add their own key (Settings → API Claude).
  useEffect(() => {
    const onTrialExhausted = () => {
      setToast(t('onboarding.trialToast'))
      setTimeout(() => setToast(null), 6000)
      setSettingsInitialTab('api')
      setActiveTab('settings')
    }
    window.addEventListener('jobtrackr:trial-exhausted', onTrialExhausted)
    return () => window.removeEventListener('jobtrackr:trial-exhausted', onTrialExhausted)
  }, [t])

  // Load the Supabase auth session and keep it in sync. This establishes
  // auth.uid() for every session (the identity RLS will key on). Google sign-in
  // for identity is separate from the GIS Gmail-reading flow.
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      // No Supabase configured (e.g. local dev without env) — don't block the app.
      setAuthLoading(false)
      return
    }
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session || false)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || false)
      setAuthLoading(false)
    })
    return () => { active = false; subscription?.unsubscribe() }
  }, [])

  // Once signed in, skip the marketing landing page and go straight to the app.
  useEffect(() => {
    if (session) {
      setShowLandingPage(false)
      // Clean the OAuth callback path out of the address bar.
      if (window.location.pathname.startsWith('/auth/callback')) {
        window.history.replaceState({}, '', '/')
      }
    }
  }, [session])

  // On load: check for cached Gmail user
  useEffect(() => {
    autoReuseStoredTokens()
    if (!gmailUser && isConnected()) {
      getGmailUserInfo().then(user => { if (user) setGmailUser(user) })
    }
  }, [])

  // Apply theme on load and when settings change
  useEffect(() => {
    // Dark themes also get a shared `is-dark` marker so cross-cutting rules
    // (e.g. theming native form controls, which the per-class bg-white override
    // can't reach) apply once instead of being duplicated per theme.
    const DARK_THEMES = ['dark', 'midnight', 'nocturne', 'ocean', 'forest', 'sunset']
    const applyTheme = (theme) => {
      console.log('🎨 Applying theme:', theme)
      // Set the --theme-* custom properties that themes.css reads.
      applyThemeTokens(theme)
      document.body.classList.remove('theme-dark', 'theme-midnight', 'theme-nocturne', 'theme-ocean', 'theme-forest', 'theme-sunset', 'theme-minimal', 'is-dark')
      if (theme !== 'light') {
        document.body.classList.add(`theme-${theme}`)
      }
      if (DARK_THEMES.includes(theme)) {
        document.body.classList.add('is-dark')
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

  // Initialize sync once the user is authenticated. The Supabase auth.uid() is
  // now the canonical sync identity (replaces the gmail-derived sync UUID). Before
  // the first sync, migrate any legacy rows from the old UUID onto auth.uid().
  useEffect(() => {
    if (!session || syncUserId) return
    const authUid = session.user?.id
    if (!authUid) return

    console.log('🔐 Authenticated, migrating + initializing SyncCoordinator for', authUid)

    migrateToAuthIdentity(session.user)
      .catch(err => console.error('Auth migration failed (continuing):', err))
      .finally(() => {
        setSyncUserId(authUid)
        initializeSyncCoordinator(authUid)
      })
  }, [session, syncUserId])

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
  const [cvGenJob, setCvGenJob] = useState(null) // job whose tailored CV is being generated
  const [cvGenEdit, setCvGenEdit] = useState(false) // true = open cvGenJob to edit its saved CV (thema/content/skills); false = generate fresh
  const [showImageImport, setShowImageImport] = useState(false)

  const { notifications, push: pushNotif, markAllRead, clear: clearNotifs, remove: removeNotif, unreadCount } = useNotifications()

  const showToast = (msg, duration = 2500) => {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }

  // Wrap addJob/updateJob to emit notifications
  const addJobWithNotif = (data) => {
    const job = addJob(data)
    pushNotif('new_job', `Nouvelle candidature ajoutée — ${data.company}`, { company: data.company, position: data.position, status: data.status, jobId: job?.id })
    return job
  }

  const updateJobWithNotif = (id, data) => {
    updateJob(id, data)
    const job = jobs.find(j => j.id === id)
    // Notify on genuinely-new timeline entries, keyed by canonical identity — NOT a
    // raw array-length delta. A refresh that re-merges an already-known email can
    // shuffle length without adding anything real; counting by length fired a
    // phantom "1 nouvelle entrée" every hour (nothing new visible in the timeline).
    if (job && Array.isArray(data.history)) {
      const oldKeys = new Set()
      for (const h of job.history || []) {
        oldKeys.add(historyEntryKey(h))
        for (const gid of h.gmailIds || []) oldKeys.add(`gmail:${gid}`)
      }
      const newCount = data.history.filter(h => !oldKeys.has(historyEntryKey(h))).length
      if (newCount > 0) {
        pushNotif('update', `${job.company} — ${newCount} nouvelle${newCount > 1 ? 's' : ''} entrée${newCount > 1 ? 's' : ''} dans l'historique`, { company: job.company, position: job.position, status: data.status || job.status, count: newCount, jobId: id })
      }
    }
  }

  const { refreshing, lastRefresh, doRefresh } = useAutoRefresh(jobs, addJobWithNotif, updateJobWithNotif, (msg, duration) => {
    showToast(msg, duration)
  }, reprocessJobs, settings, loading)
  useExtensionImport(addJobWithNotif, showToast, findDuplicateInList)

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

  // One-time self-heal once jobs finish loading: re-derives each job's status from
  // its timeline (latest entry wins) and normalizes history. The archive-settings
  // effect above skips its first run, so this is what fixes stale statuses on load.
  const didInitialReprocessRef = useRef(false)
  useEffect(() => {
    if (loading || didInitialReprocessRef.current || jobs.length === 0) return
    didInitialReprocessRef.current = true
    reprocessJobs()
  }, [loading, jobs.length, reprocessJobs])

  const handleViewChange = (v) => {
    setTrackerView(v)
    localStorage.setItem('jobtrackr_view', v)
  }

  // Open a candidature from a compact list (e.g. the Platforms view): the edit
  // modal on desktop, the full-screen detail sheet on mobile — matching how the
  // table and kanban views route clicks per breakpoint.
  const openJob = (job) => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      setDetailJob(job)
    } else {
      setModal(job)
    }
  }

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
      pushNotif('update', `${form.company} — candidature mise à jour`, { company: form.company, position: form.position, status: form.status, jobId: modal.id })
      showToast('Candidature mise à jour')
    }
  }

  const handleDelete = () => {
    pushNotif('info', `Candidature supprimée — ${toDelete.company}`, { company: toDelete.company, position: toDelete.position, status: toDelete.status })
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
    // The generator adapts the user's base CV to this job. Without a base CV,
    // send them to upload one (now lives in Settings → My CV).
    if (!baseCV) {
      showToast(t('cvManagerUI.uploadCVStart'), 4000)
      setSettingsInitialTab('cv')
      setActiveTab('settings')
      return
    }
    setCvGenEdit(false)
    setCvGenJob(job)
  }

  const handleViewSavedCV = (job) => {
    // Open the full generation output preloaded with the saved CV so the user can
    // edit the template (thema), the content, and the skills (Points manquants)
    // in one place — instead of the read-only-ish viewer.
    if (!job?.cvSaved) return
    setCvGenEdit(true)
    setCvGenJob(job)
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
    // Extract status from most recent history entry, fallback to current job.status
    const latestStatus = sorted.length > 0 && sorted[sorted.length - 1].status ? sorted[sorted.length - 1].status : job?.status
    updateJob(id, { history: sorted, status: latestStatus })

    // Show notification for both additions and deletions
    if (job) {
      const oldLen = job.history?.length || 0
      const newLen = sorted.length
      if (newLen > oldLen) {
        pushNotif('update', `${job.company} — historique mis à jour`, { company: job.company, position: job.position, status: latestStatus, jobId: id })
      } else if (newLen < oldLen) {
        pushNotif('info', `${job.company} — entrée supprimée`, { company: job.company, position: job.position, status: latestStatus, jobId: id })
      }
    }
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

  const handleMergeConfirm = (mergedJob, secondaryIds) => {
    // Persist the keeper (full data + combined history) and remove the folded-in
    // secondary rows in one atomic mutation. secondaryIds comes from the modal;
    // fall back to the current selection minus the keeper for safety.
    const ids = secondaryIds || [...selectedJobIds].filter(id => id !== mergedJob.id)
    mergeJobs(mergedJob, ids)
    setSelectedJobIds(new Set())
    setMergeModal(null)
    showToast(t('notifications.jobsMerged') || 'Jobs merged successfully!')
  }

  // ── Bulk actions over the current selection (driven by BulkActionBar) ──
  const selectedJobs = useMemo(() => jobs.filter(j => selectedJobIds.has(j.id)), [jobs, selectedJobIds])
  const allSelectedFavorite = selectedJobs.length > 0 && selectedJobs.every(j => j.favorite)
  const clearSelection = () => setSelectedJobIds(new Set())

  const bulkSetStatus = (status) => {
    const n = selectedJobIds.size
    selectedJobIds.forEach(id => updateStatus(id, status))
    clearSelection()
    showToast(t('bulkBar.toastStatus').replace('{n}', n).replace('{status}', getStatus(status).label))
  }
  const bulkArchive = () => {
    const n = selectedJobIds.size
    selectedJobIds.forEach(id => updateStatus(id, 'archived'))
    clearSelection()
    showToast(t('bulkBar.toastArchived').replace('{n}', n))
  }
  const bulkToggleFavorite = () => {
    // If every selected row is already a favorite, un-favorite all; otherwise add
    // the ones that aren't (leaving already-favorite rows untouched).
    const turnOff = allSelectedFavorite
    selectedJobs.forEach(j => { if (turnOff ? j.favorite : !j.favorite) toggleFavorite(j.id) })
    clearSelection()
  }
  const bulkDelete = () => {
    const n = selectedJobIds.size
    selectedJobIds.forEach(id => deleteJob(id))
    clearSelection()
    showToast(t('bulkBar.toastDeleted').replace('{n}', n))
  }

  const ThHeader = ({ col, label }) => (
    <th
      onClick={() => handleSort(col)}
      className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-indigo-600 select-none whitespace-nowrap"
    >
      {label}<SortIcon col={col} sort={sort} />
    </th>
  )

  // Company column header with a "select all in this section" checkbox aligned
  // with the per-row checkboxes. `rows` are the jobs rendered in that table.
  const SelectAllTh = ({ rows }) => {
    const ids = rows.map(r => r.id)
    const allSel = ids.length > 0 && ids.every(id => selectedJobIds.has(id))
    const someSel = ids.some(id => selectedJobIds.has(id))
    const toggleAll = () => setSelectedJobIds(prev => {
      const next = new Set(prev)
      if (allSel) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
    return (
      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={allSel}
            ref={el => { if (el) el.indeterminate = !allSel && someSel }}
            onChange={toggleAll}
            className="flex-shrink-0 accent-indigo-600 w-4 h-4 cursor-pointer"
            title={t('bulkBar.selectAll')}
          />
          <span onClick={() => handleSort('company')} className="cursor-pointer hover:text-indigo-600 select-none inline-flex items-center">
            {t('table.company')}<SortIcon col="company" sort={sort} />
          </span>
        </div>
      </th>
    )
  }

  // ── nav tabs config ─────────────────────────────────────────────────────────
  const NAV_TABS = [
    { id: 'tracker',  label: t('nav.tabs.tracker'), icon: '📋', badge: jobs.length || null },
    { id: 'analytics', label: t('nav.tabs.analytics'), icon: '📊', badge: null },
    // Job search is hidden unless the experimental flag is enabled.
    ...(searchEnabled ? [{ id: 'search', label: t('nav.tabs.search'), icon: '🔎', badge: null }] : []),
    { id: 'settings', label: t('nav.tabs.settings'),     icon: '⚙️',  badge: null },
  ]

  // Mobile bottom-nav tabs: adds a Home destination while keeping Settings in the
  // bar. Desktop keeps NAV_TABS.
  const MOBILE_TABS = [
    { id: 'home',      label: t('nav.tabs.home'),      icon: '🏠', badge: null },
    { id: 'tracker',   label: t('nav.tabs.tracker'),   icon: '📋', badge: jobs.length || null },
    { id: 'analytics', label: t('nav.tabs.analytics'), icon: '📊', badge: null },
    ...(searchEnabled ? [{ id: 'search', label: t('nav.tabs.search'), icon: '🔎', badge: null }] : []),
    { id: 'settings',  label: t('nav.tabs.settings'),  icon: '⚙️', badge: null },
  ]

  const goTab = (id) => {
    if (id !== 'settings') setSettingsInitialTab(null)
    setActiveTab(id)
    setAddSheet(false)
    setAccountSheet(false)
  }

  // Close the Gmail import overlay + refresh the connected-account chips. Shared
  // by the modal's own close button and the Android Back handler below.
  const closeGmail = () => {
    setShowGmail(false)
    const connected = isConnected()
    setGmailConnected(connected)
    setGmailUser(connected ? getCachedUser() : null)
  }

  // ── Android hardware Back button ─────────────────────────────────────────────
  // Tab history so Back walks to the previously-visited tab instead of exiting.
  // `activeTab` is set from many places (nav bars, notifications, deep actions),
  // so we record every change here rather than only inside goTab. `backNavRef`
  // skips recording the Back-triggered navigation itself, so it doesn't re-push
  // the tab we just left.
  const tabHistoryRef = useRef([activeTab])
  const backNavRef = useRef(false)
  useEffect(() => {
    if (backNavRef.current) { backNavRef.current = false; return }
    const stack = tabHistoryRef.current
    if (stack[stack.length - 1] !== activeTab) {
      stack.push(activeTab)
      if (stack.length > 50) stack.shift() // cap: guard against unbounded growth
    }
  }, [activeTab])

  // Back with no overlay open: step back through the tab history, else exit.
  // Only ever invoked from the native Back listener, so App.exitApp() is safe.
  const handleAndroidBack = () => {
    const stack = tabHistoryRef.current
    if (stack.length > 1) {
      stack.pop() // drop the current tab; its predecessor becomes active
      backNavRef.current = true
      setActiveTab(stack[stack.length - 1])
      setSettingsInitialTab(null)
      return
    }
    import('@capacitor/app').then(({ App }) => App.exitApp())
  }

  // Ordered top-most first: Back closes the first open overlay; if none is open
  // it falls through to handleAndroidBack (tab history → exit).
  useAndroidBackButton(
    [
      { open: tourActive, close: finishTour },
      { open: showExtUpdate, close: dismissExtUpdate },
      { open: showOnboarding, close: dismissOnboarding },
      { open: bulkCvOpen, close: () => setBulkCvOpen(false) },
      { open: !!cvGenJob, close: () => { setCvGenJob(null); setCvGenEdit(false) } },
      { open: !!mergeModal, close: () => setMergeModal(null) },
      { open: !!emailDraft, close: () => setEmailDraft(null) },
      { open: !!starJob, close: () => setStarJob(null) },
      { open: showImageImport, close: () => setShowImageImport(false) },
      { open: showGmail, close: closeGmail },
      { open: !!toDelete, close: () => setToDelete(null) },
      { open: !!modal, close: () => setModal(null) },
      { open: !!detailJob, close: () => setDetailJob(null) },
      { open: addSheet, close: () => setAddSheet(false) },
      { open: accountSheet, close: () => setAccountSheet(false) },
      { open: showAddMenu, close: () => setShowAddMenu(false) },
      { open: selectedJobIds.size > 0, close: clearSelection },
    ],
    handleAndroidBack
  )

  // While the auth session is still loading, render nothing (avoids a flash of
  // the landing page for an already-signed-in user).
  if (isSupabaseConfigured() && authLoading) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
        </div>
      </ErrorBoundary>
    )
  }

  // Require a Supabase sign-in before the app. The landing page's CTA triggers
  // Google sign-in (identity); Gmail connection happens later, inside the app.
  if (isSupabaseConfigured() && !session) {
    const isEnglish = navigator.language.startsWith('en')
    const LandingComponent = isEnglish ? LandingPageEN : LandingPage
    return (
      <ErrorBoundary>
        <LandingComponent onLogin={() => signInWithGoogle().catch(err => console.error('Sign-in failed:', err))} />
      </ErrorBoundary>
    )
  }

  // Show landing page if no user (only reached when Supabase isn't configured).
  if (showLandingPage) {
    const isEnglish = navigator.language.startsWith('en')
    const LandingComponent = isEnglish ? LandingPageEN : LandingPage
    return (
      <ErrorBoundary>
        {!showGmail ? (
          <LandingComponent onLogin={() => setShowGmail(true)} />
        ) : (
          <GmailImport onImport={handleBulkImport} onUpdate={updateJobWithNotif} onClose={closeGmail} onUserChange={(u) => { setGmailUser(u); setGmailConnected(!!u) }} existingJobs={jobs} t={t} />
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
        className={`min-h-screen transition-colors duration-300${layoutE ? ' md:pl-[220px]' : ''}`}
      >

      {/* ── Mobile: Add bottom sheet (FAB) ─────────────────────────────────── */}
      <BottomSheet open={addSheet} onClose={() => setAddSheet(false)} title={t('addMenu.import')}>
        <div className="space-y-2">
          {[
            { icon: '📧', label: t('mobileMenu.gmail'), sub: t('addMenu.gmailDesc'), tint: 'bg-indigo-50', action: () => { setAddSheet(false); setShowGmail(true) } },
            { icon: '🖼️', label: t('mobileMenu.screenshot'), sub: t('addMenu.screenshotDesc'), tint: 'bg-purple-50', action: () => { setAddSheet(false); setShowImageImport(true) } },
            { icon: '✏️', label: t('mobileMenu.manual'), sub: t('addMenu.manualDesc'), tint: 'bg-gray-50', action: () => { setAddSheet(false); setModal('add') } },
          ].map(item => (
            <button key={item.label} onClick={item.action}
              className="w-full flex items-center gap-3.5 p-3 rounded-2xl hover:bg-gray-50 active:scale-[0.98] transition-all text-left">
              <span className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${item.tint}`}>{item.icon}</span>
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 text-sm">{item.label}</div>
                <div className="text-xs text-gray-400">{item.sub}</div>
              </div>
            </button>
          ))}
          {extensionInstalled === false && (
            <a href={EXTENSION_XPI_PATH} onClick={() => setAddSheet(false)}
              className="w-full flex items-center gap-3.5 p-3 rounded-2xl hover:bg-orange-50 active:scale-[0.98] transition-all text-left">
              <span className="w-11 h-11 rounded-xl flex items-center justify-center text-xl bg-orange-50">🦊</span>
              <div className="min-w-0">
                <div className="font-semibold text-orange-700 text-sm">{t('addMenu.installExt')}</div>
                <div className="text-xs text-gray-400">{t('addMenu.installExtDesc')}</div>
              </div>
            </a>
          )}
        </div>
      </BottomSheet>

      {/* ── Mobile: Account bottom sheet (avatar) ──────────────────────────── */}
      <BottomSheet open={accountSheet} onClose={() => setAccountSheet(false)} title={t('nav.account')}>
        <div className="space-y-1">
          {gmailUser && (
            <div className="flex items-center gap-3 p-2 mb-2">
              {gmailUser.picture
                ? <img src={gmailUser.picture} alt="" className="w-11 h-11 rounded-full" />
                : <div className="w-11 h-11 rounded-full bg-indigo-500 text-white text-base flex items-center justify-center font-bold">{gmailUser.email?.[0]?.toUpperCase()}</div>
              }
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-gray-900 truncate">{gmailUser.name || gmailUser.email}</div>
                <div className="text-xs text-gray-400 truncate">{gmailUser.email}</div>
              </div>
            </div>
          )}
          {(gmailUser || gmailConnected) && (
            <button onClick={() => { setAccountSheet(false); doRefresh(false) }} disabled={refreshing}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40">
              <svg className={`w-5 h-5 text-indigo-500 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {refreshing ? t('header.loading') : t('nav.refresh')}{lastRefresh ? ` · ${lastRefresh}` : ''}
            </button>
          )}
          <button onClick={() => { setAccountSheet(false); setShowGmail(true) }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
            {gmailUser || gmailConnected ? t('nav.connected') : t('mobileMenu.connectGmail')}
          </button>
          <button onClick={startTour}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <span className="w-5 h-5 flex items-center justify-center">🧭</span>
            {t('tour.replay')}
          </button>
          {session && (
            <button onClick={() => { setAccountSheet(false); supabase.auth.signOut() }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              {t('nav.signOut')}
            </button>
          )}
        </div>
      </BottomSheet>

      {/* ── Nav rail (new E layout, desktop) — replaces the top header on md+ ──── */}
      {layoutE && (
        <NavRail
          items={NAV_TABS}
          activeTab={activeTab}
          onNav={goTab}
          onAdd={() => setModal('add')}
          gmailUser={gmailUser}
          showRefresh={!!(gmailUser || gmailConnected)}
          refreshing={refreshing}
          onRefresh={() => doRefresh(false)}
          onAccount={() => goTab('settings')}
          onTour={startTour}
          extensionInstalled={extensionInstalled}
          extensionUpdateAvailable={extUpdate.updateAvailable}
          onExtensionUpdate={() => setShowExtUpdate(true)}
          t={t}
        />
      )}

      {/* Notifications bell — the top header (which normally hosts it) is
          md:hidden under the E layout, so pin the bell to the top-right of the
          content area on md+. z-30 keeps it below the job drawer (z-40), which
          simply covers it while a candidature is open. */}
      {layoutE && (
        <div className="hidden md:block fixed top-2.5 right-4 lg:right-6 z-30">
          <NotificationBell
            notifications={notifications} unreadCount={unreadCount}
            onMarkAllRead={markAllRead} onClear={clearNotifs} onRemove={removeNotif} t={t}
            onNavigate={({ jobId, company }) => {
              setActiveTab('tracker')
              if (company) setFilters(f => ({ ...f, search: company }))
            }}
          />
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header className={`bg-white border-b border-gray-100 sticky top-0 z-30 shadow-[0_1px_8px_0_rgba(0,0,0,0.06)]${layoutE ? ' md:hidden' : ''}`}>
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 flex items-center justify-between gap-2 h-14">

          {/* Left: logo + desktop nav + mobile page title */}
          <div className="flex items-center gap-2 sm:gap-6 h-full min-w-0">

            {/* Logo */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 64 64" className="w-5 h-5" fill="none" aria-hidden="true">
                  <polyline points="16,33 28,45 50,17" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="50" cy="17" r="5" fill="#fff" />
                </svg>
              </div>
              <span className="font-bold text-gray-900 text-[15px] tracking-tight hidden sm:block">SmartJobTracker</span>
            </div>

            {/* Divider — desktop only */}
            <div className="h-5 w-px bg-gray-200 shrink-0 hidden md:block" />

            {/* Desktop nav tabs */}
            <nav data-tour="nav" className="hidden md:flex items-center gap-0.5 h-full">
              {NAV_TABS.map(tab => (
                <button key={tab.id} onClick={() => goTab(tab.id)}
                  data-tour={tab.id === 'settings' ? 'settings' : undefined}
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
            <ExtensionButton installed={extensionInstalled} updateAvailable={extUpdate.updateAvailable} onUpdate={() => setShowExtUpdate(true)} t={t} />

            {/* Replay the interactive tour */}
            <button onClick={startTour} title={t('tour.replay')} aria-label={t('tour.replay')}
              className="hidden sm:flex items-center justify-center w-8 h-8 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>

            {/* Refresh — desktop only (mobile is in drawer) */}
            {(gmailUser || gmailConnected) && (
              <button data-tour="refresh" onClick={() => doRefresh(false)} disabled={refreshing}
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
              onMarkAllRead={markAllRead} onClear={clearNotifs} onRemove={removeNotif} t={t}
              onNavigate={({ jobId, company }) => {
                setActiveTab('tracker')
                if (company) setFilters(f => ({ ...f, search: company }))
              }}
            />

            <div className="h-5 w-px bg-gray-200 mx-0.5 hidden sm:block" />

            {/* + Add dropdown — desktop only (mobile uses the bottom FAB) */}
            <div className="relative hidden sm:block">
              <button data-tour="add" onClick={() => setShowAddMenu(v => !v)} title={t('nav.add')}
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
                        <a href={EXTENSION_XPI_PATH}
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
              <button data-tour="gmail" onClick={() => setShowGmail(true)} title={gmailUser.email}
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
              <button data-tour="gmail" onClick={() => setShowGmail(true)}
                className="hidden sm:flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-green-100 transition-all">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                <span>{t('nav.connected')}</span>
              </button>
            ) : (
              <button data-tour="gmail" onClick={() => setShowGmail(true)}
                className="hidden sm:flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-100 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span>{t('nav.connectGmail')}</span>
              </button>
            )}

            {/* Sign out (Supabase identity) — desktop */}
            {session && (
              <button onClick={() => supabase.auth.signOut()} title={t('nav.signOut')}
                className="hidden sm:flex items-center justify-center w-9 h-9 bg-gray-50 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            )}

            {/* Account avatar — mobile only (tappable, opens account sheet). Shows
                the connected Google profile photo with a small Google glyph. */}
            <button data-tour="gmail" onClick={() => setAccountSheet(true)} className="sm:hidden relative flex items-center justify-center" aria-label={gmailUser?.email || t('mobileMenu.connectGmail')}>
              {gmailUser?.picture
                ? <img src={gmailUser.picture} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full border-2 border-white shadow-sm" />
                : gmailUser
                  ? <div className="w-8 h-8 rounded-full bg-indigo-500 text-white text-xs flex items-center justify-center font-bold">{gmailUser.email?.[0]?.toUpperCase()}</div>
                  : <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
              }
              {gmailUser && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center shadow-sm">
                  <svg width="9" height="9" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45 24c0-1.6-.1-2.8-.4-4H24v7.5h12c-.2 1.9-1.6 4.8-4.6 6.7l6.6 5.1C42.1 35.6 45 30.4 45 24z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.6-5.1c-1.8 1.2-4.2 2-7.9 2-6 0-11.1-4-12.9-9.5l-6.9 5.3C7.4 40.9 15 46 24 46z"/><path fill="#FBBC05" d="M11.1 28.1c-.5-1.4-.7-2.9-.7-4.1s.3-2.7.7-4.1l-6.9-5.3C2.8 17.4 2 20.6 2 24s.8 6.6 2.2 9.4l6.9-5.3z"/><path fill="#EA4335" d="M24 10.4c3.3 0 5.6 1.4 6.9 2.6l5.8-5.6C33.1 4.1 28.9 2 24 2 15 2 7.4 7.1 4.2 14.6l6.9 5.3C12.9 14.4 18 10.4 24 10.4z"/></svg>
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────────── */}
      <main className={`${layoutE ? '' : 'max-w-screen-2xl mx-auto '}px-3 sm:px-6 py-4 sm:py-6 pb-24 md:pb-6`}>
        {activeTab === 'home' ? (
          /* Mobile Home destination — action-first dashboard + upcoming meetings. */
          <div className="max-w-xl mx-auto md:mx-0 space-y-4">
            <MobileHome
              jobs={jobs}
              userName={gmailUser?.name}
              onOpenJob={(job) => setDetailJob(job)}
              onGenerateCV={handleGenerateCV}
              onSTAR={(job) => setStarJob(job)}
              onDraftEmail={(job, type) => setEmailDraft({ job, type })}
              t={t}
            />
            <UpcomingMeetings jobs={jobs} t={t} />
          </div>
        ) : activeTab === 'settings' ? (
          <Settings jobs={jobs} syncUserId={syncUserId} onMergeDuplicates={mergeDuplicates} onUpdateJob={updateJob} initialTab={settingsInitialTab} />
        ) : activeTab === 'analytics' ? (
          <Analytics jobs={jobs} t={t} language={language} />
        ) : activeTab === 'search' && searchEnabled ? (
          <JobSearch onAddJob={(job) => { addJob(job); showToast(`${job.company} ajouté !`); setActiveTab('tracker') }} existingJobs={jobs} t={t} />
        ) : layoutE ? (
          <TrackerHomeE
            jobs={jobs}
            filtered={filtered}
            userName={gmailUser?.name}
            filters={filters}
            onFilterChange={setFilters}
            onResetFilters={() => setFilters(DEFAULT_FILTERS)}
            total={jobs.length}
            showFavOnly={showFavOnly}
            onToggleFav={() => setShowFavOnly(v => !v)}
            favCount={favCount}
            showArchived={showArchived}
            onToggleArchived={() => setShowArchived(v => !v)}
            archivedCount={archivedCount}
            view={trackerView}
            onViewChange={handleViewChange}
            language={language}
            sort={sort}
            onSort={setSort}
            selectedJobIds={selectedJobIds}
            onToggleSelect={toggleJobSelection}
            onSelectAll={(ids) => setSelectedJobIds(prev => {
              const all = ids.length > 0 && ids.every(id => prev.has(id))
              const next = new Set(prev)
              ids.forEach(id => (all ? next.delete(id) : next.add(id)))
              return next
            })}
            onEdit={(j) => setModal(j)}
            onDelete={(j) => setToDelete(j)}
            onStatusChange={handleStatusChange}
            onAddStep={addHistoryEntry}
            onUpdateHistory={handleUpdateHistory}
            onUpdateJob={updateJob}
            onGenerateCV={handleGenerateCV}
            onViewSavedCV={handleViewSavedCV}
            onToggleFavorite={toggleFavorite}
            checkAllPositions={checkAllPositions}
            onSTAR={(j) => setStarJob(j)}
            onDraftEmail={(j, type) => setEmailDraft({ job: j, type })}
            t={t}
          />
        ) : (
          <>
        <div className="w-full min-w-0">
        {/* Mobile: action-first hero (Accueil) — replaces the heavier stats grid below */}
        {jobs.length > 0 && (
          <div className="md:hidden">
            <MobileHome
              jobs={jobs}
              userName={gmailUser?.name}
              onOpenJob={(job) => setDetailJob(job)}
              onGenerateCV={handleGenerateCV}
              onSTAR={(job) => setStarJob(job)}
              onDraftEmail={(job, type) => setEmailDraft({ job, type })}
              t={t}
            />
          </div>
        )}
        {/* Mobile: upcoming meetings (md+ shows them in the home row below) */}
        {jobs.length > 0 && (
          <div className="md:hidden mb-4">
            <UpcomingMeetings jobs={jobs} t={t} />
          </div>
        )}
        {/* Desktop/tablet home: compact KPI strip, then an action-first row —
            "Focus du jour" as the primary column, "Cette semaine" (meetings +
            goals) as the right rail. Mobile keeps MobileHome above. */}
        {jobs.length > 0 && (
          <div className="hidden md:block mb-4">
            <KpiStrip jobs={jobs} t={t} />
          </div>
        )}
        {jobs.length > 0 && (
          <div className="hidden md:grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 mb-4 items-start">
            <div data-tour="focus">
              <NextAction
                jobs={jobs}
                onGenerateCV={handleGenerateCV}
                onOpenJob={(job) => { setActiveTab('tracker'); setFilters(DEFAULT_FILTERS); setExpandedJobId(job.id) }}
                onSTAR={(job) => setStarJob(job)}
                onDraftEmail={(job, type) => setEmailDraft({ job, type })}
                t={t}
              />
            </div>
            {/* Cette semaine — meetings + goals unified into one rail */}
            <div>
              <UpcomingMeetings jobs={jobs} t={t} />
              <Goals jobs={jobs} t={t} />
            </div>
          </div>
        )}
        <div data-tour="views">
          <Filters
            filters={filters} onChange={setFilters} onReset={() => setFilters(DEFAULT_FILTERS)}
            total={jobs.length} filtered={filtered.length}
            showFavOnly={showFavOnly} onToggleFav={() => setShowFavOnly(v => !v)} favCount={favCount}
            showArchived={showArchived} onToggleArchived={() => setShowArchived(v => !v)} archivedCount={archivedCount}
            view={trackerView} onViewChange={handleViewChange}
            t={t}
          />
        </div>

        {trackerView === 'platforms' ? (
          <PlatformView jobs={filtered} onOpen={openJob} language={language} t={t} />
        ) : trackerView === 'kanban' && filtered.length > 0 ? (
          <>
            {/* Mobile: swipeable stage pipeline */}
            <div className="md:hidden">
              <MobilePipeline
                jobs={filtered}
                onOpen={(job) => setDetailJob(job)}
                onToggleFavorite={toggleFavorite}
                t={t}
              />
            </div>
            {/* Tablet/desktop: drag-and-drop board */}
            <div className="hidden md:block">
              <KanbanBoard
                jobs={filtered}
                filters={filters}
                showArchived={showArchived}
                onStatusChange={handleStatusChange}
                onEdit={setModal}
                onToggleFavorite={toggleFavorite}
                t={t}
              />
            </div>
          </>
        ) : (
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
              {/* ── MOBILE: Flux list (swipe a row for quick actions, tap to open) ── */}
              <div className="md:hidden space-y-4">
                {/* Favorites section */}
                {filtered.some(j => j.favorite) && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-yellow-600">⭐ {t('stats.favorites')} ({filtered.filter(j => j.favorite).length})</span>
                    </div>
                    <div className="space-y-2.5">
                      {filtered.filter(j => j.favorite).map(job => (
                        <JobFluxRow key={job.id} job={job} onOpen={setDetailJob} onToggleFavorite={toggleFavorite} onArchive={(j) => handleStatusChange(j.id, 'archived')} onRelance={(j) => setEmailDraft({ job: j, type: 'relance' })} t={t} />
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
                        <JobFluxRow key={job.id} job={job} onOpen={setDetailJob} onToggleFavorite={toggleFavorite} onArchive={(j) => handleStatusChange(j.id, 'archived')} onRelance={(j) => setEmailDraft({ job: j, type: 'relance' })} t={t} />
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
                    <table className="w-full table-fixed">
                      <JobTableColgroup />
                      <thead>
                        <tr className="border-b border-yellow-100 bg-yellow-50/60">
                          <SelectAllTh rows={filtered.filter(j => j.favorite)} />
                          <ThHeader col="score" label={t('table.score')} />
                          <ThHeader col="status" label={t('table.status')} />
                          <ThHeader col="date" label={t('table.date')} />
                          <th className="hidden md:table-cell py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('table.notes')}</th>
                          <th className="py-3 px-4"></th>
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
                  <table className="w-full table-fixed">
                    <JobTableColgroup />
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        <SelectAllTh rows={filtered.filter(j => !j.favorite)} />
                        <ThHeader col="score" label={t('table.score')} />
                        <ThHeader col="status" label={t('table.status')} />
                        <ThHeader col="date" label={t('table.date')} />
                        <th className="hidden md:table-cell py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('table.notes')}</th>
                        <th className="py-3 px-4"></th>
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
        )}

        <div className="flex items-center justify-between mt-6">
          <p className="text-xs text-gray-300">SmartJobTracker v{APP_VERSION} <span title={`commit ${__COMMIT_HASH__}`}>· #{__COMMIT_COUNT__}</span></p>
          {jobs.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap justify-end">
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
        </div>{/* end home wrapper */}
          </>
        )}
      </main>

      {/* ── Notification Permission Banner ────────────────────────────────────── */}
      <NotificationPermissionBanner />
      <AppUpdateBanner />

      {/* ── Mobile bottom nav bar (4 tabs + raised center FAB) ────────────────── */}
      <nav data-tour="nav" className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white/95 backdrop-blur-lg border-t border-gray-100 shadow-[0_-2px_16px_0_rgba(0,0,0,0.08)]">
        <div className="flex items-stretch justify-around px-1 pt-1.5 pb-1 safe-area-bottom">
          {MOBILE_TABS.map((tab, i) => (
            <Fragment key={tab.id}>
              {/* Raised FAB injected in the middle (after the 2nd tab) */}
              {i === 2 && (
                <div className="flex-1 flex justify-center">
                  <button data-tour="add" onClick={() => setAddSheet(true)} aria-label={t('nav.add')}
                    className="-mt-6 w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-300/50 ring-4 ring-white active:scale-90 transition-transform">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                  </button>
                </div>
              )}
              <button onClick={() => goTab(tab.id)}
                data-tour={tab.id === 'settings' ? 'settings' : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-colors min-w-0 flex-1 ${
                  activeTab === tab.id ? 'text-indigo-600' : 'text-gray-400'
                }`}
              >
                <span className={`text-xl leading-none transition-transform ${activeTab === tab.id ? 'scale-110' : ''}`}>{tab.icon}</span>
                <span className="text-[10px] font-medium truncate w-full text-center">{tab.label.split(' ')[0]}</span>
                {tab.badge > 0 && activeTab !== tab.id && (
                  <span className="absolute top-0 right-1.5 min-w-[16px] h-4 px-1 text-[9px] font-bold bg-indigo-500 text-white rounded-full flex items-center justify-center">{tab.badge > 99 ? '99' : tab.badge}</span>
                )}
                {activeTab === tab.id && <span className="absolute -top-0.5 w-6 h-1 bg-indigo-600 rounded-full" />}
              </button>
            </Fragment>
          ))}
        </div>
      </nav>

      {modal && <JobModal job={modal === 'add' ? null : modal} onSave={handleSave} onClose={() => setModal(null)} findDuplicate={findDuplicateInList} t={t} />}
      {toDelete && <ConfirmDelete job={toDelete} onConfirm={handleDelete} onCancel={() => setToDelete(null)} t={t} />}
      {showGmail && <GmailImport onImport={handleBulkImport} onUpdate={updateJobWithNotif} onClose={closeGmail} onUserChange={(u) => { setGmailUser(u); setGmailConnected(!!u) }} existingJobs={jobs} t={t} />}
      {showImageImport && <ImageImport onImport={handleBulkImport} onClose={() => setShowImageImport(false)} existingJobs={jobs} />}
      {starJob && <STARGenerator job={starJob} onClose={() => setStarJob(null)} />}
      {emailDraft && <EmailDraft job={emailDraft.job} type={emailDraft.type} onClose={() => setEmailDraft(null)} onEmailSent={handleEmailSent} />}
      {cvGenJob && (baseCV || cvGenEdit) && (
        <FloatingWindow
          title={`${cvGenEdit ? '✏️' : '✨'} ${cvGenJob.company} — ${cvGenJob.position}`}
          onClose={() => { setCvGenJob(null); setCvGenEdit(false) }}
        >
          <CVGenerator
            cv={baseCV}
            cvs={cvs}
            job={jobs.find(j => j.id === cvGenJob.id) || cvGenJob}
            editSaved={cvGenEdit}
            onBack={() => { setCvGenJob(null); setCvGenEdit(false) }}
            onSaveCV={updateJob}
            t={t}
          />
        </FloatingWindow>
      )}
      {mergeModal && <MergeModal jobs={mergeModal} onConfirm={handleMergeConfirm} onCancel={() => setMergeModal(null)} t={t} />}
      {showOnboarding && <OnboardingModal onAddKey={handleOnboardingAddKey} onSkip={dismissOnboarding} extensionInstalled={extensionInstalled} t={t} />}
      {showExtUpdate && (
        <ExtensionUpdateModal
          installedVersion={extUpdatePreview ? (extUpdate.installedVersion || '1.5.1') : extUpdate.installedVersion}
          latestVersion={extUpdate.latestVersion}
          onUpdate={dismissExtUpdate}
          onClose={dismissExtUpdate}
          t={t}
        />
      )}
      {tourActive && <GuidedTour steps={TOUR_STEPS} onFinish={finishTour} t={t} />}

      {/* Bulk-action bar — table view of Candidatures, when rows are selected */}
      {activeTab === 'tracker' && trackerView === 'table' && (
        <BulkActionBar
          count={selectedJobIds.size}
          allFavorite={allSelectedFavorite}
          onGenerateCVs={() => setBulkCvOpen(true)}
          onSetStatus={bulkSetStatus}
          onArchive={bulkArchive}
          onToggleFavorite={bulkToggleFavorite}
          onMerge={handleMergeSelected}
          onDelete={bulkDelete}
          onClear={clearSelection}
          t={t}
        />
      )}
      {bulkCvOpen && (
        <BatchCVModal jobs={selectedJobs} onUpdateJob={updateJob} onClose={() => setBulkCvOpen(false)} t={t} />
      )}

      {/* Mobile: full-screen job detail sheet (opened from the Flux list / pipeline / hero) */}
      {detailJob && (
        <BottomSheet open onClose={() => setDetailJob(null)} maxHeight="93vh">
          <JobCard
            variant="sheet"
            defaultExpanded
            job={jobs.find(j => j.id === detailJob.id) || detailJob}
            onEdit={(j) => { setDetailJob(null); setModal(j) }}
            onDelete={(j) => { setDetailJob(null); setToDelete(j) }}
            onStatusChange={handleStatusChange}
            onAddStep={addHistoryEntry}
            onUpdateHistory={handleUpdateHistory}
            onUpdateJob={updateJob}
            onGenerateCV={(j) => { setDetailJob(null); handleGenerateCV(j) }}
            onViewSavedCV={(j) => { setDetailJob(null); handleViewSavedCV(j) }}
            onToggleFavorite={toggleFavorite}
            checkAllPositions={checkAllPositions}
            t={t}
          />
        </BottomSheet>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
      </div>
    </ErrorBoundary>
  )
}
