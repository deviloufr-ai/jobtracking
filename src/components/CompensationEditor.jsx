import { useState } from 'react'
import {
  CURRENCIES, COMP_STAGES, summarizeComp, hasCompensation, totalComp, formatMoney,
} from '../utils/compensation'
import NegotiationAssistant from './NegotiationAssistant'
import OfferComparison from './OfferComparison'

// Per-application compensation block: a compact summary when comp exists, an inline
// editor to capture base / bonus / equity / benefits / stage, and the entry points
// for the negotiation assistant and the cross-job offer comparison. Persists to
// job.compensation via onUpdateJob (rides jobs.extras, see syncManager).
export default function CompensationEditor({ job, onUpdateJob, t = (k) => k }) {
  const tx = (k, f) => { const v = t(k); return v && v !== k ? v : f }
  const comp = job.compensation || {}
  const has = hasCompensation(comp)
  const [editing, setEditing] = useState(false)
  const [showNegotiate, setShowNegotiate] = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const [form, setForm] = useState(comp)

  const openEdit = () => { setForm(job.compensation || { currency: 'EUR', basePeriod: 'year', stage: 'offered' }); setEditing(true) }

  const save = () => {
    const cleaned = { ...form, updatedAt: new Date().toISOString() }
    onUpdateJob?.(job.id, { compensation: cleaned })
    setEditing(false)
  }

  const field = (key, value) => setForm(f => ({ ...f, [key]: value }))
  const stageLabel = (s) => tx(`comp.stages.${s}`, s)
  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const labelCls = 'block text-[11px] font-semibold text-gray-500 mb-1'

  return (
    <div className="mb-6 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">💰 {tx('comp.title', 'Compensation')}</h3>
        <button onClick={() => setShowCompare(true)} className="text-xs font-medium text-indigo-600 hover:underline">
          {tx('comp.compare', 'Compare offers')}
        </button>
      </div>

      {editing ? (
        <div className="rounded-xl bg-indigo-50/50 border border-indigo-100 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={labelCls}>{tx('comp.currency', 'Currency')}</label>
              <select value={form.currency || 'EUR'} onChange={e => field('currency', e.target.value)} className={inputCls}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>{tx('comp.stageLabel', 'Offer stage')}</label>
              <select value={form.stage || 'offered'} onChange={e => field('stage', e.target.value)} className={inputCls}>
                {COMP_STAGES.map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>{tx('comp.base', 'Base')}</label>
              <input inputMode="decimal" value={form.base ?? ''} onChange={e => field('base', e.target.value)} placeholder="65000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{tx('comp.basePeriod', 'Base per')}</label>
              <select value={form.basePeriod || 'year'} onChange={e => field('basePeriod', e.target.value)} className={inputCls}>
                <option value="year">{tx('comp.perYear', 'per year')}</option>
                <option value="month">{tx('comp.perMonth', 'per month')}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{tx('comp.bonus', 'Annual bonus')}</label>
              <input inputMode="decimal" value={form.bonus ?? ''} onChange={e => field('bonus', e.target.value)} placeholder="10000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{tx('comp.equity', 'Equity / yr')}</label>
              <input inputMode="decimal" value={form.equity ?? ''} onChange={e => field('equity', e.target.value)} placeholder="0" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{tx('comp.remotePct', 'Remote %')}</label>
              <input inputMode="numeric" value={form.remotePct ?? ''} onChange={e => field('remotePct', e.target.value)} placeholder="40" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{tx('comp.location', 'Location')}</label>
              <input value={form.location ?? ''} onChange={e => field('location', e.target.value)} placeholder="Paris" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>{tx('comp.benefits', 'Benefits & perks')}</label>
            <textarea value={form.benefits ?? ''} onChange={e => field('benefits', e.target.value)} rows={2}
              placeholder={tx('comp.benefitsPlaceholder', 'Health, meal vouchers, extra days off, signing bonus…')} className={`${inputCls} resize-none`} />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white hover:brightness-105 transition">
              {tx('common.save', 'Save')}
            </button>
            <button onClick={() => setEditing(false)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
              {tx('common.cancel', 'Cancel')}
            </button>
          </div>
        </div>
      ) : has ? (
        <div className="rounded-xl border border-gray-200 p-3">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div className="text-lg font-bold text-gray-900 tabular-nums">
              {formatMoney(totalComp(comp), comp.currency || 'EUR')}
              <span className="text-xs font-medium text-gray-400 ml-1.5">{tx('comp.totalPerYear', 'total / yr')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {comp.estimated && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700" title={comp.source ? `${tx('comp.estimatedFrom', 'Estimated from')} ${comp.source}` : ''}>
                  {tx('comp.estimated', 'estimated')}{comp.source ? ` · ${comp.source}` : ''}
                </span>
              )}
              {comp.stage && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{stageLabel(comp.stage)}</span>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{summarizeComp(comp, { base: tx('comp.baseWord', 'base'), total: tx('comp.totalWord', 'total') })}</p>
          {comp.estimated && comp.baseMin && comp.baseMax && (
            <p className="text-[11px] text-gray-400 mt-0.5">{formatMoney(comp.baseMin, comp.currency || 'EUR')} – {formatMoney(comp.baseMax, comp.currency || 'EUR')}</p>
          )}
          {comp.benefits && <p className="text-xs text-gray-400 mt-1.5 line-clamp-2">🎁 {comp.benefits}</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={openEdit} className="text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors">
              ✏️ {tx('common.edit', 'Edit')}
            </button>
            <button onClick={() => setShowNegotiate(true)} className="text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-lg px-2.5 py-1.5 hover:brightness-105 transition">
              💬 {tx('comp.negotiate', 'Negotiate')}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={openEdit} className="w-full text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl py-3 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
          + {tx('comp.add', 'Add compensation')}
        </button>
      )}

      {showNegotiate && (
        <NegotiationAssistant job={job} onSave={onUpdateJob} onClose={() => setShowNegotiate(false)} t={t} />
      )}
      {showCompare && (
        <OfferComparison currentJobId={job.id} onClose={() => setShowCompare(false)} t={t} />
      )}
    </div>
  )
}
