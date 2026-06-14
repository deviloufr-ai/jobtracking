import { setupCORS } from './cors-helper.js'

export default async function handler(req, res) {
  if (setupCORS(req, res, 'GET, OPTIONS')) return

  const { provider = 'franceTravail', query = '', location = '', page = 1, per_page = 20 } = req.query

  try {
    let url, response

    if (provider === 'adzuna') {
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
    } else if (provider === 'wttj') {
      const params = new URLSearchParams({
        query,
        per_page,
      })

      if (location && location !== 'france') {
        params.append('location', location)
      }

      const pageNum = Math.max(1, parseInt(page) || 1)
      url = `https://api.welcometothejungle.com/companies/search?${params}&page=${pageNum}`
    } else {
      // WTTJ (default)
      const params = new URLSearchParams({
        query,
        per_page,
      })

      if (location && location !== 'france') {
        params.append('location', location)
      }

      const pageNum = Math.max(1, parseInt(page) || 1)
      url = `https://api.welcometothejungle.com/companies/search?${params}&page=${pageNum}`
    }

    response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'JobTrackr/1.0'
      }
    })

    const text = await response.text()
    let data
    try { data = JSON.parse(text) } catch { data = { error: text.slice(0, 200) } }
    res.status(response.status).json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
