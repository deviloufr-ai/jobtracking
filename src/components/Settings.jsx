import { useState } from 'react'
import { useSettings, SETTINGS_DEFAULTS } from '../hooks/useSettings'

function Section({ title, icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2.5">
        <span className="text-lg">{icon}</span>
        <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
      </div>
      <div className="px-6 py-5 space-y-5">{children}</div>
    </div>
  )
}

function Row({ label, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
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
      {suffix && <span className="text-xs text-gray-400">{suffix}</span>}
    </div>
  )
}

export default function Settings({ jobs, onMergeDuplicates }) {
  const { settings, updateSetting, resetSettings } = useSettings()
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [exportDone, setExportDone] = useState(false)
  const [importError, setImportError] = useState(null)

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

  function handleFullReset() {
    ['jobtrackr_applications', 'jobtrackr_settings', 'jobtrackr_email_cache',
      'jobtrackr_notifications', 'jobtrackr_cvs', 'jobtrackr_last_refresh'].forEach(k => localStorage.removeItem(k))
    window.location.reload()
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Goals */}
      <Section title="Objectifs de recherche" icon="🎯">
        <Row label="Candidatures / semaine" hint="Nombre d'envois visé chaque semaine">
          <NumInput value={settings.weeklyApps} onChange={v => updateSetting('weeklyApps', v)} min={1} max={50} />
        </Row>
        <Row label="Taux de réponse cible" hint="% de candidatures avec un retour employeur">
          <NumInput value={settings.responseRate} onChange={v => updateSetting('responseRate', v)} min={1} max={100} suffix="%" />
        </Row>
        <Row label="Entretiens / mois" hint="Objectif mensuel d'entretiens obtenus">
          <NumInput value={settings.monthlyInterviews} onChange={v => updateSetting('monthlyInterviews', v)} min={1} max={30} />
        </Row>
      </Section>

      {/* Automation */}
      <Section title="Automatisation & Archives" icon="⚙️">
        <Row label="Auto-archiver après X jours sans réponse" hint="Candidatures envoyées / en examen / en attente">
          <NumInput value={settings.archiveSentDays} onChange={v => updateSetting('archiveSentDays', v)} min={7} max={365} suffix="jours" />
        </Row>
        <Row label="Auto-archiver les refus après X jours" hint="Statuts : Refusée, Refus ATS, Annulée">
          <NumInput value={settings.archiveRejectedDays} onChange={v => updateSetting('archiveRejectedDays', v)} min={7} max={365} suffix="jours" />
        </Row>
        <Row label="Sync Gmail automatique" hint="Intervalle entre deux synchronisations Gmail">
          <NumInput value={settings.autoRefreshHours} onChange={v => updateSetting('autoRefreshHours', v)} min={1} max={72} suffix="h" />
        </Row>
        <Row label="Période de recherche Gmail" hint="Fenêtre d'import des emails lors d'un scan">
          <NumInput value={settings.gmailPeriodMonths} onChange={v => updateSetting('gmailPeriodMonths', v)} min={1} max={12} suffix="mois" />
        </Row>
      </Section>

      {/* Follow-ups */}
      <Section title="Rappels & Suivi" icon="🔔">
        <p className="text-xs text-gray-400 -mt-2">Délais avant qu'une action urgente apparaisse dans le tableau de bord</p>
        <Row label="Relance candidature envoyée" hint="Statut : Envoyée">
          <NumInput value={settings.followUpSentDays} onChange={v => updateSetting('followUpSentDays', v)} min={1} max={60} suffix="jours" />
        </Row>
        <Row label="Relance profil en examen" hint="Statut : En cours d'examen">
          <NumInput value={settings.followUpReviewingDays} onChange={v => updateSetting('followUpReviewingDays', v)} min={1} max={60} suffix="jours" />
        </Row>
        <Row label="Suivi en attente de réponse" hint="Statut : En attente">
          <NumInput value={settings.followUpWaitingDays} onChange={v => updateSetting('followUpWaitingDays', v)} min={1} max={60} suffix="jours" />
        </Row>
        <Row label="Répondre à une offre reçue" hint="Statut : Offre reçue">
          <NumInput value={settings.followUpOfferDays} onChange={v => updateSetting('followUpOfferDays', v)} min={1} max={30} suffix="jours" />
        </Row>
        <div className="flex justify-end">
          <button
            onClick={() => {
              updateSetting('followUpSentDays', SETTINGS_DEFAULTS.followUpSentDays)
              updateSetting('followUpReviewingDays', SETTINGS_DEFAULTS.followUpReviewingDays)
              updateSetting('followUpWaitingDays', SETTINGS_DEFAULTS.followUpWaitingDays)
              updateSetting('followUpOfferDays', SETTINGS_DEFAULTS.followUpOfferDays)
            }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Remettre les valeurs par défaut
          </button>
        </div>
      </Section>

      {/* Data */}
      <Section title="Données" icon="💾">
        {/* Export */}
        <Row label="Exporter les candidatures" hint={`${jobs.length} candidatures au format JSON`}>
          <button
            onClick={handleExport}
            className={`text-sm font-medium px-4 py-1.5 rounded-lg border transition-all ${
              exportDone
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {exportDone ? '✓ Exporté' : 'Exporter JSON'}
          </button>
        </Row>

        {/* Import */}
        <Row label="Importer des candidatures" hint="Fusionne avec les données existantes (sans doublon)">
          <label className="cursor-pointer text-sm font-medium px-4 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all">
            Importer JSON
            <input type="file" accept=".json" className="hidden" onChange={handleImport} />
          </label>
        </Row>
        {importError && <p className="text-xs text-red-500">{importError}</p>}

        {/* Merge duplicates */}
        <Row label="Fusionner les doublons" hint="Détecte et fusionne les candidatures en double">
          <button
            onClick={onMergeDuplicates}
            className="text-sm font-medium px-4 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all"
          >
            Fusionner
          </button>
        </Row>

        {/* Clear email cache */}
        <Row label="Vider le cache emails" hint="Force un re-parsing complet lors du prochain scan Gmail">
          {confirmClear ? (
            <div className="flex gap-2">
              <button onClick={clearEmailCache} className="text-xs font-semibold px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">Confirmer</button>
              <button onClick={() => setConfirmClear(false)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">Annuler</button>
            </div>
          ) : (
            <button onClick={() => setConfirmClear(true)} className="text-sm font-medium px-4 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 transition-all">
              Vider le cache
            </button>
          )}
        </Row>

        {/* Danger zone */}
        <div className="border border-red-100 rounded-xl p-4 bg-red-50/40 mt-2">
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-3">Zone de danger</p>
          <Row label="Réinitialiser complètement" hint="Supprime toutes les candidatures, paramètres et données locales">
            {confirmReset ? (
              <div className="flex gap-2">
                <button onClick={handleFullReset} className="text-xs font-semibold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Oui, tout effacer</button>
                <button onClick={() => setConfirmReset(false)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 bg-white transition-colors">Annuler</button>
              </div>
            ) : (
              <button onClick={() => setConfirmReset(true)} className="text-sm font-medium px-4 py-1.5 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 transition-all">
                Réinitialiser
              </button>
            )}
          </Row>
        </div>
      </Section>

    </div>
  )
}
