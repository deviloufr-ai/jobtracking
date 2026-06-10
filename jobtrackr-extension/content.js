// JobTrackr Content Script
// v1.3 — + Autofill formulaires de candidature via Claude AI

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 : CODE EXISTANT (inchangé)
// ─────────────────────────────────────────────────────────────────────────────

function getText(selectors) {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel)
      if (el?.textContent?.trim()) return el.textContent.trim()
    } catch {}
  }
  return ''
}

function meta(name) {
  return document.querySelector(`meta[property="${name}"]`)?.getAttribute('content')
    || document.querySelector(`meta[name="${name}"]`)?.getAttribute('content')
    || ''
}

function getFullPageText() {
  const clone = document.body.cloneNode(true)
  clone.querySelectorAll('script, style, nav, footer, header, aside, [role="banner"], [role="navigation"], [aria-hidden="true"]').forEach(el => el.remove())
  const text = clone.innerText || clone.textContent || ''
  return text.replace(/\s{3,}/g, '\n\n').trim().slice(0, 15000)
}

function getSectionTexts(selectors) {
  return selectors.flatMap(sel => {
    try { return [...document.querySelectorAll(sel)].map(el => el.textContent?.trim()).filter(Boolean) }
    catch { return [] }
  }).join('\n\n')
}

function getJobDescription() {
  const hostname = window.location.hostname

  if (hostname.includes('linkedin.com')) {
    return getSectionTexts(['.jobs-description__content', '.jobs-box__html-content', '[class*="description__text"]'])
  }

  if (hostname.includes('indeed.com')) {
    return getSectionTexts(['#jobDescriptionText', '[class*="jobsearch-JobComponent-description"]'])
  }

  if (hostname.includes('welcometothejungle.com')) {
    // WTTJ splits sections: description, preferred experience, requirements, etc.
    return getSectionTexts([
      '[data-testid="job-section-description"]',
      '[data-testid="job-section-requirements"]',
      '[data-testid="job-section-preferred-experience"]',
      '[data-testid^="job-section-"]',
      'article'
    ])
  }

  if (hostname.includes('greenhouse.io') || hostname.includes('ashbyhq.com') || hostname.includes('lever.co')) {
    return getSectionTexts([
      '#content', '#app', '.application-body',
      '[class*="job-post"]', '[class*="posting-content"]',
      '[class*="job-description"]', '[class*="description"]'
    ])
  }

  if (hostname.includes('apec.fr')) {
    return getSectionTexts(['.details-post', '.job-description', '[class*="description"]'])
  }

  // Generic: try to grab every named section (description + requirements + experience)
  const sections = getSectionTexts([
    '[class*="description"]', '[class*="requirement"]',
    '[class*="qualification"]', '[class*="experience"]',
    '[class*="job-detail"]', '[class*="job_detail"]',
    'article', 'main [class*="content"]'
  ])
  return sections
}

