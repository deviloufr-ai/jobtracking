import { supabase } from './supabase'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'
const REDIRECT_URI = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'

// Debug mode: set localStorage.debug = '1' to enable verbose logging
const DEBUG = typeof window !== 'undefined' && localStorage?.getItem('debug') === '1'
const log = (...args) => DEBUG && console.log(...args)
const logError = (...args) => console.error(...args)

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

let accounts = loadAccounts() // { email: { token, user } }

// ── Sync user ID resolution ───────────────────────────────────────────────────
// The Gmail email is the single source of truth: every device, browser, and
// incognito session logged into the SAME Gmail must converge on ONE sync UUID.
// That email→UUID mapping lives in the Supabase `gmail_user_sync_mapping` table.
//
// The previous implementation returned the locally-cached UUID without ever
// consulting the mapping table when the cache was non-empty. A fresh context
// (incognito, a second device) therefore minted its own UUID and never
// discovered the existing one — producing two different user IDs for the same
// Gmail and silently breaking sync. We now ALWAYS reconcile against the mapping
// table whenever the Gmail email is known.

function normalizeCachedSyncId() {
  let syncId = localStorage.getItem(SYNC_USER_KEY)
  // Migrate legacy 'sync-user-<uuid>' format to a bare UUID
  if (syncId?.startsWith('sync-user-')) {
    syncId = syncId.substring('sync-user-'.length)
    try { localStorage.setItem(SYNC_USER_KEY, syncId) } catch {}
  }
  return syncId
}

// Resolve ALL logged-in Gmail emails, falling back to localStorage in case the
// in-memory module state is stale on a fresh page load. A user can connect
// several Gmail accounts that all feed one JobTrackr identity, so we must
// consider every connected email — not just whichever one is "first".
function currentGmailEmails() {
  let list = Object.values(accounts).map(a => a?.user?.email).filter(Boolean)
  if (list.length === 0) {
    list = Object.values(loadAccounts()).map(a => a?.user?.email).filter(Boolean)
  }
  return [...new Set(list)]
}

function cacheSyncUuid(uuid) {
  try { localStorage.setItem(SYNC_USER_KEY, uuid) } catch {}
}

// Adopt a UUID that differs from the one we were using and tell the app to
// re-point polling / the sync coordinator at it.
function adoptSyncUuid(uuid) {
  cacheSyncUuid(uuid)
  window.dispatchEvent(new CustomEvent('jobtrackr:sync-id-updated', { detail: uuid }))
}

async function countSupabaseJobs(uuid) {
  try {
    const { count } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uuid)
    return count || 0
  } catch {
    return 0
  }
}

// Make Supabase the authoritative source for this user's sync UUID and return
// the canonical value. The user may have SEVERAL Gmail accounts connected; they
// all belong to one JobTrackr identity, so every connected email must resolve to
// the SAME UUID regardless of which account is "first" in a given session (the
// order-dependent bug that split data across multiple UUIDs).
//   • No email mapped yet  → claim `localUuid` for all of them.
//   • One UUID found        → adopt it.
//   • Several UUIDs found   → the UUID that OWNS the most data wins; then every
//     connected email is repointed at it, healing an already-diverged account
//     without stranding the populated copy.
async function reconcileSyncMapping(emails, localUuid) {
  if (!emails || emails.length === 0) return localUuid

  const { data: rows } = await supabase
    .from('gmail_user_sync_mapping')
    .select('gmail_email, sync_uuid')
    .in('gmail_email', emails)

  const existingUuids = [...new Set((rows || []).map(r => r.sync_uuid).filter(Boolean))]

  // Decide the single canonical UUID for this identity.
  let canonical
  if (existingUuids.length === 0) {
    canonical = localUuid
  } else if (existingUuids.length === 1) {
    canonical = existingUuids[0]
  } else {
    // Multiple identities exist for the same user — pick the one with most data.
    const counts = await Promise.all(
      existingUuids.map(async u => ({ uuid: u, jobs: await countSupabaseJobs(u) }))
    )
    counts.sort((a, b) => b.jobs - a.jobs)
    canonical = counts[0].uuid
    console.log('✓ Multiple sync UUIDs for this user, choosing the one with most data:', counts)
  }

  // Point EVERY connected email at the canonical UUID so account order no longer
  // matters. Only write the rows that aren't already correct.
  const alreadyCorrect = new Set(
    (rows || []).filter(r => r.sync_uuid === canonical).map(r => r.gmail_email)
  )
  const toFix = emails.filter(e => !alreadyCorrect.has(e))
  if (toFix.length > 0) {
    try {
      await supabase
        .from('gmail_user_sync_mapping')
        .upsert(
          toFix.map(e => ({ gmail_email: e, sync_uuid: canonical })),
          { onConflict: 'gmail_email' }
        )
    } catch (err) {
      console.warn('Failed to unify sync mapping across accounts:', err)
    }
  }

  if (canonical !== localUuid) adoptSyncUuid(canonical)
  else cacheSyncUuid(canonical)
  return canonical
}

