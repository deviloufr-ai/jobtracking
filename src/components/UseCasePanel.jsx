import { useState, useRef } from 'react'

const DELIVERABLE_TYPES = [
  { key: 'github',  label: 'GitHub',   icon: '🐙' },
  { key: 'notion',  label: 'Notion',   icon: '📋' },
  { key: 'app',     label: 'App live', icon: '🌐' },
  { key: 'figma',   label: 'Figma',    icon: '🎨' },
  { key: 'slides',  label: 'Slides',   icon: '📊' },
  { key: 'doc',     label: 'Doc',      icon: '📄' },
  { key: 'other',   label: 'Autre',    icon: '🔗' },
]

const DELIVERABLE_STATUS = [
  { key: 'todo',        label: 'À faire',   color: 'bg-gray-100 text-gray-500' },
  { key: 'in_progress', label: 'En cours',  color: 'bg-amber-100 text-amber-700' },
  { key: 'done',        label: 'Rendu',     color: 'bg-green-100 text-green-700' },
]

function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24)
  return Math.ceil(diff)
}

function DeadlineBadge({ deadline }) {
  if (!deadline) return null
  const days = daysUntil(deadline)
  const label = days < 0 ? `${Math.abs(days)}j de retard` : days === 0 ? "Aujourd'hui !" : `${days}j restants`
  const color = days < 0 ? 'bg-red-100 text-red-600' : days <= 3 ? 'bg-orange-100 text-orange-600' : days <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${color}`}>
      ⏱ {label}
    </span>
  )
}

function AnalysisSection({ analysis }) {
  const [tab, setTab] = useState('approach')
  const tabs = [
    { key: 'approach', label: '🗺️ Approche' },
    { key: 'criteria', label: '🎯 Critères' },
    { key: 'plan',     label: '📊 Plan slides' },
    { key: 'risks',    label: '⚠️ Risques' },
  ]
  return (
    <div className="mt-3 bg-indigo-50/60 rounded-xl border border-indigo-100 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-indigo-700">🤖 Analyse IA</span>
        {analysis.time_estimate && (
          <span className="text-[10px] text-indigo-500 bg-indigo-100 px-1.5 py-0.5 rounded-full">{analysis.time_estimate}</span>
        )}
      </div>

      {/* Context + Objective */}
      <div className="px-3 pt-2 pb-1 space-y-1">
        {analysis.context && (
          <p className="text-xs text-gray-700"><span className="font-semibold text-gray-500">Contexte :</span> {analysis.context}</p>
        )}
        {analysis.objective && (
          <p className="text-xs text-gray-700"><span className="font-semibold text-gray-500">Objectif :</span> {analysis.objective}</p>
        )}
        {analysis.deliverables_expected?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {analysis.deliverables_expected.map((d, i) => (
              <span key={i} className="text-[10px] bg-white border border-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-md">{d}</span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-indigo-100 px-3 gap-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`text-[10px] font-medium px-2 py-1.5 border-b-2 transition-colors whitespace-nowrap ${tab === t.key ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-3 py-2">
        {tab === 'approach' && analysis.suggested_approach?.length > 0 && (
          <ol className="space-y-1.5">
            {analysis.suggested_approach.map((s, i) => (
              <li key={i} className="flex gap-2 text-xs">
                <span className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</span>
                <div className="flex-1">
                  <span className="font-semibold text-gray-700">{s.step}</span>
                  {s.duration && <span className="ml-1.5 text-[10px] text-gray-400 bg-gray-100 px-1 py-0.5 rounded">{s.duration}</span>}
                  {s.detail && <p className="text-gray-500 mt-0.5">{s.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}

        {tab === 'criteria' && analysis.evaluation_criteria?.length > 0 && (
          <ul className="space-y-1.5">
            {analysis.evaluation_criteria.map((c, i) => (
              <li key={i} className="text-xs">
                <span className="font-semibold text-gray-700">{c.criterion}</span>
                {c.detail && <span className="text-gray-500"> — {c.detail}</span>}
              </li>
            ))}
          </ul>
        )}

        {tab === 'plan' && analysis.presentation_plan?.length > 0 && (
          <ol className="space-y-1">
            {analysis.presentation_plan.map((s, i) => (
              <li key={i} className="flex gap-2 text-xs">
                <span className="text-[10px] text-gray-400 w-4 flex-shrink-0 mt-0.5">{i+1}.</span>
                <div>
                  <span className="font-semibold text-gray-700">{s.slide}</span>
                  {s.content && <p className="text-gray-500">{s.content}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}

        {tab === 'risks' && analysis.key_risks?.length > 0 && (
          <ul className="space-y-1">
            {analysis.key_risks.map((r, i) => (
              <li key={i} className="flex gap-1.5 text-xs text-gray-700">
                <span className="text-orange-400 flex-shrink-0">⚠</span>
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function UseCasePanel({ job, onUpdate }) {
  const uc = job.useCase || {}
  const [editing, setEditing] = useState(!uc.title)
  const [form, setForm] = useState({
    title: uc.title || '',
    deadline: uc.deadline || '',
    briefText: uc.briefText || '',
    status: uc.status || 'received',
  })
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [showAddDeliverable, setShowAddDeliverable] = useState(false)
  const [newDel, setNewDel] = useState({ type: 'github', url: '', title: '', status: 'todo' })
  const fileRef = useRef(null)

  const deliverables = uc.deliverables || []
  const analysis = uc.analysis || null

  const save = (patch) => {
    const updated = { ...uc, ...patch }
    onUpdate(job.id, { useCase: updated })
  }

  const saveForm = () => {
    save({ ...form })
    setEditing(false)
  }

  const handlePDF = async (file) => {
    if (!file || file.type !== 'application/pdf') return
    setPdfLoading(true)
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/parse-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, filename: file.name }),
      })
      const data = await res.json()
      if (data.text) setForm(f => ({ ...f, briefText: data.text }))
    } catch (e) {
      console.error('PDF parse error', e)
    }
    setPdfLoading(false)
  }

  const analyze = async () => {
    if (!form.briefText?.trim() && !uc.briefText?.trim()) return
    setAnalyzing(true)
    setAnalysisError(null)
    try {
      const res = await fetch('/api/analyze-usecase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          briefText: form.briefText || uc.briefText,
          company: job.company,
          position: job.position,
          deadline: form.deadline || uc.deadline,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      save({ analysis: data })
    } catch (e) {
      setAnalysisError(e.message)
    }
    setAnalyzing(false)
  }

  const addDeliverable = () => {
    if (!newDel.url.trim()) return
    const updated = [...deliverables, { ...newDel, id: crypto.randomUUID() }]
    save({ deliverables: updated })
    setNewDel({ type: 'github', url: '', title: '', status: 'todo' })
    setShowAddDeliverable(false)
  }

  const updateDeliverableStatus = (id, status) => {
    const updated = deliverables.map(d => d.id === id ? { ...d, status } : d)
    save({ deliverables: updated })
  }

  const removeDeliverable = (id) => {
    save({ deliverables: deliverables.filter(d => d.id !== id) })
  }

  const ucStatus = DELIVERABLE_STATUS.find(s => s.key === (uc.status || 'received'))
    || { label: 'Reçu', color: 'bg-blue-100 text-blue-700' }

  return (
    <div className="mt-4 bg-white rounded-xl border border-purple-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-purple-50/60 border-b border-purple-100">
        <span className="text-sm">📝</span>
        <span className="text-xs font-semibold text-purple-700 flex-1">
          {uc.title || 'Cas pratique'}
        </span>
        {uc.deadline && <DeadlineBadge deadline={uc.deadline} />}
        <select
          value={uc.status || 'received'}
          onChange={e => save({ status: e.target.value })}
          className="text-[10px] border-0 bg-transparent text-purple-600 font-semibold cursor-pointer focus:outline-none"
        >
          <option value="received">Reçu</option>
          <option value="in_progress">En cours</option>
          <option value="submitted">Rendu</option>
        </select>
        <button onClick={() => setEditing(v => !v)}
          className="text-[10px] text-purple-400 hover:text-purple-600 px-1.5 py-0.5 rounded hover:bg-purple-100 transition-colors">
          {editing ? 'Fermer' : '✏️ Éditer'}
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">

        {/* Edit form */}
        {editing && (
          <div className="space-y-2 pb-3 border-b border-gray-100">
            <div className="grid grid-cols-2 gap-2">
              <input
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-300 col-span-2"
                placeholder="Titre du cas (ex: Refonte dashboard collectivités)"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-400">Deadline</label>
                <input type="date"
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-300"
                  value={form.deadline}
                  onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-400">Statut</label>
                <select
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-300"
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                >
                  <option value="received">Reçu</option>
                  <option value="in_progress">En cours</option>
                  <option value="submitted">Rendu</option>
                </select>
              </div>
            </div>

            {/* Brief input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Brief / Sujet</label>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={pdfLoading}
                  className="text-[10px] text-purple-500 hover:text-purple-700 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-purple-50 transition-colors disabled:opacity-50"
                >
                  {pdfLoading ? '⏳ Lecture PDF...' : '📎 Importer PDF'}
                </button>
                <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
                  onChange={e => handlePDF(e.target.files?.[0])} />
              </div>
              <textarea
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-300 resize-none"
                rows={6}
                placeholder="Colle ici le brief du cas pratique, ou importe le PDF ci-dessus..."
                value={form.briefText}
                onChange={e => setForm(f => ({ ...f, briefText: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(false)}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100">
                Annuler
              </button>
              <button onClick={saveForm}
                className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 transition-colors">
                Sauvegarder
              </button>
            </div>
          </div>
        )}

        {/* Brief preview (not editing) */}
        {!editing && uc.briefText && (
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 max-h-24 overflow-y-auto leading-relaxed whitespace-pre-wrap border border-gray-100">
            {uc.briefText}
          </div>
        )}

        {/* AI Analysis */}
        {(uc.briefText || form.briefText) && (
          <div>
            <div className="flex items-center gap-2">
              <button
                onClick={analyze}
                disabled={analyzing}
                className="flex items-center gap-1.5 text-xs font-medium bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
              >
                {analyzing ? <><span className="animate-spin">⏳</span> Analyse en cours...</> : '🤖 Analyser avec l\'IA'}
              </button>
              {analysis && <span className="text-[10px] text-gray-400">Analyse disponible ↓</span>}
            </div>
            {analysisError && <p className="text-[10px] text-red-500 mt-1">{analysisError}</p>}
            {analysis && <AnalysisSection analysis={analysis} />}
          </div>
        )}

        {/* Deliverables */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Livrables</span>
            <button onClick={() => setShowAddDeliverable(v => !v)}
              className="text-[10px] text-purple-500 hover:text-purple-700 flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-purple-50 transition-colors">
              {showAddDeliverable ? '✕ Annuler' : '+ Ajouter'}
            </button>
          </div>

          {deliverables.length === 0 && !showAddDeliverable && (
            <p className="text-[10px] text-gray-300 italic">Aucun livrable encore — GitHub, Notion, app, slides...</p>
          )}

          <div className="space-y-1.5">
            {deliverables.map(d => {
              const type = DELIVERABLE_TYPES.find(t => t.key === d.type) || DELIVERABLE_TYPES[6]
              const st = DELIVERABLE_STATUS.find(s => s.key === d.status) || DELIVERABLE_STATUS[0]
              return (
                <div key={d.id} className="flex items-center gap-2 group/del">
                  <span className="text-sm flex-shrink-0">{type.icon}</span>
                  <a href={d.url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 min-w-0 text-xs text-indigo-600 hover:underline truncate">
                    {d.title || d.url}
                  </a>
                  <select
                    value={d.status}
                    onChange={e => updateDeliverableStatus(d.id, e.target.value)}
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none ${st.color}`}
                  >
                    {DELIVERABLE_STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <button onClick={() => removeDeliverable(d.id)}
                    className="opacity-0 group-hover/del:opacity-100 text-gray-300 hover:text-red-400 text-xs transition-opacity">
                    ✕
                  </button>
                </div>
              )
            })}
          </div>

          {showAddDeliverable && (
            <div className="mt-2 bg-gray-50 rounded-xl border border-gray-200 p-2.5 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newDel.type}
                  onChange={e => setNewDel(d => ({ ...d, type: e.target.value }))}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-300"
                >
                  {DELIVERABLE_TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                </select>
                <select
                  value={newDel.status}
                  onChange={e => setNewDel(d => ({ ...d, status: e.target.value }))}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-300"
                >
                  {DELIVERABLE_STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <input
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-300"
                placeholder="URL (github.com/..., notion.so/..., ...)"
                value={newDel.url}
                onChange={e => setNewDel(d => ({ ...d, url: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addDeliverable() }}
              />
              <input
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-300"
                placeholder="Titre (optionnel)"
                value={newDel.title}
                onChange={e => setNewDel(d => ({ ...d, title: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addDeliverable() }}
              />
              <div className="flex justify-end">
                <button onClick={addDeliverable} disabled={!newDel.url.trim()}
                  className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-40 transition-colors">
                  Ajouter
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
