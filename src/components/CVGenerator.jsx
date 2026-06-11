import { useState, useEffect, useRef } from 'react'
import html2pdf from 'html2pdf.js'

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

// ── Profile picture HTML snippet ───────────────────────────────────────────────
const picHTML = (src, size = 80, border = 'rgba(255,255,255,0.35)') =>
  src ? `<img src="${src}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:3px solid ${border};flex-shrink:0" />` : ''

// ── Group section items into experience sub-blocks ────────────────────────────
// Each h3 starts a new block. Convention: p[0]=company, p[1]=dates, rest=desc, li=bullets
function groupBlocks(items) {
  const blocks = []
  let cur = null
  for (const item of items) {
    if (item.type === 'h3') {
      if (cur) blocks.push(cur)
      cur = { title: item.text, meta: [], bullets: [] }
    } else if (!cur) {
      // items before any h3 (plain section: Profil, Compétences…)
      blocks.push({ title: null, meta: [], bullets: [], standalone: item })
    } else if (item.type === 'p') {
      cur.meta.push(item.text)
    } else if (item.type === 'li') {
      cur.bullets.push(item.text)
    }
  }
  if (cur) blocks.push(cur)
  return blocks
}

// ── Simple renderer (used for "before" original CV panel) ─────────────────────
function renderSimple(md) {
  return (md || '').split('\n').map(line => {
    if (line.startsWith('# '))  return `<h1 style="font-size:16pt;font-weight:800;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:3px;margin:0 0 6px">${line.slice(2)}</h1>`
    if (line.startsWith('## ')) return `<h2 style="font-size:10pt;font-weight:700;color:#4f46e5;margin:8px 0 2px;text-transform:uppercase;letter-spacing:0.08em">${line.slice(3)}</h2>`
    if (line.startsWith('### ')) return `<h3 style="font-size:10pt;font-weight:700;color:#1e293b;margin:4px 0 1px">${line.slice(4)}</h3>`
    if (line.startsWith('- ')) return `<div style="font-size:9.5pt;padding-left:12px;margin:1px 0;color:#334155">• ${fmt(line.slice(2))}</div>`
    if (!line.trim()) return '<div style="margin:1px 0"></div>'
    return `<p style="font-size:9.5pt;margin:1px 0;color:#334155">${fmt(line)}</p>`
  }).join('')
}

// ── Shared: render one experience sub-block (title + company + dates + bullets) ──
function expBlock(block, styles) {
  if (block.standalone) {
    const it = block.standalone
    if (it.type === 'p')  return `<div style="${styles.p}">${fmt(it.text)}</div>`
    if (it.type === 'li') return `<div style="${styles.li}">${styles.bullet} ${fmt(it.text)}</div>`
    return ''
  }
  const company = block.meta[0] || ''
  const dates   = block.meta[1] || ''
  const extra   = block.meta.slice(2)
  const bullets = block.bullets

  // Company + dates on one row: company left, dates right as a pill
  const metaRow = (company || dates) ? `
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:1px 0 2px;flex-wrap:wrap">
      ${company ? `<span style="${styles.company}">${fmt(company)}</span>` : '<span></span>'}
      ${dates   ? `<span style="${styles.dates}">${fmt(dates)}</span>` : ''}
    </div>` : ''

  return `
    <div style="${styles.block}">
      ${block.title ? `<div style="${styles.title}">${fmt(block.title)}</div>` : ''}
      ${metaRow}
      ${extra.map(t => `<div style="${styles.p}">${fmt(t)}</div>`).join('')}
      ${bullets.map(t => `<div style="${styles.li}">${styles.bullet} ${fmt(t)}</div>`).join('')}
    </div>`
}

