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
    // FR - candidatures envoyées / confirmations
    `(subject:candidature OR subject:postulation OR subject:"votre candidature" OR subject:"votre dossier" OR subject:"votre profil") newer_than:${days}d`,

    // FR - process de recrutement
    `(subject:entretien OR subject:convocation OR subject:"rendez-vous" OR subject:recrutement OR subject:"prise de contact" OR subject:"invitation" OR subject:"nous avons bien reçu" OR subject:"suite à votre candidature") newer_than:${days}d`,

    // FR - refus et retours
    `(subject:refus OR subject:"sans suite" OR subject:"nous n'avons pas retenu" OR subject:"ne correspond pas" OR subject:"nous avons le regret" OR subject:"malheureusement" OR subject:"n'a pas été retenue") newer_than:${days}d`,

    // FR - offres et propositions
    `(subject:"offre d'emploi" OR subject:"proposition" OR subject:"nous avons le plaisir" OR subject:"félicitations" OR subject:"période d'essai" OR subject:"prise de poste" OR subject:CDI OR subject:CDD) newer_than:${days}d`,

    // EN - applications
    `(subject:"thank you for applying" OR subject:"thanks for applying" OR subject:"application received" OR subject:"we received your application" OR subject:"your application" OR subject:"application for") newer_than:${days}d`,

    // EN - interview process
    `(subject:interview OR subject:"next steps" OR subject:"moving forward" OR subject:"we would like to invite" OR subject:"schedule" OR subject:"hiring process" OR subject:"your profile") newer_than:${days}d`,

    // EN - rejections
    `(subject:"we regret" OR subject:"not selected" OR subject:"not moving forward" OR subject:"decided to move forward with other" OR subject:"not be pursuing" OR subject:"position has been filled" OR subject:"not a fit") newer_than:${days}d`,

    // EN - offers
    `(subject:"job offer" OR subject:"offer letter" OR subject:"pleased to offer" OR subject:"we are delighted" OR subject:onboarding OR subject:"start date" OR subject:"background check") newer_than:${days}d`,

    // ATS platforms (emails from these domains are almost always job-related)
    `(from:ashbyhq.com OR from:greenhouse.io OR from:lever.co OR from:workable.com OR from:teamtailor.com OR from:recruitee.com OR from:bamboohr.com OR from:smartrecruiters.com OR from:jobvite.com OR from:icims.com OR from:myworkdayjobs.com OR from:taleo.net OR from:successfactors.com) newer_than:${days}d`,

    // Job platforms
    `(from:linkedin.com OR from:welcometothejungle.com OR from:apec.fr OR from:indeed.com OR from:monster.fr OR from:cadremploi.fr OR from:hellowork.com OR from:meteojob.com OR from:regionsjob.com OR from:jobteaser.com OR from:glassdoor.com) newer_than:${days}d`,

    // Recruiter emails (common patterns)
    `(subject:recruiter OR subject:recruteur OR subject:"talent acquisition" OR subject:RH OR subject:HR OR from:talent@ OR from:recrutement@ OR from:rh@ OR from:careers@ OR from:jobs@ OR from:hiring@) newer_than:${days}d`,

    // Freelance platforms
    `(from:malt.fr OR from:malt.com OR from:freelance.com OR from:upwork.com OR from:toptal.com OR subject:freelance OR subject:"mission freelance" OR subject:"proposition de mission") newer_than:${days}d`,
  ]

  // Run all queries in parallel, deduplicate results
  const allMessageIds = new Set()
  const allMessages = []

  await Promise.all(queries.map(async (query) => {
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
      console.warn('Query failed:', query.slice(0, 50), e.message)
    }
  }))

  if (allMessages.length === 0) return []

  // Fetch details for all unique messages (cap at maxResults)
  const toFetch = allMessages.slice(0, maxResults)
  const emails = await Promise.all(toFetch.map(m => fetchEmailDetail(m.id)))
  return emails.filter(Boolean)
}

async function fetchEmailDetail(id) {
  try {
    const data = await gmailFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
    )
    const headers = data.payload?.headers || []
    const get = (name) => headers.find(h => h.name === name)?.value || ''
    return {
      id: data.id,
      subject: get('Subject'),
      from: get('From'),
      date: get('Date'),
      snippet: data.snippet || '',
    }
  } catch { return null }
}
