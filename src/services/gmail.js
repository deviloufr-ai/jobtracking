const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'

let tokenClient = null

// ── Persist token in sessionStorage so it survives re-renders/page nav ────────
// sessionStorage is cleared when the tab closes — safe for OAuth tokens
const TOKEN_KEY = 'jt_gmail_token'
const USER_KEY  = 'jt_gmail_user'

function loadToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || null } catch { return null }
}
function saveToken(t) {
  try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY) } catch {}
}
function loadUser() {
  try { const raw = sessionStorage.getItem(USER_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}
function saveUser(u) {
  try { if (u) sessionStorage.setItem(USER_KEY, JSON.stringify(u)); else sessionStorage.removeItem(USER_KEY) } catch {}
}

let accessToken = loadToken()
let cachedUser  = loadUser()

export function isGmailConfigured() { return !!CLIENT_ID }
export function isConnected() { return !!accessToken }
export function getAccessToken() { return accessToken }
export function getCachedUser() { return cachedUser }

function waitForGoogle() {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) { resolve(); return }
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) { clearInterval(interval); resolve() }
    }, 100)
    setTimeout(() => { clearInterval(interval); resolve() }, 5000)
  })
}

export async function connectGmail() {
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID manquant dans .env')
  await waitForGoogle()
  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (response) => {
        if (response.error) { reject(new Error(response.error)); return }
        accessToken = response.access_token
        saveToken(accessToken)
        // Fetch and cache user info right after connect
        const user = await getGmailUserInfo()
        cachedUser = user
        saveUser(user)
        resolve(accessToken)
      },
    })
    tokenClient.requestAccessToken({ prompt: '' })  // '' = no forced consent if already granted
  })
}

export async function getGmailUserInfo() {
  if (!accessToken) return null
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) return null
    const data = await res.json()
    return { email: data.email, name: data.name, picture: data.picture }
  } catch { return null }
}

export function disconnectGmail() {
  if (accessToken && window.google) window.google.accounts.oauth2.revoke(accessToken)
  accessToken = null
  cachedUser = null
  saveToken(null)
  saveUser(null)
}

// Silent re-auth — requests a new token without showing consent screen
export async function refreshToken() {
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID manquant')
  await waitForGoogle()
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (response) => {
        if (response.error) { reject(new Error(response.error)); return }
        accessToken = response.access_token
        saveToken(accessToken)
        resolve(accessToken)
      },
    })
    client.requestAccessToken({ prompt: '' })
  })
}