// ── Template: MODERN ─────────────────────────────────────────────────────────
function renderModern(md, pic) {
  const { name, contact, sections } = parseCV(md)

  const expStyles = {
    block:   'page-break-inside:avoid;margin-bottom:5px;padding-bottom:0px',
    title:   'font-size:11pt;font-weight:900;color:#0f172a;margin:0;page-break-after:avoid;letter-spacing:-0.01em',
    company: 'font-size:9.5pt;font-weight:700;color:#4f46e5;letter-spacing:0.01em',
    dates:   'font-size:8pt;color:#fff;background:#94a3b8;border-radius:999px;padding:1px 8px;white-space:nowrap;font-style:normal',
    p:       'font-size:9pt;color:#475569;margin:2px 0',
    li:      'font-size:9.5pt;color:#334155;padding-left:14px;margin:2px 0;line-height:1.45',
    bullet:  '▸',
  }

  const header = `
    <div style="background:linear-gradient(135deg,#4338ca 0%,#6366f1 60%,#818cf8 100%);padding:26px 24px;display:flex;align-items:center;justify-content:space-between;gap:20px">
      <div style="flex:1;min-width:0">
        <div style="font-size:22pt;font-weight:900;color:#fff;letter-spacing:-0.02em;line-height:1.1;margin-bottom:5px">${name}</div>
        ${contact ? `<div style="font-size:8.5pt;color:#c7d2fe;letter-spacing:0.03em;line-height:1.3">${contact}</div>` : ''}
      </div>
      ${picHTML(pic, 84, 'rgba(255,255,255,0.3)')}
    </div>`

  const body = sections.map(s => {
    const blocks = groupBlocks(s.items)
    const inner  = blocks.map(b => expBlock(b, expStyles)).join('')
    return `
      <div style="margin-bottom:2px">
        <div style="display:flex;align-items:center;gap:10px;margin:3px 0 2px;page-break-after:avoid">
          <div style="width:3px;height:14px;background:linear-gradient(180deg,#6366f1,#818cf8);border-radius:2px;flex-shrink:0"></div>
          <div style="font-size:7.5pt;font-weight:800;color:#4338ca;text-transform:uppercase;letter-spacing:0.08em">${s.title}</div>
          <div style="flex:1;height:1px;background:#e0e7ff"></div>
        </div>
        ${inner}
      </div>`
  }).join('')

  return `${header}<div style="padding:3px 16px 5px">${body}</div>`
}

// ── Template: CLASSIC ─────────────────────────────────────────────────────────
function renderClassic(md, pic) {
  const { name, contact, sections } = parseCV(md)

  const expStyles = {
    block:   'page-break-inside:avoid;margin-bottom:5px;padding-bottom:0px',
    title:   'font-size:11pt;font-weight:900;color:#0f172a;margin:0;page-break-after:avoid;letter-spacing:-0.01em',
    company: 'font-size:9.5pt;font-weight:700;color:#1e40af;letter-spacing:0.01em',
    dates:   'font-size:8pt;color:#64748b;background:#f1f5f9;border-radius:999px;padding:1px 8px;white-space:nowrap;border:1px solid #e2e8f0',
    p:       'font-size:9pt;color:#475569;margin:2px 0',
    li:      'font-size:9.5pt;color:#1e293b;padding-left:14px;margin:2px 0;line-height:1.45',
    bullet:  '–',
  }

  const header = `
    <div style="text-align:center;padding:26px 24px 14px;border-bottom:2.5px solid #0f172a">
      ${pic ? `<div style="display:flex;justify-content:center;margin-bottom:10px">${picHTML(pic, 76, '#94a3b8')}</div>` : ''}
      <div style="font-size:21pt;font-weight:900;color:#0f172a;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:5px">${name}</div>
      ${contact ? `<div style="font-size:8.5pt;color:#64748b;letter-spacing:0.06em;line-height:1.3">${contact}</div>` : ''}
    </div>`

  const body = sections.map(s => {
    const blocks = groupBlocks(s.items)
    const inner  = blocks.map(b => expBlock(b, expStyles)).join('')
    return `
      <div style="margin-bottom:3px">
        <div style="display:flex;align-items:center;gap:12px;margin:5px 0 4px;page-break-after:avoid">
          <div style="font-size:8pt;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.12em;white-space:nowrap">${s.title}</div>
          <div style="flex:1;height:1px;background:#94a3b8"></div>
        </div>
        ${inner}
      </div>`
  }).join('')

  return `${header}<div style="padding:3px 16px 5px">${body}</div>`
}

// ── Template: EXECUTIVE (two-column sidebar) ──────────────────────────────────
const SIDEBAR_KEYS = ['compétences','competences','skills','formation','education',
  'langues','languages','certifications','outils','tools','atouts','intérêts','interests','profil','résumé','summary']
const isSidebarSec = s => SIDEBAR_KEYS.some(k => s.title.toLowerCase().includes(k))

