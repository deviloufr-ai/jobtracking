// Fetch a realistic remuneration for a candidature from the live web.
//
// The salary is researched with Claude's `web_search` server tool — the only
// dependable way to reach salary sites (Glassdoor, Payscale, Levels.fyi…) and a
// posting's stated pay, since those pages block plain scraping (JS shells, login
// walls). Web search is Anthropic-only AND billed per search, so this ALWAYS runs
// on the user's OWN Claude key (never the shared free-trial key, whose path the
// proxy keeps search-free). The result lands in `job.compensation` as an
// `expected` estimate; see utils/compensation.js for the shape.

import { getProviderKey } from './apiKey'
import { toNumber } from '../utils/compensation'
import { AI_PROVIDERS } from '../constants/aiProviders'

// Web search works on Haiku 4.5 and any Sonnet id. Default to the pinned Claude
// model so it follows VITE_CLAUDE_MODEL.
const CLAUDE_MODEL = import.meta.env.VITE_CLAUDE_MODEL || AI_PROVIDERS.anthropic.defaultModel

// Thrown when the user has no personal Claude key — web search can't run without
// one, so the bulk filler surfaces an actionable "add your key" message.
export class NoClaudeKeyError extends Error {
  constructor() {
    super('No Claude API key — web search for salaries needs your own Claude key.')
    this.name = 'NoClaudeKeyError'
    this.code = 'NO_CLAUDE_KEY'
  }
}

// Closed / dead candidatures aren't worth paying to research. Everything else
// (todo, sent, reviewing, interview, waiting, offer) is "active".
const CLOSED_STATUSES = new Set(['archived', 'rejected', 'rejected_ats', 'cancelled'])
export function isActiveForSalary(job) {
  return !!job && !CLOSED_STATUSES.has(job.status)
}

const CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF', 'CAD'])

function buildPrompt(job) {
  const url = job.url ? (/^https?:\/\//i.test(job.url) ? job.url : `https://${job.url}`) : ''
  return `You are a compensation researcher. Find the realistic ANNUAL GROSS salary for ONE specific job, using the web_search tool.

JOB
- Company: ${job.company || '(unknown)'}
- Role / title: ${job.position || '(unknown)'}
- Location: ${job.location || '(unknown)'}
${url ? `- Original posting: ${url}` : ''}

HOW TO RESEARCH
1. If a posting URL is given, look for the salary stated in that posting first.
2. Otherwise, or if the posting states none, search salary sites for this role in this location: Glassdoor, Payscale, Levels.fyi, Talent.com, Indeed salary, Comparably. Prefer a company-specific figure when available, else the market range for the role + location.
3. Use up to 4 searches. Base every number on what you actually found — never invent a figure.

RETURN
Return ONLY a JSON object, no prose, no markdown fences:
{"found": true, "currency": "EUR", "basePeriod": "year", "baseMin": 55000, "baseMax": 70000, "source": "Glassdoor", "confidence": "medium", "note": "market range for the role in this city"}
- currency is one of EUR, USD, GBP, CHF, CAD (the local currency for the location).
- Amounts are annual gross, plain integers (no thousands separators, no currency symbol).
- confidence is high | medium | low.
- If you cannot find any credible figure, return exactly {"found": false}.`
}

// Extract the JSON object from the model's text (tolerates code fences / stray prose).
export function parseSalaryJson(text) {
  if (!text) return null
  let s = String(text).trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(s.slice(start, end + 1))
  } catch {
    return null
  }
}

// Turn a parsed response into a compensation patch merged onto the existing comp
// (so a manually-set stage/location survives). Returns null when nothing usable
// was found, so the caller can count it as "no data" rather than write a blank.
export function toCompensationPatch(parsed, existing = {}) {
  if (!parsed || parsed.found === false) return null
  const min = toNumber(parsed.baseMin)
  const max = toNumber(parsed.baseMax)
  const nums = [min, max].filter(n => n !== null && n > 0)
  if (!nums.length) return null
  const lo = min !== null && min > 0 ? min : null
  const hi = max !== null && max > 0 ? max : null
  const base = lo !== null && hi !== null ? Math.round((lo + hi) / 2) : nums[0]
  const currency = CURRENCIES.has(parsed.currency) ? parsed.currency : (existing.currency || 'EUR')

  const patch = {
    ...existing,
    currency,
    basePeriod: 'year',
    base,
    stage: existing.stage || 'expected',
    estimated: true,
    source: typeof parsed.source === 'string' && parsed.source.trim() ? parsed.source.trim().slice(0, 60) : 'web',
    updatedAt: new Date().toISOString(),
  }
  if (lo !== null) patch.baseMin = lo
  if (hi !== null) patch.baseMax = hi
  if (['high', 'medium', 'low'].includes(parsed.confidence)) patch.confidence = parsed.confidence
  return patch
}

// Research the salary for one job. Requires the user's own Claude key. Returns a
// compensation patch to merge into job.compensation, or null when nothing credible
// was found. Throws NoClaudeKeyError with no key, or Error on an API failure.
export async function fetchSalaryForJob(job, { signal } = {}) {
  const apiKey = getProviderKey('anthropic')
  if (!apiKey) throw new NoClaudeKeyError()

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      provider: 'anthropic',
      apiKey,
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      messages: [{ role: 'user', content: buildPrompt(job) }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `AI error ${res.status}`)

  const text = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim()
  return toCompensationPatch(parseSalaryJson(text), job.compensation || {})
}
