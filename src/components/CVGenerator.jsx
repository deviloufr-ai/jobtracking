import { useState, useEffect } from 'react'

const IS_DEV = import.meta.env.DEV

// ── Inline markdown formatter ──────────────────────────────────────────────────
const fmt = t => (t || '')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>')

// ── Parse markdown into structured data ────────────────────────────────────────
function parseCV(raw) {
  const lines = (raw || '').split('\n')
  let name = '', contact = []
  const sections = []
  let cur = null

  for (const line of lines) {
    const l = line.trimEnd()
    if (l.startsWith('# ')) {
      name = l.slice(2).trim()
    } else if (l.startsWith('## ')) {
      if (cur) sections.push(cur)
      cur = { title: l.slice(3).trim(), items: [] }
    } else if (l.startsWith('### ')) {
      if (!cur) cur = { title: '', items: [] }
      cur.items.push({ type: 'h3', text: l.slice(4).trim() })
    } else if (l.startsWith('- ')) {
      if (!cur) cur = { title: '', items: [] }
      cur.items.push({ type: 'li', text: l.slice(2) })
    } else if (l.trim()) {
      if (!cur) contact.push(l.trim())
      else cur.items.push({ type: 'p', text: l.trim() })
    }
  }
  if (cur) sections.push(cur)
  return { name, contact: contact.join(' · '), sections }
}

// ── Simple renderer (used for "before" original CV panel) ─────────────────────
function renderSimple(md) {
  return (md || '').split('\n').map(line => {
    if (line.startsWith('# ')) return `<h1 style="font-size:16pt;font-weight:800;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:5px;margin:0 0 10px">${line.slice(2)}</h1>`
    if (line.startsWith('## ')) return `<h2 style="font-size:10pt;font-weight:700;color:#4f46e5;margin:14px 0 4px;text-transform:uppercase;letter-spacing:0.08em">${line.slice(3)}</h2>`
    if (line.startsWith('### ')) return `<h3 style="font-size:10pt;font-weight:700;color:#1e293b;margin:7px 0 2px">${line.slice(4)}</h3>`
    if (line.startsWith('- ')) return `<div style="font-size:9.5pt;padding-left:12px;margin:2px 0;color:#334155">• ${fmt(line.slice(2))}</div>`
    if (!line.trim()) return '<div style="margin:4px 0"></div>'
    return `<p style="font-size:9.5pt;margin:2px 0;color:#334155">${fmt(line)}</p>`
  }).join('')
}

// ── Template: MODERN ──────────────────────────────────────────────────────────
// Gradient indigo header · left accent bar on sections · clean bullets
function renderModern(md) {
  const { name, contact, sections } = parseCV(md)
  const header = `
    <div style="background:linear-gradient(135deg,#4338ca 0%,#6366f1 60%,#818cf8 100%);padding:32px 36px 28px;margin:0">
      <div style="font-size:23pt;font-weight:900;color:#fff;letter-spacing:-0.02em;line-height:1.1;margin-bottom:8px">${name}</div>
      ${contact ? `<div style="font-size:8.5pt;color:#c7d2fe;letter-spacing:0.03em">${contact}</div>` : ''}
    </div>`

  const body = sections.map(s => {
    const items = s.items.map(it => {
      if (it.type === 'h3') return `<div style="font-size:10pt;font-weight:700;color:#1e293b;margin:10px 0 1px;page-break-after:avoid">${fmt(it.text)}</div>`
      if (it.type === 'p')  return `<div style="font-size:9pt;color:#64748b;margin:1px 0;font-style:italic">${fmt(it.text)}</div>`
      if (it.type === 'li') return `<div style="font-size:9.5pt;color:#334155;padding-left:14px;margin:3px 0;line-height:1.55">▸ ${fmt(it.text)}</div>`
      return ''
    }).join('')
    return `
      <div style="page-break-inside:avoid;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:10px;margin:18px 0 8px;page-break-after:avoid">
          <div style="width:4px;height:18px;background:linear-gradient(180deg,#6366f1,#818cf8);border-radius:2px;flex-shrink:0"></div>
          <div style="font-size:8.5pt;font-weight:800;color:#4338ca;text-transform:uppercase;letter-spacing:0.1em">${s.title}</div>
          <div style="flex:1;height:1px;background:#e0e7ff"></div>
        </div>
        ${items}
      </div>`
  }).join('')

  return `${header}<div style="padding:4px 36px 32px">${body}</div>`
}

