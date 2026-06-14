import { setupCORS } from './cors-helper.js'

export default async function handler(req, res) {
  if (setupCORS(req, res, 'GET, OPTIONS')) return

  const { query = '', location = '', page = 1, per_page = 20 } = req.query

  try {
    const params = new URLSearchParams({
      query,
      per_page,
    })

    if (location && location !== 'france') {
      params.append('location', location)
    }

    const pageNum = Math.max(1, parseInt(page) || 1)
    const url = `https://api.welcometothejungle.com/companies/search?${params}&page=${pageNum}`

    const response = await fetch(url, {
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