// Synchronous accessor: returns a cached UUID immediately and reconciles with
// Supabase in the background so other devices converge. Prefer resolveSyncUserId()
// whenever you can await — it returns the canonical UUID directly.
function getSyncUserId() {
  let syncId = normalizeCachedSyncId()
  if (!syncId) {
    syncId = crypto.randomUUID()
    cacheSyncUuid(syncId)
  }

  const emails = currentGmailEmails()
  if (emails.length > 0) {
    reconcileSyncMapping(emails, syncId)
      .catch(err => console.warn('Background sync UUID reconcile failed:', err))
  }

  return syncId
}

// Async version: waits for the Supabase mapping lookup so the returned UUID is
// the canonical one shared across every device/incognito session for this Gmail.
export async function resolveSyncUserId() {
  const syncId = normalizeCachedSyncId()
  const emails = currentGmailEmails()
  log('📧 Resolving sync UUID — emails:', emails, 'cached:', syncId)

  // No Gmail account known yet — we can't reconcile. Reuse the cached UUID, or
  // mint a temporary one (don't auto-popup OAuth here; the user logs in manually
  // and we reconcile once the email is known).
  if (emails.length === 0) {
    if (syncId) return syncId
    console.log('ℹ️ No Gmail account found on page load - user will log in manually')
    const tempUuid = crypto.randomUUID()
    cacheSyncUuid(tempUuid)
    return tempUuid
  }

  // Gmail is known — the Supabase mapping is authoritative, even if we already
  // have a locally-cached UUID (it may be a temp UUID minted before login).
  const localUuid = syncId || crypto.randomUUID()
  try {
    return await reconcileSyncMapping(emails, localUuid)
  } catch (err) {
    console.warn('Error resolving sync UUID:', err)
    cacheSyncUuid(localUuid)
    return localUuid
  }
}

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

// Load Google OAuth script on page startup (not in connectGmail, to preserve user activation)
function initGoogleScript() {
  if (document.getElementById('google-oauth-script')) return
  const script = document.createElement('script')
  script.id = 'google-oauth-script'
  script.src = 'https://accounts.google.com/gsi/client'
  script.async = true
  script.defer = true
  document.head.appendChild(script)
}

// Call on module load to pre-load Google script
if (typeof window !== 'undefined') {
  initGoogleScript()
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

// Connect a Gmail account — uses authorization code exchange for refresh token support
// hint: optional email hint to pre-select account in Google picker
export async function connectGmail(hint = '') {
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID manquant dans .env')

  // If Google not loaded yet, wait for it (but only once)
  if (!window.google?.accounts?.oauth2) {
    await waitForGoogle()
  }

  return new Promise((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initCodeClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        hint,
        ux_mode: 'popup',
        callback: async (response) => {
          if (response.error) { reject(new Error(response.error)); return }

          try {
            // Exchange authorization code for tokens on backend
            const tokenRes = await fetch('/api/oauth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: response.code }),
            })

            if (!tokenRes.ok) {
              const err = await tokenRes.json()
              reject(new Error(err.error || 'Token exchange failed'))
              return
            }

            const tokens = await tokenRes.json()
            const token = tokens.accessToken

            // Fetch user info for this token
            const user = await fetchUserInfo(token)
            if (!user) { reject(new Error('Impossible de récupérer le profil')); return }

            // Store tokens with refresh token for silent refresh
            accounts[user.email] = {
              token,
              refreshToken: tokens.refreshToken,
              user,
              tokenExpiry: new Date(Date.now() + (tokens.expiresIn || 3600) * 1000).toISOString()
            }
            saveAccounts(accounts)
            console.log(`✅ Connected ${user.email} with refresh token support`)
            resolve({ token, user })
          } catch (err) {
            reject(err)
          }
        },
      })
      // Request authorization code with appropriate prompt
      client.requestCode()
    } catch (err) {
      reject(err)
    }
  })
}

