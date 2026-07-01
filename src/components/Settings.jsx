import { useState, useEffect } from 'react'
import { useSettings, SETTINGS_DEFAULTS } from '../hooks/useSettings'
import { useExtensionDetect } from '../hooks/useExtensionDetect'
import { useJobs } from '../hooks/useJobs'
import { useLanguage } from '../hooks/useLanguage'
import { useCVs } from '../hooks/useCVs'
import CVManager from './CVManager'
import NotificationSettings from './NotificationSettings'
import { supabase } from '../services/supabase'
import { indexeddb } from '../services/indexeddb'
import { THEMES } from '../utils/themes'
import { getFlag, setFlag, FLAGS } from '../services/featureFlags'
import { pushProfile, PROFILE_SYNCED_EVENT } from '../services/profileSync'

const PROFILE_KEY = 'jobtrackr_profile'
// CV ATS optimization level — kept in its own localStorage key (not the synced
// settings object) since it's a local generation preference and we don't want to
// depend on a user_settings DB column. Read at generation time in CVGenerator.
const CV_ATS_LEVEL_KEY = 'jobtrackr_cv_ats_level'
const CV_ATS_LEVELS = ['light', 'balanced', 'max']
const DEFAULT_CV_ATS_LEVEL = 'max'
const PROFILE_DEFAULTS = {
  name: '',
  title: '',
  email: '',
  phone: '',
  linkedin: '',
  website: '',
  experience: '',
  skills: '',
  languages: '',
  education: '',
  motivation: '',
  ai_experience: '',
  recent_project: '',
  homeAddress: '',
}

function loadProfile() {
  try { const r = localStorage.getItem(PROFILE_KEY); return r ? { ...PROFILE_DEFAULTS, ...JSON.parse(r) } : { ...PROFILE_DEFAULTS } }
  catch { return { ...PROFILE_DEFAULTS } }
}
function saveProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)) } catch {}
  // Mirror to Supabase so the profile follows the user to other devices
  pushProfile(p)
}

function Card({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {title && <h3 className="text-base font-semibold text-gray-900 mb-1">{title}</h3>}
      {subtitle && <p className="text-sm text-gray-500 mb-4">{subtitle}</p>}
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Row({ label, hint, children, wide = false }) {
  if (wide) return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
      {children}
    </div>
  )
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function NumInput({ value, onChange, min = 1, max = 365, suffix }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
        className="w-20 text-sm text-center border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
      />
      {suffix && <span className="text-xs text-gray-500">{suffix}</span>}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, multiline = false, rows = 2 }) {
  const cls = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all resize-none"
  return multiline
    ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} className={cls} />
    : <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />
}

const getCATEGORIES = (t) => [
  { id: 'profile', label: t('settingsSidebar.profile'), icon: '👤' },
  { id: 'cv', label: t('settingsSidebar.cv'), icon: '📄' },
  { id: 'goals', label: t('settingsSidebar.goals'), icon: '🎯' },
  { id: 'automation', label: t('settingsSidebar.automation'), icon: '⚙️' },
  { id: 'api', label: t('settingsSidebar.apiClaude'), icon: '🔑' },
  { id: 'notifications', label: t('settingsSidebar.notifications'), icon: '🔔' },
  { id: 'followups', label: t('settingsSidebar.followups'), icon: '⏰' },
  { id: 'appearance', label: t('settingsSidebar.appearance'), icon: '🎨' },
  { id: 'data', label: t('settingsSidebar.data'), icon: '💾' },
  { id: 'extension', label: t('settingsSidebar.extension'), icon: '🦊' },
  { id: 'debug', label: t('settingsSidebar.debug'), icon: '🐛' },
]

