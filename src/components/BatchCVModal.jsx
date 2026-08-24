import { useMemo, useState } from 'react'
import { useCVs } from '../hooks/useCVs'
import { useBatchCVGeneration } from '../hooks/useBatchCVGeneration'
import { useDragDock } from '../hooks/useDragDock'
import { TEMPLATES, LANGUAGES } from './CVGenerator'
import {
  loadBaseCvId, saveBaseCvId,
  loadTemplate, saveTemplate,
  loadBatchLang, saveBatchLang,
  loadSkillsMode, saveSkillsMode,
} from '../services/cvGeneration'

const hasJd = (j) => !!(j.jobDescription || j.url || j.notes)

// Selection-driven batch CV generation. Unlike the Settings panel (which targets
// "every open application without a CV"), this runs over an EXPLICIT selection —
// so it also allows regenerating a CV for candidatures that already have one.
export default function BatchCVModal({ jobs = [], onUpdateJob, onClose, t = (k) => k }) {
  const { cvs } = useCVs()
  const sortedCvs = useMemo(
    () => [...cvs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [cvs]
  )

  // ── Generation settings (shared with Settings → My CV via localStorage) ──
  const [baseId, setBaseId] = useState(loadBaseCvId)
  const effectiveBaseId = sortedCvs.find(c => c.id === baseId) ? baseId : (sortedCvs[0]?.id || '')
  const baseCV = sortedCvs.find(c => c.id === effectiveBaseId) || null
  const [template, setTemplate] = useState(loadTemplate)
  const [language, setLanguage] = useState(loadBatchLang)
  const [skillsMode, setSkillsMode] = useState(loadSkillsMode)

  const handleBaseChange = (id) => { setBaseId(id); saveBaseCvId(id) }
  const handleTemplateChange = (id) => { setTemplate(id); saveTemplate(id) }
  const handleLanguageChange = (id) => { setLanguage(id); saveBatchLang(id) }
  const handleSkillsModeChange = (v) => { setSkillsMode(v); saveSkillsMode(v) }

  const { run, stop, running, progress, results, batchError, finished, anyResult, resultCounts } =
    useBatchCVGeneration({ onUpdateJob, t })

  const generatable = jobs.filter(hasJd)
  const runBatch = () => run({ targets: jobs, baseCV, language, template, skillsMode })

  // Free-drag + edge-snap docking (non-modal floating panel, no dimming backdrop
  // so the list stays visible behind it). Shared behaviour via useDragDock.
  const { docked, startDrag, panelStyle, snapPreview } = useDragDock({ width: 576 })

  const selectCls ='text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white'

  // ── Per-candidate status chip ──
  const StatusChip = ({ job }) => {
    const r = results[job.id]
    if (r?.status === 'running') {
      return <span className="inline-flex items-center gap-1.5 text-xs text-indigo-600"><span className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />{t('batchCV.generating')}</span>
    }
    if (r?.status === 'done') {
      return <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">✓ {t('batchCV.doneRow')}{r.atsScore != null ? ` · ATS ${Math.round(r.atsScore)}%` : ''}</span>
    }
    if (r?.status === 'skipped') {
      return <span className="text-xs text-amber-600">⚠ {t('batchCV.skippedNoJd')}</span>
    }
    if (r?.status === 'error') {
      return <span className="text-xs text-red-500" title={r.error === 'trial' ? t('batchCV.trialExhausted') : r.error}>✕ {t('batchCV.errorRow')}</span>
    }
    if (r?.status === 'pending') {
      return <span className="text-xs text-gray-300">…</span>
    }
    if (!hasJd(job)) {
      return <span className="text-[10px] text-amber-500 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">{t('batchCV.noJdBadge')}</span>
    }
    if (job.cvSaved) {
      return <span className="text-[10px] text-blue-500 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full">{t('bulkBar.willRegenerate')}</span>
    }
    return null
  }

  return (
    <>
      {snapPreview}

      <div
        className={`fixed z-50 bg-white shadow-2xl ring-1 ring-black/5 border border-gray-100 flex flex-col rounded-2xl ${docked ? '' : 'max-h-[88vh]'}`}
        style={panelStyle}
      >
        {/* Header — drag handle */}
        <div
          onPointerDown={startDrag}
          className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 cursor-move select-none touch-none"
        >
          <span className="text-base">✨</span>
          <h3 className="text-sm font-semibold text-gray-800">{t('bulkBar.generateCVsTitle')}</h3>
          <span className="text-gray-300 text-xs ml-1" title={t('bulkBar.dragHint')}>⠿</span>
          <span className="text-xs text-gray-400 ml-auto mr-2">{t('bulkBar.selectedCount').replace('{n}', jobs.length)}</span>
          <button onPointerDown={e => e.stopPropagation()} onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className={`p-5 space-y-4 overflow-y-auto ${docked ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
          {sortedCvs.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              {t('batchCV.noBaseCv')}
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-500">{t('bulkBar.generateCVsSubtitle')}</p>

              {/* Settings bar */}
              <div className="flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 border border-gray-100 p-3">
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('batchCV.baseCV')}</label>
                  <select value={effectiveBaseId} onChange={e => handleBaseChange(e.target.value)} className={`${selectCls} w-full`}>
                    {sortedCvs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="min-w-[130px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('batchCV.template')}</label>
                  <select value={template} onChange={e => handleTemplateChange(e.target.value)} className={`${selectCls} w-full`}>
                    {TEMPLATES.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.icon} {tpl.label}</option>)}
                  </select>
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('batchCV.language')}</label>
                  <select value={language} onChange={e => handleLanguageChange(e.target.value)} className={`${selectCls} w-full`}>
                    {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.flag} {l.label}</option>)}
                  </select>
                </div>
                <div className="min-w-[160px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1" title={t('batchCV.skillsHint')}>{t('batchCV.skills')}</label>
                  <select value={skillsMode} onChange={e => handleSkillsModeChange(e.target.value)} className={`${selectCls} w-full`}>
                    <option value="none">{t('batchCV.skillsNone')}</option>
                    <option value="grounded">{t('batchCV.skillsGrounded')}</option>
                    <option value="all">{t('batchCV.skillsAll')}</option>
                  </select>
                </div>
              </div>

              {/* Run / Stop */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">
                  {t('bulkBar.generatableCount').replace('{n}', generatable.length).replace('{total}', jobs.length)}
                </span>
                {running ? (
                  <button onClick={stop} className="text-sm font-semibold bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors">
                    ⏹ {t('batchCV.stop')}
                  </button>
                ) : (
                  <button
                    onClick={runBatch}
                    disabled={!baseCV || jobs.length === 0}
                    className="text-sm font-semibold bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40"
                  >
                    ✨ {t('batchCV.generateBtn').replace('{n}', jobs.length)}
                  </button>
                )}
              </div>

              {/* Progress bar */}
              {(running || finished) && (
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>{running ? t('batchCV.progress').replace('{done}', progress.done).replace('{total}', progress.total) : t('batchCV.finished')}</span>
                    {anyResult && (
                      <span className="flex items-center gap-2">
                        <span className="text-green-600">✓ {resultCounts.done}</span>
                        {resultCounts.skipped > 0 && <span className="text-amber-600">⚠ {resultCounts.skipped}</span>}
                        {resultCounts.error > 0 && <span className="text-red-500">✕ {resultCounts.error}</span>}
                      </span>
                    )}
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
                  </div>
                </div>
              )}

              {batchError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{batchError}</p>
              )}

              {/* Candidate list */}
              <div className={`divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-y-auto ${docked ? 'flex-1 min-h-0' : 'max-h-64'}`}>
                {jobs.map(job => (
                  <div key={job.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{job.company}</p>
                      <p className="text-xs text-gray-500 truncate">{job.position}</p>
                    </div>
                    <div className="flex-shrink-0"><StatusChip job={job} /></div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            {finished ? t('common.close') : t('common.cancel')}
          </button>
        </div>
      </div>
    </>
  )
}
