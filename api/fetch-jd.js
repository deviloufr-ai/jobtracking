import { applyCors, assertSafeUrl, safeFetch } from './_lib/http.js'

// A JavaScript-rendered SPA (Welcome to the Jungle, LinkedIn, many ATS portals)
// returns only a bootstrap shell to a plain server-side fetch — a "you need to
// enable JavaScript" notice, a cookie/consent wall, or a near-empty <div id=root>.
// That text is NOT the job posting. Feeding it downstream is actively harmful:
// Claude then refuses to write a CV/letter ("the description is just a JS error"),
// and that refusal gets stored as the result. Detect it here so every caller can
// fall back to the stored notes or prompt the user to paste the description.
function looksUnusable(text) {
  const t = (text || '').trim()
  // Too thin to be a real posting — a genuine JD yields far more after tag-strip.
  if (t.length < 120) return true
  const low = t.toLowerCase()
  const markers = [
    'enable javascript',
    'javascript to run this app',
    'please enable javascript',
    'activer javascript',
    'javascript est désactivé',
    'javascript is disabled',
    'requires javascript',
    'veuillez activer javascript',
  ]
  return markers.some(m => low.includes(m))
}

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { url } = req.body
  if (!url) { res.status(400).json({ error: 'URL required' }); return }

  // SSRF guard: validate the URL up-front so a bad scheme/host fails with 400.
  try {
    await assertSafeUrl(url)
  } catch (e) {
    res.status(400).json({ error: e.message })
    return
  }

  try {
    // safeFetch re-validates every redirect hop so the guard can't be bypassed
    // by a public URL redirecting into a private/metadata host.
    const response = await safeFetch(url, {
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

    // The fetch can succeed (HTTP 200) yet yield only a JS-shell / consent wall.
    // Return 422 so callers treat it as "no JD available" instead of passing the
    // boilerplate to Claude — which would produce a refusal, not a CV/letter.
    if (looksUnusable(text)) {
      res.status(422).json({
        error: "Cette offre n'a pas pu être lue automatiquement (page dynamique). Collez la description du poste dans la fiche du poste.",
        code: 'JD_UNREADABLE',
      })
      return
    }

    res.status(200).json({ text, url })
  } catch (err) {
    res.status(500).json({ error: `Impossible de récupérer l'offre : ${err.message}` })
  }
}
