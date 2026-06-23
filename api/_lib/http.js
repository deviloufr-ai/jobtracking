// Shared HTTP helpers for Vercel serverless functions.
// Files/folders under /api prefixed with "_" are NOT treated as routes by Vercel,
// so this module is import-only and never exposed as an endpoint.
//
// Provides:
//   - applyCors(req, res, methods): strict origin-allowlist CORS + preflight handling
//   - getClientIp(req): best-effort client IP from proxy headers
//   - rateLimit({ key, limit, windowMs }): best-effort in-memory limiter
//   - assertSafeUrl(url): SSRF guard for server-side fetches of user URLs

import dns from 'node:dns/promises'
import net from 'node:net'

// Origins allowed to call the API. Configure ALLOWED_ORIGINS in Vercel as a
// comma-separated list (e.g. "https://jobtracking-three.vercel.app").
// Falls back to the known production domain + local dev ports.
function allowedOrigins() {
  const fromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
  const defaults = [
    'https://jobtracking-three.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ]
  // VERCEL_URL is the per-deployment hostname (preview URLs); allow it too so
  // preview deployments keep working.
  if (process.env.VERCEL_URL) defaults.push(`https://${process.env.VERCEL_URL}`)
  return new Set([...defaults, ...fromEnv])
}

/**
 * Apply CORS headers using a strict origin allowlist and handle the OPTIONS
 * preflight. Returns true if the response has already been ended (preflight),
 * in which case the caller should `return` immediately.
 */
export function applyCors(req, res, methods = 'POST, OPTIONS') {
  const origin = req.headers?.origin
  const allowed = allowedOrigins()
  if (origin && allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}

export function getClientIp(req) {
  const xff = req.headers?.['x-forwarded-for']
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

// Best-effort in-memory limiter. Serverless instances are ephemeral and not
// shared, so this only throttles bursts on a warm instance — it is a first line
// of defense, not a substitute for a durable store (KV/Upstash) at scale.
const buckets = new Map()
let lastSweep = 0

// Drop expired buckets so the Map can't grow unbounded over a warm instance's
// lifetime (one entry per distinct key/IP otherwise leaks until the instance
// recycles). Swept at most once per window — cheap and self-throttling.
function sweepExpired(now, windowMs) {
  if (now - lastSweep < windowMs) return
  lastSweep = now
  for (const [k, v] of buckets) {
    if (now > v.reset) buckets.delete(k)
  }
}

/**
 * Returns { ok: boolean, retryAfter?: number }. When ok is false, the caller
 * should respond 429.
 */
export function rateLimit({ key, limit = 30, windowMs = 60_000 }) {
  const now = Date.now()
  sweepExpired(now, windowMs)
  const entry = buckets.get(key)
  if (!entry || now > entry.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return { ok: true }
  }
  if (entry.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((entry.reset - now) / 1000) }
  }
  entry.count += 1
  return { ok: true }
}

// ── Shared-key trial quota ──────────────────────────────────────────────────
// When a request uses the project owner's shared ANTHROPIC_API_KEY (i.e. the
// user did NOT supply their own key), we cap usage per IP so a keyless user gets
// roughly one Gmail scan before being asked to add their own key.
//
// Tunable via env:
//   SHARED_KEY_TRIAL_LIMIT  — max shared-key calls per IP per window (default 15)
//   SHARED_KEY_WINDOW_DAYS  — rolling window length in days (default 30)
//
// Backed by the `shared_key_usage` Supabase table via the service role. If
// Supabase isn't configured, it degrades gracefully to the in-memory limiter so
// the trial is still bounded on a warm instance (never crashes the request).

function supabaseRestConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/$/, ''), key }
}

/**
 * Enforce the shared-key trial quota for this request's IP. Call this only when
 * the request is using the shared key (no user-supplied apiKey).
 *
 * Returns { ok: true, used, limit } when allowed (and records the call), or
 * { ok: false, used, limit } when the trial is exhausted — caller should
 * respond 402 with code 'TRIAL_EXHAUSTED'.
 */