async function gmailFetch(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    // Token may have expired — clear it so UI shows reconnect
    if (res.status === 401) {
      accessToken = null
      saveToken(null)
    }
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gmail API error ${res.status}`)
  }
  return res.json()
}

export async function fetchJobEmails(maxResults = null, months = 3) {
  // Scale limit with period: ~50/month is a reasonable upper bound for active job searchers
  const autoLimit = Math.min(months * 60, 500)
  maxResults = maxResults ?? autoLimit
  if (!accessToken) throw new Error('Non connecté à Gmail')

  const days = months * 30

  // Job alert subjects to exclude from all queries
  const noAlerts = `-subject:"job alert" -subject:"jobs you might like" -subject:"recommended jobs" -subject:"new jobs for you" -subject:"offres d'emploi" -subject:"nouvelles offres" -subject:"alertes emploi" -subject:"emplois recommandés" -subject:"suggested job" -subject:"candidature suggérée" -subject:"jobs suggested" -subject:"offres suggérées" -subject:"new jobs matching" -subject:"emplois correspondant" -subject:"offre recommandée" -subject:"recommended job for you"`

  const queries = [
    // French recruitment keywords (incoming)
    `in:inbox (candidature OR postulation OR entretien OR recrutement OR "votre candidature" OR "Votre candidature" OR "votre profil" OR "nous avons bien reçu" OR "suite à votre candidature" OR "nous avons le regret" OR "sans suite" OR "n'avons pas retenu") ${noAlerts} newer_than:${days}d`,
    // English recruitment keywords (incoming)
    `in:all (interview OR "thank you for applying" OR "thanks for applying" OR "thanks for your application" OR "thank you for your application" OR "application received" OR "your application" OR "application viewed" OR "was viewed" OR "viewed your application" OR "we have received" OR "we regret" OR "not selected" OR "not moving forward" OR "job offer" OR "offer letter" OR "next steps" OR "hiring process") ${noAlerts} newer_than:${days}d`,
    // ATS platforms — always job-related, no alert filter needed
    `in:all (from:ashbyhq.com OR from:greenhouse.io OR from:lever.co OR from:workable.com OR from:teamtailor.com OR from:recruitee.com OR from:bamboohr.com OR from:smartrecruiters.com OR from:jobvite.com OR from:icims.com OR from:myworkdayjobs.com OR from:taleo.net) newer_than:${days}d`,
    // Job boards — in:all to catch Updates/Promotions tabs too
    `in:all (from:linkedin.com OR from:welcometothejungle.com OR from:apec.fr OR from:indeed.com OR from:monster.fr OR from:cadremploi.fr OR from:hellowork.com OR from:jobteaser.com) (candidature OR application OR entretien OR interview OR "InMail" OR recruteur OR recruiter OR "votre profil" OR "was viewed" OR "viewed") ${noAlerts} newer_than:${days}d`,
    // LinkedIn application status notifications (viewed, accepted, rejected…)
    `in:all from:linkedin.com (subject:"was viewed" OR subject:"application was viewed" OR subject:"viewed your application" OR subject:"a été consultée" OR subject:"votre candidature a" OR subject:"application to") newer_than:${days}d`,
    // Recruiter sender patterns
    `in:inbox (from:talent@ OR from:recrutement@ OR from:rh@ OR from:careers@ OR from:jobs@ OR from:hiring@ OR from:recruiter@) ${noAlerts} newer_than:${days}d`,
    // Sent applications
    `in:sent (has:attachment OR subject:candidature OR subject:postulation OR "je postule" OR "je vous contacte" OR "je me permets" OR "I am applying" OR "please find my CV" OR "please find attached my resume") newer_than:${days}d`,
  ]

  const allMessageIds = new Set()
  const allMessages = []

  const runQuery = async (query) => {
    try {
      const data = await gmailFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.min(months * 20, 100)}&q=${encodeURIComponent(query)}`
      )
      const messages = data.messages || []
      for (const m of messages) {
        if (!allMessageIds.has(m.id)) {
          allMessageIds.add(m.id)
          allMessages.push(m)
        }
      }
    } catch (e) {
      console.warn('Query failed:', query.slice(0, 60), e.message)
    }
  }

  const batchSize = 3
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize)
    await Promise.all(batch.map(runQuery))
    if (i + batchSize < queries.length) await new Promise(r => setTimeout(r, 200))
  }

  if (allMessages.length === 0) return []

  const toFetch = allMessages.slice(0, maxResults)
  const emails = []
  for (let i = 0; i < toFetch.length; i += 5) {
    const batch = toFetch.slice(i, i + 5)
    const results = await Promise.all(batch.map(m => fetchEmailDetail(m.id)))
    emails.push(...results.filter(Boolean))
    if (i + 5 < toFetch.length) await new Promise(r => setTimeout(r, 100))
  }
  return emails
}

function decodeBase64(str) {
  try {
    return decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))))
  } catch {
    try { return atob(str.replace(/-/g, '+').replace(/_/g, '/')) } catch { return '' }
  }
}

function extractBody(payload) {
  if (!payload) return ''
  if (payload.body?.data) return decodeBase64(payload.body.data)
  if (payload.parts) {
    const plain = payload.parts.find(p => p.mimeType === 'text/plain')
    if (plain?.body?.data) return decodeBase64(plain.body.data)
    const html = payload.parts.find(p => p.mimeType === 'text/html')
    if (html?.body?.data) {
      const raw = decodeBase64(html.body.data)
      return raw.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
    }
    for (const part of payload.parts) {
      if (part.parts) { const nested = extractBody(part); if (nested) return nested }
    }
  }
  return ''
}

async function fetchEmailDetail(id) {
  try {
    const data = await gmailFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`
    )
    const headers = data.payload?.headers || []
    const get = (name) => headers.find(h => h.name === name)?.value || ''
    const body = extractBody(data.payload).slice(0, 2000)
    const from = get('From')
    const to = get('To')
    const labelIds = data.labelIds || []
    const isSent = labelIds.includes('SENT')
    return {
      id: data.id,
      subject: get('Subject'),
      from: isSent ? to : from,
      fromMe: isSent,
      date: get('Date'),
      snippet: data.snippet || '',
      body,
    }
  } catch { return null }
}
