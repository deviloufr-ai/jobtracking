import { setupCORS } from './cors-helper.js'

let cachedToken = null
let tokenExpiry = null

async function getFranceTravailToken() {
  // Return cached token if still valid
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken
  }

  const CLIENT_ID = process.env.FRANCE_TRAVAIL_CLIENT_ID
  const CLIENT_SECRET = process.env.FRANCE_TRAVAIL_SECRET

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('France Travail credentials not configured')
  }

  const response = await fetch('https://api.francetravail.io/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'api_offresdemploiv2 o2dsoffre',
    })
  })

  if (!response.ok) {
    throw new Error(`OAuth token error: ${response.status}`)
  }

  const data = await response.json()
  cachedToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000 // Refresh 1 min before expiry
  return cachedToken
}

export default async function handler(req, res) {
  if (setupCORS(req, res, 'GET, OPTIONS')) return

  const { provider = 'francetravail', query = '', location = '', page = 1, per_page = 20 } = req.query

  try {
    let url, headers = {
      'Accept': 'application/json',
      'User-Agent': 'JobTrackr/1.0'
    }

    if (provider === 'francetravail') {
      const token = await getFranceTravailToken()
      headers['Authorization'] = `Bearer ${token}`

      const params = new URLSearchParams({
        motcles: query,
        nbresultats: per_page,
        sort: 'date',
      })

      if (location && location !== 'france') {
        params.append('lieuTravail', location)
      }

      const pageNum = Math.max(1, parseInt(page) || 1)
      url = `https://api.francetravail.io/offres/v2/search?${params}&page=${pageNum}`
    } else if (provider === 'remoteok') {
      const params = new URLSearchParams({
        search: query,
        limit: per_page,
        offset: (parseInt(page) - 1) * parseInt(per_page),
      })
      url = `https://remoteok.io/api?${params}`
    } else if (provider === 'jsearch') {
      const params = new URLSearchParams({
        query,
        page,
        per_page,
      })
      if (location && location !== 'france') {
        params.append('location', location)
      }
      url = `https://jsearch.io/api?${params}`
    } else if (provider === 'adzuna') {
      const APP_ID = process.env.VITE_ADZUNA_APP_ID
      const APP_KEY = process.env.VITE_ADZUNA_APP_KEY

      if (!APP_ID || !APP_KEY) {
        return res.status(500).json({ error: 'Adzuna API keys not configured' })
      }

      const params = new URLSearchParams({
        app_id: APP_ID,
        app_key: APP_KEY,
        results_per_page: per_page,
        what: query,
        where: location,
      })

      const pageNum = parseInt(page) || 1
      url = `https://api.adzuna.com/v1/api/jobs/fr/search/${pageNum}?${params}`
    } else {
      return res.status(400).json({ error: 'Unknown provider' })
    }

    const response = await fetch(url, { headers })

    const text = await response.text()
    let data
    try { data = JSON.parse(text) } catch { data = { error: text.slice(0, 200) } }
    res.status(response.status).json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