export async function enforceSharedKeyQuota(req, weight = 1) {
  const limit = Number(process.env.SHARED_KEY_TRIAL_LIMIT || 15)
  const windowMs = Number(process.env.SHARED_KEY_WINDOW_DAYS || 30) * 24 * 60 * 60 * 1000
  const ip = getClientIp(req)
  const cfg = supabaseRestConfig()

  // Fallback: no durable store configured → best-effort in-memory cap.
  if (!cfg) {
    const { ok } = rateLimit({ key: `sharedtrial:${ip}`, limit, windowMs })
    return { ok, used: ok ? 1 : limit, limit }
  }

  const headers = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    'Content-Type': 'application/json',
  }
  const rowUrl = `${cfg.url}/rest/v1/shared_key_usage?ip=eq.${encodeURIComponent(ip)}`

  try {
    // Read current usage for this IP.
    const getRes = await fetch(`${rowUrl}&select=count,window_start`, { headers })
    const rows = getRes.ok ? await getRes.json() : []
    const now = Date.now()
    const existing = rows[0]
    const windowExpired = existing && (now - new Date(existing.window_start).getTime() > windowMs)

    // New IP, or its window rolled over → start a fresh window at `weight`.
    if (!existing || windowExpired) {
      const body = JSON.stringify({ ip, count: weight, window_start: new Date(now).toISOString(), updated_at: new Date(now).toISOString() })
      await fetch(`${cfg.url}/rest/v1/shared_key_usage`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
        body,
      })
      return { ok: weight <= limit, used: weight, limit }
    }

    const next = existing.count + weight
    if (next > limit) {
      return { ok: false, used: existing.count, limit }
    }

    // Within budget → increment.
    await fetch(rowUrl, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ count: next, updated_at: new Date(now).toISOString() }),
    })
    return { ok: true, used: next, limit }
  } catch (err) {
    // On any storage error, fail OPEN (don't block legitimate users) but log it.
    console.error('shared-key quota check failed, allowing request:', err?.message)
    return { ok: true, used: 0, limit }
  }
}

function isPrivateIp(ip) {
  // Strip IPv6-mapped IPv4 prefix (::ffff:10.0.0.1)
  const v = ip.replace(/^::ffff:/i, '')
  if (net.isIPv4(v)) {
    const [a, b] = v.split('.').map(Number)
    if (a === 10) return true
    if (a === 127) return true // loopback
    if (a === 0) return true
    if (a === 169 && b === 254) return true // link-local / cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    return false
  }
  // IPv6
  const lower = v.toLowerCase()
  if (lower === '::1' || lower === '::') return true // loopback / unspecified
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique-local
  if (lower.startsWith('fe80')) return true // link-local
  return false
}

/**
 * SSRF guard for server-side fetches of user-supplied URLs. Throws an Error
 * with a user-safe message if the URL is not a public http(s) endpoint.
 * Resolves DNS and rejects hosts that map to private/loopback/metadata ranges.
 */
export async function assertSafeUrl(rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed')
  }
  const host = url.hostname
  // Reject obvious local hostnames before resolving.
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new Error('URL host is not allowed')
  }
  // If the host is a literal IP, check it directly.
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('URL resolves to a private address')
    return url.toString()
  }
  // Resolve DNS and ensure no resolved address is private.
  let addrs
  try {
    addrs = await dns.lookup(host, { all: true })
  } catch {
    throw new Error('Could not resolve URL host')
  }
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) {
    throw new Error('URL resolves to a private address')
  }
  return url.toString()
}

/**
 * SSRF-safe fetch for user-supplied URLs. Follows redirects MANUALLY, running
 * assertSafeUrl on every hop, so a public URL can't 30x-redirect into a private
 * / metadata host (the bypass left open by fetch's default redirect:'follow').
 * Returns the final Response (with redirects already resolved).
 */
export async function safeFetch(rawUrl, init = {}, { maxRedirects = 5 } = {}) {
  let current = await assertSafeUrl(rawUrl)
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(current, { ...init, redirect: 'manual' })
    // Not a redirect → this is the final response.
    if (res.status < 300 || res.status >= 400) return res
    const location = res.headers.get('location')
    if (!location) return res
    // Resolve relative redirects against the current URL, then re-validate.
    current = await assertSafeUrl(new URL(location, current).toString())
  }
  throw new Error('Too many redirects')
}
