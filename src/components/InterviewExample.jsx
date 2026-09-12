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

// Strip anything that reads as code/markup so the output is natural prose: code
// fences, inline backticks, bold/italic markers, and leading bullet/heading marks.
function cleanText(s = '') {
  return String(s)
    .replace(/```[a-z]*\n?/gi, '').replace(/```/g, '')  // code fences
    .replace(/`([^`]+)`/g, '$1')                          // inline code
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1').replace(/_(.+?)_/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '').replace(/^\s*#{1,6}\s+/gm, '')
    .trim()
}

function buildPrompt({ company, position, description, cv, roundName, roundFocus, language, guidance }) {
  const langLine = language === 'fr' ? 'Write the ENTIRE response in FRENCH.'
    : language === 'en' ? 'Write the ENTIRE response in ENGLISH.'
    : 'DETECT the language from the role/company/description below and write the ENTIRE response in THAT language. If unsure, default to French.'
  const descCtx = description ? `\n\nJob description (excerpt):\n${String(description).slice(0, 900)}` : ''
  const cvCtx = cv ? `\n\nCandidate CV (excerpt):\n${String(cv).slice(0, 900)}` : ''
  // Free-text steering the user typed in the panel — a weak spot to drill, a
  // specific competency, or a scenario the real interview will cover. Injected as
  // a hard instruction so the questions and model answers reflect it.
  const guidanceCtx = guidance && guidance.trim()
    ? `\n\nCANDIDATE'S REQUESTED FOCUS — the person preparing asked you to specifically address the following; make sure the questions AND the model answers reflect it: ${guidance.trim()}`
    : ''
  return `You are a senior interviewer at ${company || 'the company'} running a ${roundName || 'job'} interview for the role of ${position || 'this role'}.

${langLine}

INTERVIEW STAGE — the questions MUST belong to THIS stage only: ${roundFocus || 'a general interview.'} Do not include questions from other interview types.

Write a realistic 6-question example interview for this candidate, tailored to the role, company and the candidate's background below.${descCtx}${cvCtx}${guidanceCtx}

For EACH question, write the interviewer's question, then a COMPLETE model answer spoken in the first person AS THIS CANDIDATE, grounded in their real background from the CV (use concrete details; where a specific figure or example is unknown, write a clearly bracketed placeholder like [your metric]). Each answer must be a full, ready-to-say spoken answer of about 4 to 6 natural sentences (keep each answer under ~110 words so the whole interview is complete), NOT an outline. For behavioral questions use the STAR structure but written as flowing speech.

Write like real people talking. Output PLAIN TEXT ONLY — absolutely no JSON, no markdown, no code blocks, no backticks, no bullet points, no asterisks. Use EXACTLY this layout and these English field tags (keep the tags in English even if the content is in another language):

INTRO: <1-2 sentences on what this interview stage typically feels like here>
===
Q: <the interviewer's question, as they'd say it out loud>
WHY: <one short line: what they're really assessing>
A: <the candidate's full spoken answer>
===
Q: <next question>
WHY: <...>
A: <...>

Repeat the Q / WHY / A block, separated by a line containing only === , for every question.`
}

// Parse the delimiter-based plain-text example into { intro, questions:[{q,assess,answer}] }.
// Robust to missing tags / extra blank lines; no JSON involved, so free-text answers
// with quotes and line breaks can never break it. Also accepts a legacy JSON blob.
function parseExample(text) {
  if (!text) return null
  const src = String(text).trim()

  // Legacy / accidental JSON — salvage it so old flows still render.
  if (src.startsWith('{') || src.startsWith('```')) {
    const m = src.match(/\{[\s\S]*\}/)
    if (m) { try { return JSON.parse(m[0]) } catch { /* fall through to text parse */ } }
  }

  const intro = (src.match(/INTRO\s*:\s*([\s\S]*?)(?:\n===|\nQ\s*:|$)/i)?.[1] || '').trim()
  const questions = []
  // Split on lines that are only === , then pull Q/WHY/A out of each chunk.
  for (const chunk of src.split(/\n\s*={3,}\s*\n/)) {
    const q = chunk.match(/(?:^|\n)\s*Q\s*:\s*([\s\S]*?)(?:\n\s*(?:WHY|A)\s*:|$)/i)?.[1]
    if (!q) continue
    const assess = chunk.match(/(?:^|\n)\s*WHY\s*:\s*([\s\S]*?)(?:\n\s*A\s*:|$)/i)?.[1] || ''
    const answer = chunk.match(/(?:^|\n)\s*A\s*:\s*([\s\S]*?)$/i)?.[1] || ''
    questions.push({ q: cleanText(q), assess: cleanText(assess), answer: cleanText(answer) })
  }
  if (!questions.length) return null
  return { intro: cleanText(intro), questions }
}

