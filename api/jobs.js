import { applyCors, getClientIp, rateLimit } from './_lib/http.js'

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
    throw new Error('France Travail credentials not configured: CLIENT_ID=' + !!CLIENT_ID + ', CLIENT_SECRET=' + !!CLIENT_SECRET)
  }

  try {
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

    const text = await response.text()

    if (!response.ok) {
      throw new Error(`OAuth error ${response.status}: ${text.slice(0, 200)}`)
    }

    if (!text) {
      throw new Error('OAuth response is empty')
    }

    const data = JSON.parse(text)
    cachedToken = data.access_token
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000
    return cachedToken
  } catch (e) {
    throw new Error(`OAuth failed: ${e.message}`)
  }
}

async function handlePlaceSearch(req, res) {
  const { companyName } = req.body

  if (!companyName?.trim()) {
    return res.status(400).json({ error: 'Company name is required' })
  }

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.error('GOOGLE_MAPS_API_KEY not configured in Vercel')
    return res.status(500).json({ error: 'Google Maps API key not configured in Vercel environment' })
  }

  try {
    // Places API (New) — Text Search. Uses POST + field mask + X-Goog-Api-Key.
    // Restrict to metropolitan France: regionCode + a bounding-box
    // locationRestriction so we don't get same-named companies worldwide.
    console.log('Searching for:', companyName)
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.formattedAddress,places.displayName,places.location',
      },
      body: JSON.stringify({
        textQuery: companyName,
        regionCode: 'FR',
        languageCode: 'fr',
        locationRestriction: {
          rectangle: {
            low: { latitude: 41.3, longitude: -5.2 },
            high: { latitude: 51.1, longitude: 9.6 },
          },
        },
      }),
    })

    const data = await response.json()

    // New API returns an error object (not a `status` string) on failure.
    if (!response.ok) {
      const reason = data.error?.status || data.error?.message || `HTTP ${response.status}`
      console.log('Places API (New) error:', reason)
      return res.status(200).json({ address: null, reason: `Google Places: ${reason}` })
    }

    const candidates = (data.places || []).filter(p => p.formattedAddress)
    if (!candidates.length) {
      return res.status(200).json({ address: null, reason: 'Google Places: ZERO_RESULTS' })
    }

    // When several offices match, prefer the one closest to Paris.
    const PARIS = { lat: 48.8566, lng: 2.3522 }
    const distToParis = (p) => {
      if (!p.location) return Number.POSITIVE_INFINITY
      const dLat = p.location.latitude - PARIS.lat
      const dLng = p.location.longitude - PARIS.lng
      return dLat * dLat + dLng * dLng // squared euclidean is enough for ranking
    }
    const place = candidates.sort((a, b) => distToParis(a) - distToParis(b))[0]

    res.json({
      address: place.formattedAddress,
      name: place.displayName?.text || companyName,
    })
  } catch (error) {
    console.error('Place search error:', error)
    res.status(500).json({ error: error.message || 'Failed to search for company' })
  }
}

async function handleCommute(req, res) {
  const { homeAddress, companyAddress } = req.body

  if (!homeAddress || !companyAddress) {
    return res.status(400).json({ error: 'Both homeAddress and companyAddress are required' })
  }

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return res.status(500).json({ error: 'Google Maps API key not configured' })
  }

  try {
    const params = new URLSearchParams({
      origins: homeAddress,
      destinations: companyAddress,
      mode: 'driving',
      key: process.env.GOOGLE_MAPS_API_KEY,
    })

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`
    const response = await fetch(url)
    const data = await response.json()

    if (data.status !== 'OK') {
      return res.status(400).json({
        error: `Google Maps API error: ${data.status}`,
        message: data.error_message || 'Failed to calculate commute',
      })
    }

    const result = data.rows[0]?.elements[0]
    if (!result || result.status !== 'OK') {
      return res.status(400).json({
        error: 'Could not find route between addresses',
        message: result?.status || 'Unknown error',
      })
    }

    res.json({
      durationMinutes: Math.round(result.duration.value / 60),
      distanceKm: parseFloat((result.distance.value / 1000).toFixed(1)),
      durationText: result.duration.text,
      distanceText: result.distance.text,
    })
  } catch (error) {
    console.error('Commute API error:', error)
    res.status(500).json({ error: error.message || 'Failed to calculate commute' })
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res, 'GET, POST, OPTIONS')) return

  // This endpoint proxies paid third-party APIs (Google Maps, Adzuna,
  // France Travail) with the owner's keys and is unauthenticated, so throttle
  // per IP to bound cost/abuse on a warm instance.
  const { ok, retryAfter } = rateLimit({ key: `jobs:${getClientIp(req)}`, limit: 40, windowMs: 60_000 })
  if (!ok) {
    res.setHeader('Retry-After', String(retryAfter))
    return res.status(429).json({ error: 'Too many requests. Please slow down.' })
  }

  // Handle POST requests (commute or place search)
  if (req.method === 'POST') {
    const { companyName } = req.body
    // Route to place search if companyName is present, otherwise commute
    if (companyName) {
      return handlePlaceSearch(req, res)
    }
    return handleCommute(req, res)
  }

  // Handle job search (GET)
  const { provider = 'francetravail', query = '', location = '', page = 1, per_page = 20 } = req.query

  try {
    let url, headers = {
      'Accept': 'application/json',
      'User-Agent': 'SmartJobTracker/1.0'
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
