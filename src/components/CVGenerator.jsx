import { useState, useEffect, useRef } from 'react'
import { resolveAutoLanguage, generateTailoredCV, suggestCvPoints } from '../services/cvGeneration'
import CVSuggestions from './CVSuggestions'

// html2pdf is heavy (jsPDF + html2canvas); load it lazily at export time so it
// stays out of the main bundle (see also CVViewer.jsx which already does this).

const IS_DEV = import.meta.env.DEV

// Mock "Points manquants" for local dev (no API call). Roles match the dev mock CV.
const MOCK_SUGGESTIONS = [
  { id: 'p1', gap: 'A/B testing', role: 'Senior Product Manager', company: 'Datachain', bullet: "Mise en place d'un framework A/B testing pour valider les hypothèses produit avant développement.", confidence: 'to_verify' },
  { id: 'p2', gap: 'SQL', role: 'Program Manager Ads', company: 'SmartNews', bullet: 'Analyses SQL des cohortes utilisateurs pour prioriser la roadmap Ads.', confidence: 'grounded' },
  { id: 'p3', gap: 'OKR', role: 'Chef de Projet', company: 'Hakuhodo I-Studio', bullet: 'Pilotage des objectifs produit via un cadre OKR trimestriel.', confidence: 'to_verify' },
]

