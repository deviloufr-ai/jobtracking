import { useState } from 'react'
import AIPanelBoundary from './AIPanelBoundary'
import { aiFetch } from '../services/apiKey'
import { useDragDock } from '../hooks/useDragDock'
import { summarizeComp, hasCompensation } from '../utils/compensation'

// Salary-negotiation assistant. Drafts a professional negotiation message (email
// or call talking points) from the saved offer, which the user edits and sends
// themselves. Draft-only, mirroring MotivationLetterGenerator's UX. The last saved
// draft persists on job.negotiationSaved (synced via extras).
//
// The prompt is built client-side and sent through the shared /api/claude proxy
// (CORS + the shared-key trial gate), rather than a dedicated endpoint — Vercel's
// Hobby plan caps a deployment's serverless functions, and the generic proxy is
// exactly what the mock-interview / scoring features already use for ad-hoc calls.

// Format the structured compensation into a compact block for the prompt.
function describeComp(comp) {
  if (!comp || typeof comp !== 'object') return 'Not specified.'
  const cur = comp.currency || 'EUR'
  const period = comp.basePeriod === 'month' ? '/month' : '/year'
  const lines = []
  if (comp.base) lines.push(`- Base salary: ${comp.base} ${cur}${period}`)
  if (comp.bonus) lines.push(`- Annual bonus (target): ${comp.bonus} ${cur}`)
  if (comp.equity) lines.push(`- Equity (annualized): ${comp.equity} ${cur}`)
  if (comp.benefits) lines.push(`- Benefits: ${String(comp.benefits).slice(0, 300)}`)
  if (comp.remotePct != null && comp.remotePct !== '') lines.push(`- Remote: ${comp.remotePct}%`)
  if (comp.location) lines.push(`- Location: ${String(comp.location).slice(0, 120)}`)
  return lines.length ? lines.join('\n') : 'Not specified.'
}

// Detect a refusal / meta-commentary instead of an actual draft (Haiku does this
// when handed unusable input). We only inspect the opening.
function looksLikeRefusal(text) {
  const t = (text || '').trim()
  if (!t) return true
  const head = t.slice(0, 400).toLowerCase()
  return ['unable to complete', "i'm unable to", 'i am unable to', "i can't complete",
    'cannot complete this', 'as an ai', "i can't write", 'i cannot write',
    'please provide', 'provide more'].some(s => head.includes(s))
}

function buildNegotiationPrompt({ company, position, comp, target, context, language, wantsScript }) {
  const hasContext = !!(context && context.trim())
  const langLine = language === 'auto'
    ? 'DETECT the language from the fields below (company, target, context) and write the ENTIRE response in THAT language. If unsure, default to French.'
    : language === 'en' ? 'Write the ENTIRE response in ENGLISH.' : 'Write the ENTIRE response in FRENCH.'
  return `You are an expert career coach who helps candidates negotiate job offers professionally and confidently, without being adversarial.

${langLine}

Write a ${wantsScript ? 'set of concise talking points (bullet list) for a live negotiation call' : 'polite, professional negotiation email'} for this candidate.

ROLE: ${position || 'the role'} at ${company || 'the company'}

CURRENT OFFER:
${describeComp(comp)}

WHAT THE CANDIDATE WANTS:
${(target && target.trim()) ? target.trim().slice(0, 800) : 'A reasonable increase in total compensation, framed around their value and market rate.'}
${hasContext ? `
ADDITIONAL CONTEXT FROM THE CANDIDATE (honour this):
"""
${context.trim().slice(0, 1000)}
"""
` : ''}
GUIDELINES:
- Open by reaffirming genuine enthusiasm for the role and the company.
- Anchor the ask on value delivered and market rate, not personal need.
- Be specific about the number(s) requested, but stay collaborative and flexible.
- Keep a warm, confident, respectful tone. Never threaten or issue ultimatums.
- Acknowledge the whole package (base, bonus, equity, remote, benefits), not only base.
- ${wantsScript ? 'Give 5-8 short bullet points the candidate can glance at during the call.' : 'Keep it to a short, scannable email (about 150-220 words), with a subject line.'}

WRITE LIKE A HUMAN — this must NOT read as AI-generated:
- NEVER use the em-dash or en-dash. Use a comma, period, or parentheses.
- Vary sentence length. Avoid AI-cliche phrasing ("I am thrilled to", "leverage", "I am confident that", "furthermore").
- No generic platitudes. Sound like a real, self-assured professional.

Return ONLY the ${wantsScript ? 'talking points' : 'email (subject line included)'} as plain text, no preamble or meta-commentary.`
}

export default function NegotiationAssistant(props) {
  return (
    <AIPanelBoundary label="Negotiation" onClose={props.onClose}>
      <NegotiationAssistantPanel {...props} />
    </AIPanelBoundary>
  )
}