function renderExecutive(md, pic) {
  const { name, contact, sections } = parseCV(md)
  const sidebarSecs = sections.filter(isSidebarSec)
  const mainSecs    = sections.filter(s => !isSidebarSec(s))
  const effectiveSidebar = sidebarSecs.length > 0 ? sidebarSecs : sections.slice(0, 1)
  const effectiveMain    = sidebarSecs.length > 0 ? mainSecs    : sections.slice(1)

  const sidebarExpStyles = {
    block:   'margin-bottom:4px;padding-bottom:0px',
    title:   'font-size:8.5pt;font-weight:800;color:#f1f5f9;margin:0;page-break-after:avoid',
    company: 'font-size:8pt;font-weight:700;color:#818cf8;letter-spacing:0.01em',
    dates:   'font-size:7.5pt;color:#475569;background:#0f172a;border-radius:999px;padding:1px 6px;white-space:nowrap;border:1px solid #334155',
    p:       'font-size:8pt;color:#94a3b8;margin:1px 0',
    li:      'font-size:8pt;color:#cbd5e1;padding-left:8px;margin:1px 0;line-height:1.4',
    bullet:  '·',
  }

  const mainExpStyles = {
    block:   'page-break-inside:avoid;margin-bottom:5px;padding-bottom:0px',
    title:   'font-size:11pt;font-weight:900;color:#0f172a;margin:0;page-break-after:avoid;letter-spacing:-0.01em',
    company: 'font-size:9.5pt;font-weight:700;color:#4338ca;letter-spacing:0.01em',
    dates:   'font-size:8pt;color:#fff;background:#94a3b8;border-radius:999px;padding:1px 8px;white-space:nowrap',
    p:       'font-size:9pt;color:#475569;margin:2px 0',
    li:      'font-size:9.5pt;color:#1e293b;padding-left:12px;margin:2px 0;line-height:1.45',
    bullet:  '▹',
  }

  const sidebarSection = s => {
    const blocks = groupBlocks(s.items)
    return `
      <div style="margin-bottom:8px">
        <div style="font-size:7pt;font-weight:800;text-transform:uppercase;letter-spacing:0.14em;color:#818cf8;padding-bottom:4px;margin-bottom:4px">${s.title}</div>
        ${blocks.map(b => expBlock(b, sidebarExpStyles)).join('')}
      </div>`
  }

  const mainSection = s => {
    const blocks = groupBlocks(s.items)
    return `
      <div style="margin-bottom:3px">
        <div style="font-size:8pt;font-weight:800;color:#4338ca;text-transform:uppercase;letter-spacing:0.1em;margin:5px 0 4px;padding-bottom:0px;page-break-after:avoid">${s.title}</div>
        ${blocks.map(b => expBlock(b, mainExpStyles)).join('')}
      </div>`
  }

  return `
    <table style="width:100%;border-collapse:collapse;table-layout:fixed">
      <colgroup><col style="width:205px"/><col/></colgroup>
      <tr>
        <td style="background:#1e293b;padding:18px 14px 18px;vertical-align:top">
          ${pic ? `<div style="display:flex;justify-content:center;margin-bottom:12px">${picHTML(pic, 72, 'rgba(255,255,255,0.2)')}</div>` : ''}
          <div style="margin-bottom:16px">
            <div style="font-size:12.5pt;font-weight:900;color:#fff;line-height:1.15;margin-bottom:5px">${name}</div>
            ${contact ? `<div style="font-size:7.5pt;color:#94a3b8;line-height:1.7">${contact.split(' · ').join('<br>')}</div>` : ''}
          </div>
          ${effectiveSidebar.map(sidebarSection).join('')}
        </td>
        <td style="padding:18px 18px 18px;vertical-align:top;background:#fff">
          ${effectiveMain.map(mainSection).join('')}
        </td>
      </tr>
    </table>`
}

