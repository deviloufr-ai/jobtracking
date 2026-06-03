const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly'

let tokenClient = null
let accessToken = null

export function isGmailConfigured() { return !!CLIENT_ID }
export function isConnected() { return !!accessToken }
export function getAccessToken() { return accessToken }

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
      callback: (response) => {
        if (response.error) { reject(new Error(response.error)); return }
        accessToken = response.access_token
        resolve(accessToken)
      },
    })
    tokenClient.requestAccessToken({ prompt: 'consent' })
  })
}

export function disconnectGmail() {
  if (accessToken && window.google) window.google.accounts.oauth2.revoke(accessToken)
  accessToken = null
}

async function gmailFetch(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gmail API error ${res.status}`)
  }
  return res.json()
}

export async function fetchJobEmails(maxResults = 100, months = 3) {
  if (!accessToken) throw new Error('Non connecté à Gmail')

  const days = months * 30

  // Split into multiple targeted searches to maximize coverage
  const queries = [
    // Tous les emails liés aux candidatures (inbox + sent + archives)
    `in:all (candidature OR postulation OR entretien OR recrutement OR "offre d'emploi" OR "votre candidature" OR "votre profil" OR "nous avons bien reçu" OR "suite à votre candidature" OR "nous avons le regret" OR "sans suite" OR "n'avons pas retenu") newer_than:${days}d`,

    `in:all (interview OR "thank you for applying" OR "thanks for applying" OR "application received" OR "your application" OR "we regret" OR "not selected" OR "not moving forward" OR "job offer" OR "offer letter" OR "next steps" OR "hiring process") newer_than:${days}d`,

    `in:all (from:ashbyhq.com OR from:greenhouse.io OR from:lever.co OR from:workable.com OR from:teamtailor.com OR from:recruitee.com OR from:bamboohr.com OR from:smartrecruiters.com OR from:jobvite.com OR from:icims.com OR from:myworkdayjobs.com OR from:taleo.net) newer_than:${days}d`,

    `in:all (from:linkedin.com OR from:welcometothejungle.com OR from:apec.fr OR from:indeed.com OR from:monster.fr OR from:cadremploi.fr OR from:hellowork.com OR from:jobteaser.com OR from:malt.fr OR from:malt.com) newer_than:${days}d`,

    `in:all (from:talent@ OR from:recrutement@ OR from:rh@ OR from:careers@ OR from:jobs@ OR from:hiring@ OR from:recruiter@ OR subject:recruiter OR subject:recruteur OR subject:"talent acquisition") newer_than:${days}d`,

    `in:sent (has:attachment OR subject:candidature OR subject:postulation OR "je postule" OR "je vous contacte" OR "je me permets" OR "I am applying" OR "please find my CV" OR "please find attached my resume") newer_than:${days}d`,
  ]

  // Run queries in small batches to avoid rate limiting
  const allMessageIds = new Set()
  const allMessages = []

  const runQuery = async (query) => {
    try {
      const data = await gmailFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodeURIComponent(query)}`
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

  // Run in batches of 3 with 200ms delay between batches
  const batchSize = 3
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize)
    await Promise.all(batch.map(runQuery))
    if (i + batchSize < queries.length) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  if (allMessages.length === 0) return []

  // Fetch details in batches of 5 to avoid rate limiting
  const toFetch = allMessages.slice(0, maxResults)
  const emails = []
  for (let i = 0; i < toFetch.length; i += 5) {
    const batch = toFetch.slice(i, i + 5)
    const results = await Promise.all(batch.map(m => fetchEmailDetail(m.id)))
    emails.push(...results.filter(Boolean))
    if (i + 5 < toFetch.length) {
      await new Promise(r => setTimeout(r, 100))
    }
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

  // Direct body
  if (payload.body?.data) return decodeBase64(payload.body.data)

  // Multipart - prefer text/plain, fallback to text/html
  if (payload.parts) {
    const plain = payload.parts.find(p => p.mimeType === 'text/plain')
    if (plain?.body?.data) return decodeBase64(plain.body.data)

    const html = payload.parts.find(p => p.mimeType === 'text/html')
    if (html?.body?.data) {
      const raw = decodeBase64(html.body.data)
      return raw.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
    }

    // Nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part)
        if (nested) return nested
      }
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

    // Extract body text (limit to 2000 chars for Claude)
    const body = extractBody(data.payload).slice(0, 2000)

    return {
      id: data.id,
      subject: get('Subject'),
      from: get('From'),
      date: get('Date'),
      snippet: data.snippet || '',
      body,
    }
  } catch { return null }
}
