const DEFAULT_APP_URL = 'https://jobtracking-three.vercel.app'
let appUrl = DEFAULT_APP_URL
let jobDescription = ''

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

browser.storage.local.get(['appUrl']).then(r => {
  if (r.appUrl) { appUrl = r.appUrl; appUrlInput.value = appUrl }
  else appUrlInput.value = DEFAULT_APP_URL
})

document.getElementById('toggle-settings').addEventListener('click', () => {
  settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none'
})
document.getElementById('save-settings').addEventListener('click', () => {
  const url = appUrlInput.value.trim().replace(/\/$/, '')
  if (url) { appUrl = url; browser.storage.local.set({ appUrl: url }); showToast('Sauvegardé ✓'); settingsPanel.style.display = 'none' }
})

function checkReady() {
  addBtn.disabled = !companyEl.value.trim() || !positionEl.value.trim()
}
companyEl.addEventListener('input', checkReady)
positionEl.addEventListener('input', checkReady)

// Screenshot + Claude Vision analysis
screenshotBtn.addEventListener('click', async () => {
  screenshotBtn.disabled = true
  screenshotIcon.textContent = '⏳'
  screenshotText.textContent = 'Capture en cours...'

  try {
    // Get full page text via content script
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    
    screenshotText.textContent = 'Lecture de la page...'
    
    let pageText = ''
    try {
      const result = await Promise.race([
        browser.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ])
      pageText = result?.text || ''
    } catch {
      // Fallback: use tab title
      pageText = `Page: ${tab.title}\nURL: ${tab.url}`
    }

    screenshotText.textContent = 'Analyse IA en cours...'

    // Send full text to Claude
    const res = await fetch(`${appUrl}/api/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `Analyse ce texte extrait d'une page web d'offre d'emploi. Extrait les informations clés. Réponds UNIQUEMENT en JSON valide sans backticks:
{"company": "nom de l'entreprise", "position": "titre exact du poste", "description": "résumé des compétences requises et missions en 100 mots max", "location": "ville ou remote si mentionné", "salary": "salaire si mentionné sinon null"}

Texte de la page:
${pageText.slice(0, 5000)}`
        }]
      })
    })

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
      const parts = title.replace(' | LinkedIn', '').split(' - ')
      return { company: parts.length > 1 ? parts[parts.length - 1].trim() : '', position: parts[0]?.trim() || title, url, source: 'LinkedIn', description: '' }
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
    return { company: '', position: title.split(/[-|]/)[0]?.trim() || title, url, source: hostname.split('.')[0], description: '' }
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
  if (jobDescription.length > 50) {
    jdStatusEl.textContent = `✓ ${jobDescription.length} caractères`
    jdStatusEl.className = 'jd-status found'
    jdPreviewEl.style.display = 'block'
    jdPreviewEl.textContent = jobDescription.slice(0, 200) + (jobDescription.length > 200 ? '…' : '')
  }
  checkReady()
  if (!companyEl.value) companyEl.focus()
  else if (!positionEl.value) positionEl.focus()
}

const KNOWN_HOSTS = ['linkedin.com', 'indeed.com', 'welcometothejungle.com', 'apec.fr', 'hellowork.com', 'pole-emploi.fr', 'monster.fr', 'glassdoor.com', 'cadremploi.fr', 'regionsjob.com', 'meteojob.com']

function isKnownJobSite(url) {
  try {
    const hostname = new URL(url).hostname
    return KNOWN_HOSTS.some(h => hostname.includes(h))
  } catch { return false }
}

async function autoAnalyzeWithAI(tab) {
  loadingText.textContent = 'Analyse IA en cours…'
  let pageText = ''
  try {
    const result = await Promise.race([
      browser.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ])
    pageText = result?.text || ''
  } catch {
    pageText = `Page: ${tab.title}\nURL: ${tab.url}`
  }

  const res = await fetch(`${appUrl}/api/claude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Analyse ce texte extrait d'une page web d'offre d'emploi. Extrait les informations clés. Réponds UNIQUEMENT en JSON valide sans backticks:
{"company": "nom de l'entreprise", "position": "titre exact du poste", "description": "résumé des compétences requises et missions en 100 mots max", "location": "ville ou remote si mentionné", "salary": "salaire si mentionné sinon null"}

Texte de la page:
${pageText.slice(0, 5000)}`
      }]
    })
  })

  if (!res.ok) throw new Error('Erreur API')
  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  const parsed = JSON.parse(start !== -1 ? text.slice(start, end + 1) : '{}')

  const description = parsed.description
    ? parsed.description + (parsed.location ? ` | Lieu: ${parsed.location}` : '') + (parsed.salary ? ` | Salaire: ${parsed.salary}` : '')
    : ''

  return {
    company: parsed.company || '',
    position: parsed.position || '',
    description,
    url: tab.url,
    source: new URL(tab.url).hostname.replace('www.', '').split('.')[0]
  }
}

async function init() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (!tab) { showMain({ company: '', position: '', url: '', source: 'Page web', description: '' }); return }

    let jobInfo = null
    try {
      jobInfo = await Promise.race([
        browser.tabs.sendMessage(tab.id, { type: 'GET_JOB_INFO' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ])
    } catch {}
    if (!jobInfo || (!jobInfo.company && !jobInfo.position)) jobInfo = parseFromTab(tab)

    showMain(jobInfo)

    // If detection is partial, hint the user to use the AI scan button
    if (!jobInfo.company || !jobInfo.position || !jobInfo.description) {
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

  const params = new URLSearchParams({
    add: '1',
    company: companyEl.value.trim(),
    position: positionEl.value.trim(),
    status: statusEl.value,
    date: dateEl.value,
    url: mainEl.dataset.url || '',
    jdKey: jdKey  // Pass storage key instead of full JD
  })
  addBtn.disabled = true
  addBtn.textContent = '✓ Ajouté !'
  showToast(`✅ ${companyEl.value} ajouté !`)
  setTimeout(() => {
    browser.tabs.create({ url: `${appUrl}?${params.toString()}` })
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
      const parts = []
      if (result.hasProfile) parts.push('👤 Profil')
      if (result.hasCv) parts.push(`📄 CV${result.cvName ? ' : ' + result.cvName : ''}`)
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
  txt.textContent = 'Ouverture du panel…'
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (!tab?.id) throw new Error('Pas de tab active')
    const res = await browser.tabs.sendMessage(tab.id, { type: 'TRIGGER_AUTOFILL' })
    if (res?.fieldsCount === 0) {
      txt.textContent = '⚠️ Aucun champ détecté sur cette page'
      setTimeout(() => { txt.textContent = 'Autofill le formulaire de candidature'; btn.disabled = false }, 2500)
    } else {
      txt.textContent = `✦ Panel ouvert (${res?.fieldsCount || '?'} champs)`
      setTimeout(() => window.close(), 500)
    }
  } catch (e) {
    txt.textContent = 'Erreur : ' + e.message.slice(0, 40)
    setTimeout(() => { txt.textContent = 'Autofill le formulaire de candidature'; btn.disabled = false }, 2500)
  }
})

// ── API Key panel ─────────────────────────────────────────────────────────────
document.getElementById('toggle-apikey').addEventListener('click', async () => {
  const panel = document.getElementById('apikey-panel')
  const isOpen = panel.style.display !== 'none'
  panel.style.display = isOpen ? 'none' : 'block'
  if (!isOpen) {
    const data = await browser.storage.local.get('apiKey')
    if (data.apiKey) {
      document.getElementById('apikey-input').value = data.apiKey
      document.getElementById('apikey-saved').style.display = 'inline'
    }
  }
})

document.getElementById('save-apikey').addEventListener('click', async () => {
  const key = document.getElementById('apikey-input').value.trim()
  if (!key) return
  await browser.storage.local.set({ apiKey: key })
  document.getElementById('apikey-saved').style.display = 'inline'
  showToast('🔑 Clé API sauvegardée ✓')
  setTimeout(() => { document.getElementById('apikey-panel').style.display = 'none' }, 1200)
})
