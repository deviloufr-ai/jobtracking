import { useEffect, useMemo, useRef, useState } from 'react'
import { useCVs } from '../hooks/useCVs'
import { useBatchCVGeneration } from '../hooks/useBatchCVGeneration'
import { TEMPLATES, LANGUAGES } from './CVGenerator'
import {
  loadBaseCvId, saveBaseCvId,
  loadTemplate, saveTemplate,
  loadBatchLang, saveBatchLang,
} from '../services/cvGeneration'
import CVEditModal from './CVEditModal'

// Candidatures in these states are closed — generating a tailored CV for them is
// pointless, so they're excluded from the batch targets.
const SKIP_STATUSES = new Set(['rejected', 'rejected_ats', 'cancelled', 'archived'])

// Bulk "write a CV for every application that doesn't have one yet". Fully
// automatic (per the user's chosen automation): for each selected candidature it
// resolves the job description, generates a tailored CV with the current
// generation settings, and saves it straight onto the candidature — no manual
// review step. The base (source) CV used for generation can be edited in place.
export default function BatchCVGenerator({ jobs = [], onUpdateJob, t = (k) => k }) {
  const { cvs, updateCV } = useCVs()
  const sortedCvs = useMemo(
    () => [...cvs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [cvs]
  )

  // Open candidatures still missing a saved CV — the batch targets.
  const candidates = useMemo(
    () => jobs.filter(j => !j.cvSaved && !SKIP_STATUSES.has(j.status)),
    [jobs]
  )
  const hasJd = (j) => !!(j.jobDescription || j.url || j.notes)

  // ── Generation settings (persisted; base CV is shared with Settings → My CV) ──
  const [baseId, setBaseId] = useState(() => loadBaseCvId())
  const effectiveBaseId = sortedCvs.find(c => c.id === baseId) ? baseId : (sortedCvs[0]?.id || '')
  const baseCV = sortedCvs.find(c => c.id === effectiveBaseId) || null
  const [template, setTemplate] = useState(loadTemplate)
  const [language, setLanguage] = useState(loadBatchLang)
  const [editingBase, setEditingBase] = useState(false)

  const handleBaseChange = (id) => { setBaseId(id); saveBaseCvId(id) }
  const handleTemplateChange = (id) => { setTemplate(id); saveTemplate(id) }
  const handleLanguageChange = (id) => { setLanguage(id); saveBatchLang(id) }

  // ── Selection — seeded once to every candidate that has a JD source ──
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current || candidates.length === 0) return
    seededRef.current = true
    setSelectedIds(new Set(candidates.filter(hasJd).map(j => j.id)))
  }, [candidates])

  const toggle = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const selectAll = () => setSelectedIds(new Set(candidates.map(j => j.id)))
  const selectNone = () => setSelectedIds(new Set())

  // ── Batch run state (shared engine) ──
  const { run, stop: stopBatch, running, progress, results, batchError, finished, anyResult, resultCounts } =
    useBatchCVGeneration({ onUpdateJob, t })

  const selectedCount = candidates.filter(j => selectedIds.has(j.id)).length

  const runBatch = () => {
    const targets = candidates.filter(j => selectedIds.has(j.id))
    run({ targets, baseCV, language, template })
  }

  const selectCls = 'text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white'

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
    return null
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {editingBase && baseCV && (
        <CVEditModal
          cv={baseCV}
          onSave={(text) => { updateCV(baseCV.id, { text }); setEditingBase(false) }}
          onClose={() => setEditingBase(false)}
          t={t}
        />
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">✨</span>
        <h3 className="text-sm font-semibold text-gray-800">{t('batchCV.title')}</h3>
        {candidates.length > 0 && (
          <span className="text-xs text-gray-400 ml-auto">{candidates.length} {t('batchCV.withoutCv')}</span>
        )}
      </div>

      <div className="p-4 space-y-4">
        <p className="text-sm text-gray-500">{t('batchCV.subtitle')}</p>

        {sortedCvs.length === 0 ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            {t('batchCV.noBaseCv')}
          </p>
        ) : (
          <>
            {/* Settings bar */}
            <div className="flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 border border-gray-100 p-3">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('batchCV.baseCV')}</label>
                <div className="flex items-center gap-2">
                  <select value={effectiveBaseId} onChange={e => handleBaseChange(e.target.value)} className={`${selectCls} flex-1`}>
                    {sortedCvs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setEditingBase(true)}
                    disabled={!baseCV}
                    className="text-xs font-medium text-blue-600 hover:text-white hover:bg-blue-500 border border-blue-200 hover:border-blue-500 px-2.5 py-2 rounded-lg transition-all disabled:opacity-40 whitespace-nowrap"
                    title={t('batchCV.editBaseHint')}
                  >
                    ✎ {t('common.edit')}
                  </button>
                </div>
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
            </div>

            {candidates.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <div className="text-2xl mb-1">🎉</div>
                <p className="text-sm">{t('batchCV.allHaveCv')}</p>
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <button onClick={selectAll} disabled={running} className="font-medium text-indigo-600 hover:underline disabled:opacity-40">{t('batchCV.selectAll')}</button>
                    <span className="text-gray-300">·</span>
                    <button onClick={selectNone} disabled={running} className="font-medium text-gray-500 hover:underline disabled:opacity-40">{t('batchCV.selectNone')}</button>
                    <span className="ml-1">{t('batchCV.selectedCount').replace('{n}', selectedCount).replace('{total}', candidates.length)}</span>
                  </div>
                  {running ? (
                    <button onClick={stopBatch} className="text-sm font-semibold bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors">
                      ⏹ {t('batchCV.stop')}
                    </button>
                  ) : (
                    <button
                      onClick={runBatch}
                      disabled={selectedCount === 0 || !baseCV}
                      className="text-sm font-semibold bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40"
                    >
                      ✨ {t('batchCV.generateBtn').replace('{n}', selectedCount)}
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
                <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                  {candidates.map(job => {
                    const checked = selectedIds.has(job.id)
                    return (
                      <label key={job.id} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${checked ? 'bg-indigo-50/40' : 'hover:bg-gray-50/60'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={running}
                          onChange={() => toggle(job.id)}
                          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-2 focus:ring-indigo-400 cursor-pointer disabled:opacity-50"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{job.company}</p>
                          <p className="text-xs text-gray-500 truncate">{job.position}</p>
                        </div>
                        <div className="flex-shrink-0"><StatusChip job={job} /></div>
                      </label>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
