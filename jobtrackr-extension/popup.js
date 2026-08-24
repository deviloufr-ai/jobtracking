const DEFAULT_APP_URL = 'https://jobtracking-three.vercel.app'
let appUrl = DEFAULT_APP_URL
let userApiKey = ''  // Optional — only set if user added their own key (unlimited use)
let jobDescription = ''
let reviewedText = null  // Track if user has reviewed the extracted text
let showReviewNextAnalysis = true  // Show review modal for next AI analysis

// Ensure popup starts at top
window.scrollTo(0, 0)
document.documentElement.scrollTop = 0
document.body.scrollTop = 0

const loadingEl = document.getElementById('loading')
const loadingText = document.getElementById('loading-text')
const mainEl = document.getElementById('main')
const companyEl = document.getElementById('company')
const positionEl = document.getElementById('position')
const statusEl = document.getElementById('status')
const dateEl = document.getElementById('date')
const addBtn = document.getElementById('add-btn')
const sourceNameEl = document.getElementById('source-name')
const jdStatusEl = document.getElementById('jd-status')
const jdPreviewEl = document.getElementById('jd-preview')
const screenshotBtn = document.getElementById('screenshot-btn')
const screenshotIcon = document.getElementById('screenshot-icon')
const screenshotText = document.getElementById('screenshot-text')
const settingsPanel = document.getElementById('settings-panel')
const appUrlInput = document.getElementById('app-url')
const toastEl = document.getElementById('toast')

dateEl.value = new Date().toISOString().split('T')[0]

// Consolidate storage reads
browser.storage.local.get([
  'appUrl', 'autofillEnabled', 'autofillButtonsEnabled', 'rightclickEnabled',
  'userContext', 'apiKey'
]).then(data => {
  if (data.appUrl) { appUrl = data.appUrl; appUrlInput.value = appUrl }
  else appUrlInput.value = DEFAULT_APP_URL

  if (data.apiKey) userApiKey = data.apiKey

  if (data.autofillEnabled !== undefined) toggleAutofillMain.checked = data.autofillEnabled
  if (data.autofillButtonsEnabled !== undefined) toggleAutofillButtons.checked = data.autofillButtonsEnabled
  if (data.rightclickEnabled !== undefined) toggleRightclick.checked = data.rightclickEnabled

  if (data.userContext) document.getElementById('context-input').value = data.userContext
})

// Build a /api/claude request body. When the user has added their own key it's
// included → the proxy treats the call as unlimited. Otherwise the call uses the
// shared JobTrackr key (free trial, quota-capped per IP).
function claudeBody(payload) {
  return JSON.stringify(userApiKey ? { ...payload, apiKey: userApiKey } : payload)
}

// Cross-browser content-script injection for the self-heal path. MV3 (Chrome)
// uses scripting.executeScript and must inject the `browser` shim before
// content.js; MV2 (Firefox) uses tabs.executeScript and has `browser` natively.
async function injectContentScript(tabId) {
  if (browser.scripting?.executeScript) {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['browser-polyfill.js', 'content.js']
    })
  } else {
    await browser.tabs.executeScript(tabId, { file: 'content.js', allFrames: false })
  }
}

// Small stable hash for cache keys (djb2). Content-based so any change to the
// URL, CV or job description naturally misses the cache.
function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

document.getElementById('toggle-settings').addEventListener('click', () => {
  settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none'
})
document.getElementById('save-settings').addEventListener('click', () => {
  const url = appUrlInput.value.trim().replace(/\/$/, '')
  if (!url) {
    showToast('❌ URL ne peut pas être vide')
    return
  }

  try {
    new URL(url)
  } catch {
    showToast('❌ URL invalide')
    return
  }

  appUrl = url
  browser.storage.local.set({ appUrl: url })
  showToast('Sauvegardé ✓')
  settingsPanel.style.display = 'none'
})

function checkReady() {
  addBtn.disabled = !companyEl.value.trim() || !positionEl.value.trim()
}
companyEl.addEventListener('input', checkReady)
positionEl.addEventListener('input', checkReady)

// Update score section visibility
document.getElementById('score-btn').addEventListener('click', () => calculateJobScore(true))

