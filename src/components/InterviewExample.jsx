import { useState } from 'react'
import AIPanelBoundary from './AIPanelBoundary'
import { aiFetch } from '../services/apiKey'
import { useDragDock } from '../hooks/useDragDock'
import { CLAUDE_MODEL } from '../constants/aiModel'

// InterviewExample — a text-based example interview for ONE candidature and ONE
// interview level (screening / technical / manager / final). It generates the
// realistic questions the user is likely to face at that stage for THIS company &
// role (tailored to the CV + job description) with, per question, what the
// interviewer is really assessing, how to answer, and an example opener.
//
// Draft-style like NegotiationAssistant: one /api/claude call (CORS + trial gate),
// cached per round on job.interviewExamples so it doesn't regenerate/cost every
// time and syncs across devices (jobs.extras).

const storeKey = (round) => round || 'general'

function buildPrompt({ company, position, description, cv, roundName, roundFocus, language }) {
  const langLine = language === 'fr' ? 'Write the ENTIRE response in FRENCH.'
    : language === 'en' ? 'Write the ENTIRE response in ENGLISH.'
    : 'DETECT the language from the role/company/description below and write the ENTIRE response in THAT language. If unsure, default to French.'
  const descCtx = description ? `\n\nJob description (excerpt):\n${String(description).slice(0, 900)}` : ''
  const cvCtx = cv ? `\n\nCandidate CV (excerpt):\n${String(cv).slice(0, 900)}` : ''
  return `You are a senior interviewer at ${company || 'the company'} preparing the question list for a ${roundName || 'job'} interview for the role of ${position || 'this role'}.

${langLine}

INTERVIEW STAGE — the questions MUST belong to THIS stage only: ${roundFocus || 'a general interview.'} Do not include questions from other interview types.

Produce 6 to 8 realistic questions this candidate is likely to be asked at this exact stage, tailored to the role, company and the candidate's background below.${descCtx}${cvCtx}

For EACH question give ALL of: the question itself; what the interviewer is really assessing; how to answer it well (1 to 3 short pointers); and a COMPLETE model answer written in the first person AS THIS CANDIDATE, grounded in their real background from the CV above (use concrete details, and where a specific figure/example is unknown write a clearly bracketed placeholder like [your metric]). The model answer must be a full, ready-to-say answer (about 4 to 8 sentences), not just an opener. For behavioral questions use the STAR structure.

Return ONLY valid JSON, no markdown, no preamble, in exactly this shape:
{"intro":"1-2 sentences on what this interview stage typically looks like at this company/role","questions":[{"q":"the question","assess":"what they're really evaluating","approach":"how to answer well","answer":"a complete first-person model answer for this candidate"}]}`
}

// Best-effort JSON extraction (Haiku sometimes wraps JSON in prose / code fences).
function parseExample(text) {
  if (!text) return null
  try { return JSON.parse(text) } catch { /* try to salvage */ }
  const m = text.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch { /* fall through */ } }
  return null
}

export default function InterviewExample(props) {
  return (
    <AIPanelBoundary label="Interview example" onClose={props.onClose}>
      <InterviewExamplePanel {...props} />
    </AIPanelBoundary>
  )
}

