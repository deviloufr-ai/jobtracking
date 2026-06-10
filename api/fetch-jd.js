import { setupCORS } from './cors-helper.js'

export default async function handler(req, res) {
  if (setupCORS(req, res)) return
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { url } = req.body
  if (!url) { res.status(400).json({ error: 'URL required' }); return }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(8000)
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const html = await response.text()

    // Extract text without Cheerio (pure regex - works on all job sites)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
      .replace(/\s{3,}/g, '\n\n')
      .trim()
      .slice(0, 8000) // limit tokens

    res.status(200).json({ text, url })
  } catch (err) {
    res.status(500).json({ error: `Impossible de récupérer l'offre : ${err.message}` })
  }
}
