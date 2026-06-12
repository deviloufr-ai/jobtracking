import { useState, useEffect } from 'react'
import { useSettings, SETTINGS_DEFAULTS } from '../hooks/useSettings'
import { useExtensionDetect } from '../hooks/useExtensionDetect'
import { useJobs } from '../hooks/useJobs'
import NotificationSettings from './NotificationSettings'
import { supabase } from '../services/supabase'
import { indexeddb } from '../services/indexeddb'

const PROFILE_KEY = 'jobtrackr_profile'
const PROFILE_DEFAULTS = {
  name: '',
  title: '',
  website: '',
  experience: '',
  skills: '',
  languages: '',
  education: '',
  motivation: '',
  ai_experience: '',
  recent_project: '',
}

function loadProfile() {
  try { const r = localStorage.getItem(PROFILE_KEY); return r ? { ...PROFILE_DEFAULTS, ...JSON.parse(r) } : { ...PROFILE_DEFAULTS } }
  catch { return { ...PROFILE_DEFAULTS } }
}
function saveProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)) } catch {}
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

const CATEGORIES = [
  { id: 'profile', label: 'Profil', icon: '👤' },
  { id: 'goals', label: 'Objectifs', icon: '🎯' },
  { id: 'automation', label: 'Automatisation', icon: '⚙️' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'followups', label: 'Rappels', icon: '⏰' },
  { id: 'data', label: 'Données', icon: '💾' },
  { id: 'extension', label: 'Extension', icon: '🦊' },
]