// Screenshot + Claude Vision analysis
screenshotBtn.addEventListener('click', async () => {
  screenshotBtn.disabled = true
  screenshotIcon.textContent = '⏳'
  screenshotText.textContent = 'Extraction du texte...'

  try {
    // Get cleaned page text via content script
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]

    let pageText = ''
    try {
      const result = await Promise.race([
        browser.tabs.sendMessage(tab.id, { type: 'GET_CLEANED_TEXT' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ])
      pageText = result?.text || ''
    } catch {
      // Fallback: use tab title
      pageText = `Page: ${tab.title}\nURL: ${tab.url}`
    }

    // Show review modal if enabled and text is available
    if (showReviewNextAnalysis && pageText.length > 100) {
      await showTextReviewModal(pageText)
      pageText = reviewedText || pageText
    }

    screenshotText.textContent = 'Analyse IA en cours...'

    // Send full text to Claude with timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    let res
    try {
      res = await fetch(`${appUrl}/api/claude`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: claudeBody({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: `Analyse ce texte extrait d'une page web d'offre d'emploi. Extrait les informations clés. Réponds UNIQUEMENT en JSON valide sans backticks:
{"company": "nom de l'entreprise", "position": "titre exact du poste", "description": "résumé des compétences requises et missions en 100 mots max", "location": "ville ou remote si mentionné", "salary": "salaire si mentionné sinon null"}

Texte de la page:
${pageText.slice(0, 5000)}`
          }]
        }),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) throw new Error('Erreur API')
    const data = await res.json()
    const text = data.content?.[0]?.text || '{}'
    
    // Parse JSON
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    const parsed = JSON.parse(start !== -1 ? text.slice(start, end + 1) : '{}')

    // Fill form with extracted data
    if (parsed.company) companyEl.value = parsed.company
    if (parsed.position) positionEl.value = parsed.position
    if (parsed.description) {
      jobDescription = parsed.description + (parsed.location ? ` | Lieu: ${parsed.location}` : '') + (parsed.salary ? ` | Salaire: ${parsed.salary}` : '')
      jdStatusEl.textContent = `✓ Extraite par IA`
      jdStatusEl.className = 'jd-status found'
      jdPreviewEl.style.display = 'block'
      jdPreviewEl.textContent = jobDescription
      updateScoreSection()
    }

    screenshotIcon.textContent = '✅'
    screenshotText.textContent = 'Analyse terminée !'
    checkReady()
  } catch (e) {
    screenshotIcon.textContent = '❌'
    screenshotText.textContent = 'Erreur : ' + e.message.slice(0, 40)
    setTimeout(() => {
      screenshotIcon.textContent = '📸'
      screenshotText.textContent = 'Analyser toute la page avec l\'IA'
      screenshotBtn.disabled = false
    }, 2000)
    return
  }
  screenshotBtn.disabled = false
})

function parseFromTab(tab) {
  try {
    const url = tab.url || ''
    const title = tab.title || ''
    const hostname = new URL(url).hostname.replace('www.', '')
    if (hostname.includes('linkedin.com')) {
      const cleaned = title.replace(' | LinkedIn', '').trim()
      const pipeIdx = cleaned.lastIndexOf(' | ')
      const dashIdx = cleaned.lastIndexOf(' - ')
      let position = '', company = ''
      if (pipeIdx > dashIdx && pipeIdx > 0) {
        position = cleaned.substring(0, pipeIdx).trim()
        company = cleaned.substring(pipeIdx + 3).trim()
      } else if (dashIdx > 0) {
        position = cleaned.substring(0, dashIdx).trim()
        company = cleaned.substring(dashIdx + 3).trim()
      } else {
        position = cleaned
        company = ''
      }
      return { company, position, url, source: 'LinkedIn', description: '' }
    }
    if (hostname.includes('indeed.com')) {
      const cleaned = title.replace(/\s*[\|\-]\s*Indeed.*$/i, '')
      const parts = cleaned.split(' - ')
      return { company: parts[1]?.trim() || '', position: parts[0]?.trim() || '', url, source: 'Indeed', description: '' }
    }
    if (hostname.includes('welcometothejungle.com')) {
      const parts = title.split(' - ')
      return { company: parts[1]?.trim() || '', position: parts[0]?.trim() || '', url, source: 'WTTJ', description: '' }
    }
    // ATS boards (Greenhouse, Lever, Ashby, …): company is the first URL segment.
    const ATS_HOSTS = ['greenhouse.io', 'lever.co', 'ashbyhq.com', 'workable.com', 'recruitee.com', 'teamtailor.com', 'smartrecruiters.com', 'bamboohr.com', 'jobvite.com', 'icims.com', 'workday', 'breezy.hr', 'pinpointhq.com']
    if (ATS_HOSTS.some(h => hostname.includes(h))) {
      const seg = new URL(url).pathname.split('/').filter(Boolean)[0] || ''
      const company = /^(jobs?|careers?|postings?|embed|o|j|en|fr|us)$/i.test(seg) || /^\d+$/.test(seg) || seg.length > 40
        ? ''
        : seg.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
      // ATS <title> is unreliable; leave position blank rather than guess wrong.
      const cleanTitle = title.replace(/\s*[|\-–—]\s*(greenhouse|lever|ashby|workable|jobs?|careers?).*$/i, '').trim()
      const looksLikeCompany = cleanTitle && company && cleanTitle.toLowerCase() === company.toLowerCase()
      const source = hostname.includes('greenhouse') ? 'Greenhouse' : hostname.includes('lever.co') ? 'Lever' : hostname.includes('ashbyhq') ? 'Ashby' : (company || hostname.split('.')[0])
      return { company, position: looksLikeCompany ? '' : cleanTitle, url, source, description: '' }
    }
    const pipeIdx = title.lastIndexOf(' | ')
    const dashIdx = title.lastIndexOf(' - ')
    let position = ''
    if (pipeIdx > dashIdx && pipeIdx > 0) {
      position = title.substring(0, pipeIdx).trim()
    } else if (dashIdx > 0) {
      position = title.substring(0, dashIdx).trim()
    } else {
      position = title
    }
    return { company: '', position, url, source: hostname.split('.')[0], description: '' }
  } catch {
    return { company: '', position: '', url: '', source: 'Page web', description: '' }
  }
}