function extractJobInfo() {
  const url = window.location.href
  const hostname = window.location.hostname.replace('www.', '')
  const title = document.title || ''

  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map(s => { try { return JSON.parse(s.textContent) } catch { return null } })
    .filter(Boolean)
    .find(d => d['@type'] === 'JobPosting' || d?.hiringOrganization)

  let company = '', position = ''

  if (jsonLd) {
    company = jsonLd.hiringOrganization?.name || jsonLd.hiringOrganization || ''
    position = jsonLd.title || jsonLd.name || ''
  } else if (hostname.includes('linkedin.com')) {
    const parts = title.replace(' | LinkedIn', '').split(' - ')
    position = parts[0]?.trim() || ''
    company = parts.length > 1 ? parts[parts.length - 1].trim() : ''
  } else if (hostname.includes('indeed.com')) {
    const cleaned = title.replace(/\s*[\|\-]\s*Indeed.*$/i, '')
    const parts = cleaned.split(' - ')
    position = parts[0]?.trim() || ''
    company = parts[1]?.trim() || ''
  } else if (hostname.includes('welcometothejungle.com')) {
    const parts = title.split(' - ')
    position = parts[0]?.trim() || ''
    company = parts[1]?.trim() || ''
  } else {
    position = title.split(/[-|]/)[0]?.trim() || title
    company = meta('og:site_name') || hostname.split('.')[0]
  }

  const targeted = getJobDescription()
  const description = targeted.length > 100 ? targeted : getFullPageText()

  return {
    company: company.trim(),
    position: position.trim(),
    description: description.slice(0, 12000),
    url,
    source: hostname.includes('linkedin') ? 'LinkedIn'
      : hostname.includes('indeed') ? 'Indeed'
      : hostname.includes('welcometothejungle') ? 'WTTJ'
      : hostname.includes('apec') ? 'APEC'
      : hostname.includes('hellowork') ? 'HelloWork'
      : hostname.split('.')[0]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 : AUTOFILL — Per-field ✦ buttons + generation
// ─────────────────────────────────────────────────────────────────────────────

const IDENTITY_VALUES = {
  name: 'Alexandre Leblanc',
  firstname: 'Alexandre',
  lastname: 'Leblanc',
  email: 'deviloufr@gmail.com',
  linkedin: 'https://www.linkedin.com/in/devilalex/',
  phone: '0744723658'
}

// ── 2.1 Détection des champs de formulaire ────────────────────────────────────
function detectFormFields() {
  const fields = []

  // Cible : textarea et input[type=text/email] avec un label associé
  const candidates = [
    ...document.querySelectorAll('textarea'),
    ...document.querySelectorAll('input[type="text"], input[type="email"], input[type="url"], input[type="tel"]')
  ]

  for (const el of candidates) {
    if (el.disabled || el.readOnly) continue
    if ((el.value || '').length > 20) continue
    // Ignorer les éléments appartenant à l'UI de l'extension
    if (el.closest('[id^="jt-"]')) continue
    // Visibilité via bounding rect (offsetParent === null fails inside fixed modals in Firefox)
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue

    const label = resolveLabel(el) || el.placeholder || el.name || el.type || 'Champ'
    // Ignorer les barres de recherche sans label réel
    if (label === 'Champ' && el.type !== 'textarea') continue

    // Detect identity fields — injected directly without Claude
    const lowerLabel = label.toLowerCase()
    let identityKey = null
    if (/^(full.?name|nom.*(complet|prénom)|prénom.*nom|your name|name)$/i.test(lowerLabel)) identityKey = 'name'
    else if (/^(prénom|first.?name|given.?name|forename)$/i.test(lowerLabel)) identityKey = 'firstname'
    else if (/^(nom(\s+de\s+famille)?|last.?name|surname|family.?name)$/i.test(lowerLabel)) identityKey = 'lastname'
    else if (/^(e-?mail|courriel|email.*(address|professionnel)?|adresse.*mail)$/i.test(lowerLabel)) identityKey = 'email'
    else if (/^(linkedin|linkedin url|linkedin profile|profil linkedin)$/i.test(lowerLabel)) identityKey = 'linkedin'
    else if (/^(phone|téléphone|tel\.?|mobile|numéro.*téléphone|phone.?number)$/i.test(lowerLabel)) identityKey = 'phone'

    fields.push({
      el,
      label,
      type: el.tagName.toLowerCase(),
      maxLength: el.maxLength > 0 ? el.maxLength : null,
      placeholder: el.placeholder || '',
      identityKey
    })
  }

  return fields
}

// Résolution du label d'un champ : for=id, aria-label, aria-labelledby,
// parent <label>, ou texte le plus proche dans le DOM
function resolveLabel(el) {
  // 1. <label for="id">
  if (el.id) {
    const lbl = document.querySelector(`label[for="${el.id}"]`)
    if (lbl?.textContent?.trim()) return lbl.textContent.trim().replace(/\s+/g, ' ')
  }
  // 2. aria-label direct
  if (el.getAttribute('aria-label')?.trim()) return el.getAttribute('aria-label').trim()
  // 3. aria-labelledby
  const lblId = el.getAttribute('aria-labelledby')
  if (lblId) {
    const lbl = document.getElementById(lblId)
    if (lbl?.textContent?.trim()) return lbl.textContent.trim()
  }
  // 4. <label> parent
  const parentLabel = el.closest('label')
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true)
    clone.querySelectorAll('input,textarea,select').forEach(e => e.remove())
    const t = clone.textContent?.trim()
    if (t) return t.replace(/\s+/g, ' ')
  }
  // 5. Texte du nœud précédent ou d'un parent proche (div/p/span avec texte)
  const parent = el.closest('div, p, li, section, fieldset')
  if (parent) {
    // Chercher un élément texte au-dessus dans le même bloc
    const walker = document.createTreeWalker(parent, NodeFilter.SHOW_ELEMENT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (node === el) break
      const tag = node.tagName.toLowerCase()
      if (['p', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'strong', 'label'].includes(tag)) {
        const t = node.textContent?.trim()
        if (t && t.length > 3 && t.length < 200) return t.replace(/\s+/g, ' ')
      }
    }
  }
  // 6. Heading ou paragraphe précédant le champ dans le DOM
  // Priorité : h1-h5 > p/span/div avec texte > ignorer les labels trop courts (ex: "X")
  let node = el
  for (let i = 0; i < 5; i++) {
    let sibling = node.previousElementSibling
    while (sibling) {
      const tag = sibling.tagName?.toLowerCase()
      // Heading direct
      if (['h1','h2','h3','h4','h5'].includes(tag)) {
        const t = sibling.textContent?.trim()
        if (t && t.length > 3 && t.length < 300) return t.replace(/\s+/g, ' ')
      }
      // Heading imbriqué
      const nested = sibling.querySelectorAll ? [...sibling.querySelectorAll('h1,h2,h3,h4,h5')] : []
      const lastHeading = nested[nested.length - 1]
      if (lastHeading) {
        const t = lastHeading.textContent?.trim()
        if (t && t.length > 3 && t.length < 300) return t.replace(/\s+/g, ' ')
      }
      // Paragraphe/span avec texte suffisamment long (labels LinkedIn modal)
      if (['p','span','div','strong'].includes(tag)) {
        const t = sibling.textContent?.trim()
        if (t && t.length > 8 && t.length < 400) return t.replace(/\s+/g, ' ')
      }
      sibling = sibling.previousElementSibling
    }
    if (!node.parentElement) break
    node = node.parentElement
  }
  // 7. placeholder comme fallback (moins fiable)
  if (el.placeholder?.trim() && el.placeholder.length < 100) return el.placeholder.trim()
  return null
}

