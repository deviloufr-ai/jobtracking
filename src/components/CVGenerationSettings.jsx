import { useState } from 'react'
import { useCVs } from '../hooks/useCVs'
import { pushLocalPrefs } from '../services/profileSync'

// Single source of truth for the CV-generation preferences UI. Used both in
// Settings → My CV and in the candidature CV tab. Everything is persisted to
// localStorage and read back by CVGenerator at generation time, so the two
// mount points stay consistent without prop-threading.
const ATS_LEVEL_KEY     = 'jobtrackr_cv_ats_level'
const RULES_KEY         = 'jobtrackr_cv_rules'
const CUSTOM_RULES_KEY  = 'jobtrackr_cv_custom_rules'
const BASE_CV_KEY       = 'jobtrackr_cv_base_id'
const CUSTOM_RULES_MAXLEN = 2000
const ATS_LEVELS = ['light', 'balanced', 'max']
const RULE_IDS   = ['keepAllRoles', 'singleLanguage', 'atsFormat', 'keywordMirroring', 'noFabrication']
const DEFAULT_RULES = { keepAllRoles: true, singleLanguage: true, atsFormat: true, keywordMirroring: true, noFabrication: true }

function loadAtsLevel() {
  const v = localStorage.getItem(ATS_LEVEL_KEY)
  return ATS_LEVELS.includes(v) ? v : 'max'
}
function loadRules() {
  try {
    const saved = JSON.parse(localStorage.getItem(RULES_KEY) || 'null')
    return saved ? { ...DEFAULT_RULES, ...saved } : { ...DEFAULT_RULES }
  } catch { return { ...DEFAULT_RULES } }
}

export default function CVGenerationSettings({ t = (k) => k, defaultOpen = true, showBaseCV = true }) {
  const { cvs } = useCVs()
  const sortedCvs = [...cvs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const [open, setOpen]             = useState(defaultOpen)
  const [atsLevel, setAtsLevel]     = useState(loadAtsLevel)
  const [rules, setRules]           = useState(loadRules)
  const [customRules, setCustomRules] = useState(() => {
    try { return localStorage.getItem(CUSTOM_RULES_KEY) || '' } catch { return '' }
  })
  const [baseId, setBaseId]         = useState(() => {
    try { return localStorage.getItem(BASE_CV_KEY) || '' } catch { return '' }
  })

  // Fall back to the most-recent CV when the stored choice is missing/stale.
  const effectiveBaseId = sortedCvs.find(c => c.id === baseId) ? baseId : (sortedCvs[0]?.id || '')

  const handleAtsChange = (v) => {
    setAtsLevel(v)
    try { localStorage.setItem(ATS_LEVEL_KEY, v) } catch {}
    pushLocalPrefs()
  }
  const toggleRule = (id) => {
    setRules(prev => {
      const next = { ...prev, [id]: !prev[id] }
      try { localStorage.setItem(RULES_KEY, JSON.stringify(next)) } catch {}
      return next
    })
    pushLocalPrefs()
  }
  const handleCustomChange = (v) => {
    const next = (v || '').slice(0, CUSTOM_RULES_MAXLEN)
    setCustomRules(next)
    try { localStorage.setItem(CUSTOM_RULES_KEY, next) } catch {}
    pushLocalPrefs()
  }
  const handleBaseChange = (id) => {
    setBaseId(id)
    try { localStorage.setItem(BASE_CV_KEY, id) } catch {}
    pushLocalPrefs()
  }

  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all'

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-gray-800">🎯 {t('settingsCV.panelTitle')}</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">

          {/* Base CV */}
          {showBaseCV && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settingsCV.baseCV')}</label>
              {sortedCvs.length > 0 ? (
                <select value={effectiveBaseId} onChange={e => handleBaseChange(e.target.value)} className={inputCls}>
                  {sortedCvs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <p className="text-xs text-gray-400">{t('settingsCV.baseCVNone')}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">{t('settingsCV.baseCVHint')}</p>
            </div>
          )}

          {/* ATS optimization level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('settingsCV.atsLevel')}</label>
            <select value={atsLevel} onChange={e => handleAtsChange(e.target.value)} className={inputCls}>
              <option value="light">{t('settingsCV.atsLight')}</option>
              <option value="balanced">{t('settingsCV.atsBalanced')}</option>
              <option value="max">{t('settingsCV.atsMax')}</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">{t('settingsCV.atsLevelHint')}</p>
          </div>

          {/* Rules checklist */}
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">{t('settingsCV.rulesChecklistTitle')}</p>
            {RULE_IDS.map(id => (
              <label key={id} className="flex items-center gap-2.5 text-xs text-gray-600 cursor-pointer py-0.5">
                <input type="checkbox" checked={!!rules[id]} onChange={() => toggleRule(id)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-2 focus:ring-indigo-400 focus:ring-offset-0 cursor-pointer" />
                <span>{t(`settingsCV.rule_${id}`)}</span>
              </label>
            ))}
            {/* Turning off the integrity rule lets the CV go beyond the source —
                warn the user, who stays responsible for the CV's accuracy. */}
            {!rules.noFabrication && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 mt-1.5 leading-snug">
                {t('settingsCV.noFabWarning')}
              </p>
            )}
          </div>

          {/* Custom rules */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('settingsCV.rulesLabel')}</label>
            <textarea rows={4} value={customRules} onChange={e => handleCustomChange(e.target.value)}
              placeholder={t('settingsCV.rulesPlaceholder')}
              className={`${inputCls} resize-none font-mono`} />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-gray-400">{customRules.length}/{CUSTOM_RULES_MAXLEN}</span>
              {customRules && (
                <button type="button" onClick={() => handleCustomChange('')}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors">{t('settingsCV.rulesReset')}</button>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
