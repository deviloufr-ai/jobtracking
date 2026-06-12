import { supabase } from './supabase'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'

// ── Multi-account storage ─────────────────────────────────────────────────────
// accounts: { [email]: { token: string, user: { email, name, picture } } }
const ACCOUNTS_KEY = 'jt_gmail_accounts'
const SYNC_USER_KEY = 'jt_sync_user_id'

function loadAccounts() {
  try { const raw = localStorage.getItem(ACCOUNTS_KEY); return raw ? JSON.parse(raw) : {} } catch { return {} }
}
function saveAccounts(map) {
  try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(map)) } catch {}
}

// Get sync user ID - cached in localStorage, syncs with Supabase in background
// All devices with the same Gmail email get the same UUID
function getSyncUserId() {
  // Return cached value synchronously
  let syncId = localStorage.getItem(SYNC_USER_KEY)

  // Handle legacy format
  if (syncId?.startsWith('sync-user-')) {
    const pureUuid = syncId.substring('sync-user-'.length)
    try { localStorage.setItem(SYNC_USER_KEY, pureUuid) } catch {}
    syncId = pureUuid
  }

  if (syncId) {
    return syncId
  }

  // Generate new UUID if not cached
  const newUuid = crypto.randomUUID()
  try { localStorage.setItem(SYNC_USER_KEY, newUuid) } catch {}

  // Background sync: query and cache from Supabase
  const firstAccount = Object.values(accounts)[0]
  const gmailEmail = firstAccount?.user?.email

  if (gmailEmail) {
    supabase
      .from('gmail_user_sync_mapping')
      .select('sync_uuid')
      .eq('gmail_email', gmailEmail)
      .maybeSingle()
      .then(({ data: existing }) => {
        if (existing?.sync_uuid) {
          console.log('✓ Found existing sync UUID for:', gmailEmail)
          try { localStorage.setItem(SYNC_USER_KEY, existing.sync_uuid) } catch {}
        } else {
          // Create new mapping
          supabase
            .from('gmail_user_sync_mapping')
            .insert({ gmail_email: gmailEmail, sync_uuid: newUuid })
            .then(() => console.log('✓ Created new sync UUID for:', gmailEmail))
            .catch(err => console.warn('Failed to insert sync mapping:', err))
        }
      })
      .catch(err => console.warn('Error syncing UUID:', err))
  }

  return newUuid
}