// ── 2.2 Injection des réponses dans les champs ────────────────────────────────
function injectAnswer(el, text) {
  el.focus()
  // Ashby/React requires simulating actual keystrokes via execCommand or
  // overriding the native setter AND dispatching a React-compatible InputEvent
  const proto = el.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set

  if (nativeSetter) {
    nativeSetter.call(el, text)
  } else {
    el.value = text
  }

  // React 16+ uses SyntheticEvent — InputEvent with inputType works best
  el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }))
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))

  // Fallback: select all + execCommand (works on contenteditable too)
  try {
    el.select?.()
    document.execCommand('selectAll', false, null)
    document.execCommand('insertText', false, text)
  } catch {}

  el.dispatchEvent(new Event('blur', { bubbles: true }))
}

// ── 2.3 Per-field ✦ buttons ───────────────────────────────────────────────────

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function highlightField(el, type) {
  el.style.outline = type === 'success' ? '2px solid #22c55e' : '2px solid #ef4444'
  setTimeout(() => { el.style.outline = '' }, 2000)
}

function injectStyles() {
  if (document.getElementById('jt-autofill-styles')) return
  const style = document.createElement('style')
  style.id = 'jt-autofill-styles'
  style.textContent = `
    .jt-field-btn {
      position: absolute;
      width: 22px; height: 22px;
      background: #18181b;
      color: #a78bfa;
      border: none;
      border-radius: 5px;
      font-size: 12px;
      line-height: 22px;
      text-align: center;
      cursor: pointer;
      pointer-events: all;
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      font-family: sans-serif;
      user-select: none;
      padding: 0;
    }
    .jt-field-btn:hover { background: #3730a3; transform: scale(1.1); }
    .jt-field-btn.jt-done { background: #16a34a; color: #fff; }

    .jt-popover {
      position: fixed;
      z-index: 2147483647;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #18181b;
      overflow: hidden;
    }
    .jt-pop-header {
      background: #18181b; color: #fff;
      padding: 10px 14px;
      display: flex; align-items: center; justify-content: space-between;
      font-weight: 600; font-size: 12px;
    }
    .jt-pop-close { background:none;border:none;color:#9ca3af;cursor:pointer;font-size:14px;line-height:1; }
    .jt-pop-close:hover { color:#fff; }
    .jt-pop-label { padding: 10px 14px 4px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
    .jt-pop-preview {
      margin: 0 14px 10px;
      padding: 8px 10px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      font-size: 12px;
      color: #374151;
      max-height: 100px;
      overflow-y: auto;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .jt-pop-actions { display:flex; gap:8px; padding: 0 14px 12px; }
    .jt-pop-btn {
      flex:1; padding:7px 10px; border-radius:8px; font-size:12px; font-weight:600;
      cursor:pointer; border:none; transition:opacity 0.15s;
    }
    .jt-pop-generate { background:#18181b; color:#fff; }
    .jt-pop-generate:hover:not(:disabled) { opacity:0.85; }
    .jt-pop-generate:disabled { opacity:0.4; cursor:default; }
    .jt-pop-inject { background:#f3f4f6; color:#18181b; border:1px solid #e5e7eb; }
    .jt-pop-inject:hover:not(:disabled) { background:#e5e7eb; }
    .jt-pop-inject:disabled { opacity:0.4; cursor:default; }
    .jt-pop-status { padding: 4px 14px 8px; font-size: 11px; min-height: 18px; color: #6b7280; }
    .jt-pop-status.ok { color: #16a34a; }
    .jt-pop-status.err { color: #dc2626; }
  `
  document.head.appendChild(style)
}

