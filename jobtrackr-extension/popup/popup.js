'use strict'

const APP_URL    = 'https://jobtracking-three.vercel.app'
const CLAUDE_API = `${APP_URL}/api/claude`

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)
const states = {
  loading:  $('state-loading'),
  error:    $('state-error'),
  result:   $('state-result'),
  done:     $('state-done'),
}

function showState(name) {
  Object.values(states).forEach(el => el.classList.add('hidden'))
  states[name].classList.remove('hidden')
}

// ── Main flow ─────────────────────────────────────────────────────────────────
let currentUrl = ''
let currentJD  = ''

async function run() {
  showState('loading')
  try {
    // 1. Get active tab
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    currentUrl = tab.url || ''

    // 2. Extract page text via content script
    let pageData
    try {
      pageData = await browser.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE' })
    } catch {
      // Content script not injected yet (e.g. new tab, PDF, browser page)
      throw new Error('Impossible de lire cette page. Essayez sur une page offre d\'emploi.')
    }

    if (!pageData?.text) throw new Error('Aucun texte trouvé sur cette page.')
    currentJD = pageData.text

    // 3. Call Claude via the app's proxy
    const prompt = `Tu es un assistant de recrutement. Analyse ce texte de page web et extrait les informations d'une offre d'emploi.
Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour :
{
  "company": "nom de l'entreprise (vide si non trouvé)",
  "position": "intitulé exact du poste (vide si non trouvé)",
  "contract": "CDI|CDD|Freelance|Stage|Alternance ou vide",
  "location": "ville ou télétravail (vide si non trouvé)",
  "salary": "fourchette salariale si mentionnée (vide sinon)",
  "is_job_offer": true
}
Si ce n'est PAS une offre d'emploi, retourne { "is_job_offer": false }.

URL : ${currentUrl}
Titre : ${pageData.title}

TEXTE DE LA PAGE (${pageData.text.length} caractères) :
${pageData.text.slice(0, 4000)}`

    const res = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) throw new Error(`API error ${res.status}`)
    const data = await res.json()
    const raw  = data.content?.[0]?.text || '{}'
    const match = raw.match(/\{[\s\S]*\}/)
    const info  = match ? JSON.parse(match[0]) : {}

    if (!info.is_job_offer) throw new Error('Cette page ne semble pas être une offre d\'emploi.')

    // 4. Populate form
    $('field-company').value  = info.company  || ''
    $('field-position').value = info.position || ''
    if (info.contract) $('field-contract').value = info.contract

    const notes = [
      info.location ? `📍 ${info.location}` : '',
      info.salary   ? `💰 ${info.salary}`   : '',
    ].filter(Boolean).join('  |  ')
    $('field-notes').value = notes

    showState('result')

  } catch (err) {
    $('error-msg').textContent = err.message || 'Erreur inconnue.'
    showState('error')
  }
}

// ── Add to JobTrackr ──────────────────────────────────────────────────────────
function buildAppUrl() {
  const company  = $('field-company').value.trim()
  const position = $('field-position').value.trim()
  const status   = $('field-status').value
  const notes    = $('field-notes').value.trim()

  const params = new URLSearchParams({
    add:      '1',
    company,
    position,
    url:      currentUrl,
    status,
    date:     new Date().toISOString().split('T')[0],
    notes,
    jd:       currentJD.slice(0, 2000), // store JD for CV generator
  })
  return `${APP_URL}?${params.toString()}`
}

$('btn-add').addEventListener('click', () => {
  const company  = $('field-company').value.trim()
  const position = $('field-position').value.trim()
  if (!company || !position) {
    alert('Entreprise et poste sont requis.')
    return
  }
  browser.tabs.create({ url: buildAppUrl() })
  $('done-label').textContent = `${company} — ${position}`
  showState('done')
})

$('btn-open-app').addEventListener('click', () => {
  browser.tabs.create({ url: APP_URL })
  window.close()
})

$('btn-retry').addEventListener('click', run)
$('btn-reanalyze').addEventListener('click', run)

// ── Start ─────────────────────────────────────────────────────────────────────
run()
