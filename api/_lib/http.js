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

/**
 * Returns { ok: boolean, retryAfter?: number }. When ok is false, the caller
 * should respond 429.
 */
export function rateLimit({ key, limit = 30, windowMs = 60_000 }) {
  const now = Date.now()
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