// Async version that waits for Supabase lookup (fixes incognito mode sync)
export async function resolveSyncUserId() {
  // Return cached value if available
  let syncId = localStorage.getItem(SYNC_USER_KEY)

  // Handle legacy format
  if (syncId?.startsWith('sync-user-')) {
    const pureUuid = syncId.substring('sync-user-'.length)
    try { localStorage.setItem(SYNC_USER_KEY, pureUuid) } catch {}
    syncId = pureUuid
  }

  if (syncId) {
    return syncId
  }

  // Generate new UUID as fallback
  const newUuid = crypto.randomUUID()
  try { localStorage.setItem(SYNC_USER_KEY, newUuid) } catch {}

  // Get or obtain Gmail email for Supabase lookup
  let firstAccount = Object.values(accounts)[0]
  let gmailEmail = firstAccount?.user?.email
  console.log('📧 Accounts in memory:', Object.keys(accounts).length, 'gmailEmail:', gmailEmail)

  // If no logged-in account in memory, try reloading from localStorage (in case module state is stale)
  if (!gmailEmail) {
    const storedAccounts = loadAccounts()
    const storedAccount = Object.values(storedAccounts)[0]
    gmailEmail = storedAccount?.user?.email
    if (gmailEmail && !firstAccount) firstAccount = storedAccount
    console.log('📧 Reloaded from localStorage:', Object.keys(storedAccounts).length, 'gmailEmail:', gmailEmail)
  }

  // If still no email, trigger OAuth to get email (fixes incognito mode)
  if (!gmailEmail) {
    console.log('🔐 No Gmail account found, requesting OAuth login for UUID lookup...')
    try {
      await connectGmail()
      // Reload accounts from localStorage after OAuth (more reliable than module variable)
      const freshAccounts = loadAccounts()
      firstAccount = Object.values(freshAccounts)[0]
      gmailEmail = firstAccount?.user?.email
      console.log('✅ OAuth completed, reloaded accounts:', Object.keys(freshAccounts).length, 'gmailEmail:', gmailEmail)

      if (!gmailEmail) {
        console.warn('⚠️ OAuth completed but no email found in accounts')
        return newUuid
      }
    } catch (err) {
      console.warn('⚠️ OAuth failed, proceeding with generated UUID:', err)
      return newUuid
    }
  }

  // Now lookup or create UUID mapping using Gmail email
  if (gmailEmail) {
    try {
      console.log('🔍 Looking up sync UUID for email:', gmailEmail)
      const { data: existing } = await supabase
        .from('gmail_user_sync_mapping')
        .select('sync_uuid')
        .eq('gmail_email', gmailEmail)
        .maybeSingle()

      if (existing?.sync_uuid) {
        console.log('✓ Found existing sync UUID for:', gmailEmail, '→', existing.sync_uuid)
        try { localStorage.setItem(SYNC_USER_KEY, existing.sync_uuid) } catch {}
        return existing.sync_uuid
      } else {
        // Create new mapping
        console.log('📝 Creating new sync UUID mapping for:', gmailEmail, '→', newUuid)
        await supabase
          .from('gmail_user_sync_mapping')
          .insert({ gmail_email: gmailEmail, sync_uuid: newUuid })
        console.log('✓ Created new sync UUID for:', gmailEmail)
        return newUuid
      }
    } catch (err) {
      console.warn('Error resolving sync UUID:', err)
      return newUuid
    }
  }

  console.warn('⚠️ No gmailEmail available, using generated UUID:', newUuid)
  return newUuid
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

export function getSyncUserIdForSupabase() {
  return getSyncUserId()
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
      // Use 'select_account' to allow persistence + 'consent' only if needed
      callback: async (response) => {
        if (response.error) { reject(new Error(response.error)); return }
        const token = response.access_token
        // Fetch user info for this token
        const user = await fetchUserInfo(token)
        if (!user) { reject(new Error('Impossible de récupérer le profil')); return }
        accounts[user.email] = {
          token,
          user,
          tokenExpiry: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
        }
        saveAccounts(accounts)
        resolve({ token, user })
      },
    })
    // Request token with select_account prompt for persistence
    client.requestAccessToken({ prompt: hint ? '' : 'select_account' })
  })
}