// Auto-refresh token if expired (using refresh token for silent refresh)
export async function ensureValidToken(email = '') {
  const targetEmail = email || Object.keys(accounts)[0] || null
  if (!targetEmail) return null

  const acct = accounts[targetEmail]
  if (!acct) return null

  // Check if token is expired or about to expire (within 5 minutes)
  const expiry = acct.tokenExpiry ? new Date(acct.tokenExpiry) : null
  const now = new Date()

  if (expiry && now >= new Date(expiry.getTime() - 5 * 60000)) {
    // Token expired or expiring soon
    if (acct.refreshToken) {
      // Silent refresh using refresh token (no user interaction)
      try {
        const refreshRes = await fetch('/api/oauth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: acct.refreshToken }),
        })

        if (!refreshRes.ok) {
          const err = await refreshRes.json()
          console.warn('Silent token refresh failed:', err.error)
          // Fall back to interactive re-auth
          await connectGmail(targetEmail)
          return accounts[targetEmail]?.token || acct.token
        }

        const newTokens = await refreshRes.json()
        accounts[targetEmail] = {
          ...acct,
          token: newTokens.accessToken,
          tokenExpiry: new Date(Date.now() + (newTokens.expiresIn || 3600) * 1000).toISOString(),
        }
        saveAccounts(accounts)
        console.log(`🔄 Silently refreshed token for ${targetEmail}`)
        return newTokens.accessToken
      } catch (e) {
        console.warn('Silent refresh error:', e.message)
        // Fall back to interactive re-auth
        try {
          await connectGmail(targetEmail)
          return accounts[targetEmail]?.token || acct.token
        } catch (reAuthErr) {
          console.warn('Re-auth also failed:', reAuthErr.message)
          return acct.token // Return stale token as last resort
        }
      }
    } else {
      // No refresh token (old format), fall back to interactive re-auth
      console.log(`No refresh token for ${targetEmail}, triggering interactive re-auth`)
      try {
        await connectGmail(targetEmail)
        return accounts[targetEmail]?.token || acct.token
      } catch (e) {
        console.warn('Re-auth failed:', e.message)
        return acct.token
      }
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
export async function sendEmail({ to, subject, body, fromAccount, threadId, inReplyTo }) {
  const email = fromAccount || Object.keys(accounts)[0]
  const acct = accounts[email]
  if (!acct?.token) throw new Error('Non connecté à Gmail')

  const from = acct.user?.email ? `${acct.user.name || ''} <${acct.user.email}>`.trim() : 'me'
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
  ]
  // Thread the message onto an existing conversation (e.g. replying to a refusal).
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`)
    headers.push(`References: ${inReplyTo}`)
  }
  const mime = [...headers, '', body].join('\r\n')

  const encoded = btoa(unescape(encodeURIComponent(mime)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${acct.token}`, 'Content-Type': 'application/json' },
    // threadId keeps the reply in the same Gmail conversation.
    body: JSON.stringify(threadId ? { raw: encoded, threadId } : { raw: encoded }),
  })

  if (!res.ok) {
    if (res.status === 401) { delete accounts[email]; saveAccounts(accounts) }
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gmail send error ${res.status}`)
  }
  return await res.json()
}

// Fetch the threading context for a stored message so a draft can be sent as a
// reply in the same conversation. Returns { threadId, messageId, subject } or
// null if it can't be resolved (e.g. the message was purged or token expired).
export async function getReplyContext(gmailId, fromAccount) {
  if (!gmailId) return null
  const email = fromAccount || Object.keys(accounts)[0]
  const acct = accounts[email]
  if (!acct?.token) return null
  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=Subject`,
      { headers: { Authorization: `Bearer ${acct.token}` } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const hdrs = data.payload?.headers || []
    const getH = name => hdrs.find(h => h.name.toLowerCase() === name.toLowerCase())?.value
    return { threadId: data.threadId, messageId: getH('Message-ID'), subject: getH('Subject') }
  } catch {
    return null
  }
}