export default function InterviewExample(props) {
  return (
    <AIPanelBoundary label="Interview example" onClose={props.onClose}>
      <InterviewExamplePanel {...props} />
    </AIPanelBoundary>
  )
}

function InterviewExamplePanel({ job, round, roundName, roundFocus, cv, guidance: guidanceProp = '', onClose, onSave, t = (k) => k }) {
  const tx = (k, f) => { const v = t(k); return v && v !== k ? v : f }
  const { startDrag, panelStyle, snapPreview } = useDragDock({ width: 760 })
  const saved = job.interviewExamples?.[storeKey(round)] || null
  const [data, setData] = useState(saved?.data || null)
  const [raw, setRaw] = useState(saved?.raw || '')       // fallback text when JSON failed
  const [language, setLanguage] = useState('auto')
  // Free-text steering: seeded from the prep card, editable here so the user can
  // refine it and regenerate. Persisted with the example so it survives a reopen.
  const [guidance, setGuidance] = useState(guidanceProp || saved?.guidance || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [savedFlag, setSavedFlag] = useState(false)

  const persist = (payload) => {
    if (!onSave) return
    const next = { ...(job.interviewExamples || {}), [storeKey(round)]: { ...payload, guidance, generatedAt: new Date().toISOString() } }
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
        cv, roundName, roundFocus, language, guidance,
      })
      const res = await aiFetch('/api/claude', {
        model: CLAUDE_MODEL,
        max_tokens: 4000, // proxy clamps trial keys to 4000; enough for 6 full answers
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
        // If the model still hit the token ceiling, the last block's answer is
        // likely cut off mid-sentence — drop it so we never show a partial answer.
        if (json.stop_reason === 'max_tokens' && parsed.questions.length > 1) {
          parsed.questions = parsed.questions.slice(0, -1)
        }
        setData(parsed); setRaw('')
        persist({ data: parsed })
      } else if (text.trim()) {
        const cleaned = cleanText(text)
        setData(null); setRaw(cleaned)
        persist({ raw: cleaned })
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

          {/* Optional custom focus — refine what the questions and answers should cover, then (re)generate. */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">{tx('interviews.focusLabel', 'Add your own focus (optional)')}</label>
            <textarea
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              disabled={loading}
              rows={2}
              placeholder={tx('interviews.focusPlaceholder', 'e.g. drill my weak spot on system design, or focus on leadership scenarios')}
              className="w-full resize-none text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            />
          </div>

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

          {/* Natural interviewer ↔ candidate conversation. */}
          {data?.questions?.map((qq, i) => (
            <div key={i} className="space-y-2">
              {/* Interviewer */}
              <div className="flex items-start gap-2">
                <span className="shrink-0 w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-sm" aria-hidden>🧑‍💼</span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{tx('interviewExample.interviewer', 'Interviewer')}</p>
                  <div className="mt-0.5 rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{qq.q}</div>
                  {qq.assess && <p className="text-[11px] text-gray-400 mt-1 pl-1">💡 {qq.assess}</p>}
                </div>
              </div>
              {/* Candidate */}
              {(qq.answer || qq.example) && (
                <div className="flex items-start gap-2 flex-row-reverse">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-sm" aria-hidden>🙋</span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-400 text-right">{tx('interviewExample.you', 'You')}</p>
                    <div className="mt-0.5 rounded-2xl rounded-tr-sm bg-indigo-50 border border-indigo-100 px-3 py-2 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{qq.answer || qq.example}</div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {!data && raw && (
            <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{cleanText(raw)}</div>
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