function showMain(jobInfo) {
  loadingEl.style.display = 'none'
  mainEl.style.display = 'block'
  companyEl.value = jobInfo.company || ''
  positionEl.value = jobInfo.position || ''
  sourceNameEl.textContent = jobInfo.source || 'Page web'
  mainEl.dataset.url = jobInfo.url || ''
  jobDescription = jobInfo.description || ''

  // Warn if critical fields are missing
  if (!jobInfo.company && !jobInfo.position) {
    const warning = document.createElement('div')
    warning.style.cssText = 'padding:10px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;margin-bottom:12px;font-size:12px;color:#92400e;'
    setHTML(warning, '⚠️ <strong>Extraction incomplète</strong> — Remplis les champs manuellement ou utilise "Analyser avec l\'IA"')
    mainEl.insertBefore(warning, mainEl.firstChild)
  }

  if (jobDescription.length > 50) {
    jdStatusEl.textContent = `✓ ${jobDescription.length} caractères`
    jdStatusEl.className = 'jd-status found'
    jdPreviewEl.style.display = 'block'
    jdPreviewEl.textContent = jobDescription.slice(0, 200) + (jobDescription.length > 200 ? '…' : '')
    updateScoreSection()
  }
  checkReady()
  if (!companyEl.value) companyEl.focus()
  else if (!positionEl.value) positionEl.focus()
  setupContextModal()
}

const KNOWN_HOSTS = ['linkedin.com', 'indeed.com', 'welcometothejungle.com', 'apec.fr', 'hellowork.com', 'pole-emploi.fr', 'monster.fr', 'glassdoor.com', 'cadremploi.fr', 'regionsjob.com', 'meteojob.com']

function isKnownJobSite(url) {
  try {
    const hostname = new URL(url).hostname
    return KNOWN_HOSTS.some(h => hostname.includes(h))
  } catch { return false }
}

function showTextReviewModal(text) {
  return new Promise((resolve) => {
    const modal = document.getElementById('review-modal')
    const textarea = document.getElementById('review-textarea')
    const closeBtn = document.getElementById('review-modal-close')
    const cancelBtn = document.getElementById('review-cancel')
    const confirmBtn = document.getElementById('review-confirm')

    // Populate textarea
    textarea.value = text
    textarea.focus()
    textarea.select()

    // Show modal
    modal.style.display = 'flex'

    function closeModal() {
      modal.style.display = 'none'
      closeBtn.removeEventListener('click', closeModal)
      cancelBtn.removeEventListener('click', handleCancel)
      confirmBtn.removeEventListener('click', handleConfirm)
      document.removeEventListener('click', handleOverlayClick)
    }

    function handleCancel() {
      reviewedText = null
      closeModal()
      resolve(false)
    }

    function handleConfirm() {
      reviewedText = textarea.value.trim()
      closeModal()
      resolve(true)
    }

    function handleOverlayClick(e) {
      if (e.target.id === 'review-modal') {
        handleCancel()
      }
    }

    closeBtn.addEventListener('click', handleCancel)
    cancelBtn.addEventListener('click', handleCancel)
    confirmBtn.addEventListener('click', handleConfirm)
    document.addEventListener('click', handleOverlayClick)
  })
}

