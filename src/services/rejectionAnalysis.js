// Deep rejection analysis. Sends the (bounded) rejection evidence packet to Claude
// via the shared /api/claude proxy and returns a structured, actionable analysis
// plus distilled generation rules for the CV and the cover letter.
//
// Web search: when the caller has their OWN Claude key, we attach the web_search
// server tool so the model can research the companies/roles (seniority bar, what
// they hire for) for sharper context. The proxy is a plain pass-through, so the
// pause_turn continuation loop for the server tool runs HERE, client-side. The
// free-trial/shared-key path stays search-free (consistent with the letter
// generator), because web search is billed per search.
import { aiFetch, getUserApiKey } from './apiKey'
import { CLAUDE_MODEL } from '../constants/aiModel'

function extractJSON(rawText) {
  let jsonText = rawText || '{}'
  if (jsonText.includes('```json')) {
    jsonText = jsonText.split('```json')[1]?.split('```')[0] || rawText
  } else if (jsonText.includes('```')) {
    jsonText = jsonText.split('```')[1]?.split('```')[0] || rawText
  }
  return JSON.parse(jsonText.trim())
}

function buildPrompt(evidence, language) {
  const langLine = language === 'fr'
    ? 'Write ALL human-readable text (summary, findings, recommendations, rules) in FRENCH.'
    : language === 'jp'
    ? 'Write ALL human-readable text in JAPANESE.'
    : 'Write ALL human-readable text in ENGLISH.'

  return `You are a senior technical recruiter and career coach doing a forensic review of ONE candidate's job-search rejections. Your job is to find WHY applications are being rejected and produce concrete fixes — grounded ONLY in the evidence below (plus web search, if available, for company/role context). Never invent facts about the candidate.

${langLine}

HOW TO REASON:
- The evidence has a REJECTED set and an INTERVIEWED set with the same fields. The signal is the CONTRAST: what separates applications that advanced from ones that were rejected (CV impact/ATS scores, match score, stage reached, source, recurring gaps, the rejection email wording).
- Distinguish the TWO leaks: (a) never getting a reply / rejected before a human read it (top-of-funnel: targeting, ATS coverage, CV impact) vs (b) rejected after a screen/interview (fit, seniority, interview conversion — a CV rewrite will NOT fix this; say so plainly if that is where the leak is).
- Read the rejection email notes: ATS/templated language vs a specific human "no" tells you which leak it is.
- Recurring gaps that appear across many rejected apps are the highest-leverage CV fixes.
- Be specific and evidence-cited. "Your CV impact averages ${evidence?.averages?.rejected?.cvImpact ?? '—'} on rejected vs ${evidence?.averages?.interviewed?.cvImpact ?? '—'} on interviewed" beats "improve your CV".

EVIDENCE (JSON):
${JSON.stringify(evidence).slice(0, 90000)}

Respond with ONLY a JSON object (no markdown, no preamble) with this exact structure:
{
  "summary": "<3-5 sentence overall diagnosis, evidence-based>",
  "leak": "<before_reply|after_screen|after_interview|mixed — where the biggest leak is>",
  "findings": [
    { "title": "<short>", "detail": "<what & why, 1-2 sentences>", "evidence": "<the concrete data point(s) this rests on>", "severity": "high|medium|low" }
  ],
  "recommendations": [
    { "title": "<short imperative>", "detail": "<how, concretely>", "area": "cv|letter|targeting|process" }
  ],
  "cvRules": ["<concise, reusable rule to apply when generating THIS candidate's CVs, drawn from the findings>"],
  "letterRules": ["<concise, reusable rule to apply when generating THIS candidate's cover letters>"]
}
Keep findings to the 3-6 highest-leverage. cvRules/letterRules: at most 5 each, each a single actionable sentence a CV/letter generator can follow (e.g. "Lead the profile with quantified P&L/impact, not tools" or "Mirror the exact seniority title from the posting"). If the leak is clearly after-interview, say so in the summary and keep cvRules/letterRules minimal.`
}

function normalize(parsed) {
  const arr = (v) => Array.isArray(v) ? v : []
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    leak: parsed.leak || 'mixed',
    findings: arr(parsed.findings).filter(f => f && f.title).slice(0, 8).map(f => ({
      title: String(f.title), detail: String(f.detail || ''),
      evidence: String(f.evidence || ''),
      severity: ['high', 'medium', 'low'].includes(f.severity) ? f.severity : 'medium',
    })),
    recommendations: arr(parsed.recommendations).filter(r => r && r.title).slice(0, 8).map(r => ({
      title: String(r.title), detail: String(r.detail || ''),
      area: ['cv', 'letter', 'targeting', 'process'].includes(r.area) ? r.area : 'process',
    })),
    cvRules: arr(parsed.cvRules).map(String).map(s => s.trim()).filter(Boolean).slice(0, 5),
    letterRules: arr(parsed.letterRules).map(String).map(s => s.trim()).filter(Boolean).slice(0, 5),
  }
}

export async function analyzeRejections({ evidence, language = 'en' }) {
  const userKey = getUserApiKey()
  const tools = userKey ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }] : undefined
  const messages = [{ role: 'user', content: buildPrompt(evidence, language) }]

  let lastData = null
  for (let i = 0; i < 6; i++) {
    const res = await aiFetch('/api/claude', {
      model: CLAUDE_MODEL,
      max_tokens: 3000,
      messages,
      ...(tools ? { tools } : {}),
    })
    lastData = await res.json()
    if (!res.ok) throw new Error(lastData?.error?.message || lastData?.error || `Claude API ${res.status}`)
    const content = lastData.content || []
    // Server tool still running — continue the same turn.
    if (lastData.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content })
      continue
    }
    const text = content.filter(b => b.type === 'text').map(b => b.text).join('')
    return normalize(extractJSON(text))
  }
  // Loop exhausted (shouldn't happen) — parse whatever we last got.
  const text = (lastData?.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  return normalize(extractJSON(text))
}