// ── HTML escape helper ────────────────────────────────────────────────────────
const escapeHtml = s => (s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

// Format phone number: remove extra spaces
const cleanPhone = (phone) => {
  if (!phone) return ''
  return phone.replace(/\s+/g, ' ').trim()
}

// Format LinkedIn URL: ensure it's a full URL
const cleanLinkedIn = (url) => {
  if (!url) return ''
  if (url.startsWith('http')) return url
  if (url.startsWith('linkedin.com')) return 'https://' + url
  return 'https://linkedin.com/in/' + url.replace(/^.*\//, '')
}

// Format email: ensure it's clean
const cleanEmail = (email) => {
  if (!email) return ''
  return email.toLowerCase().trim()
}

// Format date range: standardize to consistent format (Month YYYY – Month YYYY)
const formatDateRange = (dateStr) => {
  if (!dateStr) return ''
  // Replace various dashes with en-dash
  return dateStr.replace(/[-–—]/g, '–').replace(/\s+/g, ' ').trim()
}

// ── Inline markdown formatter ──────────────────────────────────────────────────
const fmt = t => escapeHtml(t || '')
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

  // Clean up contact info. The contact line is a single "·"-joined line
  // (City · Email · Phone · LinkedIn · Website), so clean each field
  // independently — running the single-value cleaners on the whole line would
  // discard every other field (cleanLinkedIn keeps only the URL tail, etc.).
  const cleanedContact = contact.map(line =>
    line.split(/\s*·\s*/).map(part => {
      if (!part) return part
      if (/\+?\d[\d\s().-]{6,}\d/.test(part)) return cleanPhone(part)
      if (part.toLowerCase().includes('linkedin')) return cleanLinkedIn(part)
      if (part.includes('@')) return cleanEmail(part)
      return part
    }).filter(Boolean).join(' · ')
  )

  return { name, contact: cleanedContact.join(' · '), sections }
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

// ── Shared block/section renderers (consistent pagination across templates) ──
// A role is split into a "head" unit (title + company/dates + first bullet) that
// is kept together — so a heading never sits alone at the foot of a page — plus
// "tail" bullets that flow to the next page individually. Every leaf line and
// the head unit carry CSS break-inside:avoid (honored by html2pdf's 'css' mode),
// so a page break NEVER slices a line or bullet in half — it falls cleanly
// *between* bullets, avoiding both mid-line cuts and large gaps from refusing to
// break inside a whole tall role block.
const BREAK_AVOID = 'page-break-inside:avoid;break-inside:avoid'
function blockParts(block, s) {
  if (block.standalone) {
    const it = block.standalone
    const html = it.type === 'li'
      ? `<div class="cv-block" style="${s.li};${BREAK_AVOID}">${s.bullet} ${fmt(it.text)}</div>`
      : `<div class="cv-block" style="${s.p};${BREAK_AVOID}">${fmt(it.text)}</div>`
    return { head: html, tail: [], wrap: '' }
  }
  const company = block.meta[0] || ''
  const dates   = block.meta[1] || ''
  const extra   = block.meta.slice(2)
  const bullets = block.bullets.map(t => `<div class="cv-block" style="${s.li};${BREAK_AVOID}">${s.bullet} ${fmt(t)}</div>`)
  const head = [
    block.title ? `<div style="${s.title}">${fmt(block.title)}</div>` : '',
    s.metaRow ? s.metaRow(company, dates) : '',
    ...extra.map(t => `<div style="${s.p}">${fmt(t)}</div>`),
    bullets[0] || '',
  ].join('')
  return { head, tail: bullets.slice(1), wrap: s.block }
}

// Render a section: glue the section header to the first role's head unit so a
// header is never orphaned, then let later roles/bullets flow across pages.
// The glue unit is break-inside:avoid so title + first bullet stay together.
function renderSection(headerHTML, blocks, s, sectionWrap) {
  const parts = blocks.map((b, i) => {
    const { head, tail, wrap } = blockParts(b, s)
    const glued = i === 0 ? headerHTML + head : head
    return `<div style="${wrap}"><div class="cv-block" style="${BREAK_AVOID}">${glued}</div>${tail.join('')}</div>`
  })
  return `<div style="${sectionWrap}">${parts.join('')}</div>`
}

// ── Template: MODERN ─────────────────────────────────────────────────────────
function renderModern(md, pic) {
  const { name, contact, sections } = parseCV(md)

  const s = {
    block:   'margin-bottom:13px',
    title:   'font-size:12pt;font-weight:800;color:#0f172a;margin:0 0 1px;letter-spacing:-0.01em;page-break-after:avoid',
    p:       'font-size:9.5pt;color:#475569;margin:3px 0;line-height:1.5',
    li:      'font-size:10pt;color:#1e293b;padding-left:16px;text-indent:-16px;margin:4px 0;line-height:1.5',
    bullet:  '▸',
    metaRow: (company, dates) => (company || dates) ? `
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:0 0 5px;flex-wrap:wrap">
        ${company ? `<span style="font-size:10pt;font-weight:700;color:#4f46e5">${fmt(company)}</span>` : '<span></span>'}
        ${dates ? `<span style="font-size:8.5pt;color:#fff;background:#94a3b8;border-radius:999px;padding:2px 9px;white-space:nowrap">${fmt(formatDateRange(dates))}</span>` : ''}
      </div>` : '',
  }

  const header = `
    <div style="background:linear-gradient(135deg,#4338ca 0%,#6366f1 60%,#818cf8 100%);padding:30px 46px;display:flex;align-items:center;justify-content:space-between;gap:22px">
      <div style="flex:1;min-width:0">
        <div style="font-size:24pt;font-weight:900;color:#fff;letter-spacing:-0.02em;line-height:1.1;margin-bottom:7px">${name}</div>
        ${contact ? `<div style="font-size:9pt;color:#c7d2fe;letter-spacing:0.02em;line-height:1.5">${contact}</div>` : ''}
      </div>
      ${picHTML(pic, 88, 'rgba(255,255,255,0.3)')}
    </div>`

  const body = sections.map(sec => {
    const headerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin:0 0 8px;page-break-after:avoid">
          <div style="width:4px;height:15px;background:linear-gradient(180deg,#6366f1,#818cf8);border-radius:2px;flex-shrink:0"></div>
          <div style="font-size:9pt;font-weight:800;color:#4338ca;text-transform:uppercase;letter-spacing:0.1em">${sec.title}</div>
          <div style="flex:1;height:1px;background:#e0e7ff"></div>
        </div>`
    return renderSection(headerHTML, groupBlocks(sec.items), s, 'margin-bottom:15px')
  }).join('')

  return `${header}<div style="padding:20px 46px 24px">${body}</div>`
}

// ── Template: CLASSIC ─────────────────────────────────────────────────────────
function renderClassic(md, pic) {
  const { name, contact, sections } = parseCV(md)

  const s = {
    block:   'margin-bottom:13px',
    title:   'font-size:12pt;font-weight:800;color:#0f172a;margin:0 0 1px;letter-spacing:-0.01em;page-break-after:avoid',
    p:       'font-size:9.5pt;color:#475569;margin:3px 0;line-height:1.5',
    li:      'font-size:10pt;color:#1e293b;padding-left:16px;text-indent:-16px;margin:4px 0;line-height:1.5',
    bullet:  '–',
    metaRow: (company, dates) => (company || dates) ? `
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:0 0 5px;flex-wrap:wrap">
        ${company ? `<span style="font-size:10pt;font-weight:700;color:#1e40af">${fmt(company)}</span>` : '<span></span>'}
        ${dates ? `<span style="font-size:8.5pt;color:#64748b;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:999px;padding:2px 9px;white-space:nowrap">${fmt(formatDateRange(dates))}</span>` : ''}
      </div>` : '',
  }

  const header = `
    <div style="text-align:center;padding:30px 46px 18px;border-bottom:2.5px solid #0f172a">
      ${pic ? `<div style="display:flex;justify-content:center;margin-bottom:12px">${picHTML(pic, 80, '#94a3b8')}</div>` : ''}
      <div style="font-size:22pt;font-weight:900;color:#0f172a;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:7px">${name}</div>
      ${contact ? `<div style="font-size:9pt;color:#64748b;letter-spacing:0.04em;line-height:1.5">${contact}</div>` : ''}
    </div>`

  const body = sections.map(sec => {
    const headerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin:0 0 8px;page-break-after:avoid">
          <div style="font-size:9.5pt;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.14em;white-space:nowrap">${sec.title}</div>
          <div style="flex:1;height:1px;background:#94a3b8"></div>
        </div>`
    return renderSection(headerHTML, groupBlocks(sec.items), s, 'margin-bottom:15px')
  }).join('')

  return `${header}<div style="padding:20px 46px 24px">${body}</div>`
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

  const sideS = {
    block:   'margin-bottom:9px',
    title:   'font-size:9pt;font-weight:800;color:#f1f5f9;margin:0 0 1px;page-break-after:avoid',
    p:       'font-size:8.5pt;color:#cbd5e1;margin:2px 0;line-height:1.5',
    li:      'font-size:8.5pt;color:#cbd5e1;padding-left:11px;text-indent:-11px;margin:3px 0;line-height:1.45',
    bullet:  '·',
    metaRow: (company, dates) => `${company ? `<div style="font-size:8pt;font-weight:700;color:#a5b4fc;margin:0 0 1px">${fmt(company)}</div>` : ''}${dates ? `<div style="font-size:7.5pt;color:#94a3b8;margin:0 0 2px">${fmt(formatDateRange(dates))}</div>` : ''}`,
  }

  const mainS = {
    block:   'margin-bottom:13px',
    title:   'font-size:12pt;font-weight:800;color:#0f172a;margin:0 0 1px;letter-spacing:-0.01em;page-break-after:avoid',
    p:       'font-size:9.5pt;color:#475569;margin:3px 0;line-height:1.5',
    li:      'font-size:10pt;color:#1e293b;padding-left:16px;text-indent:-16px;margin:4px 0;line-height:1.5',
    bullet:  '▹',
    metaRow: (company, dates) => (company || dates) ? `
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:0 0 5px;flex-wrap:wrap">
        ${company ? `<span style="font-size:10pt;font-weight:700;color:#4338ca">${fmt(company)}</span>` : '<span></span>'}
        ${dates ? `<span style="font-size:8.5pt;color:#fff;background:#94a3b8;border-radius:999px;padding:2px 9px;white-space:nowrap">${fmt(formatDateRange(dates))}</span>` : ''}
      </div>` : '',
  }

  const sidebarHTML = effectiveSidebar.map(sec => {
    const headerHTML = `<div style="font-size:8pt;font-weight:800;text-transform:uppercase;letter-spacing:0.14em;color:#a5b4fc;border-bottom:1px solid #334155;padding-bottom:4px;margin:0 0 6px;page-break-after:avoid">${sec.title}</div>`
    return renderSection(headerHTML, groupBlocks(sec.items), sideS, 'margin-bottom:14px')
  }).join('')

  const mainHTML = effectiveMain.map(sec => {
    const headerHTML = `<div style="font-size:9pt;font-weight:800;color:#4338ca;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1.5px solid #e0e7ff;padding-bottom:4px;margin:0 0 8px;page-break-after:avoid">${sec.title}</div>`
    return renderSection(headerHTML, groupBlocks(sec.items), mainS, 'margin-bottom:15px')
  }).join('')

  return `
    <table style="width:100%;border-collapse:collapse;table-layout:fixed">
      <colgroup><col style="width:210px"/><col/></colgroup>
      <tr>
        <td style="background:#1e293b;padding:26px 22px;vertical-align:top">
          ${pic ? `<div style="display:flex;justify-content:center;margin-bottom:16px">${picHTML(pic, 80, 'rgba(255,255,255,0.2)')}</div>` : ''}
          <div style="margin-bottom:20px">
            <div style="font-size:14pt;font-weight:900;color:#fff;line-height:1.2;margin-bottom:7px">${name}</div>
            ${contact ? `<div style="font-size:8pt;color:#94a3b8;line-height:1.8">${contact.split(' · ').join('<br>')}</div>` : ''}
          </div>
          ${sidebarHTML}
        </td>
        <td style="padding:26px 42px 26px 30px;vertical-align:top;background:#fff">
          ${mainHTML}
        </td>
      </tr>
    </table>`
}

// ── Template: STANDARD (Multi-page, visually attractive, ATS-optimized) ────
// Horizontal page margins come from this template's padding (consistent on
// every page). Top/bottom page margins come from html2pdf's `margin` option.
const STD_SIDE = '56px'  //≈ 13.8mm side margin on a 210mm-wide A4 element

function renderStandard(md, pic) {
  const { name, contact, sections } = parseCV(md)

  const s = {
    block:   'margin-bottom:15px',
    title:   'font-size:12pt;font-weight:800;color:#0f172a;margin:0 0 2px;letter-spacing:-0.01em;page-break-after:avoid',
    p:       'font-size:10pt;color:#334155;margin:5px 0;line-height:1.55',
    li:      'font-size:10pt;color:#1e293b;margin:5px 0;line-height:1.5;padding-left:1.2em;text-indent:-1.2em',
    metaRow: (company, dates) => (company || dates) ? `<div style="margin:0 0 7px">${company ? `<span style="font-size:10pt;font-weight:700;color:#1e40af">${fmt(company)}</span>` : ''}${(company && dates) ? `<span style="color:#cbd5e1;margin:0 8px">|</span>` : ''}${dates ? `<span style="font-size:9.5pt;color:#64748b;font-weight:600">${fmt(formatDateRange(dates))}</span>` : ''}</div>` : '',
    bullet:  '– ',
  }

  const header = `
    <div style="padding:28px ${STD_SIDE} 16px;border-bottom:2.5px solid #0f172a">
      <div style="font-size:24pt;font-weight:900;color:#0f172a;margin-bottom:8px;line-height:1.05;letter-spacing:-0.02em">${name}</div>
      ${contact ? `<div style="font-size:9pt;color:#64748b;line-height:1.6;letter-spacing:0.01em;font-weight:500">${contact}</div>` : ''}
    </div>`

  const body = sections.map(sec => {
    const headerHTML = `<div style="font-size:10.5pt;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.12em;margin:0 0 10px;padding-bottom:5px;border-bottom:1.5px solid #cbd5e1;page-break-after:avoid">${sec.title}</div>`
    return renderSection(headerHTML, groupBlocks(sec.items), s, 'margin-top:20px')
  }).join('')

  return `${header}<div style="padding:8px ${STD_SIDE} 12px;font-family:Arial,Helvetica,sans-serif">${body}</div>`
}

// ── Template: MINIMAL ────────────────────────────────────────────────────────
function renderMinimal(md, pic) {
  const { name, contact, sections } = parseCV(md)

  const s = {
    block:   'margin-bottom:9px',
    title:   'font-size:10.5pt;font-weight:800;color:#111827;margin:0 0 1px;page-break-after:avoid',
    p:       'font-size:9pt;color:#374151;margin:2px 0;line-height:1.45',
    li:      'font-size:9pt;color:#374151;padding-left:13px;text-indent:-13px;margin:3px 0;line-height:1.45',
    bullet:  '•',
    metaRow: (company, dates) => `${company ? `<div style="font-size:9pt;font-weight:700;color:#374151;margin:0">${fmt(company)}</div>` : ''}${dates ? `<div style="font-size:8pt;color:#6b7280;font-style:italic;margin:0 0 2px">${fmt(formatDateRange(dates))}</div>` : ''}`,
  }

  const header = `
    <div style="padding:22px 42px 16px;border-bottom:1.5px solid #d1d5db">
      <div style="display:flex;align-items:center;gap:16px">
        ${pic ? `<div>${picHTML(pic, 56, '#d1d5db')}</div>` : ''}
        <div>
          <div style="font-size:18pt;font-weight:900;color:#000;margin:0;letter-spacing:-0.01em">${name}</div>
          ${contact ? `<div style="font-size:8.5pt;color:#6b7280;margin-top:3px;line-height:1.5">${contact}</div>` : ''}
        </div>
      </div>
    </div>`

  const body = sections.map(sec => {
    const headerHTML = `<div style="font-size:9.5pt;font-weight:800;color:#000;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1.5px solid #e5e7eb;padding-bottom:3px;margin:0 0 6px;page-break-after:avoid">${sec.title}</div>`
    return renderSection(headerHTML, groupBlocks(sec.items), s, 'margin-bottom:12px')
  }).join('')

  return `${header}<div style="padding:16px 42px 18px">${body}</div>`
}

// ── Template registry ─────────────────────────────────────────────────────────
export const TEMPLATES = [
  { id: 'standard',  label: 'Standard',  icon: '✓', desc: 'ATS-optimized, une page' },
  { id: 'modern',    label: 'Moderne',   icon: '🎨', desc: 'Header dégradé indigo' },
  { id: 'classic',   label: 'Classique', icon: '📄', desc: 'Sobre, centré, intemporel' },
  { id: 'executive', label: 'Executive', icon: '💼', desc: 'Sidebar sombre, 2 colonnes' },
  { id: 'minimal',   label: 'Minimal',   icon: '✦', desc: 'Ultra-compact, maximal contenu' },
]

// ── Language registry ─────────────────────────────────────────────────────────
export const LANGUAGES = [
  { id: 'auto', label: 'Auto', flag: '🌐' },
  { id: 'fr',   label: 'Français', flag: '🇫🇷' },
  { id: 'en',   label: 'English', flag: '🇬🇧' },
  { id: 'jp',   label: '日本語', flag: '🇯🇵' },
]

export function renderCV(md, templateId, pic) {
  if (templateId === 'standard')  return renderStandard(md, pic)
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
</script>`

export const BASE_PRINT_CSS = `
  @page { margin:10mm 12mm; size:A4 portrait; }
  *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  html,body{ margin:0; padding:0; font-family:Arial,Helvetica,sans-serif; background:#fff; }
  img{ display:block; }
  table{ border-collapse:collapse; width:100%; }
`

// ─────────────────────────────────────────────────────────────────────────────
export default function CVGenerator({ cv, cvs = [], job, editSaved = false, onBack, onSaveCV, t = (key) => key }) {
  // When opened to *edit* an already-generated CV (a candidature's saved CV),
  // seed straight into the preview with its markdown/template/score instead of
  // running the fetch→suggest→generate flow. The JD is primed in the background
  // so "Regénérer" and "Points manquants" still work on demand.
  const savedCV = editSaved ? job?.cvSaved : null

  // Source CV the generator adapts from. Initial pick honors the base CV the
  // user chose in the generation settings (persisted in jobtrackr_cv_base_id),
  // falling back to the CV passed in (the most recent). The user can still
  // switch to any other imported CV from the toolbar and regenerate.
  const cvList = cvs.length ? cvs : (cv ? [cv] : [])
  const [selectedCvId, setSelectedCvId] = useState(() => {
    let storedBaseId = null
    try { storedBaseId = localStorage.getItem('jobtrackr_cv_base_id') } catch { /* ignore */ }
    if (storedBaseId && cvList.some(c => c.id === storedBaseId)) return storedBaseId
    return cv?.id ?? cvList[0]?.id ?? null
  })
  const [showCvPicker, setShowCvPicker] = useState(false)
  const activeCV = cvList.find(c => c.id === selectedCvId) || cv || cvList[0]
  const [step, setStep]             = useState(savedCV ? 'preview' : 'fetching_jd')
  const [jdText, setJdText]         = useState('')
  const [jdError, setJdError]       = useState(null)
  const [generatedCV, setGeneratedCV] = useState(savedCV?.markdown || '')
  const [editableCV, setEditableCV] = useState(savedCV?.markdown || '')
  const [atsScore, setAtsScore]     = useState(savedCV?.atsScore ?? null)
  const [isEditing, setIsEditing]   = useState(false)
  const [viewMode, setViewMode]     = useState('split')
  const [template, setTemplate]     = useState(savedCV?.template || 'standard')
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [profilePic, setProfilePic] = useState(() => localStorage.getItem('cv_profile_picture') || null)
  const [saved, setSaved]           = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState('auto')
  const [isCompressing, setIsCompressing] = useState(false)
  const picInputRef = useRef()

  // ── "Points manquants" state ────────────────────────────────────────────────
  // suggestions: the missing points (each assigned to an existing role) proposed
  // BEFORE generation; selectedPointIds: which the candidate keeps (all pre-
  // checked); showPointsPanel: the overlay reopened from the preview toolbar.
  const [suggestions, setSuggestions]         = useState([])
  const [selectedPointIds, setSelectedPointIds] = useState(() => new Set())
  const [showPointsPanel, setShowPointsPanel] = useState(false)
  const [suggestLoading, setSuggestLoading]   = useState(false)

  // Edit-saved mode shows the CV immediately and primes the JD silently; the
  // normal flow fetches the JD and proceeds to generate.
  useEffect(() => { savedCV ? primeJobDescription() : fetchJobDescription() }, [])

  // Confirmed additions (checked points) → { role, company, bullet } for the API.
  const buildAdditions = () => suggestions
    .filter(s => selectedPointIds.has(s.id))
    .map(s => ({ role: s.role, company: s.company, bullet: s.bullet }))

  const togglePoint = (id) => setSelectedPointIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleAllPoints = () => setSelectedPointIds(prev =>
    prev.size === suggestions.length ? new Set() : new Set(suggestions.map(s => s.id)))
  const editPointBullet = (id, text) => setSuggestions(prev =>
    prev.map(s => s.id === id ? { ...s, bullet: text } : s))

  // ── Profile picture upload + compression ──────────────────────────────────
  const handlePicUpload = e => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        // Compress: resize to 160x160px max for optimal balance
        const canvas = document.createElement('canvas')
        const maxSize = 160
        let w = img.width, h = img.height
        if (w > h) { h = Math.round((h * maxSize) / w); w = maxSize }
        else { w = Math.round((w * maxSize) / h); h = maxSize }
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        const b64 = canvas.toDataURL('image/jpeg', 0.82)  // Optimized JPEG quality
        setProfilePic(b64)
        localStorage.setItem('cv_profile_picture', b64)
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }
  const removePic = () => { setProfilePic(null); localStorage.removeItem('cv_profile_picture') }

  // ── JD fetch ──────────────────────────────────────────────────────────────
  // Once a job description is obtained we surface the "Points manquants" (missing
  // points to fold in) BEFORE generating. If none is available, warn instead.
  const proceedWithJd = (jd) => {
    const text = (jd || '').trim()
    setJdText(jd || '')
    if (!text) { setJdError(null); setStep('no_jd'); return }
    startSuggestFlow(jd)
  }

  // ── Points manquants: fetch → review → generate ─────────────────────────────
  const resolveLang = (jd, srcCV) => {
    const lang = selectedLanguage
    return lang === 'auto' ? resolveAutoLanguage(jd, srcCV?.text, job) : lang
  }

  // Core fetch — returns the list, throws on error. IS_DEV serves a static mock.
  const loadSuggestions = async (jd, srcCV, lang) => {
    if (IS_DEV) return MOCK_SUGGESTIONS
    return suggestCvPoints({
      cvText: srcCV?.text || '',
      jobDescription: jd,
      company: job.company,
      position: job.position,
      language: lang,
      knownGaps: job?.scoreDetails?.gaps || [], // seed from the Job Match Score gaps
    })
  }

  // Pre-generation: analyse gaps and AUTO-FOLD the skills that are grounded in the
  // CV — no manual review step. The (unverified) "to verify" points are NOT added
  // automatically; they stay available on demand via the "Points manquants"
  // toolbar button, where the user can opt in and regenerate. Never blocks — an
  // empty list or any failure falls straight through to generation.
  const startSuggestFlow = async (jdOverride, cvOverride) => {
    const src = cvOverride ?? activeCV
    const jd  = (jdOverride ?? jdText)
    const lang = resolveLang(jd, src)
    setStep('suggesting'); setJdError(null)
    try {
      const list = await loadSuggestions(jd, src, lang)
      setSuggestions(list)
      // Only points grounded in the CV are auto-added; pre-check just those so the
      // reopened panel reflects what was actually folded in.
      const grounded = list.filter(s => s.confidence === 'grounded')
      setSelectedPointIds(new Set(grounded.map(s => s.id)))
      generateCV(jd, lang, src, grounded.map(s => ({ role: s.role, company: s.company, bullet: s.bullet })))
    } catch (e) {
      // Suggest failed (incl. trial wall already signalled) — don't block.
      setJdError(e.message)
      generateCV(jd, lang, src, [])
    }
  }

  // Reopen the panel from the preview toolbar (overlay). Lazily fetches if the
  // list isn't loaded yet (e.g. the user skipped it the first time).
  const reopenPointsPanel = async () => {
    setShowPointsPanel(true)
    if (suggestions.length || suggestLoading) return
    setSuggestLoading(true); setJdError(null)
    try {
      const list = await loadSuggestions(jdText, activeCV, resolveLang(jdText, activeCV))
      setSuggestions(list)
      setSelectedPointIds(new Set(list.map(s => s.id)))
    } catch (e) {
      setJdError(e.message)
    } finally {
      setSuggestLoading(false)
    }
  }

  // Resolve the job-description text (job field → scrape via /api/fetch-jd →
  // notes fallback) WITHOUT touching the step or triggering generation. Shared by
  // the normal fetch-then-generate flow and the silent priming used to edit a
  // saved CV.
  const resolveJdText = async () => {
    if (job.jobDescription) return job.jobDescription
    if (!job.url) return job.notes || ''
    if (IS_DEV) {
      return `Product Manager chez ${job.company}\n\nNous recherchons un PM expérimenté pour piloter notre roadmap B2B SaaS. Compétences requises : OKR, A/B testing, SQL, Figma, Jira, métriques produit (DAU, NPS, rétention).`
    }
    try {
      const res  = await fetch('/api/fetch-jd', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url:job.url}) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      // Fetch may succeed but return nothing usable — fall back to notes.
      return data.text || job.notes || ''
    } catch(e) { setJdError(e.message); return job.notes || '' }
  }

  const fetchJobDescription = async () => {
    setStep('fetching_jd'); setJdError(null)
    proceedWithJd(await resolveJdText())
  }

  // Edit-saved mode: fetch the JD in the background so "Regénérer" and "Points
  // manquants" are ready, while the already-shown saved CV stays in place.
  const primeJobDescription = async () => {
    setJdError(null)
    setJdText(await resolveJdText())
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  // additionsOverride: [] forces "generate without", undefined uses the checked
  // "Points manquants". These flow into the prompt as REQUIRED ADDITIONS.
  const generateCV = async (jdOverride, langOverride, cvOverride, additionsOverride) => {
    const srcCV = cvOverride ?? activeCV
    // Editing a saved CV with no base CV imported: nothing to (re)generate from —
    // keep the current preview instead of crashing on srcCV.text.
    if (!srcCV?.text) return
    const jd   = (jdOverride ?? jdText)
    let   lang = (langOverride ?? selectedLanguage)
    // Resolve "Auto" to an explicit language client-side so the server gets a
    // firm "write in FRENCH/ENGLISH/JAPANESE" instruction instead of having to
    // detect inside an English-biased prompt (the reason auto-detect failed).
    if (lang === 'auto') lang = resolveAutoLanguage(jd, srcCV?.text, job)
    const additions = additionsOverride ?? buildAdditions()
    setShowPointsPanel(false)
    setStep('generating')
    try {
      if (IS_DEV) {
        const mock = `# Alexandre Leblanc\nParis, France · alexandre@email.com · linkedin.com/in/devilalex\n\n## Profil\nProduct Manager Senior avec 18 ans d'expérience internationale en B2B SaaS, gaming et IoT. Expert en pilotage de roadmap produit orienté OKR, A/B testing et métriques de rétention. Trilingue FR/EN/JP.\n\n## Expérience\n\n### Senior Product Manager — Datachain\nMai 2023 – Juin 2025 | Remote (Tokyo)\n- Piloté l'implémentation d'un pont inter-chaînes Web3/DeFi — discovery, rollout et suivi d'adoption\n- Structuré les interviews clients, recherche concurrentielle et priorisation data-driven\n- Coordonné les équipes cross-fonctionnelles (Engineering, Product, Marketing)\n\n### Program Manager Ads — SmartNews\nJanvier 2021 – Mai 2023 | Remote (Tokyo)\n- Piloté les programmes produit globaux Ads (20M+ MAU)\n- Analyse data pour identifier pain points ; traduit les insights en requirements\n- Frameworks A/B testing et cohort analysis\n\n### Chef de Projet — Hakuhodo I-Studio\nJanvier 2017 – Janvier 2020 | Tokyo\n- Développement end-to-end de l'app IoT Pechat ; 0 à 120K unités vendues\n- Lancement US avec +15% revenue · Good Design Award 2019\n\n## Compétences\n- **Produit** : OKR, roadmap, A/B testing, NPS, DAU/MAU, funnel\n- **Tech** : SQL, Jira, Figma, Confluence, analytics\n- **Méthodo** : Agile/Scrum, RICE, user interviews\n\n## Formation\nArts & Métiers — Ingénieur généraliste (2012)\nJLPT N1 · Trilingue FR/EN/JP`
        setGeneratedCV(mock); setEditableCV(mock); setAtsScore(94); setStep('preview'); return
      }
      const { cv, atsScore } = await generateTailoredCV({ cvText: srcCV.text, jobDescription: jd, company: job.company, position: job.position, language: lang, additions })
      setGeneratedCV(cv); setEditableCV(cv); setAtsScore(atsScore ?? null); setStep('preview')
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
          atsScore: atsScore ?? null, // ATS keyword-coverage score, surfaced in the candidature panel
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

    // Gentle page-break rules: let content flow across pages, but keep each
    // experience block (and its bullets) intact when possible.
    const style = document.createElement('style')
    style.innerHTML = `
      @page { size: A4; }
      body { margin: 0; padding: 0; }
    `
    element.appendChild(style)

    // Configure html2pdf options for optimal quality and file size.
    // margin: [top, left, bottom, right] in mm — top/bottom apply to EVERY
    // page so multi-page content never starts at the very edge. Horizontal
    // margins are 0 here because the template provides them (consistent on
    // all pages); setting them here too would double up.
    const options = {
      margin: [12, 0, 14, 0],
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.92 },
      html2canvas: {
        scale: 2,              // Higher scale for crisp text rendering
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 10000,
        letterRendering: true
      },
      jsPDF: {
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
        hotfixes: ['px_scaling']
      },
      pagebreak: {
        mode: ['css', 'legacy'],
        avoid: '.cv-block'
      }
    }

    // Use html2pdf's own .save() so the browser download isn't aborted by an
    // over-eager URL.revokeObjectURL (the previous blob path's bug — it only
    // saved to the candidature, never downloaded).
    //
    // Leave `element` detached and un-positioned: html2pdf mounts it in its own
    // off-screen container for capture. Do NOT set position:absolute/fixed on
    // it — the clone would then contribute zero height to that container and
    // html2canvas would render a blank, 0-height page.
    try {
      const { default: html2pdf } = await import('html2pdf.js')
      await html2pdf().set(options).from(element).save()
    } catch (err) {
      console.error('PDF export error:', err)
    }
  }

  const currentTpl  = TEMPLATES.find(t => t.id === template) || TEMPLATES[0]
  const currentLang = LANGUAGES.find(l => l.id === selectedLanguage) || LANGUAGES[0]

  // Change CV language from the preview toolbar → regenerate in the new language.
  const handleLanguageChange = (langId) => {
    setSelectedLanguage(langId)
    setShowLangPicker(false)
    if (langId !== selectedLanguage) generateCV(undefined, langId)
  }

  // Switch the source CV from the preview toolbar → regenerate from that CV.
  // Pass the new CV explicitly (state update is async, so the closure would
  // otherwise still read the previous selection).
  const handleCvChange = (cvId) => {
    setShowCvPicker(false)
    if (cvId === selectedCvId) return
    setSelectedCvId(cvId)
    const nextCV = cvList.find(c => c.id === cvId)
    // The old suggestions are assigned to the previous CV's roles — drop them and
    // regenerate cleanly. The user can reopen "Points manquants" for the new CV.
    setSuggestions([]); setSelectedPointIds(new Set())
    if (nextCV) generateCV(undefined, undefined, nextCV, [])
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full space-y-3">

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg text-sm">{t('cvGeneratorUI.back')}</button>
          <div>
            <p className="text-sm font-semibold text-gray-800">✨ {job.company} — {job.position}</p>
            <p className="text-xs text-gray-400">{t('cvGeneratorUI.sourceCV')} {activeCV?.name}</p>
          </div>
          {step === 'preview' && atsScore !== null && (
            <span
              title={t('cvGeneratorUI.atsScoreHint') || 'Score de correspondance ATS du CV adapté à cette offre'}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                atsScore >= 90 ? 'bg-green-100 text-green-700 border-green-300'
                : atsScore >= 75 ? 'bg-blue-100 text-blue-700 border-blue-300'
                : 'bg-amber-100 text-amber-700 border-amber-300'
              }`}
            >
              🎯 ATS {Math.round(atsScore)}%
            </span>
          )}
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
                  {t('cvGeneratorUI.photo')}
                </button>
              )}
              <input ref={picInputRef} type="file" accept="image/*" className="hidden" onChange={handlePicUpload} />
            </div>

            {/* View toggle */}
            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
              {[['split', t('cvGeneratorUI.sideBySide')],['before', t('cvGeneratorUI.before')],['after', t('cvGeneratorUI.after')]].map(([m,l]) => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`px-3 py-1.5 font-medium transition-colors ${viewMode===m ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>

            {/* Source-CV picker — regenerates from the chosen base CV.
                Only shown when the user has more than one imported CV. */}
            {cvList.length > 1 && (
              <div className="relative">
                <button onClick={() => setShowCvPicker(v => !v)}
                  title={t('cvGeneratorUI.cvSourceHint')}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors max-w-[180px]">
                  <span>📄</span>
                  <span className="truncate">{activeCV?.name || t('cvGeneratorUI.selectCV')}</span>
                  <span className="text-gray-300 text-[10px]">▾</span>
                </button>
                {showCvPicker && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 w-64">
                    <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{t('cvGeneratorUI.selectCV')}</p>
                    {cvList.map(c => (
                      <button key={c.id} onClick={() => handleCvChange(c.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${c.id===selectedCvId ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                        <span className="text-base flex-shrink-0">📄</span>
                        <p className={`text-xs font-semibold truncate ${c.id===selectedCvId ? 'text-indigo-700' : 'text-gray-700'}`}>{c.name}</p>
                        {c.id===selectedCvId && <span className="ml-auto text-indigo-500 text-xs flex-shrink-0">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Language picker — regenerates the CV in the chosen language */}
            <div className="relative">
              <button onClick={() => setShowLangPicker(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                <span>{currentLang.flag}</span>
                <span>{currentLang.label}</span>
                <span className="text-gray-300 text-[10px]">▾</span>
              </button>
              {showLangPicker && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 w-44">
                  {LANGUAGES.map(l => (
                    <button key={l.id} onClick={() => handleLanguageChange(l.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${selectedLanguage===l.id ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                      <span className="text-base">{l.flag}</span>
                      <p className={`text-xs font-semibold ${selectedLanguage===l.id ? 'text-indigo-700' : 'text-gray-700'}`}>{l.label}</p>
                      {selectedLanguage===l.id && <span className="ml-auto text-indigo-500 text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              )}
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
              {isEditing ? t('cvGeneratorUI.preview') : t('cvGeneratorUI.edit')}
            </button>
            {/* Reopen the "Points manquants" panel to fold different points in and
                regenerate. Both this and "Regénérer" need a source CV to adapt
                from, so hide them when editing a saved CV with no base CV. */}
            {activeCV && (
              <button onClick={reopenPointsPanel}
                title={t('cvSuggestions.subtitle')}
                className="text-xs font-medium border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors flex items-center gap-1.5">
                ➕ {t('cvGeneratorUI.missingPoints')}
                {suggestions.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold">{suggestions.length}</span>
                )}
              </button>
            )}
            {activeCV && (
              <button onClick={() => generateCV()} className="text-xs font-medium border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">{t('cvGeneratorUI.regenerate')}</button>
            )}
            <button onClick={handleExportPDF}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${saved ? 'bg-indigo-600 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
              {saved ? t('cvGeneratorUI.saved') : t('cvGeneratorUI.exportPDF')}
            </button>
          </div>
        )}
      </div>

      {/* Loading */}
      {['fetching_jd','suggesting','generating'].includes(step) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <svg className="w-10 h-10 text-indigo-400 animate-spin mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="font-medium text-gray-700">
            {step === 'fetching_jd' ? "🔍 Récupération de l'offre..."
              : step === 'suggesting' ? '🧩 Analyse des points manquants...'
              : '✨ Génération du CV adapté...'}
          </p>
          {step === 'suggesting' && <p className="text-xs text-gray-400 mt-1">Comparaison de votre CV avec l'offre pour repérer les points à ajouter</p>}
          {step === 'generating' && <p className="text-xs text-gray-400 mt-1">Claude reformule vos expériences pour matcher l'offre</p>}
        </div>
      )}

      {/* JD input — shown only when there's no job description to generate from.
          When a description IS available we skip straight to generation. */}
      {['manual_jd','ready_to_generate','no_jd'].includes(step) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-800">📋 Description du poste</p>
            {step === 'ready_to_generate' && jdText && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Récupérée</span>
            )}
          </div>
          {step === 'no_jd' && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3">
              ⚠️ Aucune description de poste trouvée pour cette candidature. Collez l'offre ci-dessous pour générer le CV adapté.
            </p>
          )}
          {jdError && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2 mb-3">{jdError}</p>}
          <textarea
            className="w-full h-40 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            placeholder="Collez ici le texte de l'offre..."
            value={jdText} onChange={e => setJdText(e.target.value)}
          />
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">🌐 {t('cvGeneratorUI.selectLanguage')}</label>
              <select
                value={selectedLanguage}
                onChange={e => setSelectedLanguage(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {LANGUAGES.map(l => (
                  <option key={l.id} value={l.id}>{l.flag} {l.label}</option>
                ))}
              </select>
            </div>
            <button onClick={() => startSuggestFlow(jdText)} disabled={!jdText.trim()}
              className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-40">
              ✨ Générer le CV adapté
            </button>
          </div>
        </div>
      )}

      {/* Preview */}
      {step === 'preview' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col flex-1 min-h-0">
          {isEditing ? (
            <div className="p-4 flex-1 min-h-0 flex flex-col">
              <p className="text-xs text-gray-400 mb-2 flex-shrink-0">Éditez le Markdown — cliquez sur "Aperçu" pour voir le rendu</p>
              <textarea
                className="w-full flex-1 min-h-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                value={editableCV} onChange={e => setEditableCV(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex divide-x divide-gray-100 flex-1 min-h-0">

              {/* BEFORE */}
              {(viewMode === 'split' || viewMode === 'before') && (
                <div className={`flex flex-col min-h-0 ${viewMode==='split' ? 'w-1/2' : 'w-full'}`}>
                  <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">CV Original</span>
                    <span className="text-xs text-gray-400 ml-auto">{activeCV?.name}</span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto p-5" style={{ background:'#f1f5f9' }}>
                    <div className="cv-paper" style={{ fontFamily:'Arial,sans-serif', lineHeight:'1.5', padding:'20px', borderRadius:4 }}
                      dangerouslySetInnerHTML={{ __html: renderSimple(activeCV?.text) }} />
                  </div>
                </div>
              )}

              {/* AFTER — rendered with selected template */}
              {(viewMode === 'split' || viewMode === 'after') && (
                <div className={`flex flex-col min-h-0 ${viewMode==='split' ? 'w-1/2' : 'w-full'}`}>
                  <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">CV Adapté — {job.company}</span>
                    <span className="text-[10px] text-indigo-400 ml-auto">{currentTpl.icon} {currentTpl.label}</span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto" style={{ background:'#f1f5f9' }}>
                    <div style={{ margin:'16px auto', maxWidth:680, background:'#fff', boxShadow:'0 4px 24px rgba(0,0,0,0.10)', borderRadius:4, overflow:'hidden', fontFamily:'Arial,Helvetica,sans-serif' }}
                      dangerouslySetInnerHTML={{ __html: renderCV(editableCV, template, profilePic) }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* "Points manquants" overlay — reopened from the preview toolbar */}
      {showPointsPanel && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowPointsPanel(false)}>
          <div className="w-full max-w-2xl max-h-[85vh] flex" onClick={e => e.stopPropagation()}>
            {suggestLoading ? (
              <div className="bg-white rounded-xl shadow-xl p-12 text-center w-full">
                <svg className="w-9 h-9 text-indigo-400 animate-spin mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <p className="text-sm font-medium text-gray-700">🧩 Analyse des points manquants...</p>
              </div>
            ) : (
              <CVSuggestions
                suggestions={suggestions}
                selectedIds={selectedPointIds}
                onToggle={togglePoint}
                onToggleAll={toggleAllPoints}
                onEditBullet={editPointBullet}
                onGenerate={() => generateCV()}
                onSkip={() => generateCV(undefined, undefined, undefined, [])}
                onClose={() => setShowPointsPanel(false)}
                isReopen
                t={t}
              />
            )}
          </div>
        </div>
      )}

      {(showTemplatePicker || showLangPicker || showCvPicker) && <div className="fixed inset-0 z-40" onClick={() => { setShowTemplatePicker(false); setShowLangPicker(false); setShowCvPicker(false) }} />}
    </div>
  )
}
