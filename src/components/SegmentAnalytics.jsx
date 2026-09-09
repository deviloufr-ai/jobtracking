import { useMemo, useState } from 'react'
import { computeSegments, SEGMENT_DIMENSIONS } from '../utils/segments'

// Cross-cut analytics: pick a DIMENSION to slice applications by (company sector,
// platform, location or salary band) and a FOCUS metric to rank/measure them by
// (volume, response, interview, offer, rejection). Everything the user chooses at
// runtime — the request was to "let the user decide what data to use". Purely
// derived from jobs already in memory; no sync, no network.

const FOCUS = {
  volume: { color: '#3b82f6', field: 'count', suffix: '' },
  response: { color: '#6366f1', field: 'responseRate', suffix: '%' },
  interview: { color: '#8b5cf6', field: 'interviewRate', suffix: '%' },
  offer: { color: '#10b981', field: 'offerRate', suffix: '%' },
  rejection: { color: '#ef4444', field: 'rejectionRate', suffix: '%' },
}
const FOCUS_KEYS = ['volume', 'response', 'interview', 'offer', 'rejection']

const MAX_ROWS = 8

// Resolve a segment's display label. Dynamic labels (platform name, city) ride on
// the segment; the fixed buckets translate by key.
function segLabel(dimension, seg, t) {
  if (seg.label) return seg.label
  if (dimension === 'sector') return t(`analytics.segments.sectors.${seg.key}`)
  if (dimension === 'salary') return t(`analytics.segments.salaryBands.${seg.key}`)
  if (dimension === 'location') {
    if (seg.key === 'remote') return t('analytics.segments.remote')
    return t('analytics.segments.unknown')
  }
  return seg.key
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        active
          ? 'bg-gray-800 text-white'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

export default function SegmentAnalytics({ jobs, t = (k) => k }) {
  const [dimension, setDimension] = useState('sector')
  const [focus, setFocus] = useState('response')

  const { total, segments } = useMemo(() => computeSegments(jobs, dimension), [jobs, dimension])

  const { field, color, suffix } = FOCUS[focus]

  // Rank by the focus metric (volume keeps the count order), catch-all buckets
  // still sink last. Copy before sort so the memoized array isn't mutated.
  const ranked = useMemo(() => {
    const isCatchAll = (k) => k === 'other' || k === '__unknown__'
    return [...segments].sort((a, b) => {
      const ca = isCatchAll(a.key), cb = isCatchAll(b.key)
      if (ca !== cb) return ca ? 1 : -1
      if (focus === 'volume') return b.count - a.count
      return b[field] - a[field] || b.count - a.count
    })
  }, [segments, focus, field])

  const shown = ranked.slice(0, MAX_ROWS)
  const hidden = ranked.length - shown.length
  const maxVal = Math.max(...shown.map(s => s[field]), 1)

  if (total === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col p-5 gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('analytics.segments.title')}</span>
        <span className="text-[11px] text-gray-400">{t('analytics.segments.subtitle')}</span>
      </div>

      {/* Dimension picker — what to slice by */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-gray-400 mr-0.5">{t('analytics.segments.groupBy')}</span>
        {SEGMENT_DIMENSIONS.map(d => (
          <Chip key={d} active={dimension === d} onClick={() => setDimension(d)}>
            {t(`analytics.segments.dimensions.${d}`)}
          </Chip>
        ))}
      </div>

      {/* Focus picker — which metric to rank & measure by */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-gray-400 mr-0.5">{t('analytics.segments.rankBy')}</span>
        {FOCUS_KEYS.map(f => (
          <Chip key={f} active={focus === f} onClick={() => setFocus(f)}>
            {t(`analytics.segments.focus.${f}`)}
          </Chip>
        ))}
      </div>

      {/* Segment rows */}
      <div className="flex flex-col gap-3 mt-1">
        {shown.map(seg => {
          const value = seg[field]
          const barPct = maxVal > 0 ? (value / maxVal) * 100 : 0
          return (
            <div key={seg.key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {seg.emoji && <span className="text-sm flex-shrink-0">{seg.emoji}</span>}
                  <span className="text-xs text-gray-700 font-medium truncate">{segLabel(dimension, seg, t)}</span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{t('analytics.segments.apps').replace('{n}', seg.count)}</span>
                </div>
                <span className="text-sm font-bold flex-shrink-0" style={{ color }}>
                  {value}{suffix}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, background: color }} />
              </div>
              {/* Cross-reference strip — every metric, whatever the focus */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-gray-400">
                <span>{t('analytics.segments.focus.response')} <b className="text-gray-600">{seg.responseRate}%</b></span>
                <span>{t('analytics.segments.focus.interview')} <b className="text-gray-600">{seg.interviewRate}%</b></span>
                <span>{t('analytics.segments.focus.offer')} <b className="text-gray-600">{seg.offers}</b></span>
                <span>{t('analytics.segments.focus.rejection')} <b className="text-gray-600">{seg.rejectionRate}%</b>
                  {seg.rejected > 0 && <span className="text-gray-300"> ({seg.ats}🤖/{seg.human}👤)</span>}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {hidden > 0 && (
        <span className="text-[11px] text-gray-400">{t('analytics.segments.more').replace('{n}', hidden)}</span>
      )}
      {dimension === 'sector' && (
        <span className="text-[10px] text-gray-300">{t('analytics.segments.sectorHint')}</span>
      )}
    </div>
  )
}