export default function Settings({ jobs, onMergeDuplicates }) {
  const { settings, updateSetting, resetSettings } = useSettings()
  const { deduplicateViaServer } = useJobs()
  const extensionInstalled = useExtensionDetect()
  const [activeTab, setActiveTab] = useState('profile')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
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
      const rawCVs = localStorage.getItem('jobtrackr_cvs')
      const cvs = rawCVs ? JSON.parse(rawCVs) : []
      if (!cvs.length) { setExtractError('Aucun CV uploadé — va dans Mon CV pour en ajouter un.'); return }
      const cv = cvs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0]
      setExtracting(true)
      setExtractError(null)
      const res = await fetch('/api/extract-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText: cv.text })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur extraction')
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
        if (!incoming) throw new Error('Format invalide')
        const existing = JSON.parse(localStorage.getItem('jobtrackr_applications') || '[]')
        const existingIds = new Set(existing.map(j => j.id))
        const merged = [...existing, ...incoming.filter(j => !existingIds.has(j.id))]
        localStorage.setItem('jobtrackr_applications', JSON.stringify(merged))
        window.location.reload()
      } catch (err) {
        setImportError(err.message || 'Erreur de lecture du fichier')
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

      // Delete from Supabase
      const { error: deleteError } = await supabase
        .from('job_history')
        .delete()
        .neq('id', 'null')

      if (deleteError) {
        console.error('Supabase delete error (may be schema cache issue):', deleteError)
        // Don't fail - the local deletion succeeded
      }

      setDeleteHistoryResult({ deletedCount, jobsAffected: deleteHistoryDetails.jobsWithHistory })
      setConfirmDeleteHistory(false)
      setDeleteHistoryDetails(null)
      setTimeout(() => setDeleteHistoryResult(null), 5000)

      // Reload the page to refresh UI
      setTimeout(() => window.location.reload(), 1000)
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
                {activeTab === 'profile' && 'Gérez vos informations professionnelles'}
                {activeTab === 'goals' && 'Définissez vos cibles de candidatures'}
                {activeTab === 'automation' && 'Configurez l\'automatisation de votre recherche'}
                {activeTab === 'notifications' && 'Gérez vos notifications'}
                {activeTab === 'followups' && 'Définissez les délais de suivi'}
                {activeTab === 'data' && 'Exportez, importez ou réinitialisez vos données'}
                {activeTab === 'extension' && 'Gérez l\'extension Firefox'}
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
                <Card subtitle="Remplissez automatiquement votre profil depuis votre CV">
                  <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-lg px-4 py-3 -mx-2">
                    <span className="text-xl shrink-0">✨</span>
                    <div className="flex-1 min-w-0">
                      {profile?.extractedFrom
                        ? <p className="text-xs text-indigo-700">Profil extrait depuis <strong>{profile.extractedFrom}</strong>{profile.extractedAt ? ` · ${new Date(profile.extractedAt).toLocaleDateString('fr-FR')}` : ''}</p>
                        : <p className="text-xs text-indigo-700 font-medium">Zéro saisie manuelle — extraction depuis ton CV.</p>
                      }
                    </div>
                    <button
                      onClick={handleExtractFromCV}
                      disabled={extracting}
                      className="shrink-0 text-xs font-semibold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {extracting
                        ? <><span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin inline-block" /> Extraction…</>
                        : profile?.extractedFrom ? '🔄 Ré-extraire' : '✦ Extraire'
                      }
                    </button>
                  </div>
                  {extractError && <p className="text-xs text-red-500">{extractError}</p>}
                </Card>

                <Card title="Informations de base">
                  <Row label="Nom complet" hint="Tel qu'il apparaîtra sur les formulaires">
                    <TextInput value={profile.name} onChange={v => updateProfile('name', v)} placeholder="Alexandre Leblanc" />
                  </Row>
                  <Row label="Titre / Poste visé">
                    <TextInput value={profile.title} onChange={v => updateProfile('title', v)} placeholder="Senior Product Manager" />
                  </Row>
                  <Row label="Site web / Portfolio" hint="Affiché dans le CV et les emails">
                    <TextInput value={profile.website} onChange={v => updateProfile('website', v)} placeholder="https://linkedin.com/in/devilalex" />
                  </Row>
                  <Row label="Langues">
                    <TextInput value={profile.languages} onChange={v => updateProfile('languages', v)} placeholder="Français (natif), Anglais (courant)" />
                  </Row>
                  <Row label="Formation">
                    <TextInput value={profile.education} onChange={v => updateProfile('education', v)} placeholder="Ingénieur Arts & Métiers" />
                  </Row>
                </Card>

                <Card title="Expérience et compétences">
                  <Row label="Résumé d'expérience" wide hint="Vos 18 ans d'expérience en résumé">
                    <TextInput multiline rows={3} value={profile.experience} onChange={v => updateProfile('experience', v)} placeholder="18 ans d'expérience en product management..." />
                  </Row>
                  <Row label="Compétences clés" wide hint="Séparées par des virgules">
                    <TextInput multiline rows={2} value={profile.skills} onChange={v => updateProfile('skills', v)} placeholder="Product strategy, OKR, Agile, Data analytics..." />
                  </Row>
                  <Row label="Expérience IA / Projets récents" wide>
                    <TextInput multiline rows={2} value={profile.ai_experience} onChange={v => updateProfile('ai_experience', v)} placeholder="Claude API, ComfyUI, JobTrackr..." />
                  </Row>
                  <Row label="Motivation / Pitch par défaut" wide>
                    <TextInput multiline rows={2} value={profile.motivation} onChange={v => updateProfile('motivation', v)} placeholder="Passionné par les produits qui résolvent de vrais problèmes..." />
                  </Row>
                </Card>

                {(profile?.key_achievements?.length > 0 || profile?.companies?.length > 0) && (
                  <Card title="Données extraites (lecture seule)">
                    {profile?.companies?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-2">Entreprises</p>
                        <div className="flex flex-wrap gap-1.5">
                          {profile.companies.map((c, i) => (
                            <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {profile?.key_achievements?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-2">Réalisations clés</p>
                        <ul className="space-y-1">
                          {profile.key_achievements.map((a, i) => (
                            <li key={i} className="text-xs text-gray-600 flex gap-2"><span className="text-indigo-400">·</span>{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveProfile}
                    className={`text-sm font-semibold px-5 py-2 rounded-lg transition-all ${
                      profileSaved ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {profileSaved ? '✓ Sauvegardé' : 'Sauvegarder'}
                  </button>
                </div>
              </>
            )}

            {/* Goals Tab */}
            {activeTab === 'goals' && (
              <Card title="Vos objectifs">
                <Row label="Candidatures / semaine" hint="Nombre d'envois visé">
                  <NumInput value={settings.weeklyApps} onChange={v => updateSetting('weeklyApps', v)} min={1} max={50} />
                </Row>
                <Row label="Taux de réponse cible" hint="% de retours employeur">
                  <NumInput value={settings.responseRate} onChange={v => updateSetting('responseRate', v)} min={1} max={100} suffix="%" />
                </Row>
                <Row label="Entretiens / mois" hint="Objectif mensuel">
                  <NumInput value={settings.monthlyInterviews} onChange={v => updateSetting('monthlyInterviews', v)} min={1} max={30} />
                </Row>
              </Card>
            )}

            {/* Automation Tab */}
            {activeTab === 'automation' && (
              <Card title="Paramètres d'automatisation">
                <Row label="Auto-archiver après X jours sans réponse" hint="Pour : Envoyée, En examen, En attente">
                  <NumInput value={settings.archiveSentDays} onChange={v => updateSetting('archiveSentDays', v)} min={0} max={365} suffix="j" />
                </Row>
                <Row label="Auto-archiver les refus après X jours" hint="Pour : Refusée, Refus ATS, Annulée">
                  <NumInput value={settings.archiveRejectedDays} onChange={v => updateSetting('archiveRejectedDays', v)} min={0} max={365} suffix="j" />
                </Row>
                <Row label="Sync Gmail automatique" hint="Intervalle entre deux synchronisations">
                  <NumInput value={settings.autoRefreshHours} onChange={v => updateSetting('autoRefreshHours', v)} min={1} max={72} suffix="h" />
                </Row>
                <Row label="Période de recherche Gmail" hint="Fenêtre d'import des emails">
                  <NumInput value={settings.gmailPeriodMonths} onChange={v => updateSetting('gmailPeriodMonths', v)} min={1} max={12} suffix="m" />
                </Row>
                <Row label="Vérifier disponibilité du poste" hint="Auto-détecte si le poste est toujours ouvert">
                  <NumInput value={settings.checkPositionAfterDays} onChange={v => updateSetting('checkPositionAfterDays', v)} min={0} max={365} suffix="j" />
                </Row>
              </Card>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <NotificationSettings />
            )}

            {/* Follow-ups Tab */}
            {activeTab === 'followups' && (
              <>
                <Card title="Délais avant action urgente" subtitle="Configurez les rappels pour chaque statut">
                  <Row label="Relance candidature envoyée" hint="Statut : Envoyée">
                    <NumInput value={settings.followUpSentDays} onChange={v => updateSetting('followUpSentDays', v)} min={1} max={60} suffix="j" />
                  </Row>
                  <Row label="Relance profil en examen" hint="Statut : En cours d'examen">
                    <NumInput value={settings.followUpReviewingDays} onChange={v => updateSetting('followUpReviewingDays', v)} min={1} max={60} suffix="j" />
                  </Row>
                  <Row label="Suivi en attente de réponse" hint="Statut : En attente">
                    <NumInput value={settings.followUpWaitingDays} onChange={v => updateSetting('followUpWaitingDays', v)} min={1} max={60} suffix="j" />
                  </Row>
                  <Row label="Répondre à une offre reçue" hint="Statut : Offre reçue">
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
                      ↻ Remettre par défaut
                    </button>
                  </div>
                </Card>
              </>
            )}

            {/* Data Tab */}
            {activeTab === 'data' && (
              <>
                <Card title="Exporter & Importer">
                  <Row label="Exporter les candidatures" hint={`${jobs.length} candidatures en JSON`}>
                    <button
                      onClick={handleExport}
                      className={`text-sm font-medium px-4 py-2 rounded-lg border transition-all ${
                        exportDone
                          ? 'bg-green-50 border-green-200 text-green-700'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {exportDone ? '✓ Exporté' : 'Exporter'}
                    </button>
                  </Row>
                  <Row label="Importer des candidatures" hint="Fusionne sans créer de doublons">
                    <label className="cursor-pointer text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all">
                      Importer
                      <input type="file" accept=".json" className="hidden" onChange={handleImport} />
                    </label>
                  </Row>
                  {importError && <p className="text-xs text-red-500">{importError}</p>}
                </Card>

                <Card title="Maintenance des données">
                  <Row label="Fusionner les doublons (client)" hint="Détecte et fusionne localement">
                    <button
                      onClick={onMergeDuplicates}
                      className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all"
                    >
                      Fusionner
                    </button>
                  </Row>
                  <Row label="Nettoyer doublons (serveur)" hint="Déduplication Supabase">
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
                        {serverDedupLoading ? '⏳ En cours...' : '🧹 Nettoyer'}
                      </button>
                      {serverDedupResult && (
                        <p className="text-xs text-green-600">
                          ✓ {serverDedupResult.stats.deletedJobs} doublons supprimés
                        </p>
                      )}
                      {serverDedupError && (
                        <p className="text-xs text-red-600">
                          ✗ Erreur: {serverDedupError}
                        </p>
                      )}
                    </div>
                  </Row>
                  <Row label="Vider le cache emails" hint="Force un re-parsing au prochain scan">
                    {confirmClear ? (
                      <div className="flex gap-2">
                        <button onClick={clearEmailCache} className="text-xs font-semibold px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600">Confirmer</button>
                        <button onClick={() => setConfirmClear(false)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Annuler</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmClear(true)} className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700">
                        Vider
                      </button>
                    )}
                  </Row>
                  <Row label="Supprimer tout l'historique" hint="Efface tous les entrées d'historique">
                    {confirmDeleteHistory ? (
                      <div className="flex flex-col gap-2">
                        {deleteHistoryDetails && (
                          <div className="text-xs bg-red-50 border border-red-200 rounded p-3 text-red-700">
                            <p className="font-semibold mb-1">Vous allez supprimer :</p>
                            <ul className="space-y-1">
                              <li>• <strong>{deleteHistoryDetails.totalHistoryEntries}</strong> entrées d'historique</li>
                              <li>• Concernant <strong>{deleteHistoryDetails.jobsWithHistory}</strong> candidature(s)</li>
                              <li>• Suppression dans IndexedDB ET Supabase</li>
                            </ul>
                            <p className="text-xs mt-2 font-semibold">Cette action est irréversible.</p>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={handleDeleteAllHistory}
                            disabled={deleteHistoryLoading}
                            className="text-xs font-semibold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                          >
                            {deleteHistoryLoading ? '⏳ Suppression...' : 'Oui, tout supprimer'}
                          </button>
                          <button onClick={() => { setConfirmDeleteHistory(false); setDeleteHistoryDetails(null) }} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">
                            Annuler
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
                        Supprimer
                      </button>
                    )}
                  </Row>
                  {deleteHistoryResult && (
                    <p className="text-xs text-red-600">
                      ✓ {deleteHistoryResult.deletedCount} entrées d'historique supprimées de {deleteHistoryResult.jobsAffected} candidature(s)
                    </p>
                  )}
                </Card>

                <Card title="Zone de danger" subtitle="Attention : cette action est irréversible">
                  <div className="border border-red-200 bg-red-50/50 rounded-lg p-4">
                    <Row label="Réinitialiser complètement" hint="Supprime tout : candidatures, paramètres, données">
                      {confirmReset ? (
                        <div className="flex gap-2">
                          <button onClick={handleFullReset} className="text-xs font-semibold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700">Oui, tout effacer</button>
                          <button onClick={() => setConfirmReset(false)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Annuler</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmReset(true)} className="text-sm font-medium px-4 py-2 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50">
                          Réinitialiser
                        </button>
                      )}
                    </Row>
                  </div>
                </Card>
              </>
            )}

            {/* Extension Tab */}
            {activeTab === 'extension' && (
              <Card title="Extension Firefox">
                <Row label="Status" hint="Installez l'extension pour importer les offres directement">
                  {extensionInstalled === false && (
                    <a href="/jobtracker-addon-1.5.0.xpi" className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600">
                      📥 Installer
                    </a>
                  )}
                  {extensionInstalled === true && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-green-100 text-green-700">
                      ✓ Activée
                    </span>
                  )}
                  {extensionInstalled === null && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-gray-100 text-gray-700">
                      ⏳ Vérification...
                    </span>
                  )}
                </Row>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
