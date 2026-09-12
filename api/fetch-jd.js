import { applyCors, assertSafeUrl, safeFetch, getClientIp, rateLimit } from './_lib/http.js'

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

// Strip tags + decode the handful of entities we care about, collapse whitespace.
function cleanText(html) {
  return (html || '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/').replace(/&#\d+;/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s{3,}/g, '\n\n')
    .trim()
}

// ── LinkedIn share links ─────────────────────────────────────────────────────
// The LinkedIn app/website "Share" action produces a canonical job URL of the
// form https://www.linkedin.com/jobs/view/<jobId>/ (the numeric jobId is the
// only stable identifier). Collections/search pages instead carry the id as a
// ?currentJobId=<jobId> query param. A plain fetch of either only returns the JS
// shell (see looksUnusable above) — but LinkedIn exposes a public, auth-free,
// server-rendered fragment for each posting at /jobs-guest/jobs/api/jobPosting/
// <jobId>, which carries the title, company, location and description. We read
// that instead so a shared link becomes a real candidature.
function isLinkedInHost(host) {
  return /(^|\.)linkedin\.com$/i.test(host || '')
}

function linkedInJobId(rawUrl) {
  let u
  try { u = new URL(rawUrl) } catch { return null }
  if (!isLinkedInHost(u.hostname)) return null
  // /jobs/view/<id> or /jobs/view/<slug>-<id> (the slug ends in "-<digits>").
  const view = u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/i)
  if (view) return view[1]
  // ?currentJobId=<id> on collections/search result pages.
  const cur = u.searchParams.get('currentJobId')
  if (cur && /^\d{6,}$/.test(cur)) return cur
  // Last resort: a long run of digits anywhere in the path.
  const tail = u.pathname.match(/(\d{8,})/)
  return tail ? tail[1] : null
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
}

// Grab the text inside the first element carrying `cls` on its class list. The
// \1 backref matches the same tag name, so it stops at that element's own close
// (fine for the non-nesting title/company/location nodes we target).
function textByClass(html, cls) {
  const re = new RegExp(`<([a-z0-9]+)[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/\\1>`, 'i')
  const m = html.match(re)
  return m ? cleanText(m[2]) : ''
}

// The description markup nests <div>/<ul>/<strong>, so a same-tag backref would
// truncate it. Slice from the markup node to the "show more" button that always
// follows it instead.
function descriptionFromGuest(html) {
  const start = html.search(/class="[^"]*show-more-less-html__markup/i)
  if (start === -1) return ''
  const open = html.indexOf('>', start)
  if (open === -1) return ''
  let body = html.slice(open + 1)
  const end = body.search(/show-more-less-html__button|<\/section>/i)
  if (end > 0) body = body.slice(0, end)
  return cleanText(body)
}

// og:title on a LinkedIn job page reads "<Company> hiring <Position> in <Location>".
function parseOgTitle(html) {
  const m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
  if (!m) return null
  const cleaned = cleanText(m[1]).replace(/\s*\|\s*LinkedIn\s*$/i, '')
  const hire = cleaned.match(/^(.*?)\s+hiring\s+(.*?)(?:\s+in\s+(.+))?$/i)
  if (hire) return { company: hire[1].trim(), position: hire[2].trim(), location: (hire[3] || '').trim() }
  return null
}

// Pull structured job fields out of LinkedIn guest/job HTML. Returns null when
// nothing recognisable is present (a login wall or a redesigned page).
function parseLinkedInHtml(html) {
  const position = textByClass(html, 'top-card-layout__title') || textByClass(html, 'topcard__title')
  const company  = textByClass(html, 'topcard__org-name-link') || textByClass(html, 'topcard__flavor--black-link')
  const location = textByClass(html, 'topcard__flavor--bullet')
  const description = descriptionFromGuest(html)
  if (company || position) {
    return { company, position, location, description }
  }
  // The guest fragment failed — fall back to the page's own og:title.
  return parseOgTitle(html)
}

// Fetch + parse the public guest fragment for a job id. Never throws — returns
// null on any failure so the caller can fall back to a generic scrape.
async function fetchLinkedInJob(jobId) {
  try {
    const res = await safeFetch(
      `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`,
      { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return null
    const html = await res.text()
    return parseLinkedInHtml(html)
  } catch {
    return null
  }
}

// Build the { text, url, meta } response for a resolved LinkedIn posting.
function linkedInResponse(meta, url) {
  const parts = [meta.position, meta.company].filter(Boolean).join(' — ')
  const text = (meta.description && meta.description.length >= 40)
    ? meta.description.slice(0, 8000)
    : parts
  return {
    text,
    url,
    meta: {
      company: meta.company || '',
      position: meta.position || '',
      location: meta.location || '',
      source: 'linkedin',
    },
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  // SSRF-guarded, but still a server-side fetcher of user URLs — throttle per IP so
  // it can't be used as an unbounded URL-probing oracle (matches check-position.js).
  const { ok, retryAfter } = rateLimit({ key: `fetch-jd:${getClientIp(req)}`, limit: 30, windowMs: 60_000 })
  if (!ok) {
    res.setHeader('Retry-After', String(retryAfter))
    res.status(429).json({ error: 'Too many requests. Please slow down.' })
    return
  }

  const { url } = req.body
  if (!url) { res.status(400).json({ error: 'URL required' }); return }

  // SSRF guard: validate the URL up-front so a bad scheme/host fails with 400.
  try {
    await assertSafeUrl(url)
  } catch (e) {
    res.status(400).json({ error: e.message })
    return
  }

  // LinkedIn share link → read the public guest fragment for structured fields.
  const directId = linkedInJobId(url)
  if (directId) {
    const meta = await fetchLinkedInJob(directId)
    if (meta && (meta.company || meta.position)) {
      res.status(200).json(linkedInResponse(meta, url))
      return
    }
  }

  try {
    // safeFetch re-validates every redirect hop so the guard can't be bypassed
    // by a public URL redirecting into a private/metadata host. It also follows
    // link shorteners (e.g. lnkd.in), so response.url is the final destination.
    const response = await safeFetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000)
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const html = await response.text()
    const finalUrl = response.url || url

    // A shortener (lnkd.in) or a non-canonical LinkedIn link resolves to a job
    // page here — extract from its guest fragment, then from the page's own HTML.
    const resolvedId = directId || linkedInJobId(finalUrl)
    if (resolvedId || isLinkedInHost(new URL(finalUrl).hostname)) {
      const meta = (resolvedId ? await fetchLinkedInJob(resolvedId) : null) || parseLinkedInHtml(html)
      if (meta && (meta.company || meta.position)) {
        res.status(200).json(linkedInResponse(meta, finalUrl))
        return
      }
    }

    // Extract text without Cheerio (pure regex - works on all job sites)
    const text = cleanText(html).slice(0, 8000) // limit tokens

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
