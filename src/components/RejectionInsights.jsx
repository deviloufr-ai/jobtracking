import { useState, useMemo } from 'react'
import { buildRejectionEvidence } from '../utils/rejectionEvidence'
import { analyzeRejections } from '../services/rejectionAnalysis'
import { loadLearnedRules, saveLearnedRules, mergeLearnedRules } from '../services/learnedRules'
import { getUserApiKey } from '../services/apiKey'

const CACHE_KEY = 'jobtrackr_rejection_analysis'

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch { return null }
}
function saveCache(v) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)) } catch { /* ignore */ }
}

const SEV = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
}
const AREA = {
  cv: 'bg-indigo-100 text-indigo-700',
  letter: 'bg-orange-100 text-orange-700',
  targeting: 'bg-sky-100 text-sky-700',
  process: 'bg-gray-100 text-gray-600',
}

// Deep, AI-driven analysis of WHY applications are rejected — reads the CV/letter
// sent, the match-score gaps, the funnel stage, the source, and the rejection
// email text, contrasts rejected vs interviewed applications, and (with a personal
// Claude key) web-searches the companies. Distils lessons the user can toggle on
// to steer future CV/cover-letter generation.
export default function RejectionInsights({ jobs, t = (k) => k, language = 'en' }) {
  const evidence = useMemo(() => buildRejectionEvidence(jobs), [jobs])
  const cached = useMemo(() => loadCache(), [])
  const [analysis, setAnalysis] = useState(cached?.result || null)
  const [meta, setMeta] = useState(cached ? { generatedAt: cached.generatedAt, rejectedCount: cached.rejectedCount } : null)
  const [rules, setRules] = useState(loadLearnedRules)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const hasKey = !!getUserApiKey()
  const staleBy = meta ? Math.max(0, evidence.totals.rejected - (meta.rejectedCount || 0)) : 0

  const run = async () => {
    if (!evidence.hasData) { setError(t('rejectionInsights.noData') || 'No rejections to analyze yet.'); return }
    setLoading(true); setError(null)
    try {
      const result = await analyzeRejections({ evidence, language })
      setAnalysis(result)
      const m = { generatedAt: new Date().toISOString(), rejectedCount: evidence.totals.rejected }
      setMeta(m)
      saveCache({ result, ...m })
      mergeLearnedRules([
        ...result.cvRules.map(text => ({ text, area: 'cv' })),
        ...result.letterRules.map(text => ({ text, area: 'letter' })),
      ])
      setRules(loadLearnedRules())
    } catch (e) {
      setError(e?.code === 'TRIAL_EXHAUSTED'
        ? (t('rejectionInsights.trial') || 'Free trial used up — add your Claude API key in Settings to run the analysis.')
        : (e?.message || 'Analysis failed.'))
    } finally {
      setLoading(false)
    }
  }

  const toggleRule = (id) => {
    const next = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
    setRules(next); saveLearnedRules(next)
  }

  const cvRules = rules.filter(r => r.area === 'cv')
  const letterRules = rules.filter(r => r.area === 'letter')
  const enabledCount = rules.filter(r => r.enabled).length

  const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return '' } }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col p-5 gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('rejectionInsights.title') || 'Rejection analysis'}</span>
          <p className="text-[11px] text-gray-400 mt-0.5 max-w-md">
            {t('rejectionInsights.subtitle') || 'Deep AI review of why applications are rejected — reads the CV/letter sent, match gaps, funnel stage, source and rejection emails.'}
            {hasKey ? ` ${t('rejectionInsights.webOn') || '· web research on (your key)'}` : ''}
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading || !evidence.hasData}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-40 hover:bg-indigo-700 transition-colors flex-shrink-0"
        >
          {loading ? (t('rejectionInsights.analyzing') || 'Analyzing…') : analysis ? (t('rejectionInsights.reRun') || 'Re-analyze') : (t('rejectionInsights.run') || 'Analyze rejections')}
        </button>
      </div>

      {!evidence.hasData && (
        <p className="text-sm text-gray-500">{t('rejectionInsights.noData') || 'No rejections to analyze yet. Once applications are marked rejected, insights will appear here.'}</p>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      {meta && (
        <p className="text-[11px] text-gray-400">
          {(t('rejectionInsights.lastRun') || 'Last analyzed {date} · {n} rejections').replace('{date}', fmtDate(meta.generatedAt)).replace('{n}', meta.rejectedCount)}
          {staleBy > 0 && <span className="text-amber-600"> · {(t('rejectionInsights.stale') || '{n} new since — re-analyze').replace('{n}', staleBy)}</span>}
        </p>
      )}

      {analysis && (
        <div className="flex flex-col gap-4">
          {/* Summary */}
          {analysis.summary && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-700 leading-relaxed">{analysis.summary}</p>
            </div>
          )}

          {/* Findings */}
          {analysis.findings.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('rejectionInsights.findings') || 'What the data shows'}</p>
              <div className="flex flex-col gap-2">
                {analysis.findings.map((f, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${SEV[f.severity] || SEV.medium}`}>{f.severity}</span>
                      <span className="text-sm font-semibold text-gray-800">{f.title}</span>
                    </div>
                    {f.detail && <p className="text-xs text-gray-600 leading-relaxed">{f.detail}</p>}
                    {f.evidence && <p className="text-[11px] text-gray-400 mt-1">📊 {f.evidence}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {analysis.recommendations.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('rejectionInsights.recommendations') || 'What to change'}</p>
              <div className="flex flex-col gap-2">
                {analysis.recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${AREA[r.area] || AREA.process}`}>{r.area}</span>
                    <div>
                      <span className="text-sm font-medium text-gray-800">{r.title}</span>
                      {r.detail && <p className="text-xs text-gray-600 leading-relaxed">{r.detail}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Learned rules — toggle to feed generation */}
          {(cvRules.length > 0 || letterRules.length > 0) && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('rejectionInsights.learned') || 'Lessons for generation'}</p>
              <p className="text-[11px] text-gray-400 mb-2">
                {(t('rejectionInsights.learnedHint') || 'Toggle a lesson on to apply it to every future CV / cover letter. {n} active.').replace('{n}', enabledCount)}
              </p>
              <div className="flex flex-col gap-3">
                {[['cv', cvRules, t('rejectionInsights.forCV') || 'CV'], ['letter', letterRules, t('rejectionInsights.forLetter') || 'Cover letter']].map(([area, list, label]) => (
                  list.length > 0 && (
                    <div key={area}>
                      <p className="text-[11px] font-semibold text-gray-500 mb-1">{label}</p>
                      <div className="flex flex-col gap-1.5">
                        {list.map(rule => (
                          <label key={rule.id} className="flex items-start gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={!!rule.enabled}
                              onChange={() => toggleRule(rule.id)}
                              className="mt-0.5 accent-indigo-600 flex-shrink-0"
                            />
                            <span className={`text-xs leading-relaxed ${rule.enabled ? 'text-gray-800' : 'text-gray-500'} group-hover:text-gray-900`}>{rule.text}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
