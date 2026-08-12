import { useState } from 'react'

// ── "Points manquants" selection panel ────────────────────────────────────────
// Shows the missing points (from cvSuggest) grouped by experience/company, each
// pre-checked, with an editable bullet, the JD gap it closes, and a confidence
// badge. The candidate toggles which to fold into the CV, then generates.
// Rendered inline in the review_points step AND as an overlay reopened from the
// preview toolbar (see CVGenerator).

function ConfidenceBadge({ confidence, t }) {
  const grounded = confidence === 'grounded'
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${
        grounded
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-amber-50 text-amber-700 border-amber-200'
      }`}
      title={grounded ? t('cvSuggestions.groundedHint') : t('cvSuggestions.toVerifyHint')}
    >
      {grounded ? '✓ ' + t('cvSuggestions.grounded') : '◐ ' + t('cvSuggestions.toVerify')}
    </span>
  )
}

export default function CVSuggestions({
  suggestions = [],
  selectedIds,
  onToggle,
  onToggleAll,
  onEditBullet,
  onGenerate,
  onSkip,
  onClose,
  generating = false,
  isReopen = false,
  t = (k) => k,
}) {
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')

  const selectedCount = suggestions.filter(s => selectedIds.has(s.id)).length
  const allSelected = suggestions.length > 0 && selectedCount === suggestions.length
  const toVerifySelected = suggestions.filter(s => selectedIds.has(s.id) && s.confidence !== 'grounded').length

  // Group by experience: role heading + its company (one group per ### role).
  const groups = []
  const byKey = new Map()
  for (const s of suggestions) {
    const key = `${s.role}|||${s.company}`
    if (!byKey.has(key)) {
      const g = { key, role: s.role, company: s.company, items: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    byKey.get(key).items.push(s)
  }

  const startEdit = (s) => { setEditingId(s.id); setEditText(s.bullet) }
  const commitEdit = () => {
    if (editingId && editText.trim()) onEditBullet(editingId, editText.trim())
    setEditingId(null); setEditText('')
  }

  // ── Empty state — CV already aligned ────────────────────────────────────────
  if (suggestions.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="text-4xl mb-3">🎯</div>
        <p className="text-sm font-semibold text-gray-800">{t('cvSuggestions.emptyTitle')}</p>
        <p className="text-xs text-gray-500 mt-1 mb-5">{t('cvSuggestions.emptyHint')}</p>
        <button
          onClick={onSkip}
          disabled={generating}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {generating
            ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {t('cvSuggestions.generating')}</>
            : '✨ ' + t('cvSuggestions.generateCV')}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col max-h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <span className="text-base">➕</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800">{t('cvSuggestions.title')}</p>
          <p className="text-xs text-gray-400">{t('cvSuggestions.subtitle')}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onToggleAll}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors whitespace-nowrap"
          >
            {allSelected ? t('cvSuggestions.deselectAll') : t('cvSuggestions.selectAll')}
          </button>
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1" title={t('common.close') || 'Fermer'}>×</button>
          )}
        </div>
      </div>

      {/* Grouped list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ maxHeight: 460 }}>
        {groups.map(g => (
          <div key={g.key} className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
              <span className="text-sm">💼</span>
              <p className="text-xs font-bold text-gray-700 truncate">{g.role}</p>
              {g.company && <span className="text-[11px] text-gray-400 truncate">· {g.company}</span>}
            </div>
            <div className="divide-y divide-gray-50">
              {g.items.map(s => {
                const checked = selectedIds.has(s.id)
                return (
                  <div key={s.id} className={`flex gap-2.5 px-3 py-2.5 transition-colors ${checked ? 'bg-indigo-50/40' : 'hover:bg-gray-50/60'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(s.id)}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400 cursor-pointer flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      {editingId === s.id ? (
                        <textarea
                          autoFocus
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit() } }}
                          className="w-full text-sm text-gray-800 border border-indigo-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                          rows={2}
                        />
                      ) : (
                        <div className="flex items-start gap-1.5">
                          <p className="text-sm text-gray-800 leading-snug flex-1">{s.bullet}</p>
                          <button
                            onClick={() => startEdit(s)}
                            className="text-gray-300 hover:text-indigo-600 text-xs flex-shrink-0 mt-0.5"
                            title={t('cvSuggestions.edit')}
                          >✎</button>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <ConfidenceBadge confidence={s.confidence} t={t} />
                        {s.gap && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100 max-w-[220px] truncate" title={s.gap}>
                            🎯 {s.gap}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100 space-y-2">
        {toVerifySelected > 0 && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            ⚠️ {t('cvSuggestions.verifyWarning').replace('{n}', String(toVerifySelected))}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={onSkip}
            disabled={generating}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
          >
            {t('cvSuggestions.generateWithout')}
          </button>
          <button
            onClick={onGenerate}
            disabled={generating}
            className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {generating
              ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {t('cvSuggestions.generating')}</>
              : (isReopen ? '↺ ' : '✨ ') + t(isReopen ? 'cvSuggestions.regenerateWith' : 'cvSuggestions.generateWith').replace('{n}', String(selectedCount))}
          </button>
        </div>
      </div>
    </div>
  )
}
