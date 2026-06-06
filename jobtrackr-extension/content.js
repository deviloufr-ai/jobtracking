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
  return text.replace(/\s{3,}/g, '\n\n').trim().slice(0, 8000)
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
    description: description.slice(0, 6000),
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
// SECTION 2 : AUTOFILL — Détection des champs + UI + injection
// ─────────────────────────────────────────────────────────────────────────────

// ── 2.1 Détection des champs de formulaire ────────────────────────────────────
function detectFormFields() {
  const fields = []

  // Cible : textarea et input[type=text/email] avec un label associé
  const candidates = [
    ...document.querySelectorAll('textarea'),
    ...document.querySelectorAll('input[type="text"], input[type="email"], input[type="url"], input[type="tel"]')
  ]

  for (const el of candidates) {
    // Ignorer les champs cachés, désactivés, déjà remplis (> 20 chars)
    if (el.offsetParent === null) continue
    if (el.disabled || el.readOnly) continue
    if ((el.value || '').length > 20) continue
    // Ignorer les éléments appartenant à l'UI de l'extension
    if (el.closest('#jt-autofill-panel, #jt-autofill-btn')) continue

    const label = resolveLabel(el)
    if (!label) continue  // on ignore les champs sans label (ex: barre de recherche)

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

// ── 2.3 UI : bouton flottant "✦ Autofill" ─────────────────────────────────────
let autofillButton = null
let autofillPanel = null
let detectedFields = []

function getModalContainer() {
  // If detected fields live inside a modal/dialog, inject UI there to avoid z-index issues
  if (detectedFields.length > 0) {
    const modal = detectedFields[0].el.closest(
      '[role="dialog"], dialog, .artdeco-modal, [class*="jobs-easy-apply-modal"], [class*="modal__content"], [class*="overlay-container"]'
    )
    if (modal) return modal
  }
  return document.body
}

function createAutofillButton() {
  if (autofillButton) return
  detectedFields = detectFormFields()
  if (detectedFields.length === 0) return

  const container = getModalContainer()
  const insideModal = container !== document.body

  autofillButton = document.createElement('div')
  autofillButton.id = 'jt-autofill-btn'
  if (insideModal) {
    // Inside modal: use sticky positioning at the bottom of the scroll container
    autofillButton.style.cssText = 'position:sticky;bottom:16px;z-index:9999;margin:8px 16px 0;display:inline-flex;align-items:center;gap:7px;padding:8px 14px;background:#18181b;color:#fff;border-radius:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;font-weight:500;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.3);'
    container.appendChild(autofillButton)
  } else {
    container.appendChild(autofillButton)
  }
  autofillButton.innerHTML = `
    <span class="jt-icon">✦</span>
    <span class="jt-label">Autofill (${detectedFields.length} champ${detectedFields.length > 1 ? 's' : ''})</span>
  `
  autofillButton.addEventListener('click', openAutofillPanel)
}

async function openAutofillPanel() {
  if (autofillPanel) {
    autofillPanel.remove()
    autofillPanel = null
    return
  }

  autofillPanel = document.createElement('div')
  autofillPanel.id = 'jt-autofill-panel'

  const jobInfo = extractJobInfo()
  const IDENTITY_VALUES = {
    name: 'Alexandre Leblanc',
    firstname: 'Alexandre',
    lastname: 'Leblanc',
    email: 'deviloufr@gmail.com',
    linkedin: 'https://www.linkedin.com/in/devilalex/',
    phone: '0744723658'
  }

  const fieldsHtml = detectedFields.map((f, i) => {
    const identVal = f.identityKey && IDENTITY_VALUES[f.identityKey] !== undefined ? IDENTITY_VALUES[f.identityKey] : null
    if (identVal !== null) {
      const isEmpty = identVal === ''
      return `
    <div class="jt-field jt-field-identity" data-index="${i}">
      <label class="jt-field-check">
        <input type="checkbox" class="jt-chk" data-index="${i}" checked />
        <span class="jt-field-label">${escHtml(f.label.slice(0, 72))}</span>
      </label>
      ${isEmpty
        ? `<input type="text" class="jt-identity-edit" id="jt-preview-${i}" data-answer="" placeholder="À remplir…" style="grid-column:1;padding-left:22px;font-size:11.5px;border:1px solid #e5e7eb;border-radius:6px;padding:4px 8px;color:#374151;width:100%;box-sizing:border-box" />`
        : `<div class="jt-field-preview jt-identity-val" id="jt-preview-${i}" data-answer="${escHtml(identVal)}">${escHtml(identVal)}</div>`
      }
      <button class="jt-inject-btn" data-index="${i}"${isEmpty ? ' disabled' : ''}>Injecter</button>
    </div>`
    }
    return `
    <div class="jt-field" data-index="${i}">
      <label class="jt-field-check">
        <input type="checkbox" class="jt-chk" data-index="${i}" checked />
        <span class="jt-field-label">${escHtml(f.label.slice(0, 72))}${f.label.length > 72 ? '…' : ''}</span>
      </label>
      <div class="jt-field-preview" id="jt-preview-${i}">En attente…</div>
      <button class="jt-inject-btn" data-index="${i}" disabled>Injecter</button>
    </div>`
  }).join('')

  autofillPanel.innerHTML = `
    <div class="jt-panel-header">
      <span class="jt-panel-title">✦ JobTrackr Autofill</span>
      <button class="jt-close-btn" id="jt-close">✕</button>
    </div>
    <div class="jt-context">
      <strong>${escHtml(jobInfo.company || 'Entreprise inconnue')}</strong> — ${escHtml(jobInfo.position || 'Poste inconnu')}
    </div>
    <div class="jt-select-row">
      <label class="jt-select-all-label">
        <input type="checkbox" id="jt-chk-all" checked /> Tout sélectionner
      </label>
    </div>
    <div class="jt-fields-list">${fieldsHtml}</div>
    <div class="jt-jd-section">
      <div class="jt-jd-header">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="jt-jd-label">Description du poste</span>
          <button class="jt-jd-scan-btn" id="jt-jd-scan" style="display:none">↺ Scanner</button>
        </div>
        <div style="display:flex;align-items:center;gap:5px">
          <span class="jt-jd-status" id="jt-jd-status">Chargement…</span>
          <button class="jt-jd-clear-btn" id="jt-jd-clear" title="Vider">✕</button>
        </div>
      </div>
      <textarea id="jt-extra-ctx" class="jt-jd-textarea" placeholder="La description du poste sera chargée automatiquement. Tu peux la modifier ou la remplacer." rows="4"></textarea>
    </div>
    <div class="jt-actions">
      <button class="jt-btn-primary" id="jt-generate-all">⚡ Générer la sélection</button>
      <button class="jt-btn-secondary" id="jt-inject-all" disabled>↓ Tout injecter</button>
    </div>
    <div class="jt-status" id="jt-status"></div>
  `

  document.body.appendChild(autofillPanel)

  // ── Auto-fetch JD from page ──────────────────────────────────────────────
  const jdStatusEl = document.getElementById('jt-jd-status')
  const jdTextarea = document.getElementById('jt-extra-ctx')

  // Storage key = normalized job URL (strip /apply*, query, hash)
  // Ashby: app.ashbyhq.com/company/jobs/UUID  (same URL, tab switch is JS-only)
  // Greenhouse: boards.greenhouse.io/co/jobs/ID
  // Lever: jobs.lever.co/co/UUID
  const rawPath = window.location.pathname
    .replace(/\/(apply|application|form|candidature|submit)(\/.*)$/i, '')
    .replace(/\/+$/, '')
  const jdKey = 'jd:' + window.location.hostname + rawPath

  function saveJD(text) {
    if (text && text.length > 80) {
      browser.runtime.sendMessage({ type: 'SAVE_JD', key: jdKey, text })
    }
  }

  // Auto-save when user edits
  jdTextarea.addEventListener('input', () => {
    const len = jdTextarea.value.trim().length
    jdStatusEl.textContent = len > 0 ? `${len} car.` : 'Vide'
    jdStatusEl.className = 'jt-jd-status ' + (len > 80 ? 'ok' : 'empty')
    saveJD(jdTextarea.value.trim())
  })

  function setJD(text, label, type) {
    jdTextarea.value = text
    jdStatusEl.textContent = label
    jdStatusEl.className = 'jt-jd-status ' + type
    saveJD(text)
  }

  console.log('[JobTrackr] jdKey:', jdKey)

  // 1. Check storage first (JD from another tab on same job)
  let storedJD = null
  try {
    const r = await Promise.race([
      browser.runtime.sendMessage({ type: 'LOAD_JD', key: jdKey }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))
    ])
    storedJD = r?.text || ''
    console.log('[JobTrackr] stored JD length:', storedJD.length)
  } catch (e) {
    console.warn('[JobTrackr] storage lookup failed:', e.message)
  }

  if (storedJD && storedJD.length > 80) {
    setJD(storedJD, `${storedJD.length} car. — sauvegardé`, 'ok')
  } else {
    // 2. Try targeted selector (fast, clean)
    const targeted = getJobDescription()
    if (targeted && targeted.length > 80) {
      setJD(targeted.slice(0, 6000), `${targeted.length} car. — page actuelle`, 'ok')
    } else {
      // 3. Try full page text — but filter out form-heavy pages
      // Count form fields: if many inputs/textareas → likely a form page, skip
      const formFieldCount = document.querySelectorAll('textarea, input[type="text"], input[type="email"]').length
      const isFormHeavy = formFieldCount >= 3
      if (!isFormHeavy) {
        const pageText = getFullPageText()
        if (pageText && pageText.length > 80) {
          setJD(pageText.slice(0, 4000), 'Page entière — à nettoyer si besoin', 'warn')
        } else {
          jdTextarea.value = ''
          jdStatusEl.textContent = 'Non détectée'
          jdStatusEl.className = 'jt-jd-status empty'
        }
      } else {
        // Form page with no stored JD — offer manual scan anyway
        jdTextarea.value = ''
        jdStatusEl.textContent = 'Non trouvée'
        jdStatusEl.className = 'jt-jd-status empty'
        document.getElementById('jt-jd-scan').style.display = 'inline-block'
      }
    }
  }

  // Manual scan button (shown when auto-detection fails on form pages)
  document.getElementById('jt-jd-scan').addEventListener('click', () => {
    const pageText = getFullPageText()
    if (pageText && pageText.length > 80) {
      setJD(pageText.slice(0, 4000), 'Page scannée manuellement', 'warn')
    }
    document.getElementById('jt-jd-scan').style.display = 'none'
  })

  // Clear button
  document.getElementById('jt-jd-clear').addEventListener('click', () => {
    jdTextarea.value = ''
    jdStatusEl.textContent = 'Vidé — colle manuellement'
    jdStatusEl.className = 'jt-jd-status empty'
    browser.runtime.sendMessage({ type: 'SAVE_JD', key: jdKey, text: '' })
  })

  // Wire editable identity fields (e.g. empty phone)
  autofillPanel.querySelectorAll('.jt-identity-edit').forEach(input => {
    input.addEventListener('input', () => {
      input.dataset.answer = input.value
      const idx = input.id.replace('jt-preview-', '')
      const btn = autofillPanel.querySelector(`.jt-inject-btn[data-index="${idx}"]`)
      if (btn) btn.disabled = !input.value.trim()
    })
  })

  document.getElementById('jt-close').addEventListener('click', () => {
    autofillPanel.remove()
    autofillPanel = null
  })

  // Select-all checkbox
  document.getElementById('jt-chk-all').addEventListener('change', (e) => {
    autofillPanel.querySelectorAll('.jt-chk').forEach(chk => { chk.checked = e.target.checked })
  })
  autofillPanel.addEventListener('change', (e) => {
    if (!e.target.classList.contains('jt-chk')) return
    const all = [...autofillPanel.querySelectorAll('.jt-chk')]
    document.getElementById('jt-chk-all').checked = all.every(c => c.checked)
    document.getElementById('jt-chk-all').indeterminate = !all.every(c => c.checked) && all.some(c => c.checked)
  })

  // Update jd status when user edits
  jdTextarea.addEventListener('input', () => {
    const len = jdTextarea.value.trim().length
    jdStatusEl.textContent = len > 0 ? `${len} car.` : 'Vide'
    jdStatusEl.className = 'jt-jd-status ' + (len > 80 ? 'ok' : 'empty')
  })

  document.getElementById('jt-generate-all').addEventListener('click', () => generateAll(jobInfo))
  document.getElementById('jt-inject-all').addEventListener('click', injectAll)

  autofillPanel.querySelectorAll('.jt-inject-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index)
      const preview = document.getElementById(`jt-preview-${idx}`)
      const text = preview.dataset.answer || ''
      if (text) {
        injectAnswer(detectedFields[idx].el, text)
        highlightField(detectedFields[idx].el, 'success')
        btn.textContent = '✓ Injecté'
        setTimeout(() => { btn.textContent = 'Injecter' }, 1500)
      }
    })
  })
}