// ── Template: CLASSIC ─────────────────────────────────────────────────────────
// Centered name · thin horizontal rules · timeless black & slate
function renderClassic(md) {
  const { name, contact, sections } = parseCV(md)
  const header = `
    <div style="text-align:center;padding:32px 36px 20px;border-bottom:2.5px solid #0f172a">
      <div style="font-size:22pt;font-weight:900;color:#0f172a;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:8px">${name}</div>
      ${contact ? `<div style="font-size:8.5pt;color:#64748b;letter-spacing:0.06em">${contact}</div>` : ''}
    </div>`

  const body = sections.map(s => {
    const items = s.items.map(it => {
      if (it.type === 'h3') return `<div style="font-size:10pt;font-weight:700;color:#0f172a;margin:9px 0 1px;page-break-after:avoid">${fmt(it.text)}</div>`
      if (it.type === 'p')  return `<div style="font-size:9pt;color:#64748b;margin:1px 0;font-style:italic">${fmt(it.text)}</div>`
      if (it.type === 'li') return `<div style="font-size:9.5pt;color:#1e293b;padding-left:14px;margin:3px 0;line-height:1.55">– ${fmt(it.text)}</div>`
      return ''
    }).join('')
    return `
      <div style="page-break-inside:avoid;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:12px;margin:18px 0 8px;page-break-after:avoid">
          <div style="font-size:8.5pt;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.12em;white-space:nowrap">${s.title}</div>
          <div style="flex:1;height:1px;background:#94a3b8"></div>
        </div>
        ${items}
      </div>`
  }).join('')

  return `${header}<div style="padding:4px 36px 32px">${body}</div>`
}

// ── Template: EXECUTIVE (two-column with dark sidebar) ────────────────────────
// Dark navy sidebar for skills/education · white main for experience
const SIDEBAR_KEYS = ['compétences', 'competences', 'skills', 'formation', 'education',
  'langues', 'languages', 'certifications', 'outils', 'tools', 'atouts', 'intérêts', 'interests', 'profil', 'résumé']
const isSidebarSection = s => SIDEBAR_KEYS.some(k => s.title.toLowerCase().includes(k))

function renderExecutive(md) {
  const { name, contact, sections } = parseCV(md)
  const sidebarSecs = sections.filter(isSidebarSection)
  const mainSecs    = sections.filter(s => !isSidebarSection(s))

  // If nothing ends up in sidebar, put Profil there
  const effectiveSidebar = sidebarSecs.length > 0 ? sidebarSecs : sections.slice(0, 1)
  const effectiveMain    = sidebarSecs.length > 0 ? mainSecs : sections.slice(1)

  const sidebarSection = s => {
    const items = s.items.map(it => {
      if (it.type === 'h3') return `<div style="font-size:8.5pt;font-weight:700;color:#e2e8f0;margin:7px 0 1px">${fmt(it.text)}</div>`
      if (it.type === 'p')  return `<div style="font-size:8pt;color:#94a3b8;margin:1px 0">${fmt(it.text)}</div>`
      if (it.type === 'li') return `<div style="font-size:8pt;color:#cbd5e1;padding-left:8px;margin:3px 0;line-height:1.5">· ${fmt(it.text)}</div>`
      return ''
    }).join('')
    return `
      <div style="margin-bottom:18px">
        <div style="font-size:7pt;font-weight:800;text-transform:uppercase;letter-spacing:0.14em;color:#818cf8;padding-bottom:5px;border-bottom:1px solid #334155;margin-bottom:7px">${s.title}</div>
        ${items}
      </div>`
  }

  const mainSection = s => {
    const items = s.items.map(it => {
      if (it.type === 'h3') return `<div style="font-size:10pt;font-weight:700;color:#0f172a;margin:9px 0 1px;page-break-after:avoid">${fmt(it.text)}</div>`
      if (it.type === 'p')  return `<div style="font-size:9pt;color:#64748b;margin:1px 0;font-style:italic">${fmt(it.text)}</div>`
      if (it.type === 'li') return `<div style="font-size:9.5pt;color:#1e293b;padding-left:12px;margin:3px 0;line-height:1.55">▹ ${fmt(it.text)}</div>`
      return ''
    }).join('')
    return `
      <div style="page-break-inside:avoid;margin-bottom:4px">
        <div style="font-size:8pt;font-weight:800;color:#4338ca;text-transform:uppercase;letter-spacing:0.1em;margin:16px 0 7px;padding-bottom:4px;border-bottom:1.5px solid #e0e7ff;page-break-after:avoid">${s.title}</div>
        ${items}
      </div>`
  }

  return `
    <table style="width:100%;border-collapse:collapse;min-height:100%">
      <tr>
        <td style="width:210px;background:#1e293b;padding:28px 20px;vertical-align:top">
          <div style="margin-bottom:24px">
            <div style="font-size:13pt;font-weight:900;color:#fff;line-height:1.2;margin-bottom:6px">${name}</div>
            ${contact ? `<div style="font-size:7.5pt;color:#94a3b8;line-height:1.8">${contact.split(' · ').join('<br>')}</div>` : ''}
          </div>
          ${effectiveSidebar.map(sidebarSection).join('')}
        </td>
        <td style="padding:28px 28px 32px;vertical-align:top">
          ${effectiveMain.map(mainSection).join('')}
        </td>
      </tr>
    </table>`
}

