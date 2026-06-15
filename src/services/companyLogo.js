// Client-side company-logo resolution. Calls the /api/logo proxy (name → logo URL)
// and caches results in memory + localStorage, including negative results, so we
// never re-hit the network for the same company. No job mutation / sync needed —
// logos are derived from the company name on render.

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
    try {
      const r = await fetch(`/api/logo?name=${encodeURIComponent(name)}`)
      const data = await r.json().catch(() => ({}))
      const logo = data?.logo || null
      MEM.set(k, logo)
      const ls = loadLS(); ls[k] = { logo, ts: Date.now() }; saveLS(ls)
      return logo
    } catch {
      MEM.set(k, null)
      return null
    }
  })()
  MEM.set(k, p)
  return p
}