// ── Refresh token for a specific account ─────────────────────────────────────
// First tries silent refresh using refresh token, falls back to interactive re-auth
export async function refreshToken(email) {
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID manquant')

  const targetEmail = email || getCachedUser()?.email
  if (!targetEmail) throw new Error('Aucun compte Gmail détecté')

  const acct = accounts[targetEmail]
  if (!acct) throw new Error(`Compte non trouvé: ${targetEmail}`)

  // Try silent refresh first if we have a refresh token
  if (acct.refreshToken) {
    try {
      console.log(`🔄 Attempting silent refresh for ${targetEmail}...`)
      const refreshRes = await fetch('/api/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: acct.refreshToken }),
      })

      if (!refreshRes.ok) {
        const err = await refreshRes.json()
        console.warn('Silent refresh failed:', err.error)
        throw new Error(err.error || 'Silent refresh failed')
      }

      const newTokens = await refreshRes.json()
      accounts[targetEmail] = {
        ...acct,
        token: newTokens.accessToken,
        tokenExpiry: new Date(Date.now() + (newTokens.expiresIn || 3600) * 1000).toISOString(),
      }
      saveAccounts(accounts)
      console.log(`✅ Silent refresh successful for ${targetEmail}`)
      return newTokens.accessToken
    } catch (e) {
      console.warn('Silent refresh failed, falling back to interactive re-auth:', e.message)
      // Fall through to interactive re-auth below
    }
  }

  // Fall back to interactive re-auth
  console.log(`🔐 Triggering interactive re-auth for ${targetEmail}`)
  return await connectGmail(targetEmail).then(result => result.token)
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
    // ③b Soft rejection / "keep in touch" follow-ups (EN) — polite phrasing with a
    // generic subject ("Follow Up from X") that none of the above keyword sets catch
    `in:all ("not a good match" OR "isn't a good match" OR "good match with our" OR "keep your information on file" OR "future open roles" OR "future endeavors" OR "wish you the best in your search") ${baseExclude} ${dateFilter}`,
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
      log(`📨 Running query: ${query.slice(0, 80)}...`)
      const maxResults = Math.max(1, Math.floor(Math.min(effectiveMonths * 20, 100)))
      const data = await gmailFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
        token
      )
      const newCount = (data.messages || []).length
      log(`✅ Query returned ${newCount} emails`)
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