// Track per-field state: fieldKey → { btn, popover, answer }
const fieldState = new Map()
let activePopover = null
let cachedJD = null

function fieldKey(el) {
  return el.name || el.id || el.placeholder || el.closest('form')?.action || Math.random()
}

async function getJD() {
  if (cachedJD !== null) return cachedJD
  const rawPath = window.location.pathname.replace(/\/(apply|application|form|candidature|submit)(\/.*)$/i, '').replace(/\/+$/, '')
  const jdKey = 'jd:' + window.location.hostname + rawPath
  try {
    const r = await Promise.race([
      browser.runtime.sendMessage({ type: 'LOAD_JD', key: jdKey }),
      new Promise((_, rej) => setTimeout(() => rej(), 1500))
    ])
    if (r?.text && r.text.length > 80) { cachedJD = r.text; return cachedJD }
  } catch {}
  const targeted = getJobDescription()
  if (targeted && targeted.length > 80) { cachedJD = targeted.slice(0, 12000); return cachedJD }
  cachedJD = getFullPageText().slice(0, 12000)
  return cachedJD
}

function positionNearField(btn, popover) {
  const rect = btn.getBoundingClientRect()
  const pw = 300, ph = 240
  let left = rect.right + 10
  let top = rect.top - 10
  if (left + pw > window.innerWidth - 8) left = rect.left - pw - 10
  if (left < 8) left = 8
  if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8
  if (top < 8) top = 8
  popover.style.left = left + 'px'
  popover.style.top = top + 'px'
}