async function autoAnalyzeWithAI(tab) {
  loadingText.textContent = 'Extraction du texte…'
  let pageText = ''
  try {
    const result = await Promise.race([
      browser.tabs.sendMessage(tab.id, { type: 'GET_CLEANED_TEXT' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ])
    pageText = result?.text || ''
  } catch {
    pageText = `Page: ${tab.title}\nURL: ${tab.url}`
  }

  // Show review modal
  if (showReviewNextAnalysis && pageText.length > 100) {
    await showTextReviewModal(pageText)
    pageText = reviewedText || pageText
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  let res
  try {
    res = await fetch(`${appUrl}/api/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: claudeBody({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `Analyse ce texte extrait d'une page web d'offre d'emploi. Extrait les informations clés. Réponds UNIQUEMENT en JSON valide sans backticks:
{"company": "nom de l'entreprise", "position": "titre exact du poste", "description": "résumé des compétences requises et missions en 100 mots max", "location": "ville ou remote si mentionné", "salary": "salaire si mentionné sinon null"}

Texte de la page:
${pageText.slice(0, 5000)}`
        }]
      }),
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) throw new Error('Erreur API')
  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  const parsed = JSON.parse(start !== -1 ? text.slice(start, end + 1) : '{}')

  const description = parsed.description
    ? parsed.description + (parsed.location ? ` | Lieu: ${parsed.location}` : '') + (parsed.salary ? ` | Salaire: ${parsed.salary}` : '')
    : ''

  // Update global jobDescription if we got a description
  if (description) {
    jobDescription = description
    updateScoreSection()
  }

  return {
    company: parsed.company || '',
    position: parsed.position || '',
    description,
    url: tab.url,
    source: new URL(tab.url).hostname.replace('www.', '').split('.')[0]
  }
}

// Ask the content script for job info. Returns null if the content script
// isn't there (e.g. tab was open before the extension was reloaded/updated —
// Firefox only injects content scripts into pages loaded afterwards).
async function requestJobInfo(tabId) {
  try {
    return await Promise.race([
      browser.tabs.sendMessage(tabId, { type: 'GET_JOB_INFO' }),
      // Give the content script room for the LinkedIn guest-API lookup (async) that
      // resolves the real job on two-pane collections/search pages.
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ])
  } catch {
    return null
  }
}

// Server-side JD fetch — the page is fetched and stripped on the backend
// (same path the web app uses successfully). This is the fallback for when the
// content script can't read the description from the DOM (e.g. LinkedIn's
// client-rendered markup, an iframe, or the content script not being injected).
async function fetchJdFromServer(url) {
  if (!url || !/^https?:\/\//i.test(url)) return ''
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 9000)
    const res = await fetch(`${appUrl}/api/fetch-jd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal
    })
    clearTimeout(timeout)
    if (!res.ok) return ''
    const data = await res.json()
    return (data?.text || '').trim()
  } catch {
    return ''
  }
}

async function init() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (!tab) { showMain({ company: '', position: '', url: '', source: 'Page web', description: '' }); return }

    let jobInfo = await requestJobInfo(tab.id)

    // No response → the content script is missing on this tab (stale tab from
    // before an extension reload). Inject it on demand and retry once, so the
    // job description (which only the content script can read) self-heals
    // without the user having to refresh the page.
    if (!jobInfo) {
      try {
        await injectContentScript(tab.id)
        jobInfo = await requestJobInfo(tab.id)
      } catch {}
    }

    if (!jobInfo || (!jobInfo.company && !jobInfo.position)) jobInfo = parseFromTab(tab)

    showMain(jobInfo)

    // Description still missing (content script couldn't read it from the DOM)?
    // Fetch it server-side from the job URL — the proven path the web app uses.
    if (jobDescription.length <= 50) {
      const url = jobInfo.url || tab.url
      jdStatusEl.textContent = '⏳ Récupération…'
      const serverJd = await fetchJdFromServer(url)
      if (serverJd.length > 50) {
        jobDescription = serverJd
        jdStatusEl.textContent = `✓ ${jobDescription.length} caractères`
        jdStatusEl.className = 'jd-status found'
        jdPreviewEl.style.display = 'block'
        jdPreviewEl.textContent = jobDescription.slice(0, 200) + (jobDescription.length > 200 ? '…' : '')
        updateScoreSection()
      } else {
        jdStatusEl.textContent = 'Non détectée'
        jdStatusEl.className = 'jd-status not-found'
      }
    }

    // If detection is partial, hint the user to use the AI scan button
    if (!jobInfo.company || !jobInfo.position || jobDescription.length <= 50) {
      const icon = document.getElementById('screenshot-icon')
      const text = document.getElementById('screenshot-text')
      if (icon) icon.textContent = '✦'
      if (text) text.textContent = 'Détection incomplète — Analyser avec l\'IA'
    }
  } catch (e) {
    showMain({ company: '', position: '', url: '', source: 'Page web', description: '' })
  }
}