export default function Settings({ jobs, syncUserId, onMergeDuplicates, initialTab }) {
  const { settings, updateSetting, resetSettings } = useSettings()
  const { deduplicateViaServer } = useJobs()
  const { t, language, setLanguage, availableLanguages } = useLanguage()
  const { cvs } = useCVs()
  const extensionInstalled = useExtensionDetect()
  const CATEGORIES = getCATEGORIES(t)
  const [activeTab, setActiveTab] = useState(initialTab || 'profile')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [currentTheme, setCurrentTheme] = useState(() => localStorage.getItem('jobtrackr_theme') || 'light')
  const [jobSearchFlag, setJobSearchFlag] = useState(() => getFlag(FLAGS.JOB_SEARCH))
  // Cross-device deletion sync is ON by default; the flag is a "disable" kill-switch.
  const [crossDeleteDisabled, setCrossDeleteDisabled] = useState(() => getFlag(FLAGS.CROSS_DEVICE_DELETE_OFF))

  // Listen for theme changes
  useEffect(() => {
    const handleThemeChange = (e) => {
      console.log('🎨 Settings heard theme-changed event:', e.detail.theme)
      setCurrentTheme(e.detail.theme)
    }
    window.addEventListener('theme-changed', handleThemeChange)
    return () => window.removeEventListener('theme-changed', handleThemeChange)
  }, [])

  // Debug: log currentTheme whenever it changes
  useEffect(() => {
    console.log('🎨 Settings currentTheme state updated to:', currentTheme)
  }, [currentTheme])
  const [confirmDeleteHistory, setConfirmDeleteHistory] = useState(false)
  const [deleteHistoryDetails, setDeleteHistoryDetails] = useState(null)
  const [deleteHistoryLoading, setDeleteHistoryLoading] = useState(false)
  const [deleteHistoryResult, setDeleteHistoryResult] = useState(null)
  const [deleteHistoryError, setDeleteHistoryError] = useState(null)
  const [exportDone, setExportDone] = useState(false)
  const [importError, setImportError] = useState(null)
  const [serverDedupLoading, setServerDedupLoading] = useState(false)
  const [serverDedupResult, setServerDedupResult] = useState(null)
  const [serverDedupError, setServerDedupError] = useState(null)

  // API Key state
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('jobtrackr_claude_api_key') || '')
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [apiKeyTested, setApiKeyTested] = useState(false)
  const [apiKeyTestLoading, setApiKeyTestLoading] = useState(false)
  const [apiKeyTestError, setApiKeyTestError] = useState(null)

  // CV ATS optimization level (local generation preference)
  const [cvAtsLevel, setCvAtsLevel] = useState(() => {
    const v = localStorage.getItem(CV_ATS_LEVEL_KEY)
    return CV_ATS_LEVELS.includes(v) ? v : DEFAULT_CV_ATS_LEVEL
  })
  const handleAtsLevelChange = (v) => {
    setCvAtsLevel(v)
    localStorage.setItem(CV_ATS_LEVEL_KEY, v)
  }

  // Profile state
  const [profile, setProfile] = useState(loadProfile)
  const [profileSaved, setProfileSaved] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState(null)

  const updateProfile = (key, value) => setProfile(p => ({ ...p, [key]: value }))
  const handleSaveProfile = () => {
    saveProfile(profile)
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
  }

  // Refresh the form when a remote profile is pulled in on another device's sync.
  useEffect(() => {
    const onSynced = (e) => { if (e.detail) setProfile(p => ({ ...p, ...e.detail })) }
    window.addEventListener(PROFILE_SYNCED_EVENT, onSynced)
    return () => window.removeEventListener(PROFILE_SYNCED_EVENT, onSynced)
  }, [])

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      setApiKeyTestError(t('settingsAPI.errorEmpty'))
      return
    }
    localStorage.setItem('jobtrackr_claude_api_key', apiKey)
    setApiKeySaved(true)
    setApiKeyTestError(null)
    setTimeout(() => setApiKeySaved(false), 2000)
  }

  const handleTestApiKey = async () => {
    if (!apiKey.trim()) {
      setApiKeyTestError(t('settingsAPI.errorEnterBeforeTest'))
      return
    }

    setApiKeyTestLoading(true)
    setApiKeyTestError(null)
    setApiKeyTested(false)

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 100,
          system: 'You are a helpful assistant.',
          messages: [{ role: 'user', content: 'Simply say "OK" to confirm your API is working.' }],
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setApiKeyTestError(data.error?.message || data.error || `API Error: ${res.status}`)
      } else {
        setApiKeyTested(true)
        setTimeout(() => setApiKeyTested(false), 3000)
      }
    } catch (e) {
      setApiKeyTestError(e.message || t('settingsAPI.errorConnection'))
    } finally {
      setApiKeyTestLoading(false)
    }
  }

  const handleClearApiKey = () => {
    setApiKey('')
    localStorage.removeItem('jobtrackr_claude_api_key')
    setApiKeySaved(true)
    setApiKeyTestError(null)
    setTimeout(() => setApiKeySaved(false), 2000)
  }

  const handleServerDedup = async () => {
    setServerDedupLoading(true)
    setServerDedupError(null)
    setServerDedupResult(null)
    try {
      const result = await deduplicateViaServer()
      setServerDedupResult(result)
      setTimeout(() => setServerDedupResult(null), 5000)
    } catch (error) {
      setServerDedupError(error.message)
      setTimeout(() => setServerDedupError(null), 5000)
    } finally {
      setServerDedupLoading(false)
    }
  }

  async function handleExtractFromCV() {
    try {
      if (!cvs.length) { setExtractError('No CV uploaded — go to My CV to add one.'); return }
      const cv = cvs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0]
      setExtracting(true)
      setExtractError(null)
      const res = await fetch('/api/extract-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText: cv.text })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Extraction error')
      const extracted = { ...data.profile, extractedFrom: cv.name }
      saveProfile(extracted)
      setProfile(extracted)
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 3000)
    } catch (e) {
      setExtractError(e.message)
    }
    setExtracting(false)
  }

  function handleExport() {
    const data = { jobs, exportedAt: new Date().toISOString(), version: '1.0' }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `jobtrackr-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setExportDone(true)
    setTimeout(() => setExportDone(false), 2000)
  }

  function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        const incoming = data.jobs || (Array.isArray(data) ? data : null)
        if (!incoming) throw new Error('Invalid format')
        const existing = JSON.parse(localStorage.getItem('jobtrackr_applications') || '[]')
        const existingIds = new Set(existing.map(j => j.id))
        const merged = [...existing, ...incoming.filter(j => !existingIds.has(j.id))]
        localStorage.setItem('jobtrackr_applications', JSON.stringify(merged))
        window.location.reload()
      } catch (err) {
        setImportError(err.message || 'Error reading file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function clearEmailCache() {
    localStorage.removeItem('jobtrackr_email_cache')
    setConfirmClear(false)
  }

  async function getHistoryDetails() {
    try {
      const allJobs = jobs || []
      const totalHistoryEntries = allJobs.reduce((sum, job) => sum + (job.history?.length || 0), 0)
      setDeleteHistoryDetails({
        jobsWithHistory: allJobs.filter(j => j.history?.length > 0).length,
        totalHistoryEntries,
        totalJobs: allJobs.length
      })
    } catch (err) {
      console.error('Failed to get history details:', err)
      setDeleteHistoryDetails(null)
    }
  }

  async function handleDeleteAllHistory() {
    if (!deleteHistoryDetails) return
    setDeleteHistoryLoading(true)
    setDeleteHistoryError(null)
    setDeleteHistoryResult(null)

    try {
      const allJobs = jobs || []
      let deletedCount = 0

      // Delete from IndexedDB for all jobs
      for (const job of allJobs) {
        if (job.history?.length > 0) {
          deletedCount += job.history.length
          const updatedJob = { ...job, history: [] }
          await indexeddb.saveJob(updatedJob)
        }
      }

      // Delete from Supabase - delete all history for current user
      if (syncUserId) {
        const { error: deleteError } = await supabase
          .from('job_history')
          .delete()
          .eq('user_id', syncUserId)

        if (deleteError) {
          console.error('Supabase delete error:', deleteError)
          throw new Error(`Failed to delete from Supabase: ${deleteError.message}`)
        }
      } else {
        throw new Error('User not authenticated')
      }

      setDeleteHistoryResult({ deletedCount, jobsAffected: deleteHistoryDetails.jobsWithHistory })
      setConfirmDeleteHistory(false)
      setDeleteHistoryDetails(null)

      // Wait 2 seconds then reload to let deletion propagate
      await new Promise(resolve => setTimeout(resolve, 2000))
      window.location.reload()
    } catch (err) {
      setDeleteHistoryError(err.message)
      console.error('Delete history error:', err)
    } finally {
      setDeleteHistoryLoading(false)
    }
  }

  function handleFullReset() {
    ['jobtrackr_applications', 'jobtrackr_settings', 'jobtrackr_email_cache',
      'jobtrackr_notifications', 'jobtrackr_cvs', 'jobtrackr_last_refresh'].forEach(k => localStorage.removeItem(k))
    window.location.reload()
  }

  const currentCategory = CATEGORIES.find(c => c.id === activeTab)

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white overflow-hidden">
      {/* Sidebar */}
      <div className={`fixed inset-0 z-40 sm:relative sm:z-0 ${sidebarOpen ? 'block' : 'hidden'} sm:block sm:w-56 bg-white border-r border-gray-200 flex flex-col overflow-y-auto`}>
        {/* Close button on mobile */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="sm:hidden absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg"
        >
          ✕
        </button>

        <div className="p-5 space-y-1.5">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => { setActiveTab(cat.id); setSidebarOpen(false) }}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-3 ${
                activeTab === cat.id
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="text-lg">{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Overlay on mobile when sidebar is open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6 sm:p-8">
          {/* Header with mobile menu */}
          <div className="flex items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{currentCategory?.icon} {currentCategory?.label}</h1>
              <p className="text-gray-500 text-sm mt-1">
                {activeTab === 'profile' && t('settingsDesc.profile')}
                {activeTab === 'cv' && t('settingsDesc.cv')}
                {activeTab === 'goals' && t('settingsDesc.goals')}
                {activeTab === 'automation' && t('settingsDesc.automation')}
                {activeTab === 'api' && t('settingsDesc.apiClaude')}
                {activeTab === 'notifications' && t('settingsDesc.notifications')}
                {activeTab === 'followups' && t('settingsDesc.followups')}
                {activeTab === 'appearance' && t('settingsDesc.appearance')}
                {activeTab === 'data' && t('settingsDesc.data')}
                {activeTab === 'extension' && t('settingsDesc.extension')}
                {activeTab === 'debug' && t('settingsDesc.debug')}
              </p>
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="sm:hidden p-2 rounded-lg hover:bg-gray-100"
            >
              ☰
            </button>
          </div>

          <div className="space-y-6">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <>
                <Card subtitle={t('settingsProfile.autoFillSubtitle')}>
                  <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-lg px-4 py-3 -mx-2">
                    <span className="text-xl shrink-0">✨</span>
                    <div className="flex-1 min-w-0">
                      {profile?.extractedFrom
                        ? <p className="text-xs text-indigo-700">{`${t('settingsProfile.profileExtractedFrom')} `}<strong>{profile.extractedFrom}</strong>{profile.extractedAt ? ` · ${new Date(profile.extractedAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')}` : ''}</p>
                        : <p className="text-xs text-indigo-700 font-medium">{t('settingsProfile.zeroManualEntry')}</p>
                      }
                    </div>
                    <button
                      onClick={handleExtractFromCV}
                      disabled={extracting}
                      className="shrink-0 text-xs font-semibold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {extracting
                        ? <><span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin inline-block" /> {t('settingsProfile.extractingFromCV')}…</>
                        : profile?.extractedFrom ? `🔄 ${t('settingsProfile.reExtract')}` : `✦ ${t('settingsProfile.extract')}`
                      }
                    </button>
                  </div>
                  {extractError && <p className="text-xs text-red-500">{extractError}</p>}
                </Card>

                <Card title={t('settingsProfile.basicInfo')}>
                  <Row label={t('settingsProfile.fullName')} hint={t('settingsProfile.fullNameHint')}>
                    <TextInput value={profile.name} onChange={v => updateProfile('name', v)} placeholder="Alexandre Leblanc" />
                  </Row>
                  <Row label={t('settingsProfile.jobTitle')}>
                    <TextInput value={profile.title} onChange={v => updateProfile('title', v)} placeholder="Senior Product Manager" />
                  </Row>
                  <Row label={t('settingsProfile.email')} hint={t('settingsProfile.emailHint')}>
                    <TextInput value={profile.email} onChange={v => updateProfile('email', v)} placeholder="devilalex@example.com" />
                  </Row>
                  <Row label={t('settingsProfile.phone')} hint={t('settingsProfile.phoneHint')}>
                    <TextInput value={profile.phone} onChange={v => updateProfile('phone', v)} placeholder="+33 6 12 34 56 78" />
                  </Row>
                  <Row label={t('settingsProfile.linkedin')} hint={t('settingsProfile.linkedinHint')}>
                    <TextInput value={profile.linkedin} onChange={v => updateProfile('linkedin', v)} placeholder="https://linkedin.com/in/devilalex" />
                  </Row>
                  <Row label={t('settingsProfile.website')} hint={t('settingsProfile.websiteHint')}>
                    <TextInput value={profile.website} onChange={v => updateProfile('website', v)} placeholder="https://devilalex.com" />
                  </Row>
                  <Row label={t('settingsProfile.languages')}>
                    <TextInput value={profile.languages} onChange={v => updateProfile('languages', v)} placeholder="Français (natif), Anglais (courant)" />
                  </Row>
                  <Row label={t('settingsProfile.education')}>
                    <TextInput value={profile.education} onChange={v => updateProfile('education', v)} placeholder="Ingénieur Arts & Métiers" />
                  </Row>
                </Card>

                <Card title="📍 Commute Settings" subtitle="Set your home address to calculate commute times to job locations">
                  <Row label="Home Address" hint="Used to calculate driving time to company offices">
                    <TextInput value={profile.homeAddress} onChange={v => updateProfile('homeAddress', v)} placeholder="123 Rue de Paris, Paris, France" />
                  </Row>
                </Card>

                <Card title={t('settingsProfile.experienceAndSkills')}>
                  <Row label={t('settingsProfile.companies')} wide hint={t('settingsProfile.companiesHint')}>
                    <TextInput
                      multiline
                      rows={3}
                      value={Array.isArray(profile.companies) ? profile.companies.join('\n') : (profile.companies || '')}
                      onChange={v => updateProfile('companies', v.split('\n').filter(c => c.trim()))}
                      placeholder="Acme Inc (2020-2023)&#10;Google (2018-2020)&#10;Startup XYZ (2015-2018)"
                    />
                  </Row>
                  <Row label={t('settingsProfile.experienceSummary')} wide hint={t('settingsProfile.experienceSummaryHint')}>
                    <TextInput multiline rows={3} value={profile.experience} onChange={v => updateProfile('experience', v)} placeholder="18 years of experience in product management..." />
                  </Row>
                  <Row label={t('settingsProfile.keySkills')} wide hint={t('settingsProfile.keySkillsHint')}>
                    <TextInput multiline rows={2} value={profile.skills} onChange={v => updateProfile('skills', v)} placeholder="Product strategy, OKR, Agile, Data analytics..." />
                  </Row>
                  <Row label={t('settingsProfile.aiExperience')} wide>
                    <TextInput multiline rows={2} value={profile.ai_experience} onChange={v => updateProfile('ai_experience', v)} placeholder="Claude API, ComfyUI, JobTrackerAI..." />
                  </Row>
                  <Row label={t('settingsProfile.motivation')} wide>
                    <TextInput multiline rows={2} value={profile.motivation} onChange={v => updateProfile('motivation', v)} placeholder="Passionate about products that solve real problems..." />
                  </Row>
                </Card>

                {profile?.key_achievements?.length > 0 && (
                  <Card title={t('settingsProfile.keyAchievements')}>
                    <ul className="space-y-1">
                      {profile.key_achievements.map((a, i) => (
                        <li key={i} className="text-xs text-gray-600 flex gap-2"><span className="text-indigo-400">·</span>{a}</li>
                      ))}
                    </ul>
                  </Card>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveProfile}
                    className={`text-sm font-semibold px-5 py-2 rounded-lg transition-all ${
                      profileSaved ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {profileSaved ? `✓ ${t('settingsProfile.saved')}` : t('common.save')}
                  </button>
                </div>
              </>
            )}

            {/* My CV Tab */}
            {activeTab === 'cv' && (
              <>
                <Card title={`🎯 ${t('settingsCV.atsTitle')}`} subtitle={t('settingsCV.atsSubtitle')}>
                  <Row label={t('settingsCV.atsLevel')} hint={t('settingsCV.atsLevelHint')}>
                    <select
                      value={cvAtsLevel}
                      onChange={e => handleAtsLevelChange(e.target.value)}
                      className="w-full sm:w-auto text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
                    >
                      <option value="light">{t('settingsCV.atsLight')}</option>
                      <option value="balanced">{t('settingsCV.atsBalanced')}</option>
                      <option value="max">{t('settingsCV.atsMax')}</option>
                    </select>
                  </Row>
                </Card>
                <CVManager jobs={jobs} onUpdateJob={() => {}} manageOnly t={t} />
              </>
            )}

            {/* Goals Tab */}
            {activeTab === 'goals' && (
              <Card title={t('settingsGoals.title')}>
                <Row label={t('settingsGoals.applicationsPerWeek')} hint={t('settingsGoals.applicationsPerWeekHint')}>
                  <NumInput value={settings.weeklyApps} onChange={v => updateSetting('weeklyApps', v)} min={1} max={50} />
                </Row>
                <Row label={t('settingsGoals.responseRateTarget')} hint={t('settingsGoals.responseRateTargetHint')}>
                  <NumInput value={settings.responseRate} onChange={v => updateSetting('responseRate', v)} min={1} max={100} suffix="%" />
                </Row>
                <Row label={t('settingsGoals.interviewsPerMonth')} hint={t('settingsGoals.interviewsPerMonthHint')}>
                  <NumInput value={settings.monthlyInterviews} onChange={v => updateSetting('monthlyInterviews', v)} min={1} max={30} />
                </Row>
              </Card>
            )}

            {/* Automation Tab */}
            {activeTab === 'automation' && (
              <Card title={t('settingsAutomation.title')}>
                <Row label={t('settingsAutomation.autoArchiveNoResponse')} hint={t('settingsAutomation.autoArchiveNoResponseHint')}>
                  <NumInput value={settings.archiveSentDays} onChange={v => updateSetting('archiveSentDays', v)} min={0} max={365} suffix="j" />
                </Row>
                <Row label={t('settingsAutomation.autoArchiveRejected')} hint={t('settingsAutomation.autoArchiveRejectedHint')}>
                  <NumInput value={settings.archiveRejectedDays} onChange={v => updateSetting('archiveRejectedDays', v)} min={0} max={365} suffix="j" />
                </Row>
                <Row label={t('settingsAutomation.gmailSync')} hint={t('settingsAutomation.gmailSyncHint')}>
                  <NumInput value={settings.autoRefreshHours} onChange={v => updateSetting('autoRefreshHours', v)} min={1} max={72} suffix="h" />
                </Row>
                <Row label={t('settingsAutomation.gmailPeriod')} hint={t('settingsAutomation.gmailPeriodHint')}>
                  <NumInput value={settings.gmailPeriodDays} onChange={v => updateSetting('gmailPeriodDays', v)} min={1} max={365} suffix="j" />
                </Row>
                <Row label={t('settingsAutomation.checkPositionAvailability')} hint={t('settingsAutomation.checkPositionAvailabilityHint')}>
                  <NumInput value={settings.checkPositionAfterDays} onChange={v => updateSetting('checkPositionAfterDays', v)} min={0} max={365} suffix="j" />
                </Row>
              </Card>
            )}

            {/* API Tab */}
            {activeTab === 'api' && (
              <>
                <Card subtitle={t('settingsAPI.subtitle')}>
                  <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 -mx-2">
                    <span className="text-xl shrink-0">🔐</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-blue-700 font-medium">{t('settingsAPI.privateKeyInfo')}</p>
                      <p className="text-xs text-blue-600 mt-0.5">{t('settingsAPI.neverSentToServer')}</p>
                    </div>
                  </div>
                </Card>

                <Card title={t('settingsAPI.claudeAPIKey')}>
                  <Row label={t('settingsAPI.yourAPIKey')} hint={t('settingsAPI.yourAPIKeyHint')} wide>
                    <div className="flex gap-2">
                      <input
                        type={apiKeyVisible ? 'text' : 'password'}
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        placeholder="sk-ant-..."
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all font-mono text-xs"
                      />
                      <button
                        onClick={() => setApiKeyVisible(!apiKeyVisible)}
                        className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm font-medium"
                        title={apiKeyVisible ? t('settingsAPI.hide') : t('settingsAPI.show')}
                      >
                        {apiKeyVisible ? '👁️‍🗨️' : '👁️'}
                      </button>
                    </div>
                  </Row>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveApiKey}
                      disabled={!apiKey.trim()}
                      className={`flex-1 text-sm font-semibold px-4 py-2.5 rounded-lg transition-all ${
                        apiKeySaved
                          ? 'bg-green-50 border border-green-200 text-green-700'
                          : apiKey.trim()
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {apiKeySaved ? `✓ ${t('settingsAPI.keySaved')}` : apiKey.trim() ? t('settingsAPI.saveKey') : t('settingsAPI.enterKey')}
                    </button>
                    {apiKey.trim() && (
                      <button
                        onClick={handleTestApiKey}
                        disabled={apiKeyTestLoading}
                        className={`text-sm font-semibold px-4 py-2.5 rounded-lg border transition-all ${
                          apiKeyTestLoading
                            ? 'opacity-50 cursor-not-allowed'
                            : apiKeyTested
                            ? 'bg-green-50 border-green-200 text-green-700'
                            : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50'
                        }`}
                      >
                        {apiKeyTestLoading
                          ? `⏳ ${t('settingsAPI.testing')}`
                          : apiKeyTested
                          ? `✓ ${t('settingsAPI.testSuccess')}`
                          : t('settingsAPI.testKey')}
                      </button>
                    )}
                  </div>

                  {apiKeyTestError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-xs text-red-700"><strong>Error:</strong> {apiKeyTestError}</p>
                    </div>
                  )}

                  {apiKey.trim() && !apiKeyTestError && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600 mb-2">{t('settingsAPI.options')}</p>
                      <button
                        onClick={handleClearApiKey}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 transition-all"
                      >
                        {t('settingsAPI.deleteKey')}
                      </button>
                    </div>
                  )}
                </Card>

                <Card title={t('settingsAPI.about')} subtitle={t('settingsAPI.aboutSubtitle')}>
                  <div className="space-y-3 text-sm text-gray-600">
                    <div>
                      <p className="font-semibold text-gray-900 mb-1">{t('settingsAPI.whereStored')}</p>
                      <p>{t('settingsAPI.whereStoredAnswer')}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 mb-1">{t('settingsAPI.howCommunication')}</p>
                      <p>{t('settingsAPI.howCommunicationAnswer')}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 mb-1">{t('settingsAPI.costs')}</p>
                      <p>{t('settingsAPI.costsAnswer')}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 mb-1">{t('settingsAPI.security')}</p>
                      <p>{t('settingsAPI.securityAnswer')}</p>
                    </div>
                  </div>
                </Card>
              </>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <NotificationSettings />
            )}

            {/* Follow-ups Tab */}
            {activeTab === 'followups' && (
              <>
                <Card title={t('settingsFollowups.title')} subtitle={t('settingsFollowups.subtitle')}>
                  <Row label={t('settingsFollowups.followUpSent')} hint={t('settingsFollowups.followUpSentHint')}>
                    <NumInput value={settings.followUpSentDays} onChange={v => updateSetting('followUpSentDays', v)} min={1} max={60} suffix="j" />
                  </Row>
                  <Row label={t('settingsFollowups.followUpReviewing')} hint={t('settingsFollowups.followUpReviewingHint')}>
                    <NumInput value={settings.followUpReviewingDays} onChange={v => updateSetting('followUpReviewingDays', v)} min={1} max={60} suffix="j" />
                  </Row>
                  <Row label={t('settingsFollowups.followUpWaiting')} hint={t('settingsFollowups.followUpWaitingHint')}>
                    <NumInput value={settings.followUpWaitingDays} onChange={v => updateSetting('followUpWaitingDays', v)} min={1} max={60} suffix="j" />
                  </Row>
                  <Row label={t('settingsFollowups.respondToOffer')} hint={t('settingsFollowups.respondToOfferHint')}>
                    <NumInput value={settings.followUpOfferDays} onChange={v => updateSetting('followUpOfferDays', v)} min={1} max={30} suffix="j" />
                  </Row>
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => {
                        updateSetting('followUpSentDays', SETTINGS_DEFAULTS.followUpSentDays)
                        updateSetting('followUpReviewingDays', SETTINGS_DEFAULTS.followUpReviewingDays)
                        updateSetting('followUpWaitingDays', SETTINGS_DEFAULTS.followUpWaitingDays)
                        updateSetting('followUpOfferDays', SETTINGS_DEFAULTS.followUpOfferDays)
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      {t('settingsFollowups.resetDefaults')}
                    </button>
                  </div>
                </Card>
              </>
            )}

            {/* Appearance Tab */}
            {activeTab === 'appearance' && (
              <>
                <Card title={t('settingsAppearance.language')} subtitle={t('settingsAppearance.languageSubtitle')}>
                  <Row label={t('settingsAppearance.language')} hint={t('settingsAppearance.languageHint')}>
                    <select
                      value={language}
                      onChange={e => { setLanguage(e.target.value); setTimeout(() => window.location.reload(), 300) }}
                      className="w-full sm:w-auto text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
                    >
                      {availableLanguages.map(lang => (
                        <option key={lang} value={lang}>
                          {lang === 'en' ? '🇬🇧 English' : lang === 'fr' ? '🇫🇷 Français' : lang}
                        </option>
                      ))}
                    </select>
                  </Row>
                </Card>

                <Card title={t('settingsAppearance.applicationTheme')} subtitle={t('settingsAppearance.applicationThemeSubtitle')}>
                  <Row label={t('settingsAppearance.applicationTheme')} hint={t('settingsAppearance.themeHint')}>
                    <div className="space-y-3">
                      {Object.values(THEMES).map(theme => (
                        <button
                          key={theme.id}
                          onClick={() => {
                            console.log('🎨 Changing theme to:', theme.id)
                            localStorage.setItem('jobtrackr_theme', theme.id)
                            window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: theme.id } }))
                          }}
                          className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg border-2 transition-all text-left ${
                            currentTheme === theme.id
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          {/* Theme preview */}
                          <div className="flex gap-2 shrink-0">
                            <div
                              style={{ backgroundColor: theme.bg, borderColor: theme.border }}
                              className="w-12 h-12 rounded-md border"
                            />
                            <div
                              style={{ backgroundColor: theme.primary }}
                              className="w-12 h-12 rounded-md"
                            />
                          </div>
                          <div className="flex-1">
                            <p className={`font-semibold ${currentTheme === theme.id ? 'text-indigo-700' : 'text-gray-900'}`}>
                              {theme.label}
                            </p>
                          </div>
                          {currentTheme === theme.id && (
                            <span className="text-lg">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </Row>
                </Card>
              </>
            )}

            {/* Data Tab */}
            {activeTab === 'data' && (
              <>
                <Card title={t('settingsData.exportImport')}>
                  <Row label={t('settingsData.exportApplications')} hint={`${jobs.length} applications in JSON`}>
                    <button
                      onClick={handleExport}
                      className={`text-sm font-medium px-4 py-2 rounded-lg border transition-all ${
                        exportDone
                          ? 'bg-green-50 border-green-200 text-green-700'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {exportDone ? `✓ ${t('settingsData.exported')}` : t('settingsData.exportApplications')}
                    </button>
                  </Row>
                  <Row label={t('settingsData.importApplications')} hint={t('settingsData.importApplicationsHint')}>
                    <label className="cursor-pointer text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all">
                      {t('settingsData.import')}
                      <input type="file" accept=".json" className="hidden" onChange={handleImport} />
                    </label>
                  </Row>
                  {importError && <p className="text-xs text-red-500">{importError}</p>}
                </Card>

                <Card title={t('settingsData.dataMaintenance')}>
                  <Row label={t('settingsData.mergeDuplicatesLocal')} hint={t('settingsData.mergeDuplicatesLocalHint')}>
                    <button
                      onClick={onMergeDuplicates}
                      className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all"
                    >
                      {t('settingsData.merge')}
                    </button>
                  </Row>
                  <Row label={t('settingsData.mergeDuplicatesServer')} hint={t('settingsData.mergeDuplicatesServerHint')}>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={handleServerDedup}
                        disabled={serverDedupLoading}
                        className={`text-sm font-medium px-4 py-2 rounded-lg border transition-all ${
                          serverDedupLoading
                            ? 'opacity-50 cursor-not-allowed'
                            : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50 hover:border-blue-300'
                        }`}
                      >
                        {serverDedupLoading ? `⏳ ${t('settingsData.clearing')}` : t('settingsData.clean')}
                      </button>
                      {serverDedupResult && (
                        <p className="text-xs text-green-600">
                          ✓ {serverDedupResult.stats.deletedJobs} duplicates removed
                        </p>
                      )}
                      {serverDedupError && (
                        <p className="text-xs text-red-600">
                          ✗ Error: {serverDedupError}
                        </p>
                      )}
                    </div>
                  </Row>
                  <Row label={t('settingsData.clearEmailCache')} hint={t('settingsData.clearEmailCacheHint')}>
                    {confirmClear ? (
                      <div className="flex gap-2">
                        <button onClick={clearEmailCache} className="text-xs font-semibold px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600">{t('settingsData.confirm')}</button>
                        <button onClick={() => setConfirmClear(false)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">{t('settingsData.cancel')}</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmClear(true)} className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700">
                        {t('settingsData.clear')}
                      </button>
                    )}
                  </Row>
                  <Row label={t('settingsData.deleteAllHistory')} hint={t('settingsData.deleteAllHistoryHint')}>
                    {confirmDeleteHistory ? (
                      <div className="flex flex-col gap-2">
                        {deleteHistoryDetails && (
                          <div className="text-xs bg-red-50 border border-red-200 rounded p-3 text-red-700">
                            <p className="font-semibold mb-1">{t('settingsData.youWillDelete')}</p>
                            <ul className="space-y-1">
                              <li>• <strong>{deleteHistoryDetails.totalHistoryEntries}</strong> {t('settingsData.historyEntries')}</li>
                              <li>• Affecting <strong>{deleteHistoryDetails.jobsWithHistory}</strong> application(s)</li>
                              <li>• {t('settingsData.deletionIndexedDBAndSupabase')}</li>
                            </ul>
                            <p className="text-xs mt-2 font-semibold">{t('settingsData.actionIrreversible')}</p>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={handleDeleteAllHistory}
                            disabled={deleteHistoryLoading}
                            className="text-xs font-semibold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                          >
                            {deleteHistoryLoading ? `⏳ ${t('settingsData.deleting')}` : t('settingsData.deleteHistoryButton')}
                          </button>
                          <button onClick={() => { setConfirmDeleteHistory(false); setDeleteHistoryDetails(null) }} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">
                            {t('settingsData.cancel')}
                          </button>
                        </div>
                        {deleteHistoryError && <p className="text-xs text-red-600">{deleteHistoryError}</p>}
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          getHistoryDetails()
                          setConfirmDeleteHistory(true)
                        }}
                        className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                      >
                        {t('settingsData.deleteAllHistory')}
                      </button>
                    )}
                  </Row>
                  {deleteHistoryResult && (
                    <p className="text-xs text-red-600">
                      ✓ {deleteHistoryResult.deletedCount} history entries deleted from {deleteHistoryResult.jobsAffected} application(s)
                    </p>
                  )}
                </Card>

                <Card title={t('settingsData.dangerZone')} subtitle={t('settingsData.dangerZoneSubtitle')}>
                  <div className="border border-red-200 bg-red-50/50 rounded-lg p-4">
                    <Row label={t('settingsData.resetCompletely')} hint={t('settingsData.resetCompletelyHint')}>
                      {confirmReset ? (
                        <div className="flex gap-2">
                          <button onClick={handleFullReset} className="text-xs font-semibold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700">{t('settingsData.yesDeleteEverything')}</button>
                          <button onClick={() => setConfirmReset(false)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">{t('settingsData.cancel')}</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmReset(true)} className="text-sm font-medium px-4 py-2 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50">
                          {t('settingsData.resetCompletely')}
                        </button>
                      )}
                    </Row>
                  </div>
                </Card>
              </>
            )}

            {/* Extension Tab */}
            {activeTab === 'extension' && (
              <Card title={t('settingsExtension.firefoxExtension')}>
                <Row label={t('settingsExtension.status')} hint={t('settingsExtension.statusHint')}>
                  {extensionInstalled === false && (
                    <a href="/jobtracker-addon-1.5.1.xpi" className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600">
                      {t('settingsExtension.install')}
                    </a>
                  )}
                  {extensionInstalled === true && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-green-100 text-green-700">
                      {t('settingsExtension.enabled')}
                    </span>
                  )}
                  {extensionInstalled === null && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-gray-100 text-gray-700">
                      {t('settingsExtension.checking')}
                    </span>
                  )}
                </Row>
              </Card>
            )}

            {/* Debug Tab */}
            {activeTab === 'debug' && (
              <>
              <Card title={t('settingsDebug.consoleLogs')}>
                <Row label={t('settingsDebug.enableLogs')} hint={t('settingsDebug.enableLogsHint')}>
                  <button
                    onClick={() => updateSetting('debugLogsEnabled', !settings.debugLogsEnabled)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      settings.debugLogsEnabled
                        ? 'bg-green-500 text-white hover:bg-green-600'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {settings.debugLogsEnabled ? '✓ Enabled' : 'Disabled'}
                  </button>
                </Row>
              </Card>

              <Card title="🧪 Expérimental" subtitle="Fonctionnalités en cours d'évaluation — peuvent changer ou disparaître.">
                <Row label="Recherche d'offres" hint="Affiche l'onglet 🔎 Recherche pour explorer des offres (France Travail, Adzuna…). Masqué par défaut.">
                  <button
                    onClick={() => {
                      const next = !jobSearchFlag
                      setFlag(FLAGS.JOB_SEARCH, next)
                      setJobSearchFlag(next)
                    }}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      jobSearchFlag
                        ? 'bg-green-500 text-white hover:bg-green-600'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {jobSearchFlag ? '✓ Activée' : 'Désactivée'}
                  </button>
                </Row>
                <Row label="Suppression multi-appareils" hint="Propage la suppression d'une candidature à vos autres appareils. Activé par défaut — désactivez seulement en cas de problème de synchronisation.">
                  <button
                    onClick={() => {
                      const disabledNext = !crossDeleteDisabled
                      setFlag(FLAGS.CROSS_DEVICE_DELETE_OFF, disabledNext)
                      setCrossDeleteDisabled(disabledNext)
                    }}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      !crossDeleteDisabled
                        ? 'bg-green-500 text-white hover:bg-green-600'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {!crossDeleteDisabled ? '✓ Activée' : 'Désactivée'}
                  </button>
                </Row>
              </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