// ── Template registry ─────────────────────────────────────────────────────────
const TEMPLATES = [
  { id: 'modern',    label: 'Moderne',    icon: '🎨', desc: 'Header dégradé indigo' },
  { id: 'classic',   label: 'Classique',  icon: '📄', desc: 'Sobre, centré, intemporel' },
  { id: 'executive', label: 'Executive',  icon: '💼', desc: 'Sidebar sombre, deux colonnes' },
]

function renderCV(md, templateId) {
  if (templateId === 'classic')   return renderClassic(md)
  if (templateId === 'executive') return renderExecutive(md)
  return renderModern(md)
}

// ── Print CSS (handles page breaks & base reset) ───────────────────────────────
function getPrintCSS(templateId) {
  const base = `
    @page { margin: 12mm 14mm; size: A4; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background: #fff; }
    h1,h2,h3,h4 { page-break-after: avoid; }
    table { page-break-inside: auto; }
    tr    { page-break-inside: avoid; }
  `
  return base
}

// ─────────────────────────────────────────────────────────────────────────────
export default function CVGenerator({ cv, job, onBack }) {
  const [step, setStep] = useState('fetching_jd')
  const [jdText, setJdText] = useState('')
  const [jdError, setJdError] = useState(null)
  const [generatedCV, setGeneratedCV] = useState('')
  const [editableCV, setEditableCV] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [viewMode, setViewMode] = useState('split')
  const [template, setTemplate] = useState('modern')
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)

  useEffect(() => { fetchJobDescription() }, [])

  const fetchJobDescription = async () => {
    setStep('fetching_jd')
    setJdError(null)
    if (job.jobDescription) { setJdText(job.jobDescription); setStep('ready_to_generate'); return }
    if (!job.url) { setJdText(job.notes || ''); setStep('ready_to_generate'); return }
    if (IS_DEV) {
      setJdText(`Product Manager chez ${job.company}\n\nNous recherchons un PM expérimenté pour piloter notre roadmap B2B SaaS. Compétences requises : OKR, A/B testing, SQL, Figma, Jira, métriques produit (DAU, NPS, rétention).`)
      setStep('ready_to_generate'); return
    }
    try {
      const res = await fetch('/api/fetch-jd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: job.url }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setJdText(data.text)
      setStep('ready_to_generate')
    } catch (e) { setJdError(e.message); setStep('manual_jd') }
  }

  const generateCV = async () => {
    setStep('generating')
    try {
      if (IS_DEV) {
        const mock = `# Alexandre Leblanc\nParis, France · alexandre@email.com · linkedin.com/in/devilalex\n\n## Profil\nProduct Manager Senior avec 18 ans d'expérience internationale en B2B SaaS, gaming et IoT. Expert en pilotage de roadmap produit orienté OKR, A/B testing et métriques de rétention (NPS +32%, DAU +40%). Trilingue FR/EN/JP.\n\n## Expérience\n\n### Senior Product Manager — Datachain\nMai 2023 – Juin 2025 | Remote (Tokyo)\n- Piloté l'implémentation complète d'un pont inter-chaînes Web3/DeFi — discovery, rollout et suivi d'adoption\n- Structuré les interviews clients, recherche concurrentielle et priorisation data-driven des features\n- Coordonné les équipes cross-fonctionnelles (Engineering, Product, Marketing)\n- Opéré 100% en remote asynchrone, partenariat direct avec la CTO\n\n### Program Manager Ads — SmartNews\nJanvier 2021 – Mai 2023 | Remote (Tokyo)\n- Piloté les programmes produit globaux Ads (20M+ MAU), reportage direct au VP Product\n- Analyse data pour identifier pain points ; traduit les insights en requirements engineering\n- Implémenté les frameworks A/B testing et cohort analysis\n\n### Chef de Projet — Hakuhodo I-Studio\nJanvier 2017 – Janvier 2020 | Tokyo\n- Développement end-to-end de l'app IoT Pechat ; 0 à 120K unités vendues\n- Lancement US avec +15% revenue en 12 mois · Good Design Award 2019\n\n## Compétences\n- **Produit** : OKR, roadmap, A/B testing, NPS, DAU/MAU, funnel analysis\n- **Tech** : SQL, Jira, Figma, Confluence, analytics\n- **Méthodo** : Agile/Scrum, RICE, user interviews, discovery\n\n## Formation\nArts & Métiers — Ingénieur généraliste (2012)\nJLPT N1 · Trilingue FR/EN/JP`
        setGeneratedCV(mock); setEditableCV(mock); setStep('preview'); return
      }
      const res = await fetch('/api/generate-cv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText: cv.text, jobDescription: jdText, company: job.company, position: job.position })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGeneratedCV(data.cv); setEditableCV(data.cv); setStep('preview')
    } catch (e) { setJdError(e.message); setStep('ready_to_generate') }
  }

  const handleExportPDF = () => {
    const html = renderCV(editableCV || generatedCV, template)
    const filename = `CV_${job.company}_${job.position.replace(/\s+/g, '_')}`
    const win = window.open('', '_blank')
    if (!win) { alert('Autorisez les pop-ups pour exporter le PDF.'); return }
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>${filename}</title>
      <style>${getPrintCSS(template)}</style>
    </head><body>${html}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const currentTpl = TEMPLATES.find(t => t.id === template) || TEMPLATES[0]

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
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
            {/* View toggle */}
            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
              {[['split','⬛⬛ Côte à côte'],['before','◀ Avant'],['after','▶ Après']].map(([m,l]) => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`px-3 py-1.5 font-medium transition-colors ${viewMode===m ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>

            {/* Template picker */}
            <div className="relative">
              <button
                onClick={() => setShowTemplatePicker(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <span>{currentTpl.icon}</span>
                <span>{currentTpl.label}</span>
                <span className="text-gray-300">▾</span>
              </button>
              {showTemplatePicker && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 w-52">
                  {TEMPLATES.map(t => (
                    <button key={t.id} onClick={() => { setTemplate(t.id); setShowTemplatePicker(false) }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${template===t.id ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                      <span className="text-lg">{t.icon}</span>
                      <div>
                        <p className={`text-xs font-semibold ${template===t.id ? 'text-indigo-700' : 'text-gray-700'}`}>{t.label}</p>
                        <p className="text-[10px] text-gray-400">{t.desc}</p>
                      </div>
                      {template===t.id && <span className="ml-auto text-indigo-500 text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => setIsEditing(v => !v)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${isEditing ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {isEditing ? '👁️ Aperçu' : '✏️ Éditer'}
            </button>
            <button onClick={generateCV} className="text-xs font-medium border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">↺ Regénérer</button>
            <button onClick={handleExportPDF}
              className="text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 flex items-center gap-1.5">
              ⬇️ Exporter PDF
            </button>
          </div>
        )}
      </div>

      {/* ── Loading ─────────────────────────────────────────────────────────── */}
      {['fetching_jd','generating'].includes(step) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <svg className="w-10 h-10 text-indigo-400 animate-spin mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="font-medium text-gray-700">
            {step === 'fetching_jd' ? "🔍 Récupération de l'offre..." : '✨ Génération du CV adapté...'}
          </p>
          {step === 'generating' && <p className="text-xs text-gray-400 mt-1">Claude reformule vos expériences pour matcher l'offre</p>}
        </div>
      )}

      {/* ── JD input ────────────────────────────────────────────────────────── */}
      {['manual_jd','ready_to_generate'].includes(step) && (
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
            value={jdText} onChange={e => setJdText(e.target.value)}
          />
          <div className="flex justify-end mt-3">
            <button onClick={generateCV} disabled={!jdText.trim()}
              className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-40">
              ✨ Générer le CV adapté
            </button>
          </div>
        </div>
      )}

      {/* ── Preview ─────────────────────────────────────────────────────────── */}
      {step === 'preview' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" style={{ minHeight: 640 }}>
          {isEditing ? (
            <div className="p-4">
              <p className="text-xs text-gray-400 mb-2">Éditez le Markdown — cliquez sur "Aperçu" pour voir le rendu</p>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                style={{ height: 580 }}
                value={editableCV} onChange={e => setEditableCV(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex divide-x divide-gray-100" style={{ minHeight: 640 }}>
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
                      dangerouslySetInnerHTML={{ __html: renderSimple(cv.text) }} />
                  </div>
                </div>
              )}

              {/* AFTER — rendered with selected template */}
              {(viewMode === 'split' || viewMode === 'after') && (
                <div className={`flex flex-col ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
                  <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
                      CV Adapté — {job.company}
                    </span>
                    <span className="text-[10px] text-indigo-400 ml-auto">{currentTpl.icon} {currentTpl.label}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto" style={{ background: '#f8fafc' }}>
                    {/* A4-ish preview card */}
                    <div style={{ margin: '16px auto', maxWidth: 680, background: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', borderRadius: 4, overflow: 'hidden', fontFamily: 'Arial, Helvetica, sans-serif' }}
                      dangerouslySetInnerHTML={{ __html: renderCV(editableCV, template) }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Close template picker on outside click */}
      {showTemplatePicker && (
        <div className="fixed inset-0 z-40" onClick={() => setShowTemplatePicker(false)} />
      )}
    </div>
  )
}