// Auto-refresh token if expired
export async function ensureValidToken(email = '') {
  // Fixed: corrected ternary operator logic
  const targetEmail = email || Object.keys(accounts)[0] || null
  if (!targetEmail) return null

  const acct = accounts[targetEmail]
  if (!acct) return null

  // Check if token is expired or about to expire (within 5 minutes)
  const expiry = acct.tokenExpiry ? new Date(acct.tokenExpiry) : null
  const now = new Date()

  if (expiry && now >= new Date(expiry.getTime() - 5 * 60000)) {
    // Token expired, need to refresh
    try {
      await connectGmail(targetEmail)
    } catch (e) {
      console.warn('Token refresh failed:', e.message)
      return acct.token
    }
  }

  return acct.token
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

// Validate and reuse stored tokens on app startup
// Tokens are kept in localStorage as long as they're valid
export function autoReuseStoredTokens() {
  const stored = loadAccounts()
  if (Object.keys(stored).length === 0) return

  // Restore accounts from localStorage - tokens will be reused if valid
  // If tokens expire, user will be asked to reconnect on next Gmail action
  accounts = stored
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
          // Fixed: add tokenExpiry to refreshed token
          accounts[user.email] = {
            token,
            user,
            tokenExpiry: new Date(Date.now() + 3600000).toISOString()
          }
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
export async function fetchJobEmailsForAccount(accountEmail, maxResults = null, months = null, dateRange = null, lastSyncTime = null, companies = null) {
  // Ensure token is valid and refresh if expired
  const token = await ensureValidToken(accountEmail)
  if (!token) throw new Error(`Non connecté : ${accountEmail}`)

  // Smart period: 3 months on first import, 1 day on refreshes with lastSyncTime
  const actualMonths = months !== null ? months : (lastSyncTime ? 1/30 : 3)
  return _fetchJobEmails(token, maxResults, actualMonths, dateRange, lastSyncTime, companies)
}

// Fetch from ALL connected accounts (merged + deduplicated)
// lastSyncTime: optional ISO timestamp - if provided, only fetch emails after this time
// If no lastSyncTime: fetch 3 months (first import), otherwise use 1 day incremental
// companies: optional array of company names to search for
export async function fetchJobEmails(maxResults = null, months = null, dateRange = null, lastSyncTime = null, companies = null) {
  const accountEntries = Object.entries(accounts)
  if (accountEntries.length === 0) throw new Error('Non connecté à Gmail')

  // Smart period: 3 months on first import, 1 day on refreshes with lastSyncTime
  const actualMonths = months !== null ? months : (lastSyncTime ? 1/30 : 3)

  // Ensure all tokens are valid and refresh if expired
  const validTokens = await Promise.all(
    accountEntries.map(([email]) => ensureValidToken(email))
  )

  // Fetch from all accounts in parallel using valid tokens
  const results = await Promise.all(
    accountEntries.map(([email], i) => _fetchJobEmails(validTokens[i], maxResults, actualMonths, dateRange, lastSyncTime, companies))
  )

  // Merge and deduplicate by email ID + data (prevents same email from multiple queries)
  const seenIds = new Set()
  const seenData = new Set()
  const merged = []
  for (const emails of results) {
    for (const e of emails) {
      // Primary dedup: email ID
      if (seenIds.has(e.id)) continue
      // Secondary dedup: prevent same email from appearing via different queries
      // e.g., query ⑤ and ⑤b both returning the same Winside email
      const dataKey = `${e.from || ''}_${e.subject || ''}_${e.date || ''}`
      if (seenData.has(dataKey)) continue

      seenIds.add(e.id)
      seenData.add(dataKey)
      merged.push(e)
    }
  }
  return merged
}

// Gmail category labels returned by the API
const GMAIL_CAT_MAP = {
  CATEGORY_UPDATES: 'updates',
  CATEGORY_PERSONAL: 'personal',
  CATEGORY_SOCIAL: 'social',
  CATEGORY_PROMOTIONS: 'promotions',
  CATEGORY_FORUMS: 'forums',
}

async function _fetchJobEmails(token, maxResults, months, dateRange = null, lastSyncTime = null, companies = null) {
  // Build date filter: smart incremental sync if lastSyncTime provided
  let dateFilter
  let effectiveMonths = months

  if (lastSyncTime) {
    // Incremental sync: only fetch emails after last sync
    const lastSync = new Date(lastSyncTime)
    const year = lastSync.getFullYear()
    const month = String(lastSync.getMonth() + 1).padStart(2, '0')
    const day = String(lastSync.getDate()).padStart(2, '0')
    const hours = String(lastSync.getHours()).padStart(2, '0')
    const mins = String(lastSync.getMinutes()).padStart(2, '0')
    dateFilter = `after:${year}/${month}/${day} ${hours}:${mins}`
    effectiveMonths = 1  // Focus on recent results
  } else if (dateRange?.startDate && dateRange?.endDate) {
    const fmt = d => d.replace(/-/g, '/')
    // Add 1 day to endDate because "before" excludes the date itself
    const nextDay = new Date(dateRange.endDate)
    nextDay.setDate(nextDay.getDate() + 1)
    const nextDayStr = nextDay.toISOString().split('T')[0]
    dateFilter = `after:${fmt(dateRange.startDate)} before:${fmt(nextDayStr)}`
    // Estimate months for maxResults calculation
    const ms = new Date(dateRange.endDate) - new Date(dateRange.startDate)
    effectiveMonths = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24 * 30)))
  } else {
    const days = months * 30
    dateFilter = `newer_than:${days}d`
  }

  const autoLimit = Math.floor(Math.min(effectiveMonths * 60, 500))
  maxResults = maxResults ?? autoLimit

  // Gmail-native category filter — "promotions" = newsletters/job alerts → skip entirely
  const noPromo = `-category:promotions -category:forums`
  const noAlerts = `-subject:"job alert" -subject:"jobs you might like" -subject:"recommended jobs" -subject:"new jobs for you" -subject:"offres d'emploi" -subject:"nouvelles offres" -subject:"alertes emploi" -subject:"emplois recommandés" -subject:"suggested job" -subject:"candidature suggérée" -subject:"jobs suggested" -subject:"offres suggérées" -subject:"new jobs matching" -subject:"emplois correspondant" -subject:"offre recommandée" -subject:"recommended job for you"`
  const baseExclude = `${noPromo} ${noAlerts}`

  const queries = [
    // ① Gmail "Updates" category = transactional — best signal for ATS/confirmations
    `category:updates (candidature OR application OR entretien OR interview OR recrutement OR recruteur OR recruiter OR "votre candidature" OR "thank you for applying" OR "application received" OR "your application" OR "we regret" OR "not selected" OR "job offer" OR "next steps") ${dateFilter}`,
    // ① Inbox emails with common job keywords (broader net)
    `in:inbox (job AND (offer OR application OR candidature)) ${dateFilter}`,
    // ② Personal inbox keywords (FR)
    `in:inbox category:personal (candidature OR postulation OR entretien OR recrutement OR "votre candidature" OR "nous avons bien reçu" OR "suite à votre candidature" OR "nous avons le regret" OR "sans suite" OR "n'avons pas retenu") ${dateFilter}`,
    // ②b Recruiter acknowledgement emails (FR)
    `in:all "nous vous remercions" ${dateFilter}`,
    // ②c Recruiter interview invitation emails (FR) — both "faire plus ample connaissance" patterns
    `in:all ("faire plus ample connaissance" OR "ample connaissance") ${dateFilter}`,
    // ②d Talent acquisition emails
    `in:all ("head of talent" OR "talent acquisition" OR "talent recruiter") ${dateFilter}`,
    // ③ Personal inbox keywords (EN)
    `in:inbox category:personal (interview OR "thank you for applying" OR "thanks for applying" OR "application received" OR "your application" OR "we have received" OR "we regret" OR "not selected" OR "not moving forward" OR "job offer" OR "offer letter" OR "next steps" OR "hiring process") ${dateFilter}`,
    // ④ ATS platforms — always relevant regardless of category
    `in:all (from:ashbyhq.com OR from:greenhouse.io OR from:lever.co OR from:workable.com OR from:teamtailor.com OR from:teamtailor-mail.com OR from:recruitee.com OR from:bamboohr.com OR from:smartrecruiters.com OR from:jobvite.com OR from:icims.com OR from:myworkdayjobs.com OR from:taleo.net) ${dateFilter}`,
    // ④b Broad ATS confirmation pattern — catch "we have received your application" type confirmations
    `in:all ("we have received" OR "application received" OR "application confirmed" OR "thanks for applying") (application OR candidature OR candidacy) ${dateFilter}`,
    // ⑤ Job boards — only when accompanied by real action keywords
    `in:all (from:linkedin.com OR from:jobs-noreply@linkedin.com OR from:welcometothejungle.com OR from:apec.fr OR from:indeed.com OR from:monster.fr OR from:cadremploi.fr OR from:hellowork.com OR from:jobteaser.com) (candidature OR application OR entretien OR interview OR "InMail" OR recruteur OR recruiter OR "was viewed" OR "viewed" OR sent OR applied OR confirmation OR "application sent" OR "applied to") ${noAlerts} ${dateFilter}`,
    // ⑤b LinkedIn application confirmations — explicit subject match
    `from:jobs-noreply@linkedin.com subject:"your application was sent" ${dateFilter}`,
    // ⑥ Recruiter-pattern senders in inbox
    `in:inbox (from:talent@ OR from:recrutement@ OR from:rh@ OR from:careers@ OR from:jobs@ OR from:hiring@ OR from:recruiter@) ${baseExclude} ${dateFilter}`,
    // ⑦ Sent emails (outbound applications)
    `in:sent (has:attachment OR subject:candidature OR subject:postulation OR "je postule" OR "je vous contacte" OR "je me permets" OR "I am applying" OR "please find my CV" OR "please find attached my resume") ${dateFilter}`,
  ]

  // ⑧ Company-based search — if candidature companies exist, search for emails mentioning each company
  if (companies && companies.length > 0) {
    // Filter and normalize company names (remove empty, trim whitespace)
    const validCompanies = companies
      .map(c => c.trim())
      .filter(c => c.length > 0 && c.length < 100) // Avoid empty or unreasonably long names
      .slice(0, 20) // Limit to 20 companies to avoid query explosion

    for (const company of validCompanies) {
      // Escape special Gmail search characters and quote the company name for exact matching
      const escapedCompany = company.replace(/"/g, '\\"')
      // Search for company name alone - simpler syntax, more reliable with Gmail API
      // Other queries will catch the job keywords, this just ensures company emails are found
      queries.push(
        `in:all "${escapedCompany}" ${dateFilter}`
      )
    }
  }

  const allMessageIds = new Set()
  const allMessages = []

  const runQuery = async (query) => {
    try {
      console.log(`📨 Running query: ${query.slice(0, 80)}...`)
      const data = await gmailFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.floor(Math.min(effectiveMonths * 20, 100))}&q=${encodeURIComponent(query)}`,
        token
      )
      const newCount = (data.messages || []).length
      console.log(`✅ Query returned ${newCount} emails`)
      for (const m of (data.messages || [])) {
        if (!allMessageIds.has(m.id)) { allMessageIds.add(m.id); allMessages.push(m) }
      }
    } catch (e) { console.warn('❌ Query failed:', query.slice(0, 60), e.message) }
  }

  for (let i = 0; i < queries.length; i += 6) {
    await Promise.all(queries.slice(i, i + 6).map(runQuery))
    if (i + 6 < queries.length) await new Promise(r => setTimeout(r, 100))
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
    const headers = data.payload?.headers || []
    const get = (name) => headers.find(h => h.name === name)?.value || ''
    const subject = get('Subject')
    const from = get('From')

    console.log(`📧 Processing email: "${subject}" from ${from}`)

    // Safety net: drop promotional/forum emails even if they slipped through query filters
    if (labelIds.includes('CATEGORY_PROMOTIONS') || labelIds.includes('CATEGORY_FORUMS')) {
      console.log(`   ❌ Filtered: Promotional/Forum category`)
      return null
    }

    const body = extractBody(data.payload).slice(0, 2000)

    // Drop job-alert / digest emails based on sender + subject patterns
    const fromRaw = get('From').toLowerCase()
    const subjectRaw = get('Subject').toLowerCase()
    const snippetRaw = (data.snippet || '').toLowerCase()

    // Known ATS domains always pass through — their no-reply addresses are legit
    const ATS_DOMAINS = ['greenhouse.io','lever.co','ashbyhq.com','workable.com','teamtailor.com','teamtailor-mail.com',
      'recruitee.com','bamboohr.com','smartrecruiters.com','jobvite.com','icims.com',
      'myworkdayjobs.com','taleo.net']
    // LinkedIn application confirmations are legitimate, not job alerts
    const LINKEDIN_APP_CONFIRMATION = subjectRaw.includes('your application was sent') &&
                                       fromRaw.includes('jobs-noreply@linkedin.com')
    const isATS = ATS_DOMAINS.some(d => fromRaw.includes(d)) || LINKEDIN_APP_CONFIRMATION

    if (isATS) {
      console.log(`   ✅ Passed: Recognized ATS domain`)
    }

    if (!isATS) {
      // ① Sender blocklist — job board alerts + marketing/CRM bulk senders
      // Note: noreply@ from known recruiters is OK (checked separately via isRecruiterNoreply)
      const JOB_ALERT_SENDERS = [
        'notification@emails.hellowork', 'jobalerts@', 'jobalertes@',
        'newsletter@', 'digest@', 'news@', 'mailer@', 'info@emails.',
        'donotreply@match.indeed.com', '@match.indeed.com', 'match@indeed.com',
        'suggested@indeed.com', 'recommendations@indeed.com',
        // Marketing/CRM bulk-sending subdomains — used by brands, never by recruiters
        '@crm.', '@email.', '@send.', '@promo.', '@marketing.', // Removed 'noreply@', 'no-reply@' — checked separately
      ]

      // Recruiter noreply addresses are legitimate (not job alerts)
      const RECRUITER_NOREPLY_PATTERNS = ['recrutement@', 'recruiting@', 'careers@', 'jobs@', 'hiring@', 'talent@', 'rh@']
      const RECRUITER_KEYWORDS = ['candidature', 'application', 'entretien', 'interview', 'nous vous remercions',
                                   'faire plus ample connaissance', 'product owner', 'product manager', 'head of talent']
      const hasRecruiterSignal = RECRUITER_KEYWORDS.some(k => (subjectRaw.includes(k) || snippetRaw.includes(k)))

      const isRecruiterNoreply = (RECRUITER_NOREPLY_PATTERNS.some(p => fromRaw.includes(p)) ||
                                   hasRecruiterSignal) &&
                                  (fromRaw.includes('noreply@') || fromRaw.includes('no-reply@'))

      const isFromBlocklist = JOB_ALERT_SENDERS.some(s => fromRaw.includes(s))

      // Noreply addresses are job alerts UNLESS they're from known recruiter patterns OR have recruiter keywords
      const noreplyAlert = (fromRaw.includes('noreply@') || fromRaw.includes('no-reply@')) && !isRecruiterNoreply

      if (isFromBlocklist || noreplyAlert) {
        console.log(`   ❌ Filtered: Job alert sender/noreply (blocklist: ${isFromBlocklist}, noreplyAlert: ${noreplyAlert})`)
        return null
      }
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
      if (isJobAlert) {
        console.log(`   ❌ Filtered: Job alert subject`)
        return null
      }

      // ② Subject/snippet keyword pre-filter — skip Claude if no job signal at all
      const JOB_SUBJECT_KEYWORDS = [
        // FR
        'candidature','postulation','entretien','recrutement','recruteur','recruteuse',
        'nous avons bien reçu','votre candidature','suite à votre','nous avons le regret',
        'sans suite','n\'avons pas retenu','offre d\'emploi','poste de','proposition d\'embauche',
        'test technique','cas pratique','prise de contact','nous serions ravis','opportunité',
        'postuler','postulé','candidat','négociation salariale','embauche',
        // FR acknowledgement/recruiter emails
        'nous vous remercions','nous allons étudier','reprendrons contact','merci de votre',
        'merci de votre confiance','nous retenons','nous vous contactrons','délai de',
        'base de données','avons le regret','n\'a pas retenu','reste informé',
        // FR interview invitation / engagement emails
        'faire plus ample connaissance','ample connaissance','échange sera l','projeter au sein',
        'attentes et vous','talent acquisition','head of talent','recrutement','créneau qui vous',
        'product owner','product manager','chef de projet',
        // EN
        'application','interview','hiring','recruiter','thank you for applying',
        'thanks for applying','application received','your application','we regret',
        'not selected','not moving forward','job offer','offer letter','next steps',
        'hiring process','we\'d love','inmail','viewed your application',
        'applied','applied to','candidate','salary negotiation',
        'get to know you','meet with you','schedule a call','time slot','available times',
      ]
      const hasJobSignal = JOB_SUBJECT_KEYWORDS.some(k => subjectRaw.includes(k) || snippetRaw.includes(k))
      if (!hasJobSignal) {
        console.log(`   ❌ Filtered: No job signal keywords found`)
        return null
      }
      console.log(`   ✅ Passed: Has job signal keywords`)
    }
    const isSent = labelIds.includes('SENT')

    // Detect Gmail category for Claude confidence hint
    const gmailCategory = Object.entries(GMAIL_CAT_MAP).find(([k]) => labelIds.includes(k))?.[1] || null

    console.log(`   ✅ Email accepted and will be sent to Claude`)
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
  } catch (e) {
    console.error(`   ❌ Error fetching email detail:`, e.message)
    return null
  }
}