addBtn.addEventListener('click', async () => {
  const jdKey = `jd-${Date.now()}`

  // Store full JD in extension storage (no char limit)
  await browser.storage.local.set({ [jdKey]: jobDescription })

  const jobData = {
    company: companyEl.value.trim(),
    position: positionEl.value.trim(),
    status: statusEl.value,
    date: dateEl.value,
    url: mainEl.dataset.url || '',
    description: jobDescription
  }

  // Flag it locally so the on-page score pill shows "already applied" next time,
  // without waiting for the next full sync from the app.
  browser.runtime.sendMessage({
    type: 'RECORD_APPLIED',
    job: { url: jobData.url, company: jobData.company, position: jobData.position, status: jobData.status, date: jobData.date }
  }).catch(() => {})


  // If the user kept today's date, send a full ISO timestamp (with time) so the
  // import sorts to the top among same-day rows. A date-only value (midnight)
  // would lose the tiebreak to Gmail entries imported earlier today. An
  // explicitly-chosen past date is sent as-is.
  const todayStr = new Date().toISOString().split('T')[0]
  const dateParam = jobData.date === todayStr ? new Date().toISOString() : jobData.date

  const params = new URLSearchParams({
    add: '1',
    company: jobData.company,
    position: jobData.position,
    status: jobData.status,
    date: dateParam,
    url: jobData.url,
    jdKey: jdKey
  })
  addBtn.disabled = true
  addBtn.textContent = '✓ Ajouté !'
  showToast(`✅ ${jobData.company} ajouté !`)
  setTimeout(async () => {
    const targetUrl = `${appUrl}?${params.toString()}`
    // Reuse an already-open JobTrackr tab instead of spawning a new one.
    try {
      const tabs = await browser.tabs.query({})
      const existing = tabs.find(t => t.url && t.url.startsWith(appUrl))
      if (existing) {
        await browser.tabs.update(existing.id, { url: targetUrl, active: true })
        try { await browser.windows.update(existing.windowId, { focused: true }) } catch {}
      } else {
        await browser.tabs.create({ url: targetUrl })
      }
    } catch {
      await browser.tabs.create({ url: targetUrl })
    }
    window.close()
  }, 600)
})

function showToast(msg) {
  toastEl.textContent = msg
  toastEl.classList.add('show')
  setTimeout(() => toastEl.classList.remove('show'), 2500)
}

init()

// ── Sync from JobTrackr ───────────────────────────────────────────────────────
const syncBtn = document.getElementById('sync-btn')
const syncStatus = document.getElementById('sync-status')
const syncInfo = document.getElementById('sync-info')

// Show last sync info on load
browser.storage.local.get(['cvName', 'cvText', 'profile', 'lastSync']).then(data => {
  if (data.lastSync) {
    const d = new Date(data.lastSync)
    syncStatus.textContent = `Sync : ${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    const parts = []
    if (data.profile?.name) parts.push(`👤 ${data.profile.name}`)
    if (data.cvName) parts.push(`📄 CV : ${data.cvName}`)
    else if (data.cvText) parts.push('📄 CV importé')
    if (parts.length) { syncInfo.textContent = parts.join('  ·  '); syncInfo.style.display = 'block' }
  }
})

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true
  syncBtn.textContent = '⏳ Synchronisation...'
  try {
    const result = await browser.runtime.sendMessage({ type: 'SYNC_FROM_APP' })
    if (result?.success) {
      await browser.storage.local.set({ lastSync: new Date().toISOString() })
      // Reflect the synced key in this popup session so AI calls use it right away.
      if (result.hasApiKey) {
        const d = await browser.storage.local.get('apiKey')
        userApiKey = d.apiKey || userApiKey
      }
      const parts = []
      if (result.hasProfile) parts.push('👤 Profil')
      if (result.hasCv) parts.push(`📄 CV${result.cvName ? ' : ' + result.cvName : ''}`)
      if (result.hasApiKey) parts.push('🔑 Clé API')
      syncBtn.textContent = `✅ ${parts.join(' + ')} synchronisé${parts.length > 1 ? 's' : ''} !`
      syncStatus.textContent = `Sync : à l'instant`
      if (parts.length) { syncInfo.textContent = parts.join('  ·  '); syncInfo.style.display = 'block' }
      setTimeout(() => { syncBtn.textContent = '🔄 Sync CV + Profil depuis l\'app'; syncBtn.disabled = false }, 2500)
    } else {
      syncBtn.textContent = `❌ ${(result?.error || 'Échec').slice(0, 45)}`
      setTimeout(() => { syncBtn.textContent = '🔄 Sync CV + Profil depuis l\'app'; syncBtn.disabled = false }, 3000)
    }
  } catch (e) {
    syncBtn.textContent = '❌ Erreur : ' + e.message.slice(0, 40)
    setTimeout(() => { syncBtn.textContent = '🔄 Sync CV + Profil depuis l\'app'; syncBtn.disabled = false }, 3000)
  }
})

// ── Autofill button ───────────────────────────────────────────────────────────
document.getElementById('autofill-btn').addEventListener('click', async () => {
  const btn = document.getElementById('autofill-btn')
  const txt = document.getElementById('autofill-text')
  btn.disabled = true
  txt.textContent = '⏳ Scan des champs…'
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (!tab?.id) throw new Error('Pas de tab active')

    // First, trigger autofill to detect fields
    const res = await browser.tabs.sendMessage(tab.id, { type: 'TRIGGER_AUTOFILL' })
    if (res?.fieldsCount === 0) {
      txt.textContent = '⚠️ Aucun champ détecté'
      setTimeout(() => { txt.textContent = 'Autofill le formulaire de candidature'; btn.disabled = false }, 2500)
    } else {
      txt.textContent = `⏳ Génération (${res?.fieldsCount || '?'} champs)…`
      // Send signal to auto-generate all fields
      await browser.tabs.sendMessage(tab.id, { type: 'AUTO_GENERATE_ALL' }).catch(() => {})
      txt.textContent = `✓ Génération lancée (${res?.fieldsCount} champs)`
      setTimeout(() => window.close(), 1500)
    }
  } catch (e) {
    txt.textContent = 'Erreur : ' + e.message.slice(0, 40)
    setTimeout(() => { txt.textContent = 'Autofill le formulaire de candidature'; btn.disabled = false }, 2500)
  }
})