// Strip HTML to text, but keep <img alt> / title text — ATS emails (Indeed,
// LinkedIn) often render the employer name as a logo image or inside markup the
// text/plain part omits entirely.
function htmlToText(data) {
  return decodeBase64(data)
    // Drop <style>/<script> blocks entirely — their CSS/JS lives as TEXT between
    // the tags (not inside them), so tag-stripping alone leaves kilobytes of
    // @import/media-query junk that buries the real content (and the employer name).
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(?:img|area)\b[^>]*\b(?:alt|title)=["']([^"']+)["'][^>]*>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&zwnj;|&#8203;|&#847;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// preferHtml: ATS confirmation emails (Indeed/LinkedIn) ship a gutted text/plain
// part that drops the real employer + position — only the text/html part carries
// them. For those senders we extract the HTML instead of the plain text.
function extractBody(payload, { preferHtml = false } = {}) {
  if (!payload) return ''
  if (payload.body?.data) {
    return payload.mimeType === 'text/html' ? htmlToText(payload.body.data) : decodeBase64(payload.body.data)
  }
  if (payload.parts) {
    const plain = payload.parts.find(p => p.mimeType === 'text/plain')
    const html = payload.parts.find(p => p.mimeType === 'text/html')
    const order = preferHtml ? [html, plain] : [plain, html]
    for (const part of order) {
      if (!part?.body?.data) continue
      return part.mimeType === 'text/html' ? htmlToText(part.body.data) : decodeBase64(part.body.data)
    }
    for (const part of payload.parts) {
      if (part.parts) { const nested = extractBody(part, { preferHtml }); if (nested) return nested }
    }
  }
  return ''
}

// ── Raw single-email fetch (no job-signal filtering) ──────────────────────────
// fetchEmailDetail() drops anything that doesn't look like a job email and can
// return null. The ATS-candidature repair already KNOWS these gmailIds belong to
// real applications (they're stored on a job's history) — it just needs the raw
// subject/from/body to re-derive the true employer + position. So this fetches
// the message content unconditionally. accountEmail = the account that received
// it (history.receivedBy); falls back to the first connected account.
export async function fetchEmailRawById(gmailId, accountEmail = '') {
  const token = await ensureValidToken(accountEmail)
  if (!token) throw new Error(`Non connecté à Gmail${accountEmail ? ` : ${accountEmail}` : ''}`)
  const data = await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}?format=full`, token)
  const headers = data.payload?.headers || []
  const get = (name) => headers.find(h => h.name === name)?.value || ''
  const isSent = (data.labelIds || []).includes('SENT')
  return {
    id: data.id,
    gmailId: data.id,
    subject: get('Subject'),
    from: isSent ? get('To') : get('From'),
    fromMe: isSent,
    date: get('Date'),
    snippet: data.snippet || '',
    // Prefer the HTML part: ATS text/plain parts drop the employer + position.
    // Keep far more body than the import path too — the real employer can sit past
    // the bloated HTML preheader.
    body: extractBody(data.payload, { preferHtml: true }).slice(0, 8000),
  }
}

async function fetchEmailDetail(id, token) {
  try {
    const data = await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, token)
    const labelIds = data.labelIds || []
    const headers = data.payload?.headers || []
    const get = (name) => headers.find(h => h.name === name)?.value || ''
    const subject = get('Subject')
    const from = get('From')

    log(`📧 Processing email: "${subject}" from ${from}`)

    // Safety net: drop promotional/forum emails even if they slipped through query filters
    if (labelIds.includes('CATEGORY_PROMOTIONS') || labelIds.includes('CATEGORY_FORUMS')) {
      log(`   ❌ Filtered: Promotional/Forum category`)
      return null
    }

    // ATS senders ship a gutted text/plain part — pull the HTML for them so the
    // import parser sees the real employer + position, not just "candidature envoyée".
    const preferHtml = /indeed\.com|linkedin\.com|jobgether\.com|welcometothejungle|hellowork|apec\.fr/i.test(from)
    const body = extractBody(data.payload, { preferHtml }).slice(0, 4000)

    // Drop job-alert / digest emails based on sender + subject patterns
    const fromRaw = get('From').toLowerCase()
    const subjectRaw = get('Subject').toLowerCase()
    const snippetRaw = (data.snippet || '').toLowerCase()
    const bodyRaw = (body || '').toLowerCase()

    // Known ATS domains always pass through — their no-reply addresses are legit
    const ATS_DOMAINS = ['greenhouse.io','lever.co','ashbyhq.com','workable.com','teamtailor.com','teamtailor-mail.com',
      'recruitee.com','bamboohr.com','smartrecruiters.com','jobvite.com','icims.com',
      'myworkdayjobs.com','taleo.net','jobgether.com']
    // LinkedIn application confirmations are legitimate, not job alerts
    const LINKEDIN_APP_CONFIRMATION = subjectRaw.includes('your application was sent') &&
                                       fromRaw.includes('jobs-noreply@linkedin.com')
    const isATS = ATS_DOMAINS.some(d => fromRaw.includes(d)) || LINKEDIN_APP_CONFIRMATION

    if (isATS) {
      log(`   ✅ Passed: Recognized ATS domain`)
    }

    if (!isATS) {
      // ① Sender blocklist — job board alerts + marketing/CRM bulk senders
      // Note: noreply@ from known recruiters is OK (checked separately via isRecruiterNoreply)
      const JOB_ALERT_SENDERS = [
        'notification@emails.hellowork', 'jobalerts@', 'jobalertes@',
        'newsletter@', 'digest@', 'news@', 'mailer@', 'info@emails.',
        'donotreply@match.indeed.com', '@match.indeed.com', 'match@indeed.com',
        'suggested@indeed.com', 'recommendations@indeed.com',
        // LinkedIn "Top job picks for you" / "...role at X: Actively recruiting" digest.
        // NOT an application — real LinkedIn confirmations come from jobs-noreply@linkedin.com
        // ("your application was sent", whitelisted above via LINKEDIN_APP_CONFIRMATION).
        'jobs-listings@linkedin.com', 'jobalerts-noreply@linkedin.com',
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
        log(`   ❌ Filtered: Job alert sender/noreply (blocklist: ${isFromBlocklist}, noreplyAlert: ${noreplyAlert})`)
        return null
      }
      const JOB_ALERT_SUBJECTS = [
        'nouvelles offres', 'new jobs', 'offres d\'emploi', 'offres recommand',
        'emplois recommand', 'job alert', 'jobs you might like', 'candidatures suggest',
        'suggested job', 'offres suggest', 'new jobs matching', 'emplois correspondant',
        'offre recommand', 'recommended job', 'jobs matching your', 'recrute un ', 'recrute une ',
        'votre parcours pourrait correspondre', 'pourrait correspondre pour', 'correspond à votre profil',
        'your profile matches', 'matches your experience', 'job match',
        // LinkedIn job-digest subjects: "[Title] role at [Company]: Actively recruiting"
        'actively recruiting', 'top job picks',
      ]
      // LinkedIn job-pick digests bury "Top job picks for you" in the body, not the subject.
      const isJobDigestBody = bodyRaw.includes('top job picks') || snippetRaw.includes('top job picks')
      const isJobAlert = JOB_ALERT_SENDERS.some(s => fromRaw.includes(s))
        || JOB_ALERT_SUBJECTS.some(s => subjectRaw.includes(s))
        || isJobDigestBody
      if (isJobAlert) {
        log(`   ❌ Filtered: Job alert subject`)
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
        // EN soft rejection / "keep in touch" follow-ups — polite phrasing that never
        // uses "we regret"/"not selected" (e.g. "Follow Up from Dashlane")
        'good match','not a good fit','keep your information on file','future endeavors',
        'future open roles','wish you the best in your',
      ]
      // Scan the body too, not just subject+snippet: soft rejections carry a
      // generic subject ("Follow Up from X") and bury the signal mid-body, past
      // the ~200-char Gmail snippet boundary.
      const hasJobSignal = JOB_SUBJECT_KEYWORDS.some(k =>
        subjectRaw.includes(k) || snippetRaw.includes(k) || bodyRaw.includes(k))
      if (!hasJobSignal) {
        log(`   ❌ Filtered: No job signal keywords found`)
        return null
      }
      log(`   ✅ Passed: Has job signal keywords`)
    }
    const isSent = labelIds.includes('SENT')

    // Detect Gmail category for Claude confidence hint
    const gmailCategory = Object.entries(GMAIL_CAT_MAP).find(([k]) => labelIds.includes(k))?.[1] || null

    log(`   ✅ Email accepted and will be sent to Claude`)
    // Use Gmail's internalDate (receipt timestamp, in milliseconds) instead of the
    // Date header (which is set by sender and can be wrong/backdated). Convert to
    // ISO date string YYYY-MM-DD for consistent sorting and grouping.
    const internalDateMs = parseInt(data.internalDate, 10)
    const receivedDate = new Date(internalDateMs).toISOString().split('T')[0]
    return {
      id: data.id,
      subject: get('Subject'),
      from: isSent ? get('To') : get('From'),
      fromMe: isSent,
      date: receivedDate,
      snippet: data.snippet || '',
      body,
      gmailCategory, // 'updates' | 'personal' | 'social' | null
    }
  } catch (e) {
    console.error(`   ❌ Error fetching email detail:`, e.message)
    return null
  }
}
