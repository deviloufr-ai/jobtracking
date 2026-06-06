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
// Returns { url, account, uncertain } for a Gmail message deep link
// account = which Gmail account will be used
// uncertain = true when we're guessing (no receivedBy stored on the entry)
export function gmailMessageUrl(gmailId, receivedBy) {
  const connectedEmails = Object.keys(accounts)

  // Determine which account to use
  let account = receivedBy || null

  // Fallback: if only one account is connected, use it
  if (!account && connectedEmails.length === 1) {
    account = connectedEmails[0]
  }

  const uncertain = !receivedBy && connectedEmails.length > 1
  const auth = account ? `?authuser=${encodeURIComponent(account)}` : ''
  const url = `https://mail.google.com/mail/${auth}#inbox/${gmailId}`

  return { url, account, uncertain }
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
export async function fetchJobEmailsForAccount(accountEmail, maxResults = null, months = 3, dateRange = null) {
  const acct = accounts[accountEmail]
  if (!acct?.token) throw new Error(`Non connecté : ${accountEmail}`)
  return _fetchJobEmails(acct.token, maxResults, months, dateRange)
}

// Backward-compat: fetch from first connected account
export async function fetchJobEmails(maxResults = null, months = 3, dateRange = null) {
  const first = Object.entries(accounts)[0]
  if (!first) throw new Error('Non connecté à Gmail')
  return _fetchJobEmails(first[1].token, maxResults, months, dateRange)
}

// Gmail category labels returned by the API
const GMAIL_CAT_MAP = {
  CATEGORY_UPDATES: 'updates',
  CATEGORY_PERSONAL: 'personal',
  CATEGORY_SOCIAL: 'social',
  CATEGORY_PROMOTIONS: 'promotions',
  CATEGORY_FORUMS: 'forums',
}

async function _fetchJobEmails(token, maxResults, months, dateRange = null) {
  // Build date filter: either explicit range or relative months
  let dateFilter
  let effectiveMonths = months
  if (dateRange?.startDate && dateRange?.endDate) {
    const fmt = d => d.replace(/-/g, '/')
    dateFilter = `after:${fmt(dateRange.startDate)} before:${fmt(dateRange.endDate)}`
    // Estimate months for maxResults calculation
    const ms = new Date(dateRange.endDate) - new Date(dateRange.startDate)
    effectiveMonths = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24 * 30)))
  } else {
    const days = months * 30
    dateFilter = `newer_than:${days}d`
  }

  const autoLimit = Math.min(effectiveMonths * 60, 500)
  maxResults = maxResults ?? autoLimit

  // Gmail-native category filter — "promotions" = newsletters/job alerts → skip entirely
  const noPromo = `-category:promotions -category:forums`
  const noAlerts = `-subject:"job alert" -subject:"jobs you might like" -subject:"recommended jobs" -subject:"new jobs for you" -subject:"offres d'emploi" -subject:"nouvelles offres" -subject:"alertes emploi" -subject:"emplois recommandés" -subject:"suggested job" -subject:"candidature suggérée" -subject:"jobs suggested" -subject:"offres suggérées" -subject:"new jobs matching" -subject:"emplois correspondant" -subject:"offre recommandée" -subject:"recommended job for you"`
  const baseExclude = `${noPromo} ${noAlerts}`

  const queries = [
    // ① Gmail "Updates" category = transactional — best signal for ATS/confirmations
    `category:updates (candidature OR application OR entretien OR interview OR recrutement OR recruteur OR recruiter OR "votre candidature" OR "thank you for applying" OR "application received" OR "your application" OR "we regret" OR "not selected" OR "job offer" OR "next steps") ${dateFilter}`,
    // ② Personal inbox keywords (FR)
    `in:inbox category:personal (candidature OR postulation OR entretien OR recrutement OR "votre candidature" OR "nous avons bien reçu" OR "suite à votre candidature" OR "nous avons le regret" OR "sans suite" OR "n'avons pas retenu") ${dateFilter}`,
    // ③ Personal inbox keywords (EN)
    `in:inbox category:personal (interview OR "thank you for applying" OR "thanks for applying" OR "application received" OR "your application" OR "we have received" OR "we regret" OR "not selected" OR "not moving forward" OR "job offer" OR "offer letter" OR "next steps" OR "hiring process") ${dateFilter}`,
    // ④ ATS platforms — always relevant regardless of category
    `in:all (from:ashbyhq.com OR from:greenhouse.io OR from:lever.co OR from:workable.com OR from:teamtailor.com OR from:recruitee.com OR from:bamboohr.com OR from:smartrecruiters.com OR from:jobvite.com OR from:icims.com OR from:myworkdayjobs.com OR from:taleo.net) ${dateFilter}`,
    // ⑤ Job boards — only when accompanied by real action keywords
    `in:all (from:linkedin.com OR from:welcometothejungle.com OR from:apec.fr OR from:indeed.com OR from:monster.fr OR from:cadremploi.fr OR from:hellowork.com OR from:jobteaser.com) (candidature OR application OR entretien OR interview OR "InMail" OR recruteur OR recruiter OR "was viewed" OR "viewed") ${noAlerts} ${dateFilter}`,
    // ⑥ Recruiter-pattern senders in inbox
    `in:inbox (from:talent@ OR from:recrutement@ OR from:rh@ OR from:careers@ OR from:jobs@ OR from:hiring@ OR from:recruiter@) ${baseExclude} ${dateFilter}`,
    // ⑦ Sent emails (outbound applications)
    `in:sent (has:attachment OR subject:candidature OR subject:postulation OR "je postule" OR "je vous contacte" OR "je me permets" OR "I am applying" OR "please find my CV" OR "please find attached my resume") ${dateFilter}`,
  ]

  const allMessageIds = new Set()
  const allMessages = []

  const runQuery = async (query) => {
    try {
      const data = await gmailFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.min(effectiveMonths * 20, 100)}&q=${encodeURIComponent(query)}`,
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
    const labelIds = data.labelIds || []

    // Safety net: drop promotional/forum emails even if they slipped through query filters
    if (labelIds.includes('CATEGORY_PROMOTIONS') || labelIds.includes('CATEGORY_FORUMS')) return null

    const headers = data.payload?.headers || []
    const get = (name) => headers.find(h => h.name === name)?.value || ''
    const body = extractBody(data.payload).slice(0, 2000)

    // Drop job-alert / digest emails based on sender + subject patterns
    const fromRaw = get('From').toLowerCase()
    const subjectRaw = get('Subject').toLowerCase()
    const snippetRaw = (data.snippet || '').toLowerCase()

    // Known ATS domains always pass through — their no-reply addresses are legit
    const ATS_DOMAINS = ['greenhouse.io','lever.co','ashbyhq.com','workable.com','teamtailor.com',
      'recruitee.com','bamboohr.com','smartrecruiters.com','jobvite.com','icims.com',
      'myworkdayjobs.com','taleo.net']
    const isATS = ATS_DOMAINS.some(d => fromRaw.includes(d))

    if (!isATS) {
      // ① Sender blocklist — job board alerts + marketing/CRM bulk senders
      const JOB_ALERT_SENDERS = [
        'notification@emails.hellowork', 'jobalerts@', 'jobalertes@',
        'newsletter@', 'digest@', 'news@', 'mailer@', 'info@emails.',
        'donotreply@match.indeed.com', '@match.indeed.com', 'match@indeed.com',
        'suggested@indeed.com', 'recommendations@indeed.com',
        // Marketing/CRM bulk-sending subdomains — used by brands, never by recruiters
        '@crm.', '@email.', '@send.', '@promo.', '@marketing.', 'noreply@', 'no-reply@',
      ]
      const JOB_ALERT_SUBJECTS = [
        'nouvelles offres', 'new jobs', 'offres d\'emploi', 'offres recommand',
        'emplois recommand', 'job alert', 'jobs you might like', 'candidatures suggest',
        'suggested job', 'offres suggest', 'new jobs matching', 'emplois correspondant',
        'offre recommand', 'recommended job', 'jobs matching your', 'recrute un ', 'recrute une ',
        'votre parcours pourrait correspondre', 'pourrait correspondre pour', 'correspond à votre profil',
        'your profile matches', 'matches your experience', 'job match',
      ]
      const isJobAlert = JOB_ALERT_SENDERS.some(s => fromRaw.includes(s))
        || JOB_ALERT_SUBJECTS.some(s => subjectRaw.includes(s))
      if (isJobAlert) return null

      // ② Subject/snippet keyword pre-filter — skip Claude if no job signal at all
      const JOB_SUBJECT_KEYWORDS = [
        // FR
        'candidature','postulation','entretien','recrutement','recruteur','recruteuse',
        'nous avons bien reçu','votre candidature','suite à votre','nous avons le regret',
        'sans suite','n\'avons pas retenu','offre d\'emploi','poste de','proposition d\'embauche',
        'test technique','cas pratique','prise de contact','nous serions ravis','opportunité',
        // EN
        'application','interview','hiring','recruiter','thank you for applying',
        'thanks for applying','application received','your application','we regret',
        'not selected','not moving forward','job offer','offer letter','next steps',
        'hiring process','we\'d love','inmail','viewed your application',
      ]
      const hasJobSignal = JOB_SUBJECT_KEYWORDS.some(k => subjectRaw.includes(k) || snippetRaw.includes(k))
      if (!hasJobSignal) return null
    }
    const isSent = labelIds.includes('SENT')

    // Detect Gmail category for Claude confidence hint
    const gmailCategory = Object.entries(GMAIL_CAT_MAP).find(([k]) => labelIds.includes(k))?.[1] || null

    return {
      id: data.id,
      subject: get('Subject'),
      from: isSent ? get('To') : get('From'),
      fromMe: isSent,
      date: get('Date'),
      snippet: data.snippet || '',
      body,
      gmailCategory, // 'updates' | 'personal' | 'social' | null
    }
  } catch { return null }
}