// ── Scan listing page button ──────────────────────────────────────────────────
// Asks the content script to enumerate + score the offers on the current search
// page. Results render in an on-page panel (the popup is too small and closes),
// so here we just trigger it and report how many offers were found.
document.getElementById('scan-listing-btn').addEventListener('click', async () => {
  const txt = document.getElementById('scan-listing-text')
  const btn = document.getElementById('scan-listing-btn')
  btn.disabled = true
  txt.textContent = '⏳ Analyse des offres…'
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (!tab?.id) throw new Error('Pas de tab active')
    const res = await browser.tabs.sendMessage(tab.id, { type: 'TRIGGER_SCAN' })
    if (!res || res.count === 0) {
      txt.textContent = '⚠️ Aucune offre détectée ici'
      setTimeout(() => { txt.textContent = 'Scanner les offres de la page'; btn.disabled = false }, 2800)
    } else {
      txt.textContent = `✓ ${res.count} offre(s) — voir le panneau`
      setTimeout(() => window.close(), 900)
    }
  } catch (e) {
    txt.textContent = 'Ouvre une page de résultats d\'abord'
    setTimeout(() => { txt.textContent = 'Scanner les offres de la page'; btn.disabled = false }, 2800)
  }
})

// ── API Key panel (optional — for unlimited use beyond the free trial) ─────────
document.getElementById('toggle-apikey').addEventListener('click', async () => {
  const panel = document.getElementById('apikey-panel')
  const isOpen = panel.style.display !== 'none'
  panel.style.display = isOpen ? 'none' : 'block'
  if (!isOpen && userApiKey) {
    document.getElementById('apikey-input').value = userApiKey
    document.getElementById('apikey-saved').style.display = 'inline'
  }
})

document.getElementById('save-apikey').addEventListener('click', async () => {
  const key = document.getElementById('apikey-input').value.trim()
  await browser.storage.local.set({ apiKey: key })
  userApiKey = key
  document.getElementById('apikey-saved').style.display = key ? 'inline' : 'none'
  showToast(key ? '🔑 Clé API sauvegardée ✓' : '🔑 Clé supprimée — essai gratuit')
  setTimeout(() => { document.getElementById('apikey-panel').style.display = 'none' }, 1200)
})

// ── Autofill toggle persistence ────────────────────────────────────────────────
const toggleAutofillMain = document.getElementById('toggle-autofill-main')
const toggleAutofillButtons = document.getElementById('toggle-autofill-buttons')

// Load saved states - moved to consolidated init above

// Save state when top autofill toggle is clicked
// Also sync to buttons toggle and notify content script
toggleAutofillMain.addEventListener('change', async () => {
  const isEnabled = toggleAutofillMain.checked
  await browser.storage.local.set({
    autofillEnabled: isEnabled,
    autofillButtonsEnabled: isEnabled  // Sync with buttons toggle!
  })

  // Also sync the buttons toggle UI
  toggleAutofillButtons.checked = isEnabled

  // Notify active tab to enable/disable buttons
  const tabs = await browser.tabs.query({ active: true, currentWindow: true })
  if (tabs[0]) {
    browser.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_AUTOFILL_BUTTONS', enabled: isEnabled }).catch(() => {})
  }
})

// Save state and notify content script when autofill buttons toggled
toggleAutofillButtons.addEventListener('change', async () => {
  const isEnabled = toggleAutofillButtons.checked
  await browser.storage.local.set({
    autofillButtonsEnabled: isEnabled,
    autofillEnabled: isEnabled  // Keep main toggle synced
  })

  // Also sync the main toggle UI
  toggleAutofillMain.checked = isEnabled

  // Notify active tab's content script
  const tabs = await browser.tabs.query({ active: true, currentWindow: true })
  if (tabs[0]) {
    browser.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_AUTOFILL_BUTTONS', enabled: isEnabled }).catch(() => {})
  }
})

// ── Right-click context menu toggle ────────────────────────────────────────────
const toggleRightclick = document.getElementById('toggle-rightclick')

// Load saved state - moved to consolidated init above

// Save state and update context menu
toggleRightclick.addEventListener('change', async () => {
  const isEnabled = toggleRightclick.checked
  await browser.storage.local.set({ rightclickEnabled: isEnabled })

  // Enable/disable context menu
  if (isEnabled) {
    browser.contextMenus.update('jobtrackr-autofill', { visible: true })
  } else {
    browser.contextMenus.update('jobtrackr-autofill', { visible: false })
  }
})