// ── Template: MINIMAL ────────────────────────────────────────────────────────
function renderMinimal(md, pic) {
  const { name, contact, sections } = parseCV(md)

  const expStyles = {
    block:   'margin-bottom:4px;padding-bottom:3px',
    title:   'font-size:10pt;font-weight:800;color:#1e293b;margin:0;margin-bottom:2px',
    company: 'font-size:9pt;font-weight:700;color:#334155;margin-bottom:1px',
    dates:   'font-size:8pt;color:#666;font-style:italic;margin-bottom:2px',
    p:       'font-size:8.5pt;color:#334155;margin:2px 0;line-height:1.35',
    li:      'font-size:8.5pt;color:#334155;padding-left:12px;margin:2px 0;line-height:1.4',
    bullet:  '•',
  }

  const header = `
    <div style="padding:16px 24px;border-bottom:1.5px solid #d1d5db">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:4px">
        ${pic ? `<div>${picHTML(pic, 52, '#d1d5db')}</div>` : ''}
        <div>
          <div style="font-size:17pt;font-weight:900;color:#000;margin:0">${name}</div>
          ${contact ? `<div style="font-size:8pt;color:#666;margin-top:2px;line-height:1.4">${contact}</div>` : ''}
        </div>
      </div>
    </div>`

  const body = sections.map(s => {
    const blocks = groupBlocks(s.items)
    const inner  = blocks.map(b => expBlock(b, expStyles)).join('')
    return `
      <div style="margin:9px 0;padding-bottom:2px">
        <div style="font-size:9.5pt;font-weight:800;color:#000;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;border-bottom:1.5px solid #e5e7eb;padding-bottom:2px">${s.title}</div>
        ${inner}
      </div>`
  }).join('')

  return `${header}<div style="padding:12px 24px 14px">${body}</div>`
}

// ── Template registry ─────────────────────────────────────────────────────────
const TEMPLATES = [
  { id: 'modern',    label: 'Moderne',   icon: '🎨', desc: 'Header dégradé indigo' },
  { id: 'classic',   label: 'Classique', icon: '📄', desc: 'Sobre, centré, intemporel' },
  { id: 'executive', label: 'Executive', icon: '💼', desc: 'Sidebar sombre, 2 colonnes' },
  { id: 'minimal',   label: 'Minimal',   icon: '✦', desc: 'Ultra-compact, maximal contenu' },
]

export function renderCV(md, templateId, pic) {
  if (templateId === 'classic')   return renderClassic(md, pic)
  if (templateId === 'executive') return renderExecutive(md, pic)
  if (templateId === 'minimal')   return renderMinimal(md, pic)
  return renderModern(md, pic)
}

// ── Legacy: Shared one-page scale logic (no longer used — using html2pdf instead) ───
// Kept for backward compatibility only
export const ONE_PAGE_SCALE_FN = `
(function scaleToOnePage(){
  var probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;height:277mm;top:0;left:0';
  document.body.appendChild(probe);
  var usable = probe.offsetHeight;
  document.body.removeChild(probe);
  var naturalH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  if(naturalH > usable && usable > 0){
    document.documentElement.style.zoom = (usable / naturalH).toFixed(6);
  }
})`

// ── Auto-fit to one page: injected script inside print window ─────────────────
export const ONE_PAGE_SCRIPT = `
<script>
(function(){
  window.addEventListener('load', function(){
    ${ONE_PAGE_SCALE_FN}();
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        window.print();
        window.close();
      });
    });
  });
})();
<\/script>`

export const BASE_PRINT_CSS = `
  @page { margin:10mm 12mm; size:A4 portrait; }
  *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  html,body{ margin:0; padding:0; font-family:Arial,Helvetica,sans-serif; background:#fff; }
  img{ display:block; }
  table{ border-collapse:collapse; width:100%; }
`