// ── 2.4 Génération via background.js (qui appelle Claude) ────────────────────
async function generateAll(jobInfo) {
  const btn = document.getElementById('jt-generate-all')
  const injectAllBtn = document.getElementById('jt-inject-all')
  const status = document.getElementById('jt-status')

  btn.disabled = true
  btn.textContent = '⏳ Génération en cours…'
  setStatus('Appel à Claude AI…', 'loading')

  // Only generate for checked non-identity fields (identity fields are pre-filled)
  const checkedIndexes = [...autofillPanel.querySelectorAll('.jt-chk:checked')].map(c => parseInt(c.dataset.index))
  const fieldsData = detectedFields
    .filter((f, i) => checkedIndexes.includes(i) && !f.identityKey)
    .map(f => {
      const origIdx = detectedFields.indexOf(f)
      return { label: f.label, type: f.type, maxLength: f.maxLength, placeholder: f.placeholder, _origIdx: origIdx }
    })

  if (fieldsData.length === 0) {
    setStatus('Aucun champ à générer (que des champs identité)', 'loading')
    btn.disabled = false
    btn.textContent = '⚡ Générer la sélection'
    return
  }

  const jdText = document.getElementById('jt-extra-ctx')?.value?.trim() || ''
  const jobContext = [
    `Entreprise: ${jobInfo.company}`,
    `Poste: ${jobInfo.position}`,
    jdText
      ? `Description du poste (source: page ou collée par l'utilisateur):\n${jdText.slice(0, 3500)}`
      : '(pas de description disponible — génère des réponses génériques PM senior)'
  ].filter(Boolean).join('\n')

  try {
    const response = await browser.runtime.sendMessage({
      type: 'AUTOFILL_REQUEST',
      fields: fieldsData,
      jobContext
    })

    if (response.error) {
      setStatus(`Erreur : ${response.error}`, 'error')
      btn.disabled = false
      btn.textContent = '⚡ Réessayer'
      return
    }

    // Remplir les previews — remap fieldIndex (index dans subset) → origIdx
    let allReady = true
    for (const answer of (response.answers || [])) {
      const { fieldIndex, text } = answer
      const origIdx = fieldsData[fieldIndex]?._origIdx ?? fieldIndex
      const preview = document.getElementById(`jt-preview-${origIdx}`)
      const injectBtn = autofillPanel.querySelector(`.jt-inject-btn[data-index="${origIdx}"]`)
      if (preview && text) {
        preview.textContent = text
        preview.dataset.answer = text
        if (injectBtn) injectBtn.disabled = false
      } else {
        allReady = false
      }
    }

    setStatus(`${response.answers?.length || 0} réponse(s) générée(s) ✓`, 'success')
    btn.textContent = '⚡ Regénérer'
    btn.disabled = false
    injectAllBtn.disabled = false

  } catch (err) {
    setStatus(`Erreur de communication : ${err.message}`, 'error')
    btn.disabled = false
    btn.textContent = '⚡ Réessayer'
  }
}