// ── Score calculation ─────────────────────────────────────────────────────────
// Escape model output before it touches innerHTML. strengths/gaps come from
// Claude, which summarises an untrusted job page — a prompt-injected posting
// could otherwise return markup and run script inside the extension popup.
function escHtml(str) {
  return (str || '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Mount a trusted HTML string (dynamic parts already run through escHtml) without
// assigning innerHTML. DOMParser builds an inert document — it never executes
// scripts and the AMO validator does not flag it — then we move the nodes in, so
// the UI renders identically with a clean "no unsafe innerHTML" report.
function setHTML(el, html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  el.replaceChildren(...doc.head.childNodes, ...doc.body.childNodes)
}

// Render a score result object into the UI (shared by cache hits + fresh calls).
function renderScore(result) {
  const scoreBadge = document.getElementById('score-badge')
  const scoreSummary = document.getElementById('score-summary')
  const scoreVerdict = document.getElementById('score-verdict')
  const scoreDetails = document.getElementById('score-details')
  const scoreStrengths = document.getElementById('score-strengths')
  const scoreGaps = document.getElementById('score-gaps')

  document.getElementById('score-loading').style.display = 'none'
  document.getElementById('score-display').style.display = 'block'
  scoreDetails.style.display = 'block'
  scoreSummary.style.color = ''

  const score = Math.round(result.score || 0)
  scoreBadge.textContent = score
  scoreBadge.style.backgroundColor = score >= 80 ? '#dcfce7' : score >= 60 ? '#dbeafe' : score >= 40 ? '#fef3c7' : '#fee2e2'
  scoreBadge.style.color = score >= 80 ? '#15803d' : score >= 60 ? '#0c4a6e' : score >= 40 ? '#92400e' : '#7f1d1d'
  scoreBadge.style.borderColor = score >= 80 ? '#bbf7d0' : score >= 60 ? '#bfdbfe' : score >= 40 ? '#fde68a' : '#fca5a5'

  scoreSummary.textContent = result.summary || ''
  scoreVerdict.textContent = (result.verdict || 'PARTIAL_MATCH').replace(/_/g, ' ')

  if (result.strengths?.length > 0) {
    scoreStrengths.style.display = 'block'
    setHTML(document.getElementById('strengths-list'), result.strengths.map(s => `
      <li style="font-size: 11px; color: #15803d; margin-bottom: 4px; display: flex; gap: 6px;">
        <span style="flex-shrink: 0;">•</span>
        <span>${escHtml(s)}</span>
      </li>
    `).join(''))
  } else {
    scoreStrengths.style.display = 'none'
  }

  if (result.gaps?.length > 0) {
    scoreGaps.style.display = 'block'
    setHTML(document.getElementById('gaps-list'), result.gaps.map(g => `
      <li style="font-size: 11px; color: #b45309; margin-bottom: 4px; display: flex; gap: 6px;">
        <span style="flex-shrink: 0;">•</span>
        <span>${escHtml(g)}</span>
      </li>
    `).join(''))
  } else {
    scoreGaps.style.display = 'none'
  }

  document.getElementById('score-btn').style.display = 'inline-flex'
}

// Drop cached scores older than 30 days so storage doesn't grow unbounded.
async function pruneScoreCache() {
  try {
    const all = await browser.storage.local.get(null)
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    const stale = Object.keys(all).filter(k => k.startsWith('score:') && (all[k]?._ts || 0) < cutoff)
    if (stale.length) await browser.storage.local.remove(stale)
  } catch {}
}

async function calculateJobScore(force = false) {
  const scoreBtn = document.getElementById('score-btn')
  const scoreLoading = document.getElementById('score-loading')
  const scoreDisplay = document.getElementById('score-display')
  const scoreSummary = document.getElementById('score-summary')
  const scoreDetails = document.getElementById('score-details')

  scoreBtn.disabled = true
  scoreLoading.style.display = 'block'
  scoreDisplay.style.display = 'none'

  try {
    // Get CV data from storage
    const data = await browser.storage.local.get(['cvText', 'cvName'])
    if (!data.cvText) {
      // If no CV, just hide the loading and show message
      scoreLoading.style.display = 'none'
      scoreDisplay.style.display = 'block'
      scoreSummary.textContent = '📄 Synchronisez votre CV depuis JobTrackr pour calculer le score'
      scoreSummary.style.color = '#64748b'
      scoreDetails.style.display = 'none'
      scoreBtn.disabled = false
      return
    }

    // Prepare job data
    const company = companyEl.value.trim()
    const position = positionEl.value.trim()
    const jobDesc = jobDescription || ''

    if (!company || !position) {
      throw new Error('Complétez le nom de l\'entreprise et du poste')
    }

    if (!jobDesc) {
      throw new Error('Aucune description du poste détectée')
    }

    // Cache per candidature so re-opening the popup on the same job doesn't
    // re-hit Claude. Key on the job URL (the stable identity of a candidature)
    // plus the CV. The URL is what stays constant — the JD text does NOT: the
    // content script, the server fetch and the AI scan can each yield slightly
    // different description text for the same page, so hashing the JD would miss
    // the cache on every re-open. Including the CV means syncing a new CV
    // re-scores. When there's no URL (manual entry) fall back to
    // company/position/JD content. "Recalculer" forces a fresh call (force=true).
    const url = mainEl.dataset.url || ''
    const cacheKey = 'score:' + djb2([
      url || `${company}|${position}|${djb2(jobDesc)}`,
      djb2(data.cvText)
    ].join('|'))

    if (!force) {
      const cached = (await browser.storage.local.get(cacheKey))[cacheKey]
      if (cached) {
        renderScore(cached)
        scoreBtn.disabled = false
        return
      }
    }

    // Build scoring prompt (same as jobtracking app)
    const prompt = `You are an expert recruiter and CV screener. Analyze how well the candidate's CV matches the job description.

CANDIDATE CV:
${data.cvText}

JOB DESCRIPTION (${company} - ${position}):
${jobDesc}

Evaluate the candidate's fit across these dimensions:
1. Required Skills Match (must-have technical/soft skills from JD)
2. Experience Level (years, seniority, relevant domain)
3. Background Alignment (industry, company size, role similarity)
4. Achievement Relevance (measurable outcomes matching JD context)

Respond with ONLY a JSON object (no markdown, no preamble) with this exact structure:
{
  "score": <number 0-100>,
  "summary": "<2-3 sentence assessment>",
  "strengths": ["<key strength>", "<key strength>"],
  "gaps": ["<missing skill/experience>", "<gap>"],
  "verdict": "<STRONG_MATCH|GOOD_MATCH|PARTIAL_MATCH|WEAK_MATCH>"
}`

    // Call Claude API via JobTrackr
    const response = await fetch(`${appUrl}/api/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: claudeBody({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!response.ok) {
      const errData = await response.json()
      throw new Error(errData?.error?.message || errData?.error || `Erreur API: ${response.status}`)
    }

    const apiResult = await response.json()
    const text = apiResult.content?.[0]?.text || '{}'

    // Parse JSON from response
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    const result = JSON.parse(start !== -1 ? text.slice(start, end + 1) : '{}')

    renderScore(result)

    // Cache so subsequent popup opens on the same page skip the Claude call.
    browser.storage.local.set({ [cacheKey]: { ...result, _ts: Date.now() } })
    pruneScoreCache()

    scoreBtn.disabled = false
  } catch (e) {
    scoreLoading.style.display = 'none'
    scoreDisplay.style.display = 'block'
    scoreSummary.textContent = '❌ ' + e.message
    scoreSummary.style.color = '#dc2626'
    scoreDetails.style.display = 'none'
    // Show recalculate button even on error
    scoreBtn.style.display = 'inline-flex'
    scoreBtn.disabled = false
  }
}

// Show score section and auto-calculate when job has description
function updateScoreSection() {
  const scoreSection = document.getElementById('score-section')
  if (jobDescription && jobDescription.length > 50) {
    scoreSection.style.display = 'block'
    // Auto-calculate score if CV is available
    calculateJobScore()
  } else {
    scoreSection.style.display = 'none'
    document.getElementById('score-display').style.display = 'none'
  }
}

// ── Context modal for adding personal notes ─────────────────────────────────────
function setupContextModal() {
  const contextModal = document.getElementById('context-modal')
  const modalClose = document.getElementById('modal-close')
  const modalCancel = document.getElementById('modal-cancel')
  const modalConfirm = document.getElementById('modal-confirm')
  const contextInput = document.getElementById('context-input')

  // Add button to open context modal (insert after screenshot button)
  const contextBtn = document.createElement('button')
  contextBtn.className = 'btn btn-ai'
  contextBtn.id = 'context-btn'
  setHTML(contextBtn, '<span>📝</span><span>Ajouter du contexte</span>')

  // Insert context button after screenshot button
  if (screenshotBtn?.parentNode) {
    screenshotBtn.parentNode.insertBefore(contextBtn, screenshotBtn.nextSibling)
  }

  // Context already loaded in consolidated init at popup start

  // Open modal
  contextBtn.addEventListener('click', () => {
    contextModal.style.display = 'flex'
  })

  // Close modal
  modalClose.addEventListener('click', () => {
    contextModal.style.display = 'none'
  })

  modalCancel.addEventListener('click', () => {
    contextModal.style.display = 'none'
  })

  // Close on overlay click
  contextModal.addEventListener('click', (e) => {
    if (e.target === contextModal) contextModal.style.display = 'none'
  })

  // Save context
  modalConfirm.addEventListener('click', async () => {
    const context = contextInput.value.trim()
    await browser.storage.local.set({ userContext: context })
    showToast('✓ Contexte sauvegardé')
    contextModal.style.display = 'none'
  })
}
