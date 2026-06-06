const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'

// ── Multi-account storage ─────────────────────────────────────────────────────
// accounts: { [email]: { token: string, user: { email, name, picture } } }
const ACCOUNTS_KEY = 'jt_gmail_accounts'

function loadAccounts() {
  try { const raw = sessionStorage.getItem(ACCOUNTS_KEY); return raw ? JSON.parse(raw) : {} } catch { return {} }
}
function saveAccounts(map) {
  try { sessionStorage.setItem(ACCOUNTS_KEY, JSON.stringify(map)) } catch {}
}

let accounts = loadAccounts() // { email: { token, user } }

// ── Public API ────────────────────────────────────────────────────────────────
export function isGmailConfigured() { return !!CLIENT_ID }

export function getConnectedAccounts() {
  return Object.values(accounts).map(a => a.user).filter(Boolean)
}

export function isConnected() { return Object.keys(accounts).length > 0 }

export function getCachedUser() {
  const first = Object.values(accounts)[0]
  return first?.user || null
}

export function getAccessToken(email) {
  if (email) return accounts[email]?.token || null
  const first = Object.values(accounts)[0]
  return first?.token || null
}

// ── Deep link helper ──────────────────────────────────────────────────────────
// Returns a Gmail URL that opens the right account using authuser param
export function gmailMessageUrl(gmailId, receivedBy) {
  const auth = receivedBy ? `?authuser=${encodeURIComponent(receivedBy)}` : ''
  return `https://mail.google.com/mail/${auth}#inbox/${gmailId}`
}

function waitForGoogle() {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) { resolve(); return }
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) { clearInterval(interval); resolve() }
    }, 100)
    setTimeout(() => { clearInterval(interval); resolve() }, 5000)
  })
}

// Connect a Gmail account — adds to the multi-account map
// hint: optional email hint to pre-select account in Google picker
export async function connectGmail(hint = '') {
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID manquant dans .env')
  await waitForGoogle()
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      hint,
      callback: async (response) => {
        if (response.error) { reject(new Error(response.error)); return }
        const token = response.access_token
        // Fetch user info for this token
        const user = await fetchUserInfo(token)
        if (!user) { reject(new Error('Impossible de récupérer le profil')); return }
        accounts[user.email] = { token, user }
        saveAccounts(accounts)
        resolve({ token, user })
      },
    })
    client.requestAccessToken({ prompt: hint ? '' : 'select_account' })
  })
}

export function disconnectGmail(email) {
  if (email) {
    const acct = accounts[email]
    if (acct?.token && window.google) window.google.accounts.oauth2.revoke(acct.token)
    delete accounts[email]
  } else {
    // Disconnect all
    for (const acct of Object.values(accounts)) {
      if (acct.token && window.google) window.google.accounts.oauth2.revoke(acct.token)
    }
    accounts = {}
  }
  saveAccounts(accounts)
}

// ── User info ─────────────────────────────────────────────────────────────────
async function fetchUserInfo(token) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return null
    const data = await res.json()
    return { email: data.email, name: data.name, picture: data.picture }
  } catch { return null }
}

export async function getGmailUserInfo() {
  const token = getAccessToken()
  if (!token) return null
  return fetchUserInfo(token)
}

// ── Send email ────────────────────────────────────────────────────────────────
// fromAccount: email address of the account to send from (defaults to first connected)
export async function sendEmail({ to, subject, body, fromAccount }) {
  const email = fromAccount || Object.keys(accounts)[0]
  const acct = accounts[email]
  if (!acct?.token) throw new Error('Non connecté à Gmail')

  const from = acct.user?.email ? `${acct.user.name || ''} <${acct.user.email}>`.trim() : 'me'
  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
    '',
    body,
  ].join('\r\n')

  const encoded = btoa(unescape(encodeURIComponent(mime)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${acct.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  })

  if (!res.ok) {
    if (res.status === 401) { delete accounts[email]; saveAccounts(accounts) }
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gmail send error ${res.status}`)
  }
  return await res.json()
}

// ── Refresh token for a specific account ─────────────────────────────────────
export async function refreshToken(email) {
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID manquant')
  const hint = email || getCachedUser()?.email || ''
  await waitForGoogle()
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      hint,
      callback: async (response) => {
        if (response.error) { reject(new Error(response.error)); return }
        const token = response.access_token
        const user = await fetchUserInfo(token)
        if (user) {
          accounts[user.email] = { token, user }
          saveAccounts(accounts)
        }
        resolve(token)
      },
    })
    client.requestAccessToken({ prompt: '' })
  })
}

// ── Gmail API fetch helper ────────────────────────────────────────────────────
async function gmailFetch(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    if (res.status === 401) {
      // Find and remove the stale account
      for (const [email, acct] of Object.entries(accounts)) {
        if (acct.token === token) { delete accounts[email]; saveAccounts(accounts); break }
      }
    }
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gmail API error ${res.status}`)
  }
  return res.json()
}

// ── Fetch job emails for a specific account ───────────────────────────────────
export async function fetchJobEmailsForAccount(accountEmail, maxResults = null, months = 3) {
  const acct = accounts[accountEmail]
  if (!acct?.token) throw new Error(`Non connecté : ${accountEmail}`)
  return _fetchJobEmails(acct.token, maxResults, months)
}

// Backward-compat: fetch from first connected account
export async function fetchJobEmails(maxResults = null, months = 3) {
  const first = Object.entries(accounts)[0]
  if (!first) throw new Error('Non connecté à Gmail')
  return _fetchJobEmails(first[1].token, maxResults, months)
}