function InterviewExamplePanel({ job, round, roundName, roundFocus, cv, onClose, onSave, t = (k) => k }) {
  const tx = (k, f) => { const v = t(k); return v && v !== k ? v : f }
  const { startDrag, panelStyle, snapPreview } = useDragDock({ width: 760 })
  const saved = job.interviewExamples?.[storeKey(round)] || null
  const [data, setData] = useState(saved?.data || null)
  const [raw, setRaw] = useState(saved?.raw || '')       // fallback text when JSON failed
  const [language, setLanguage] = useState('auto')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [savedFlag, setSavedFlag] = useState(false)

  const persist = (payload) => {
    if (!onSave) return
    const next = { ...(job.interviewExamples || {}), [storeKey(round)]: { ...payload, generatedAt: new Date().toISOString() } }
    onSave(job.id, { interviewExamples: next })
    setSavedFlag(true)
    setTimeout(() => setSavedFlag(false), 2500)
  }

  const generate = async () => {
    setLoading(true)
    setError(null)
    try {
      const prompt = buildPrompt({
        company: job.company, position: job.position, description: job.description || job.jobDescription,
        cv, roundName, roundFocus, language,
      })
      const res = await aiFetch('/api/claude', {
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Generation failed: ${res.status}`)
      }
      const json = await res.json()
      const text = json.content?.[0]?.text || ''
      const parsed = parseExample(text)
      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length) {
        setData(parsed); setRaw('')
        persist({ data: parsed })
      } else if (text.trim()) {
        setData(null); setRaw(text)
        persist({ raw: text })
      } else {
        throw new Error(tx('interviewExample.failed', 'Could not generate example questions. Try again.'))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const hasContent = !!(data || raw)

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      {snapPreview}
      <div className="bg-white rounded-2xl shadow-2xl w-11/12 max-h-[85vh] flex flex-col max-w-3xl" style={panelStyle}>
        {/* Header */}
        <div onPointerDown={startDrag} className="flex items-center justify-between p-4 border-b border-gray-200 cursor-move select-none">
          <div>
            <h2 className="text-lg font-bold text-gray-800">📝 {roundName ? `${roundName} — ${tx('interviewExample.title', 'example interview')}` : tx('interviewExample.title', 'Example interview')}</h2>
            <p className="text-xs text-gray-500">{job.company} – {job.position}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <p className="text-xs text-gray-500">{tx('interviewExample.subtitle', 'Likely questions for this interview stage, tailored to this application. Use it to prepare — then practise with a mock interview.')}</p>

          {!hasContent && !loading && (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">📝</div>
              <p className="text-sm text-gray-500 mb-4">{tx('interviewExample.empty', 'Generate a set of example questions for this interview stage.')}</p>
            </div>
          )}

          {loading && (
            <div className="text-center py-8 text-sm text-gray-500">⏳ {tx('interviewExample.generating', 'Preparing example questions…')}</div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3"><p className="text-xs text-red-700">{error}</p></div>
          )}

          {data?.intro && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-sm text-indigo-900">{data.intro}</div>
          )}

          {data?.questions?.map((qq, i) => (
            <div key={i} className="rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-semibold text-gray-900">{i + 1}. {qq.q}</p>
              {qq.assess && (
                <p className="text-xs text-gray-600 mt-2"><span className="font-semibold text-gray-700">🎯 {tx('interviewExample.assess', 'What they assess')}: </span>{qq.assess}</p>
              )}
              {qq.approach && (
                <p className="text-xs text-gray-600 mt-1.5"><span className="font-semibold text-gray-700">✅ {tx('interviewExample.approach', 'How to answer')}: </span>{qq.approach}</p>
              )}
              {(qq.answer || qq.example) && (
                <div className="mt-2 rounded-lg bg-green-50 border border-green-100 p-2.5">
                  <p className="text-[11px] font-semibold text-green-800 mb-1">💬 {tx('interviewExample.answer', 'Example answer')}</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{qq.answer || qq.example}</p>
                </div>
              )}
            </div>
          ))}

          {!data && raw && (
            <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{raw}</div>
          )}

          {savedFlag && <p className="text-xs text-green-600">✅ {tx('interviewExample.saved', 'Saved to this candidature')}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 gap-2">
          <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-100">
            {tx('common.close', 'Close')}
          </button>
          <div className="flex items-center gap-2">
            <select value={language} onChange={e => setLanguage(e.target.value)} disabled={loading}
              className="text-sm border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="auto">{tx('negotiation.langAuto', 'Detect (auto)')}</option>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
            <button onClick={generate} disabled={loading}
              className="text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
              {loading ? `⏳ ${tx('interviewExample.generating', 'Generating…')}` : (hasContent ? `🔄 ${tx('common.regenerate', 'Regenerate')}` : `✨ ${tx('interviewExample.generate', 'Generate questions')}`)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