function injectAll() {
  let count = 0
  detectedFields.forEach((field, idx) => {
    const preview = document.getElementById(`jt-preview-${idx}`)
    const text = preview?.dataset.answer || ''
    if (text) {
      injectAnswer(field.el, text)
      highlightField(field.el, 'success')
      const btn = autofillPanel.querySelector(`.jt-inject-btn[data-index="${idx}"]`)
      if (btn) {
        btn.textContent = '✓ Injecté'
        setTimeout(() => { btn.textContent = 'Injecter' }, 1500)
      }
      count++
    }
  })
  setStatus(`${count} champ(s) injecté(s) — tu peux réinjecter ✓`, 'success')
}

// ── 2.5 Helpers UI ─────────────────────────────────────────────────────────────
function setStatus(msg, type = 'info') {
  const el = document.getElementById('jt-status')
  if (!el) return
  el.textContent = msg
  el.className = `jt-status jt-status-${type}`
}

function highlightField(el, type) {
  el.style.transition = 'box-shadow 0.3s, border-color 0.3s'
  el.style.boxShadow = type === 'success' ? '0 0 0 3px rgba(34,197,94,0.4)' : '0 0 0 3px rgba(239,68,68,0.4)'
  el.style.borderColor = type === 'success' ? '#22c55e' : '#ef4444'
  setTimeout(() => {
    el.style.boxShadow = ''
    el.style.borderColor = ''
  }, 2500)
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── 2.6 Styles injectés ────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('jt-autofill-styles')) return
  const style = document.createElement('style')
  style.id = 'jt-autofill-styles'
  style.textContent = `
    #jt-autofill-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 10px 16px;
      background: #18181b;
      color: #fff;
      border-radius: 24px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 4px 24px rgba(0,0,0,0.22), 0 1px 4px rgba(0,0,0,0.12);
      transition: transform 0.15s, box-shadow 0.15s;
      user-select: none;
    }
    #jt-autofill-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.14);
    }
    #jt-autofill-btn .jt-icon { font-size: 15px; color: #a78bfa; }

    #jt-autofill-panel {
      position: fixed;
      bottom: 76px;
      right: 24px;
      z-index: 2147483645;
      width: 380px;
      max-height: 540px;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 8px 48px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #18181b;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      border: 1px solid #e5e7eb;
    }

    .jt-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: #18181b;
      color: #fff;
    }
    .jt-panel-title { font-weight: 600; font-size: 14px; letter-spacing: 0.01em; }
    .jt-close-btn {
      background: none;
      border: none;
      color: #9ca3af;
      font-size: 16px;
      cursor: pointer;
      padding: 0 2px;
      line-height: 1;
    }
    .jt-close-btn:hover { color: #fff; }

    .jt-context {
      padding: 10px 16px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .jt-context strong { color: #18181b; }

    .jt-select-row {
      padding: 8px 16px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }
    .jt-select-all-label {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      font-weight: 500;
      color: #374151;
      cursor: pointer;
      user-select: none;
    }
    .jt-select-all-label input { cursor: pointer; accent-color: #18181b; width: 14px; height: 14px; }
    .jt-fields-list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }
    .jt-field {
      padding: 10px 16px;
      border-bottom: 1px solid #f3f4f6;
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-rows: auto auto;
      gap: 5px 10px;
      align-items: start;
    }
    .jt-field:last-child { border-bottom: none; }
    .jt-field-check {
      grid-column: 1;
      grid-row: 1;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      cursor: pointer;
      padding-top: 1px;
    }
    .jt-field-check input { cursor: pointer; accent-color: #18181b; flex-shrink: 0; width: 14px; height: 14px; margin-top: 1px; }
    .jt-field-label {
      font-weight: 500;
      font-size: 12px;
      color: #111827;
      line-height: 1.4;
    }
    .jt-field-preview {
      grid-column: 1;
      grid-row: 2;
      font-size: 11.5px;
      color: #6b7280;
      line-height: 1.55;
      max-height: 60px;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      padding-left: 22px;
    }
    .jt-inject-btn {
      grid-column: 2;
      grid-row: 1 / 3;
      align-self: center;
      padding: 5px 11px;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
      min-width: 62px;
      text-align: center;
    }
    .jt-inject-btn:hover { background: #e5e7eb; }
    .jt-field-identity { background: #fafafa; }
    .jt-identity-val {
      color: #374151;
      font-weight: 500;
      padding-left: 22px;
      font-size: 11.5px;
    }

    .jt-jd-section {
      padding: 8px 16px 6px;
      border-top: 1px solid #e5e7eb;
      background: #fafafa;
    }
    .jt-jd-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 5px;
    }
    .jt-jd-label {
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .jt-jd-status {
      font-size: 10px;
      font-weight: 500;
      padding: 2px 7px;
      border-radius: 10px;
    }
    .jt-jd-status.ok    { background: #dcfce7; color: #16a34a; }
    .jt-jd-status.warn  { background: #fef3c7; color: #92400e; }
    .jt-jd-status.empty { background: #f3f4f6; color: #9ca3af; }
    .jt-jd-textarea {
      width: 100%;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 7px 10px;
      font-size: 11px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #374151;
      resize: vertical;
      outline: none;
      line-height: 1.5;
      box-sizing: border-box;
      background: #fff;
      transition: border-color 0.15s;
      min-height: 72px;
    }
    .jt-jd-textarea:focus {
      border-color: #a78bfa;
      box-shadow: 0 0 0 2px rgba(167,139,250,0.12);
    }
    .jt-jd-textarea::placeholder { color: #c4c4c4; font-style: italic; }
    .jt-jd-clear-btn {
      background: none;
      border: none;
      font-size: 10px;
      color: #9ca3af;
      cursor: pointer;
      padding: 1px 3px;
      border-radius: 4px;
      line-height: 1;
    }
    .jt-jd-clear-btn:hover { background: #f3f4f6; color: #6b7280; }
    .jt-jd-scan-btn {
      background: none;
      border: 1px solid #d1d5db;
      font-size: 10px;
      color: #6b7280;
      cursor: pointer;
      padding: 2px 7px;
      border-radius: 10px;
      font-weight: 500;
    }
    .jt-jd-scan-btn:hover { background: #f3f4f6; border-color: #9ca3af; }
    .jt-actions {
      display: flex;
      gap: 8px;
      padding: 8px 16px 12px;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }
    .jt-btn-primary, .jt-btn-secondary {
      flex: 1;
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: opacity 0.15s, transform 0.1s;
    }
    .jt-btn-primary { background: #18181b; color: #fff; }
    .jt-btn-primary:hover:not(:disabled) { opacity: 0.85; }
    .jt-btn-secondary {
      background: #fff;
      color: #18181b;
      border: 1px solid #d1d5db;
    }
    .jt-btn-secondary:hover:not(:disabled) { background: #f3f4f6; }
    .jt-btn-primary:disabled, .jt-btn-secondary:disabled { opacity: 0.4; cursor: default; }

    .jt-status {
      padding: 6px 16px 10px;
      font-size: 11px;
      min-height: 22px;
      background: #f9fafb;
    }
    .jt-status-loading { color: #6b7280; }
    .jt-status-success { color: #16a34a; }
    .jt-status-error   { color: #dc2626; }
  `
  document.head.appendChild(style)
}

