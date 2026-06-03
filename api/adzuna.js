export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const APP_ID = process.env.VITE_ADZUNA_APP_ID
  const APP_KEY = process.env.VITE_ADZUNA_APP_KEY

  if (!APP_ID || !APP_KEY) {
    res.status(500).json({ error: 'Adzuna API keys not configured' })
    return
  }

  const { query = '', location = 'france', page = 1, results_per_page = 20 } = req.query

  try {
    const params = new URLSearchParams({
      app_id: APP_ID,
      app_key: APP_KEY,
      results_per_page,
      what: query,
      where: location,
    })

    const pageNum = parseInt(page) || 1
    const url = `https://api.adzuna.com/v1/api/jobs/fr/search/${pageNum}?${params}`
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    })
    const text = await response.text()
    let data
    try { data = JSON.parse(text) } catch { data = { error: text.slice(0, 200) } }
    res.status(response.status).json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