function openFieldPopover(field, btn) {
  // Close any open popover
  if (activePopover) { activePopover.remove(); activePopover = null }

  const state = fieldState.get(field.el) || {}
  const jobInfo = extractJobInfo()

  const popover = document.createElement('div')
  popover.className = 'jt-popover'
  activePopover = popover

  const identVal = field.identityKey ? IDENTITY_VALUES[field.identityKey] : null

  popover.innerHTML = `
    <div class="jt-pop-header">
      <span>✦ ${escHtml(field.label.slice(0, 50))}${field.label.length > 50 ? '…' : ''}</span>
      <button class="jt-pop-close">✕</button>
    </div>
    ${identVal !== null ? `
      <div class="jt-pop-label">Valeur identité</div>
      <div class="jt-pop-preview">${escHtml(identVal || '—')}</div>
      <div class="jt-pop-actions">
        <button class="jt-pop-btn jt-pop-inject" id="jt-pop-inject">↓ Injecter</button>
      </div>
    ` : `
      <div class="jt-pop-label">Réponse générée</div>
      <div class="jt-pop-preview" id="jt-pop-preview">${state.answer ? escHtml(state.answer) : 'Cliquez Générer pour créer une réponse IA'}</div>
      <div class="jt-pop-actions">
        <button class="jt-pop-btn jt-pop-generate" id="jt-pop-gen">${state.answer ? '↺ Regénérer' : '⚡ Générer'}</button>
        <button class="jt-pop-btn jt-pop-inject" id="jt-pop-inject" ${state.answer ? '' : 'disabled'}>↓ Injecter</button>
      </div>
      <div class="jt-pop-status" id="jt-pop-status"></div>
    `}
  `

  document.body.appendChild(popover)
  positionNearField(btn, popover)

  popover.querySelector('.jt-pop-close').addEventListener('click', () => { popover.remove(); activePopover = null })

  if (identVal !== null) {
    popover.querySelector('#jt-pop-inject').addEventListener('click', () => {
      injectAnswer(field.el, identVal)
      highlightField(field.el, 'success')
      btn.textContent = '✓'
      btn.classList.add('jt-done')
      popover.remove(); activePopover = null
    })
    return
  }

  // AI generate
  const genBtn = popover.querySelector('#jt-pop-gen')
  const injectBtn = popover.querySelector('#jt-pop-inject')
  const preview = popover.querySelector('#jt-pop-preview')
  const status = popover.querySelector('#jt-pop-status')

  genBtn.addEventListener('click', async () => {
    genBtn.disabled = true
    genBtn.textContent = '⏳ Génération…'
    status.textContent = 'Appel à Claude AI…'
    status.className = 'jt-pop-status'

    try {
      const jdText = await getJD()
      const jobContext = [
        `Entreprise: ${jobInfo.company}`,
        `Poste: ${jobInfo.position}`,
        jdText ? `Description:\n${jdText.slice(0, 3500)}` : ''
      ].filter(Boolean).join('\n')

      const response = await browser.runtime.sendMessage({
        type: 'AUTOFILL_REQUEST',
        fields: [{ label: field.label, type: field.type, maxLength: field.maxLength, placeholder: field.placeholder }],
        jobContext
      })

      if (response.error) throw new Error(response.error)
      const text = response.answers?.[0]?.text || ''
      if (!text) throw new Error('Réponse vide')

      state.answer = text
      fieldState.set(field.el, state)
      preview.textContent = text
      injectBtn.disabled = false
      genBtn.textContent = '↺ Regénérer'
      genBtn.disabled = false
      status.textContent = '✓ Généré'
      status.className = 'jt-pop-status ok'
    } catch (e) {
      status.textContent = 'Erreur : ' + e.message.slice(0, 60)
      status.className = 'jt-pop-status err'
      genBtn.textContent = '⚡ Réessayer'
      genBtn.disabled = false
    }
  })

  injectBtn.addEventListener('click', () => {
    const text = fieldState.get(field.el)?.answer || ''
    if (!text) return
    injectAnswer(field.el, text)
    highlightField(field.el, 'success')
    btn.textContent = '✓'
    btn.classList.add('jt-done')
    status.textContent = '✓ Injecté'
    status.className = 'jt-pop-status ok'
    setTimeout(() => { popover.remove(); activePopover = null }, 800)
  })

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function onOutside(e) {
      if (!popover.contains(e.target) && e.target !== btn) {
        popover.remove(); activePopover = null
        document.removeEventListener('click', onOutside)
      }
    })
  }, 0)
}