function NegotiationAssistantPanel({ job, onClose, onSave, t = (k) => k }) {
  const tx = (k, f) => { const v = t(k); return v && v !== k ? v : f }
  const { startDrag, panelStyle, snapPreview } = useDragDock({ width: 760 })
  const comp = job.compensation || {}
  const [draft, setDraft] = useState(job.negotiationSaved?.content || '')
  const [target, setTarget] = useState('')
  const [context, setContext] = useState('')
  const [format, setFormat] = useState('email') // 'email' | 'script'
  const [language, setLanguage] = useState('auto')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const offerSummary = summarizeComp(comp)

  const generate = async () => {
    setLoading(true)
    setError(null)
    try {
      const prompt = buildNegotiationPrompt({
        company: job.company, position: job.position, comp,
        target, context, language, wantsScript: format === 'script',
      })
      const res = await aiFetch('/api/claude', {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Generation failed: ${res.status}`)
      }
      const data = await res.json()
      const text = data.content?.[0]?.text || ''
      if (looksLikeRefusal(text)) {
        throw new Error(tx('negotiation.unusable', 'Could not draft a message from these details. Add the offer figures and what you would like to ask for, then try again.'))
      }
      setDraft(text)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const save = () => {
    if (!draft || !onSave) return
    onSave(job.id, { negotiationSaved: { content: draft, savedAt: new Date().toISOString() } })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      {snapPreview}
      <div className="bg-white rounded-2xl shadow-2xl w-11/12 max-h-[85vh] flex flex-col max-w-3xl" style={panelStyle}>
        {/* Header */}
        <div onPointerDown={startDrag} className="flex items-center justify-between p-4 border-b border-gray-200 cursor-move select-none">
          <div>
            <h2 className="text-lg font-bold text-gray-800">💰 {tx('negotiation.title', 'Negotiation assistant')}</h2>
            <p className="text-xs text-gray-500">{job.company} – {job.position}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {!hasCompensation(comp) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              {tx('negotiation.noComp', 'Tip: add the offer figures (base, bonus…) in the Compensation section first so the draft can anchor on real numbers.')}
            </div>
          )}
          {offerSummary && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
              <span className="font-semibold text-gray-700">{tx('negotiation.currentOffer', 'Current offer')}:</span> {offerSummary}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{tx('negotiation.format', 'Format')}</label>
              <select value={format} onChange={e => setFormat(e.target.value)} disabled={loading}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="email">{tx('negotiation.formatEmail', 'Email')}</option>
                <option value="script">{tx('negotiation.formatScript', 'Call talking points')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{tx('negotiation.language', 'Language')}</label>
              <select value={language} onChange={e => setLanguage(e.target.value)} disabled={loading}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="auto">{tx('negotiation.langAuto', 'Detect (auto)')}</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{tx('negotiation.target', 'What would you like to ask for?')}</label>
            <input value={target} onChange={e => setTarget(e.target.value)} disabled={loading}
              placeholder={tx('negotiation.targetPlaceholder', 'e.g. base 75k instead of 68k, or +5 remote days')}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              {tx('negotiation.context', 'Additional context')} <span className="text-gray-400 font-normal">({tx('common.optional', 'optional')})</span>
            </label>
            <textarea value={context} onChange={e => setContext(e.target.value)} disabled={loading} rows={2}
              placeholder={tx('negotiation.contextPlaceholder', 'Competing offer, timeline, achievements to highlight, tone…')}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {draft && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{tx('negotiation.draft', 'Draft (edit before sending)')}</label>
              <textarea value={draft} onChange={e => setDraft(e.target.value)}
                className="w-full h-72 border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <p className="text-[11px] text-gray-400 mt-1">✍️ {tx('negotiation.draftHint', 'This is a draft. Review and send it yourself, we never send anything for you.')}</p>
              {saved && <p className="text-xs text-green-600 mt-1">✅ {tx('negotiation.saved', 'Draft saved')}</p>}
              {copied && <p className="text-xs text-indigo-600 mt-1">📋 {tx('negotiation.copied', 'Copied to clipboard')}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 gap-2">
          <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-100">
            {tx('common.close', 'Close')}
          </button>
          <div className="flex gap-2">
            {draft && (
              <>
                <button onClick={copy} className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-100">
                  📋 {tx('common.copy', 'Copy')}
                </button>
                <button onClick={save} className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-100">
                  💾 {tx('common.save', 'Save')}
                </button>
              </>
            )}
            <button onClick={generate} disabled={loading}
              className="text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
              {loading ? `⏳ ${tx('negotiation.generating', 'Generating…')}` : (draft ? `🔄 ${tx('common.regenerate', 'Regenerate')}` : `✨ ${tx('negotiation.generate', 'Generate draft')}`)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
