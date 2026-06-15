import { applyCors, getClientIp, rateLimit } from './_lib/http.js'

// Resolve a company NAME to a logo URL (and domain) via Clearbit's keyless
// autocomplete endpoint. Proxied server-side to avoid CORS and to allow swapping
// the provider later without touching the client. Misses return { logo: null } so
// the client can cache the negative result too.
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

export default async function handler(req, res) {
  if (applyCors(req, res, 'GET, OPTIONS')) return
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

  const name = (req.query?.name || '').toString().trim()
  if (!name || name.length > 100) { res.status(400).json({ error: 'name required' }); return }

  const rl = rateLimit({ key: `logo:${getClientIp(req)}`, limit: 120, windowMs: 60_000 })
  if (!rl.ok) { res.status(429).json({ error: 'Rate limited', retryAfter: rl.retryAfter }); return }

  try {
    const r = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(name)}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
    )
    if (!r.ok) throw new Error(`upstream ${r.status}`)
    const list = await r.json()

    // Guard against wildly wrong matches: keep a suggestion only when its name or
    // domain loosely matches the query (autocomplete is fuzzy and can return
    // unrelated brands for short/obscure names).
    const q = norm(name)
    const match = Array.isArray(list)
      ? list.find(c => {
          const n = norm(c?.name), d = norm(c?.domain)
          return c?.logo && (n === q || n.includes(q) || q.includes(n) || d.includes(q))
        })
      : null

    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800')
    if (match) res.status(200).json({ name: match.name, domain: match.domain, logo: match.logo })
    else res.status(200).json({ logo: null })
  } catch (err) {
    // Short cache on errors so transient upstream failures don't stick.
    res.setHeader('Cache-Control', 'public, max-age=600')
    res.status(200).json({ logo: null, error: err.message })
  }
}
