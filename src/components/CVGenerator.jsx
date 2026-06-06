import { useState, useEffect, useRef } from 'react'

const IS_DEV = import.meta.env.DEV

function cvToHTML(md) {
  if (!md) return ''
  return md
    .split('\n')
    .map(line => {
      if (line.startsWith('# ')) return `<h1 style="font-size:17pt;font-weight:bold;color:#1e293b;border-bottom:2px solid #6366f1;padding-bottom:5px;margin:0 0 10px">${line.slice(2)}</h1>`
      if (line.startsWith('## ')) return `<h2 style="font-size:11pt;font-weight:bold;color:#4f46e5;margin:14px 0 5px;text-transform:uppercase;letter-spacing:0.06em">${line.slice(3)}</h2>`
      if (line.startsWith('### ')) return `<h3 style="font-size:10.5pt;font-weight:bold;color:#1e293b;margin:8px 0 3px">${line.slice(4)}</h3>`
      if (line.startsWith('- ')) return `<div style="margin:2px 0;padding-left:14px;font-size:10pt">• ${line.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>`
      if (!line.trim()) return '<div style="margin:5px 0"></div>'
      return `<p style="margin:2px 0;font-size:10pt">${line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')}</p>`
    })
    .join('')
}

export default function CVGenerator({ cv, job, onBack }) {
  const [step, setStep] = useState('fetching_jd')
  const [jdText, setJdText] = useState('')
  const [jdError, setJdError] = useState(null)
  const [generatedCV, setGeneratedCV] = useState('')
  const [editableCV, setEditableCV] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [viewMode, setViewMode] = useState('split') // 'split' | 'before' | 'after'
  const [exporting, setExporting] = useState(false)
  const afterRef = useRef()

  useEffect(() => { fetchJobDescription() }, [])

  const fetchJobDescription = async () => {
    setStep('fetching_jd')
    setJdError(null)

    // Use JD from extension if available
    if (job.jobDescription) {
      setJdText(job.jobDescription)
      setStep('ready_to_generate')
      return
    }

    if (!job.url) {
      setJdText(job.notes || '')
      setStep('ready_to_generate')
      return
    }

    if (IS_DEV) {
      setJdText(`Product Manager chez ${job.company}\n\nNous recherchons un PM expérimenté pour piloter notre roadmap B2B SaaS. Compétences requises : OKR, A/B testing, SQL, Figma, Jira, métriques produit (DAU, NPS, rétention).`)
      setStep('ready_to_generate')
      return
    }

    try {
      const res = await fetch('/api/fetch-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: job.url })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setJdText(data.text)
      setStep('ready_to_generate')
    } catch (e) {
      setJdError(e.message)
      setStep('manual_jd')
    }
  }

  const generateCV = async () => {
    setStep('generating')
    try {
      if (IS_DEV) {
        const mock = `# Alexandre Leblanc\nParis, France · alexandre@email.com\n\n## Profil\nProduct Manager Senior avec 18 ans d'expérience internationale en B2B SaaS, gaming et IoT. Expert en pilotage de roadmap produit orienté OKR, A/B testing et métriques de rétention (NPS +32%, DAU +40%). Trilingual FR/EN/JP.\n\n## Expérience\n\n### Senior Product Manager — Wargaming (2018-2024)\n- Pilotage roadmap pour 3M utilisateurs actifs avec framework OKR\n- A/B testing sur parcours d'activation : +35% conversion\n- Dashboard Jira/SQL pour suivi métriques DAU/MAU en temps réel\n- Management 2 squads agiles × 8 personnes\n\n### Product Owner — Rakuten (2015-2018)\n- Backlog priorisé via RICE score, livraison bi-hebdomadaire\n- Analyse rétention SQL : identification des drop-off points\n- Déploiement Figma pour prototypage rapide avec UX designers\n\n## Compétences\n- **Produit** : OKR, roadmap, A/B testing, NPS, DAU/MAU, funnel analysis\n- **Tech** : SQL, Jira, Figma, Confluence, analytics\n- **Méthodo** : Agile/Scrum, RICE, user interviews\n\n## Formation\nArts & Métiers — Ingénieur généraliste (2012) · JLPT N1`
        setGeneratedCV(mock)
        setEditableCV(mock)
        setStep('preview')
        return
      }

      const res = await fetch('/api/generate-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText: cv.text, jobDescription: jdText, company: job.company, position: job.position })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGeneratedCV(data.cv)
      setEditableCV(data.cv)
      setStep('preview')
    } catch (e) {
      setJdError(e.message)
      setStep('ready_to_generate')
    }
  }

  const handleExportPDF = () => {
    const html = cvToHTML(editableCV || generatedCV)
    const filename = `CV_${job.company}_${job.position.replace(/\s+/g, '_')}`
    const win = window.open('', '_blank')
    if (!win) { alert('Autorisez les pop-ups pour exporter le PDF.'); return }
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>${filename}</title>
      <style>
        @page { margin: 15mm; }
        body { font-family: Arial, sans-serif; font-size: 10pt; color: #1e293b; line-height: 1.5; }
        h1 { font-size: 17pt; font-weight: bold; color: #1e293b; border-bottom: 2px solid #6366f1; padding-bottom: 5px; margin: 0 0 10px; }
        h2 { font-size: 11pt; font-weight: bold; color: #4f46e5; margin: 14px 0 5px; text-transform: uppercase; letter-spacing: 0.06em; }
        h3 { font-size: 10.5pt; font-weight: bold; color: #1e293b; margin: 8px 0 3px; }
        @media print { body { margin: 0; } }
      </style>
    </head><body>${html}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  const CVPanel = ({ text, label, accent, ref: panelRef }) => (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className={`flex items-center gap-2 px-4 py-2 border-b ${accent}`}>
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-5 bg-white" ref={panelRef}>
        <div
          style={{ fontFamily: 'Arial, sans-serif', lineHeight: '1.5', maxWidth: '100%' }}
          dangerouslySetInnerHTML={{ __html: cvToHTML(text) }}
        />
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg text-sm">← Retour</button>
          <div>
            <p className="text-sm font-semibold text-gray-800">✨ {job.company} — {job.position}</p>
            <p className="text-xs text-gray-400">CV source : {cv.name}</p>
          </div>
        </div>
        {step === 'preview' && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* View mode toggle */}
            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
              {[['split', '⬛⬛ Côte à côte'], ['before', '◀ Avant'], ['after', '▶ Après']].map(([mode, label]) => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 font-medium transition-colors ${viewMode === mode ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={() => setIsEditing(v => !v)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${isEditing ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {isEditing ? '👁️ Aperçu' : '✏️ Éditer'}
            </button>
            <button onClick={generateCV} className="text-xs font-medium border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">↺ Regénérer</button>
            <button onClick={handleExportPDF} disabled={exporting}
              className="text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50">
              {exporting ? '⏳' : '⬇️ PDF'}
            </button>
          </div>
        )}
      </div>

      {/* Loading */}
      {['fetching_jd', 'generating'].includes(step) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <svg className="w-10 h-10 text-indigo-400 animate-spin mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="font-medium text-gray-700">
            {step === 'fetching_jd' ? '🔍 Récupération de l\'offre...' : '✨ Génération du CV adapté...'}
          </p>
          {step === 'generating' && <p className="text-xs text-gray-400 mt-1">Claude reformule vos expériences pour matcher l'offre</p>}
        </div>
      )}

      {/* JD input */}
      {['manual_jd', 'ready_to_generate'].includes(step) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-800">📋 Description du poste</p>
            {step === 'ready_to_generate' && jdText && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Récupérée</span>
            )}
          </div>
          {jdError && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2 mb-3">{jdError}</p>}
          <textarea
            className="w-full h-40 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            placeholder="Collez ici le texte de l'offre..."
            value={jdText}
            onChange={e => setJdText(e.target.value)}
          />
          <div className="flex justify-end mt-3">
            <button onClick={generateCV} disabled={!jdText.trim()}
              className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-40">
              ✨ Générer le CV adapté
            </button>
          </div>
        </div>
      )}

      {/* Preview */}
      {step === 'preview' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" style={{ minHeight: '600px' }}>
          {isEditing ? (
            <div className="p-4 h-full">
              <p className="text-xs text-gray-400 mb-2">Éditez le Markdown — cliquez sur "Aperçu" pour voir le rendu</p>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                style={{ height: '560px' }}
                value={editableCV}
                onChange={e => setEditableCV(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex divide-x divide-gray-100" style={{ minHeight: '600px' }}>
              {/* BEFORE */}
              {(viewMode === 'split' || viewMode === 'before') && (
                <div className={`flex flex-col ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
                  <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">CV Original</span>
                    <span className="text-xs text-gray-400 ml-auto">{cv.name}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5">
                    <div style={{ fontFamily: 'Arial, sans-serif', lineHeight: '1.5' }}
                      dangerouslySetInnerHTML={{ __html: cvToHTML(cv.text) }} />
                  </div>
                </div>
              )}

              {/* AFTER */}
              {(viewMode === 'split' || viewMode === 'after') && (
                <div className={`flex flex-col ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
                  <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">CV Adapté — {job.company}</span>
                    <span className="text-xs text-indigo-400 ml-auto">{job.position}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5" ref={afterRef}>
                    <div style={{ fontFamily: 'Arial, sans-serif', lineHeight: '1.5' }}
                      dangerouslySetInnerHTML={{ __html: cvToHTML(editableCV) }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
