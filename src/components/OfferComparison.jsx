import { useState, useEffect } from 'react'
import { indexeddb } from '../services/indexeddb'
import { deduplicateJobs } from '../hooks/useJobs'
import { buildComparison, hasMixedCurrencies, formatMoney } from '../utils/compensation'

// Cross-job offer comparison. Self-loads every job from the local IndexedDB cache
// (the app's read path) so it needs no prop threading through App.jsx, and shows a
// side-by-side table of every application that carries compensation numbers, sorted
// by total comp. The current job is highlighted. Read-only.
export default function OfferComparison({ currentJobId = null, onClose, t = (k) => k }) {
  const tx = (k, f) => { const v = t(k); return v && v !== k ? v : f }
  const [rows, setRows] = useState(null) // null = loading

  useEffect(() => {
    let alive = true
    indexeddb.getAllJobs()
      .then(jobs => {
        if (!alive) return
        // Fold physical duplicate rows the way the rest of the UI does, so an offer
        // imported onto two rows isn't double-counted in the table or the 🏆 pick.
        const deduped = deduplicateJobs(jobs || [])
        setRows(buildComparison(deduped.filter(j => j.status !== 'archived')))
      })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [])

  const mixed = rows ? hasMixedCurrencies(rows) : false
  const best = rows && rows.length ? rows[0].total : null

  const stageLabel = (s) => s ? tx(`comp.stages.${s}`, s) : ''

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-800">💰 {tx('comp.compareTitle', 'Compare offers')}</h2>
            <p className="text-xs text-gray-500">{tx('comp.compareSubtitle', 'All applications with compensation, ranked by total package')}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {rows === null ? (
            <p className="text-sm text-gray-400 text-center py-10">{tx('common.loading', 'Loading…')}</p>
          ) : rows.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-500">{tx('comp.compareEmpty', 'No offers with compensation yet.')}</p>
              <p className="text-xs text-gray-400 mt-2">{tx('comp.compareEmptyHint', 'Add base / bonus / equity in an application’s Compensation section to compare here.')}</p>
            </div>
          ) : (
            <>
              {mixed && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3 text-[11px] text-amber-800">
                  ⚠️ {tx('comp.mixedCurrencies', 'These offers use different currencies. Totals are not converted, compare with that in mind.')}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
                      <th className="py-2 pr-3 font-semibold">{tx('comp.company', 'Company')}</th>
                      <th className="py-2 px-3 font-semibold text-right">{tx('comp.base', 'Base')}</th>
                      <th className="py-2 px-3 font-semibold text-right">{tx('comp.bonus', 'Bonus')}</th>
                      <th className="py-2 px-3 font-semibold text-right">{tx('comp.equity', 'Equity')}</th>
                      <th className="py-2 px-3 font-semibold text-right">{tx('comp.total', 'Total')}</th>
                      <th className="py-2 pl-3 font-semibold">{tx('comp.remote', 'Remote')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const isCurrent = r.id === currentJobId
                      const isBest = best !== null && r.total === best
                      return (
                        <tr key={r.id} className={`border-b border-gray-100 ${isCurrent ? 'bg-indigo-50/60' : ''}`}>
                          <td className="py-2.5 pr-3">
                            <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                              {r.company}
                              {isBest && <span title={tx('comp.best', 'Highest total')}>🏆</span>}
                              {isCurrent && <span className="text-[10px] font-semibold text-indigo-600">({tx('comp.thisOne', 'this one')})</span>}
                            </div>
                            <div className="text-xs text-gray-400">{r.position}{r.stage ? ` · ${stageLabel(r.stage)}` : ''}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{formatMoney(r.base, r.currency)}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{r.bonus != null ? formatMoney(r.bonus, r.currency) : '—'}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{r.equity != null ? formatMoney(r.equity, r.currency) : '—'}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-bold text-gray-900">{formatMoney(r.total, r.currency)}</td>
                          <td className="py-2.5 pl-3 text-gray-600">{r.remotePct != null ? `${r.remotePct}%` : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