// ── 2.7 Initialisation : observer les mutations DOM ──────────────────────────
// Les formulaires apparaissent souvent dynamiquement (React SPA, modales, etc.)
function initAutofill() {
  injectStyles()

  // Essai immédiat
  createAutofillButton()

  // Observer les mutations pour les formulaires qui apparaissent en différé
  const observer = new MutationObserver(() => {
    if (!autofillButton) {
      createAutofillButton()
    } else {
      // Refresh la liste si de nouveaux champs sont apparus
      const newFields = detectFormFields()
      if (newFields.length !== detectedFields.length) {
        detectedFields = newFields
        const label = autofillButton.querySelector('.jt-label')
        if (label) label.textContent = `Autofill (${detectedFields.length} champ${detectedFields.length > 1 ? 's' : ''})`
      }
    }
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
    if (!autofillButton) createAutofillButton()
    if (autofillButton && !autofillPanel) openAutofillPanel()
    return Promise.resolve({ fieldsCount: detectedFields.length })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 : Boot
// ─────────────────────────────────────────────────────────────────────────────

// Attendre que le DOM soit stable avant de scanner les champs
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAutofill)
} else {
  // Petit délai pour les SPA qui injectent le form après le DOMContentLoaded
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
      const params = new URLSearchParams({
        add: '1', company, position, status,
        date: new Date().toISOString().split('T')[0],
        url: jobInfo.url || window.location.href,
        jd: (jobInfo.description || '').slice(0, 2000)
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