// ─────────────────────────────────────────────────────────────────────────────
export default function CVGenerator({ cv, job, onBack, onSaveCV }) {
  const [step, setStep]             = useState('fetching_jd')
  const [jdText, setJdText]         = useState('')
  const [jdError, setJdError]       = useState(null)
  const [generatedCV, setGeneratedCV] = useState('')
  const [editableCV, setEditableCV] = useState('')
  const [isEditing, setIsEditing]   = useState(false)
  const [viewMode, setViewMode]     = useState('split')
  const [template, setTemplate]     = useState('modern')
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [profilePic, setProfilePic] = useState(() => localStorage.getItem('cv_profile_picture') || null)
  const [saved, setSaved]           = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState('auto')
  const [isCompressing, setIsCompressing] = useState(false)
  const picInputRef = useRef()

  useEffect(() => { fetchJobDescription() }, [])

  // ── Profile picture upload + compression ──────────────────────────────────
  const handlePicUpload = e => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        // Compress: resize to 200x200px max, convert to webp/jpeg
        const canvas = document.createElement('canvas')
        const maxSize = 200
        let w = img.width, h = img.height
        if (w > h) { h = Math.round((h * maxSize) / w); w = maxSize }
        else { w = Math.round((w * maxSize) / h); h = maxSize }
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        const b64 = canvas.toDataURL('image/jpeg', 0.85)  // JPEG quality 0.85 for good balance
        setProfilePic(b64)
        localStorage.setItem('cv_profile_picture', b64)
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }
  const removePic = () => { setProfilePic(null); localStorage.removeItem('cv_profile_picture') }

  // ── JD fetch ──────────────────────────────────────────────────────────────
  const fetchJobDescription = async () => {
    setStep('fetching_jd'); setJdError(null)
    if (job.jobDescription) { setJdText(job.jobDescription); setStep('ready_to_generate'); return }
    if (!job.url) { setJdText(job.notes || ''); setStep('ready_to_generate'); return }
    if (IS_DEV) {
      setJdText(`Product Manager chez ${job.company}\n\nNous recherchons un PM expérimenté pour piloter notre roadmap B2B SaaS. Compétences requises : OKR, A/B testing, SQL, Figma, Jira, métriques produit (DAU, NPS, rétention).`)
      setStep('ready_to_generate'); return
    }
    try {
      const res  = await fetch('/api/fetch-jd', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url:job.url}) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setJdText(data.text); setStep('ready_to_generate')
    } catch(e) { setJdError(e.message); setStep('manual_jd') }
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  const generateCV = async () => {
    setStep('generating')
    try {
      if (IS_DEV) {
        const mock = `# Alexandre Leblanc\nParis, France · alexandre@email.com · linkedin.com/in/devilalex\n\n## Profil\nProduct Manager Senior avec 18 ans d'expérience internationale en B2B SaaS, gaming et IoT. Expert en pilotage de roadmap produit orienté OKR, A/B testing et métriques de rétention. Trilingue FR/EN/JP.\n\n## Expérience\n\n### Senior Product Manager — Datachain\nMai 2023 – Juin 2025 | Remote (Tokyo)\n- Piloté l'implémentation d'un pont inter-chaînes Web3/DeFi — discovery, rollout et suivi d'adoption\n- Structuré les interviews clients, recherche concurrentielle et priorisation data-driven\n- Coordonné les équipes cross-fonctionnelles (Engineering, Product, Marketing)\n\n### Program Manager Ads — SmartNews\nJanvier 2021 – Mai 2023 | Remote (Tokyo)\n- Piloté les programmes produit globaux Ads (20M+ MAU)\n- Analyse data pour identifier pain points ; traduit les insights en requirements\n- Frameworks A/B testing et cohort analysis\n\n### Chef de Projet — Hakuhodo I-Studio\nJanvier 2017 – Janvier 2020 | Tokyo\n- Développement end-to-end de l'app IoT Pechat ; 0 à 120K unités vendues\n- Lancement US avec +15% revenue · Good Design Award 2019\n\n## Compétences\n- **Produit** : OKR, roadmap, A/B testing, NPS, DAU/MAU, funnel\n- **Tech** : SQL, Jira, Figma, Confluence, analytics\n- **Méthodo** : Agile/Scrum, RICE, user interviews\n\n## Formation\nArts & Métiers — Ingénieur généraliste (2012)\nJLPT N1 · Trilingue FR/EN/JP`
        setGeneratedCV(mock); setEditableCV(mock); setStep('preview'); return
      }
      const res  = await fetch('/api/generate-cv', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cvText:cv.text,jobDescription:jdText,company:job.company,position:job.position,language:selectedLanguage}) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGeneratedCV(data.cv); setEditableCV(data.cv); setStep('preview')
    } catch(e) { setJdError(e.message); setStep('ready_to_generate') }
  }

  // ── Export PDF with optional server-side compression ──────────────────────
  const handleExportPDF = async () => {
    const md       = editableCV || generatedCV
    const html     = renderCV(md, template, profilePic)
    const cvData   = parseCV(md)
    const candidateName = cvData.name || 'CV'
    const filename = `${candidateName} - ${job.position}`

    // Save to candidature FIRST
    if (onSaveCV) {
      onSaveCV(job.id, {
        cvSaved: {
          markdown: md,
          template,
          filename,
          savedAt: new Date().toISOString(),
        }
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }

    // Create temporary container with PDF content (allows multiple pages for full content)
    const element = document.createElement('div')
    element.innerHTML = html
    element.style.padding = '0'
    element.style.margin = '0'
    element.style.fontFamily = 'Arial, Helvetica, sans-serif'
    element.style.lineHeight = '1.2'
    element.style.color = '#000'
    element.style.backgroundColor = '#fff'
    element.style.width = '210mm'
    element.style.boxSizing = 'border-box'
    element.style.wordWrap = 'break-word'
    element.style.overflowWrap = 'break-word'

    // Add style to remove page break visual separators and force single page
    const style = document.createElement('style')
    style.innerHTML = `
      @page { margin: 0; padding: 0; size: A4; }
      * { page-break-after: auto !important; page-break-inside: avoid !important; }
      body { margin: 0; padding: 0; line-height: 1.2; }
      div { page-break-inside: avoid; }
    `
    element.appendChild(style)

    // Configure html2pdf options for balanced quality and file size
    const options = {
      margin: 0,
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.85 },  // JPEG with 85% quality
      html2canvas: {
        scale: 1.2,            // Balanced scale for crisp text
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 10000
      },
      jsPDF: {
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,        // Enable PDF compression
        hotfixes: ['px_scaling']
      },
      pagebreak: {
        mode: ['css', 'legacy'],
        before: false,
        after: false
      }
    }

    try {
      html2pdf().set(options).from(element).output('blob').then(blob => {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${filename}.pdf`
        link.click()
        URL.revokeObjectURL(url)
      })
    } catch (err) {
      console.error('PDF export error:', err)
    }
  }

  const currentTpl = TEMPLATES.find(t => t.id === template) || TEMPLATES[0]

  // ── Render ────────────────────────────────────────────────────────────────
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

            {/* Profile picture */}
            <div className="flex items-center gap-1.5">
              {profilePic ? (
                <div className="relative group">
                  <img src={profilePic} alt="Photo" className="w-8 h-8 rounded-full object-cover border-2 border-indigo-200 cursor-pointer" onClick={() => picInputRef.current?.click()} />
                  <button onClick={removePic} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity leading-none">✕</button>
                </div>
              ) : (
                <button onClick={() => picInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                  📷 Photo
                </button>
              )}
              <input ref={picInputRef} type="file" accept="image/*" className="hidden" onChange={handlePicUpload} />
            </div>

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
              <button onClick={() => setShowTemplatePicker(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                <span>{currentTpl.icon}</span>
                <span>{currentTpl.label}</span>
                <span className="text-gray-300 text-[10px]">▾</span>
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
              className={`text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${saved ? 'bg-indigo-600 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
              {saved ? '✓ Sauvegardé' : '⬇️ Exporter PDF'}
            </button>
          </div>
        )}
      </div>

      {/* Loading */}
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

      {/* JD input */}
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
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">🌐 Langue du CV :</label>
              <select
                value={selectedLanguage}
                onChange={e => setSelectedLanguage(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="auto">Détection automatique</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
            <button onClick={generateCV} disabled={!jdText.trim()}
              className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-40">
              ✨ Générer le CV adapté
            </button>
          </div>
        </div>
      )}

      {/* Preview */}
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
                <div className={`flex flex-col ${viewMode==='split' ? 'w-1/2' : 'w-full'}`}>
                  <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">CV Original</span>
                    <span className="text-xs text-gray-400 ml-auto">{cv.name}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5">
                    <div style={{ fontFamily:'Arial,sans-serif', lineHeight:'1.5' }}
                      dangerouslySetInnerHTML={{ __html: renderSimple(cv.text) }} />
                  </div>
                </div>
              )}

              {/* AFTER — rendered with selected template */}
              {(viewMode === 'split' || viewMode === 'after') && (
                <div className={`flex flex-col ${viewMode==='split' ? 'w-1/2' : 'w-full'}`}>
                  <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">CV Adapté — {job.company}</span>
                    <span className="text-[10px] text-indigo-400 ml-auto">{currentTpl.icon} {currentTpl.label}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto" style={{ background:'#f1f5f9' }}>
                    <div style={{ margin:'16px auto', maxWidth:680, background:'#fff', boxShadow:'0 4px 24px rgba(0,0,0,0.10)', borderRadius:4, overflow:'hidden', fontFamily:'Arial,Helvetica,sans-serif' }}
                      dangerouslySetInnerHTML={{ __html: renderCV(editableCV, template, profilePic) }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showTemplatePicker && <div className="fixed inset-0 z-40" onClick={() => setShowTemplatePicker(false)} />}
    </div>
  )
}