let jtOverlay = null

function getOverlay() {
  if (jtOverlay && document.contains(jtOverlay)) return jtOverlay
  jtOverlay = document.createElement('div')
  jtOverlay.id = 'jt-overlay'
  jtOverlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden;'
  document.body.appendChild(jtOverlay)
  return jtOverlay
}

function placeFieldButton(field) {
  if (fieldState.has(field.el) && document.contains(fieldState.get(field.el).btn)) return

  const btn = document.createElement('button')
  btn.className = 'jt-field-btn'
  btn.textContent = '✦'
  btn.title = 'JobTrackr Autofill'
  getOverlay().appendChild(btn)

  fieldState.set(field.el, { btn, answer: null })

  // Position loop — runs every frame, keeps button glued to field
  let frameCount = 0
  function tick() {
    if (!document.contains(field.el) || !document.contains(btn)) {
      if (frameCount < 5) console.log('[JT] tick bail — el in doc:', document.contains(field.el), 'btn in doc:', document.contains(btn))
      return
    }
    const rect = field.el.getBoundingClientRect()
    if (frameCount < 5) console.log('[JT] tick rect:', rect.width, rect.height, rect.top, rect.left, 'label:', field.label?.slice(0,30))
    frameCount++
    if (rect.width > 0 && rect.height > 0) {
      btn.style.display = 'block'
      btn.style.top = (rect.bottom - 28) + 'px'
      btn.style.left = (rect.right - 28) + 'px'
    } else {
      btn.style.display = 'none'
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  btn.addEventListener('click', e => {
    e.stopPropagation()
    e.preventDefault()
    openFieldPopover(field, btn)
  })
}

// ── 2.4 Init + MutationObserver ───────────────────────────────────────────────

let scanTimer = null

function scanAndPlaceButtons() {
  const fields = detectFormFields()
  console.log('[JT] scanAndPlaceButtons — fields detected:', fields.length, fields.map(f => f.label))
  fields.forEach(f => placeFieldButton(f))
}

function initAutofill() {
  injectStyles()
  scanAndPlaceButtons()

  const observer = new MutationObserver(() => {
    clearTimeout(scanTimer)
    scanTimer = setTimeout(scanAndPlaceButtons, 350)
  })
  observer.observe(document.body, { childList: true, subtree: true })

}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 : Message listener (existant + nouveau AUTOFILL_REQUEST)
// ─────────────────────────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'GET_JOB_INFO') {
    return Promise.resolve(extractJobInfo())
  }
  if (msg.type === 'GET_PAGE_TEXT') {
    return Promise.resolve({ text: getFullPageText() })
  }
  // Déclencher l'autofill depuis le popup
  if (msg.type === 'TRIGGER_AUTOFILL') {
    scanAndPlaceButtons()
    return Promise.resolve({ fieldsCount: fieldState.size })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 : Request JD from storage (via custom events)
// The app sends 'jobtrackr-jd-request' event with jdKey, we respond with data
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('jobtrackr-jd-request', async (e) => {
  const jdKey = e.detail?.jdKey
  if (!jdKey) return
  try {
    const result = await browser.runtime.sendMessage({ type: 'LOAD_JD', key: jdKey })
    // Serialize as JSON string to avoid cross-origin security errors
    window.dispatchEvent(new CustomEvent('jobtrackr-jd-response', { detail: JSON.stringify({ jdKey, text: result?.text || '' }) }))
  } catch (err) {
    window.dispatchEvent(new CustomEvent('jobtrackr-jd-response', { detail: JSON.stringify({ jdKey, text: '', error: err.message }) }))
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 : Boot
// ─────────────────────────────────────────────────────────────────────────────

// Attendre que le DOM soit stable avant de scanner les champs
// Expose flag on window so page console can verify script is loaded
window.__jtLoaded = true

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAutofill)
} else {
  setTimeout(initAutofill, 800)
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 : Auto-detect apply button clicks → confirm + add to JobTrackr
// ─────────────────────────────────────────────────────────────────────────────

const APPLY_PATTERNS = /^(apply|postuler|j'envoie|envoyer ma candidature|submit.*application|send.*application|submit|envoyer|candidater|je postule|i'm in|apply now|soumettre)/i

function isApplyButton(el) {
  if (!el) return false
  const tag = el.tagName?.toLowerCase()
  if (!['button', 'a', 'input'].includes(tag)) return false
  const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim()
  return APPLY_PATTERNS.test(text)
}

function findApplyAncestor(el) {
  let node = el
  for (let i = 0; i < 6; i++) {
    if (!node) return null
    if (isApplyButton(node)) return node
    node = node.parentElement
  }
  return null
}

let confirmationShown = false

function showApplyConfirmation(jobInfo) {
  if (confirmationShown) return
  confirmationShown = true

  const overlay = document.createElement('div')
  overlay.id = 'jt-apply-overlay'

  overlay.innerHTML = `
    <div id="jt-apply-modal">
      <div class="jt-apply-header">
        <span class="jt-apply-icon">✦</span>
        <span class="jt-apply-title">Ajouter à JobTrackr ?</span>
        <button class="jt-apply-close" id="jt-apply-dismiss">✕</button>
      </div>
      <div class="jt-apply-body">
        <div class="jt-apply-row">
          <label class="jt-apply-label">Entreprise</label>
          <input class="jt-apply-input" id="jt-apply-company" value="${escHtml(jobInfo.company)}" placeholder="Entreprise" />
        </div>
        <div class="jt-apply-row">
          <label class="jt-apply-label">Poste</label>
          <input class="jt-apply-input" id="jt-apply-position" value="${escHtml(jobInfo.position)}" placeholder="Titre du poste" />
        </div>
        <div class="jt-apply-row">
          <label class="jt-apply-label">Statut</label>
          <select class="jt-apply-input" id="jt-apply-status">
            <option value="sent" selected>Envoyée</option>
            <option value="todo">À envoyer</option>
            <option value="reviewing">En cours de review</option>
            <option value="interview">Entretien</option>
          </select>
        </div>
      </div>
      <div class="jt-apply-actions">
        <button class="jt-apply-btn-secondary" id="jt-apply-cancel">Ignorer</button>
        <button class="jt-apply-btn-primary" id="jt-apply-confirm">✓ Ajouter</button>
      </div>
    </div>
  `

  // Styles
  const style = document.createElement('style')
  style.id = 'jt-apply-styles'
  style.textContent = `
    #jt-apply-overlay {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      animation: jt-fadein 0.15s ease;
    }
    @keyframes jt-fadein { from { opacity:0 } to { opacity:1 } }
    #jt-apply-modal {
      background: #fff; border-radius: 16px; width: 340px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.22);
      overflow: hidden;
    }
    .jt-apply-header {
      display: flex; align-items: center; gap: 8px;
      padding: 14px 16px; background: #18181b; color: #fff;
    }
    .jt-apply-icon { color: #a78bfa; font-size: 15px; }
    .jt-apply-title { flex: 1; font-weight: 600; font-size: 14px; }
    .jt-apply-close {
      background: none; border: none; color: #9ca3af;
      font-size: 16px; cursor: pointer; padding: 0 2px; line-height: 1;
    }
    .jt-apply-close:hover { color: #fff; }
    .jt-apply-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
    .jt-apply-row { display: flex; flex-direction: column; gap: 3px; }
    .jt-apply-label { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
    .jt-apply-input {
      padding: 7px 10px; border: 1px solid #e5e7eb; border-radius: 8px;
      font-size: 13px; color: #111827; outline: none;
      font-family: inherit; width: 100%; box-sizing: border-box;
      transition: border-color 0.15s;
    }
    .jt-apply-input:focus { border-color: #a78bfa; box-shadow: 0 0 0 2px rgba(167,139,250,0.15); }
    .jt-apply-actions {
      display: flex; gap: 8px; padding: 10px 16px 14px;
      border-top: 1px solid #f3f4f6; background: #f9fafb;
    }
    .jt-apply-btn-primary, .jt-apply-btn-secondary {
      flex: 1; padding: 9px 12px; border-radius: 10px;
      font-size: 13px; font-weight: 600; cursor: pointer; border: none;
      transition: opacity 0.15s;
    }
    .jt-apply-btn-primary { background: #18181b; color: #fff; }
    .jt-apply-btn-primary:hover { opacity: 0.85; }
    .jt-apply-btn-secondary { background: #fff; color: #6b7280; border: 1px solid #e5e7eb; }
    .jt-apply-btn-secondary:hover { background: #f3f4f6; }
  `
  document.head.appendChild(style)
  document.body.appendChild(overlay)

  function dismiss() {
    overlay.remove()
    style.remove()
    confirmationShown = false
  }

  document.getElementById('jt-apply-dismiss').addEventListener('click', dismiss)
  document.getElementById('jt-apply-cancel').addEventListener('click', dismiss)
  overlay.addEventListener('click', e => { if (e.target === overlay) dismiss() })

  document.getElementById('jt-apply-confirm').addEventListener('click', async () => {
    const company = document.getElementById('jt-apply-company').value.trim()
    const position = document.getElementById('jt-apply-position').value.trim()
    const status = document.getElementById('jt-apply-status').value
    if (!company && !position) { dismiss(); return }

    const btn = document.getElementById('jt-apply-confirm')
    btn.textContent = '⏳ Ajout…'
    btn.disabled = true

    try {
      const r = await browser.runtime.sendMessage({ type: 'GET_APP_URL' })
      const appUrl = r?.appUrl || 'https://jobtracking-three.vercel.app'

      // Store full JD in extension storage instead of URL
      const jdKey = `jd-${Date.now()}`
      await browser.runtime.sendMessage({
        type: 'SAVE_JD',
        key: jdKey,
        text: jobInfo.description || ''
      })

      const params = new URLSearchParams({
        add: '1', company, position, status,
        date: new Date().toISOString().split('T')[0],
        url: jobInfo.url || window.location.href,
        jdKey: jdKey  // Pass storage key instead of full JD
      })
      window.open(`${appUrl}?${params.toString()}`, '_blank')
      btn.textContent = '✓ Ajouté !'
      setTimeout(dismiss, 1000)
    } catch (e) {
      btn.textContent = '✗ Erreur'
      btn.disabled = false
    }
  })
}

// Listen for clicks on the page — intercept apply buttons
document.addEventListener('click', e => {
  const applyBtn = findApplyAncestor(e.target)
  if (!applyBtn) return
  // Small delay to let the page's own handler run first, then show ours
  setTimeout(() => {
    const jobInfo = extractJobInfo()
    showApplyConfirmation(jobInfo)
  }, 400)
}, true) // capture phase so we fire even if page stops propagation

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 : Extension detection ping/pong
// JobTrackr web app sends 'jobtrackr-ext-ping', we respond with 'jobtrackr-ext-pong'
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('jobtrackr-ext-ping', () => {
  window.dispatchEvent(new CustomEvent('jobtrackr-ext-pong'))
})
// Also set the attribute immediately for faster detection
document.documentElement.setAttribute('data-jobtrackr-ext', 'true')
