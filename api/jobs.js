import { setupCORS } from './cors-helper.js'

// Simple INSEE code detection (without importing the ref file)
function detectInseeCode(location) {
  if (!location || location === 'france') return null
  const query = location.toLowerCase().trim()

  // Exact code match (5 digits)
  if (/^\d{5}$/.test(query)) return query

  // City name to INSEE code mapping
  const inseeMap = {
    'paris': '75056',
    'lyon': '69123',
    'marseille': '13055',
    'toulouse': '31555',
    'nice': '06088',
    'nantes': '44109',
    'strasbourg': '67482',
    'montpellier': '34172',
    'bordeaux': '33063',
    'lille': '59350',
    'rennes': '35238',
    'reims': '51454',
    'le mans': '72181',
    'havre': '76321',
    'saint-étienne': '42218',
    'toulon': '83137',
    'grenoble': '38185',
    'angers': '49007',
    'dijon': '21231',
    'brest': '29019',
    'orléans': '45234',
    'tours': '37261',
    'nîmes': '30189',
    'limoges': '87085',
    'poitiers': '86194',
    'caen': '14118',
    'rouen': '76540',
    'metz': '57463',
    'quimper': '29232',
    'besançon': '25056',
    'ajaccio': '20004',
    'bastia': '20033',
    'amiens': '80021',
    'douai': '59178',
    'boulogne-billancourt': '92012',
    'saint-denis': '93066',
    'versailles': '78646',
    'le mans': '72181',
  }

  return inseeMap[query] || null
}

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

  const response = await fetch('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=partenaire', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'o2dsoffre api_offresdemploiv2',
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
        motsCles: query,
        sort: '1', // Date descending
      })

      // Pagination using range parameter (format: "p-d" where p=start, d=end)
      const pageNum = Math.max(1, parseInt(page) || 1)
      const perPage = Math.max(1, parseInt(per_page) || 20)
      const start = (pageNum - 1) * perPage
      const end = start + perPage - 1
      params.append('range', `${start}-${end}`)

      // Auto-detect INSEE code from location and add if found
      const inseeCode = detectInseeCode(location)
      if (inseeCode) {
        params.append('commune', inseeCode)
      }

      url = `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${params}`
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

    if (!response.ok) {
      const text = await response.text()
      return res.status(response.status).json({
        error: `API error ${response.status}: ${text.slice(0, 200)}`
      })
    }

    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch (e) {
      return res.status(500).json({
        error: `Failed to parse response: ${e.message}. Response: ${text.slice(0, 200)}`
      })
    }
    res.status(response.status).json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
