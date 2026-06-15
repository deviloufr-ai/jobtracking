// Client-side company-logo resolution. Calls Clearbit's keyless, CORS-enabled
// autocomplete endpoint directly (no serverless function — Hobby plan caps at 12),
// resolving a company NAME to a logo URL. Results (including negatives) are cached
// in memory + localStorage, so each company hits the network at most once. No job
// mutation / sync needed — logos are derived from the company name on render.

const MEM = new Map() // normName -> string(url) | null(no logo) | Promise
const LS_KEY = 'jobtrackr_logo_cache'
const TTL = 30 * 24 * 60 * 60 * 1000 // 30 days

const norm = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function loadLS() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}
function saveLS(map) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(map)) } catch {}
}

// Resolve a logo URL from Clearbit suggestions. Clearbit's autocomplete no longer
// embeds a `logo` field (the free logo API was wound down) but still returns the
// company DOMAIN — so we build a logo URL from the domain via unavatar.io (keyless,
// aggregates favicon/logo sources). ?fallback=false makes it 404 when no logo is
// found, so the <img> onError cleanly falls back to initials instead of showing a
// generic placeholder. Guard against wildly wrong matches: keep a suggestion only
// when its name or domain loosely matches the query (autocomplete is fuzzy).
function pickLogo(name, list) {
  if (!Array.isArray(list)) return null
  const q = norm(name)
  const match = list.find(c => {
    const n = norm(c?.name), d = norm(c?.domain)
    return c?.domain && (n === q || n.includes(q) || q.includes(n) || d.includes(q))
  })
  return match?.domain ? `https://unavatar.io/${match.domain}?fallback=false` : null
}

// undefined = not resolved yet · null = resolved, no logo · string = logo URL
export function getCachedLogo(name) {
  const k = norm(name)
  if (!k) return null
  if (MEM.has(k)) {
    const v = MEM.get(k)
    return v instanceof Promise ? undefined : v
  }
  const entry = loadLS()[k]
  if (entry && Date.now() - entry.ts < TTL) {
    MEM.set(k, entry.logo)
    return entry.logo
  }
  return undefined
}

export async function resolveCompanyLogo(name) {
  const k = norm(name)
  if (!k) return null

  const cached = getCachedLogo(name)
  if (cached !== undefined) return cached
  const inflight = MEM.get(k)
  if (inflight instanceof Promise) return inflight

  const p = (async () => {
    let logo = null
    try {
      const r = await fetch(
        `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(name)}`,
        { headers: { Accept: 'application/json' } }
      )
      if (r.ok) logo = pickLogo(name, await r.json())
    } catch {
      // network/CORS failure → treat as no logo (graceful fallback to initials)
    }
    MEM.set(k, logo)
    const ls = loadLS(); ls[k] = { logo, ts: Date.now() }; saveLS(ls)
    return logo
  })()
  MEM.set(k, p)
  return p
}