async function _fetchJobEmails(token, maxResults, months) {
  const autoLimit = Math.min(months * 60, 500)
  maxResults = maxResults ?? autoLimit
  const days = months * 30

  const noAlerts = `-subject:"job alert" -subject:"jobs you might like" -subject:"recommended jobs" -subject:"new jobs for you" -subject:"offres d'emploi" -subject:"nouvelles offres" -subject:"alertes emploi" -subject:"emplois recommandés" -subject:"suggested job" -subject:"candidature suggérée" -subject:"jobs suggested" -subject:"offres suggérées" -subject:"new jobs matching" -subject:"emplois correspondant" -subject:"offre recommandée" -subject:"recommended job for you"`

  const queries = [
    `in:inbox (candidature OR postulation OR entretien OR recrutement OR "votre candidature" OR "Votre candidature" OR "votre profil" OR "nous avons bien reçu" OR "suite à votre candidature" OR "nous avons le regret" OR "sans suite" OR "n'avons pas retenu") ${noAlerts} newer_than:${days}d`,
    `in:all (interview OR "thank you for applying" OR "thanks for applying" OR "thanks for your application" OR "thank you for your application" OR "application received" OR "your application" OR "application viewed" OR "was viewed" OR "viewed your application" OR "we have received" OR "we regret" OR "not selected" OR "not moving forward" OR "job offer" OR "offer letter" OR "next steps" OR "hiring process") ${noAlerts} newer_than:${days}d`,
    `in:all (from:ashbyhq.com OR from:greenhouse.io OR from:lever.co OR from:workable.com OR from:teamtailor.com OR from:recruitee.com OR from:bamboohr.com OR from:smartrecruiters.com OR from:jobvite.com OR from:icims.com OR from:myworkdayjobs.com OR from:taleo.net) newer_than:${days}d`,
    `in:all (from:linkedin.com OR from:welcometothejungle.com OR from:apec.fr OR from:indeed.com OR from:monster.fr OR from:cadremploi.fr OR from:hellowork.com OR from:jobteaser.com) (candidature OR application OR entretien OR interview OR "InMail" OR recruteur OR recruiter OR "votre profil" OR "was viewed" OR "viewed") ${noAlerts} newer_than:${days}d`,
    `in:all from:linkedin.com (subject:"was viewed" OR subject:"application was viewed" OR subject:"viewed your application" OR subject:"a été consultée" OR subject:"votre candidature a" OR subject:"application to") newer_than:${days}d`,
    `in:inbox (from:talent@ OR from:recrutement@ OR from:rh@ OR from:careers@ OR from:jobs@ OR from:hiring@ OR from:recruiter@) ${noAlerts} newer_than:${days}d`,
    `in:sent (has:attachment OR subject:candidature OR subject:postulation OR "je postule" OR "je vous contacte" OR "je me permets" OR "I am applying" OR "please find my CV" OR "please find attached my resume") newer_than:${days}d`,
  ]

  const allMessageIds = new Set()
  const allMessages = []

  const runQuery = async (query) => {
    try {
      const data = await gmailFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.min(months * 20, 100)}&q=${encodeURIComponent(query)}`,
        token
      )
      for (const m of (data.messages || [])) {
        if (!allMessageIds.has(m.id)) { allMessageIds.add(m.id); allMessages.push(m) }
      }
    } catch (e) { console.warn('Query failed:', query.slice(0, 60), e.message) }
  }

  for (let i = 0; i < queries.length; i += 3) {
    await Promise.all(queries.slice(i, i + 3).map(runQuery))
    if (i + 3 < queries.length) await new Promise(r => setTimeout(r, 200))
  }

  if (!allMessages.length) return []
  const toFetch = allMessages.slice(0, maxResults)
  const emails = []
  for (let i = 0; i < toFetch.length; i += 5) {
    const results = await Promise.all(toFetch.slice(i, i + 5).map(m => fetchEmailDetail(m.id, token)))
    emails.push(...results.filter(Boolean))
    if (i + 5 < toFetch.length) await new Promise(r => setTimeout(r, 100))
  }
  return emails
}

function decodeBase64(str) {
  try { return decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/')))) }
  catch { try { return atob(str.replace(/-/g, '+').replace(/_/g, '/')) } catch { return '' } }
}

function extractBody(payload) {
  if (!payload) return ''
  if (payload.body?.data) return decodeBase64(payload.body.data)
  if (payload.parts) {
    const plain = payload.parts.find(p => p.mimeType === 'text/plain')
    if (plain?.body?.data) return decodeBase64(plain.body.data)
    const html = payload.parts.find(p => p.mimeType === 'text/html')
    if (html?.body?.data) return decodeBase64(html.body.data).replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
    for (const part of payload.parts) {
      if (part.parts) { const nested = extractBody(part); if (nested) return nested }
    }
  }
  return ''
}

async function fetchEmailDetail(id, token) {
  try {
    const data = await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, token)
    const headers = data.payload?.headers || []
    const get = (name) => headers.find(h => h.name === name)?.value || ''
    const body = extractBody(data.payload).slice(0, 2000)
    const isSent = (data.labelIds || []).includes('SENT')
    return {
      id: data.id,
      subject: get('Subject'),
      from: isSent ? get('To') : get('From'),
      fromMe: isSent,
      date: get('Date'),
      snippet: data.snippet || '',
      body,
    }
  } catch { return null }
}
