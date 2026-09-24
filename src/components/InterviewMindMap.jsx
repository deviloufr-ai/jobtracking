import { useState } from 'react'
import AIPanelBoundary from './AIPanelBoundary'
import { aiFetch } from '../services/apiKey'
import { useDragDock } from '../hooks/useDragDock'
import { CLAUDE_MODEL } from '../constants/aiModel'
import { detectLanguage } from '../utils/detectLanguage'
import { jobRoundKeys, roundLabel } from '../utils/interviewRounds'
import { buildMindMapPrompt, parseMindMap, mnemonicFor, drillDeck, mindMapSources, hasMindMap } from '../utils/mindMap'

// InterviewMindMap — the candidate's interview prep on one page, built to be
// REMEMBERED: themes (branches) → 1-3 word keywords → the story each keyword
// unlocks, the questions it answers, S/T/A/R cues and the proof point to land.
// Three ways to use it: the radial Map (with a "recall test" that hides the
// keywords), an Outline (readable on mobile) and a Drill (see a question, recall
// which keyword answers it). Built from the CV + saved STAR answers + example
// interview questions in one /api/claude call, cached on job.mindMap (jobs.extras).

const COLORS = ['#4f46e5', '#0d9488', '#d97706', '#db2777', '#2563eb', '#7c3aed']
const colorAt = (i) => COLORS[i % COLORS.length]
const trunc = (s = '', n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const starLabels = (lang) => lang === 'en'
  ? { S: 'Situation', T: 'Task', A: 'Action', R: 'Result' }
  : { S: 'Situation', T: 'Tâche', A: 'Action', R: 'Résultat' }
const STAR_TONES = { S: 'bg-blue-50 text-blue-700', T: 'bg-violet-50 text-violet-700', A: 'bg-amber-50 text-amber-700', R: 'bg-green-50 text-green-700' }

const txOf = (t) => (k, f) => { const v = t(k); return v && v !== k ? v : f }

function loadProfile() {
  try { const r = localStorage.getItem('jobtrackr_profile'); return r ? JSON.parse(r) : null } catch { return null }
}

// ── Radial map ────────────────────────────────────────────────────────────────
// Ring radii / spread were checked for pill overlaps at 3-6 branches × 1-3
// keywords with every label at its max (truncated) length.
const W = 1200, H = 640, CX = 600, CY = 320

function layout(map) {
  const n = map.branches.length
  return map.branches.map((b, bi) => {
    const a = -Math.PI / 2 + (bi * 2 * Math.PI) / n
    const bx = CX + 220 * Math.cos(a), by = CY + 190 * Math.sin(a)
    const k = b.keywords.length
    const step = Math.min(((2 * Math.PI) / n) * 0.65, 1.2) / 2
    const leaves = b.keywords.map((kw, ki) => {
      const la = a + (ki - (k - 1) / 2) * step
      // Alternate leaves sit one ring further out so neighbouring pills at the top
      // and bottom of the map don't overlap.
      const out = ki % 2 ? 1 : 0
      return { kw, ki, x: CX + (440 + out * 40) * Math.cos(la), y: CY + (260 + out * 40) * Math.sin(la) }
    })
    return { b, bi, bx, by, leaves, color: colorAt(bi) }
  })
}

const curve = (x1, y1, x2, y2) => {
  const mx = (x1 + x2) / 2
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
}

// Where a branch→keyword edge meets the keyword pill: its left/right side, or its
// top/bottom when the pill sits (almost) straight above/below the branch. Ending at
// the edge keeps the line out from behind the translucent pill's text.
const leafAnchor = (bx, by, x, y, w) => (Math.abs(x - bx) > w / 2
  ? [x + (x > bx ? -w / 2 : w / 2), y]
  : [x, y + (y > by ? -14 : 14)])

function MapCanvas({ map, job, selected, onSelect, hidden, revealed }) {
  const nodes = layout(map).map(n => ({
    ...n,
    leaves: n.leaves.map(l => {
      const id = `${n.bi}-${l.ki}`
      const masked = hidden && !revealed.has(id)
      const text = masked ? '? ? ?' : trunc(l.kw.word, 20)
      return { ...l, id, masked, text, w: Math.max(64, text.length * 7.5 + 24) }
    }),
  }))
  const activate = (id) => (e) => {
    if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); onSelect(id) }
  }
  return (
    <div className="overflow-x-auto no-scrollbar">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[760px] select-none" role="img" aria-label="Interview mind map">
        {/* Edges first so nodes paint on top */}
        {nodes.map(({ bi, bx, by, leaves, color }) => (
          <g key={`e${bi}`} fill="none" stroke={color}>
            <path d={curve(CX, CY, bx, by)} strokeWidth={4} strokeOpacity={0.45} strokeLinecap="round" />
            {leaves.map(l => <path key={l.ki} d={curve(bx, by, ...leafAnchor(bx, by, l.x, l.y, l.w))} strokeWidth={1.75} strokeOpacity={0.5} />)}
          </g>
        ))}

        {/* Centre: the candidature */}
        <g>
          <rect x={CX - 110} y={CY - 32} width={220} height={64} rx={18} fill="#312e81" />
          <text x={CX} y={CY - 5} textAnchor="middle" fontSize={17} fontWeight={700} fill="#fff">{trunc(job.company || '', 22)}</text>
          <text x={CX} y={CY + 16} textAnchor="middle" fontSize={12} fill="#c7d2fe">{trunc(job.position || '', 32)}</text>
        </g>

        {nodes.map(({ b, bi, bx, by, leaves, color }) => {
          const label = `${b.icon ? b.icon + ' ' : ''}${trunc(b.label, 18)}`
          const bw = Math.max(90, [...label].length * 8.4 + 26)
          return (
            <g key={`n${bi}`}>
              <rect x={bx - bw / 2} y={by - 17} width={bw} height={34} rx={17} fill={color} />
              <text x={bx} y={by + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#fff">{label}</text>
              {leaves.map(({ kw, id, masked, text, w, x, y }) => {
                const sel = selected === id
                return (
                  <g key={id} role="button" tabIndex={0} aria-label={masked ? `${b.label} — hidden keyword` : kw.word}
                    onClick={activate(id)} onKeyDown={activate(id)} className="cursor-pointer outline-none">
                    <rect x={x - w / 2} y={y - 14} width={w} height={28} rx={14}
                      fill={color} fillOpacity={sel ? 0.3 : masked ? 0.06 : 0.14}
                      stroke={color} strokeWidth={sel ? 2.5 : 1.25} strokeDasharray={masked ? '4 3' : undefined} />
                    <text x={x} y={y + 4.5} textAnchor="middle" fontSize={13} fontWeight={600}
                      fill={masked ? color : 'currentColor'} className="text-gray-800">{text}</text>
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Keyword detail (what the keyword unlocks) ─────────────────────────────────
function KeywordDetail({ branch, kw, color, lang, tx, compact = false }) {
  const labels = starLabels(lang)
  return (
    <div className={compact ? 'space-y-2' : 'rounded-xl border border-gray-200 bg-white p-4 space-y-3'} style={compact ? undefined : { borderLeft: `4px solid ${color}` }}>
      {!compact && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: color }}>{branch.icon} {branch.label}</span>
          <span className="text-gray-300">›</span>
          <span className="text-[15px] font-bold text-gray-900">{kw.word}</span>
        </div>
      )}
      {kw.story && <p className="text-[13px] text-gray-700"><span className="text-gray-400">{tx('mindMap.story', 'Story')}:</span> {kw.story}</p>}
      {kw.questions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{tx('mindMap.answers', 'Answers these questions')}</p>
          <ul className="space-y-0.5">
            {kw.questions.map((q, i) => <li key={i} className="text-[13px] text-gray-700">❓ {q}</li>)}
          </ul>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-1.5">
        {['S', 'T', 'A', 'R'].filter(k => kw.cue?.[k]).map(k => (
          <div key={k} className="flex gap-2 items-start">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${STAR_TONES[k]}`}>{labels[k]}</span>
            <span className="text-[13px] text-gray-700 leading-snug">{kw.cue[k]}</span>
          </div>
        ))}
      </div>
      {kw.proof && (
        <p className="text-[13px] font-semibold text-gray-900">📌 {tx('mindMap.proof', 'Proof point')}: <span className="font-bold" style={{ color }}>{kw.proof}</span></p>
      )}
    </div>
  )
}

// ── Outline (mobile-friendly, printable) ──────────────────────────────────────
function OutlineView({ map, lang, hidden, revealed, onReveal, tx }) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {map.branches.map((b, bi) => {
        const color = colorAt(bi)
        return (
          <div key={bi} className="rounded-xl border border-gray-200 bg-white p-3" style={{ borderTop: `4px solid ${color}` }}>
            <div className="text-[14px] font-bold text-gray-900 mb-2">{b.icon} {b.label}</div>
            <div className="space-y-3">
              {b.keywords.map((kw, ki) => {
                const id = `${bi}-${ki}`
                const masked = hidden && !revealed.has(id)
                return (
                  <div key={ki}>
                    <button onClick={() => onReveal(id)} disabled={!masked}
                      className="text-[13px] font-bold px-2.5 py-1 rounded-full border mb-1.5 disabled:cursor-default"
                      style={{ borderColor: color, color, background: `${color}14` }}>
                      {masked ? `? ? ? — ${tx('mindMap.tapToCheck', 'tap to check')}` : kw.word}
                    </button>
                    {!masked && <KeywordDetail branch={b} kw={kw} color={color} lang={lang} tx={tx} compact />}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Drill: see a question, recall the keyword that answers it ─────────────────
const shuffled = (n) => {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

function DrillView({ map, lang, tx }) {
  const deck = drillDeck(map)
  const [queue, setQueue] = useState(() => shuffled(deck.length))
  const [shown, setShown] = useState(false)
  const [got, setGot] = useState(0)

  if (deck.length === 0) return <p className="text-sm text-gray-500 text-center py-8">{tx('mindMap.drillEmpty', 'No questions to drill yet — regenerate the map.')}</p>

  if (queue.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="text-4xl mb-2">🎉</div>
        <p className="text-sm font-semibold text-gray-800">{tx('mindMap.drillDone', 'All {n} questions mapped to an answer.').replace('{n}', deck.length)}</p>
        <button onClick={() => { setQueue(shuffled(deck.length)); setGot(0); setShown(false) }}
          className="mt-4 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg">↻ {tx('mindMap.drillRestart', 'Start over')}</button>
      </div>
    )
  }

  const card = deck[queue[0]]
  const branch = map.branches[card.bi]
  const kw = branch.keywords[card.ki]
  const color = colorAt(card.bi)
  const next = (ok) => {
    setShown(false)
    if (ok) { setGot(g => g + 1); setQueue(q => q.slice(1)) } else setQueue(q => [...q.slice(1), q[0]])
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center justify-between text-[12px] text-gray-500 mb-2">
        <span>{tx('mindMap.drillProgress', '{left} left · {got} nailed').replace('{left}', queue.length).replace('{got}', got)}</span>
        <div className="flex-1 mx-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${(got / deck.length) * 100}%` }} />
        </div>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">{tx('mindMap.drillPrompt', 'Which keyword answers this?')}</p>
        <p className="text-[16px] font-semibold text-gray-900 leading-snug">“{card.q}”</p>
        {!shown ? (
          <button onClick={() => setShown(true)} className="mt-5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg">
            👀 {tx('mindMap.drillReveal', 'Show the answer map')}
          </button>
        ) : (
          <div className="mt-4 text-left">
            <KeywordDetail branch={branch} kw={kw} color={color} lang={lang} tx={tx} />
            <div className="flex justify-center gap-2 mt-4">
              <button onClick={() => next(false)} className="text-sm font-semibold px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">🔁 {tx('mindMap.drillAgain', 'Again')}</button>
              <button onClick={() => next(true)} className="text-sm font-semibold px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700">✓ {tx('mindMap.drillGot', 'Got it')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Workspace (map + outline + drill), reused inline in the candidature drawer ─
export function MindMapWorkspace({ map, job, t = (k) => k }) {
  const tx = txOf(t)
  const lang = map.lang || detectLanguage(job)
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'outline' : 'map'))
  const [selected, setSelected] = useState(null)
  const [hidden, setHidden] = useState(false)
  const [revealed, setRevealed] = useState(() => new Set())
  const [tipsOpen, setTipsOpen] = useState(false)
  const { letters, sentence } = mnemonicFor(map)

  const reveal = (id) => setRevealed(s => new Set(s).add(id))
  const selectLeaf = (id) => { reveal(id); setSelected(id) }
  const toggleHidden = () => { setHidden(h => !h); setRevealed(new Set()); setSelected(null) }
  const [sbi, ski] = selected ? selected.split('-').map(Number) : []
  const selBranch = selected ? map.branches[sbi] : null
  const selKw = selBranch?.keywords[ski]

  const seg = (id, label) => (
    <button key={id} onClick={() => setView(id)}
      className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${view === id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
  )

  return (
    <div className="space-y-3">
      {/* Hook + memory key */}
      <div className="grid sm:grid-cols-2 gap-2">
        {map.pitch && (
          <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400 mb-1">🎙️ {tx('mindMap.pitch', 'Your hook — “tell me about yourself”')}</p>
            <p className="text-[13px] text-gray-800 leading-snug">{map.pitch}</p>
          </div>
        )}
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">🔑 {tx('mindMap.mnemonic', 'Memory key — one letter per theme')}</p>
          <div className="flex items-center gap-1 flex-wrap">
            {letters.map((l, i) => (
              <span key={i} title={map.branches[i].label} className="w-7 h-7 rounded-lg flex items-center justify-center text-[14px] font-extrabold text-white" style={{ background: colorAt(i) }}>{l || '·'}</span>
            ))}
          </div>
          {sentence && <p className="text-[12px] text-gray-600 mt-1.5 italic">{sentence}</p>}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex p-0.5 rounded-xl bg-gray-100">
          {seg('map', `🧠 ${tx('mindMap.viewMap', 'Map')}`)}
          {seg('outline', `☰ ${tx('mindMap.viewOutline', 'Outline')}`)}
          {seg('drill', `🎯 ${tx('mindMap.viewDrill', 'Drill')}`)}
        </div>
        {view !== 'drill' && (
          <button onClick={toggleHidden} aria-pressed={hidden}
            className={`ml-auto text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${hidden ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            🙈 {tx('mindMap.recall', 'Recall test')}
          </button>
        )}
      </div>
      {hidden && view !== 'drill' && (
        <p className="text-[12px] text-gray-500">{tx('mindMap.recallHint', 'Keywords hidden. Say each one (and its story) out loud, then tap to check.')}</p>
      )}

      {view === 'map' && (
        <>
          <MapCanvas map={map} job={job} selected={selected} onSelect={selectLeaf} hidden={hidden} revealed={revealed} />
          {selKw
            ? <KeywordDetail branch={selBranch} kw={selKw} color={colorAt(sbi)} lang={lang} tx={tx} />
            : <p className="text-[12px] text-gray-400 text-center">{tx('mindMap.pickKeyword', 'Tap a keyword to see the questions it answers and the STAR cues to tell it.')}</p>}
        </>
      )}
      {view === 'outline' && <OutlineView map={map} lang={lang} hidden={hidden} revealed={revealed} onReveal={reveal} tx={tx} />}
      {view === 'drill' && <DrillView map={map} lang={lang} tx={tx} />}

      {/* How to remember */}
      <div className="rounded-xl border border-gray-100 bg-white">
        <button onClick={() => setTipsOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
          <span className="text-[12.5px] font-semibold text-gray-700">💡 {tx('mindMap.tips', 'How to remember it')}</span>
          <span className={`ml-auto text-gray-300 text-xs transition-transform ${tipsOpen ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {tipsOpen && (
          <ul className="px-3 pb-3 space-y-1.5 text-[12.5px] text-gray-600">
            {map.tips.map((tip, i) => <li key={`m${i}`}>• {tip}</li>)}
            <li>• {tx('mindMap.tipKeywords', 'Learn the keywords, not the sentences — a keyword brings back the story, and telling it fresh sounds natural.')}</li>
            <li>• {tx('mindMap.tipDrill', 'Drill the day before and the morning of: each question you get right leaves the deck, each miss comes back.')}</li>
            <li>• {tx('mindMap.tipProof', 'Finish every answer on its proof point — the number is what the interviewer writes down.')}</li>
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Modal: generate / regenerate / reset ──────────────────────────────────────
export default function InterviewMindMap(props) {
  return (
    <AIPanelBoundary label="Interview mind map" onClose={props.onClose}>
      <InterviewMindMapPanel {...props} />
    </AIPanelBoundary>
  )
}

function InterviewMindMapPanel({ job, guidance: guidanceProp = '', onClose, onSave, t = (k) => k }) {
  const tx = txOf(t)
  const { startDrag, panelStyle, snapPreview } = useDragDock({ width: 1040 })
  const [data, setData] = useState(hasMindMap(job) ? job.mindMap : null)
  const [language, setLanguage] = useState('auto')
  const [guidance, setGuidance] = useState(guidanceProp || job.mindMap?.guidance || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)
  const { stars, exampleQuestions } = mindMapSources(job)

  const notify = (msg) => { setFlash(msg); setTimeout(() => setFlash(null), 2500) }

  const generate = async () => {
    setLoading(true)
    setError(null)
    try {
      const prompt = buildMindMapPrompt({
        job, cv: job.cvSaved?.markdown || '', profile: loadProfile(),
        rounds: jobRoundKeys(job).map(k => roundLabel(k, t)), language, guidance,
      })
      const res = await aiFetch('/api/claude', {
        model: CLAUDE_MODEL,
        max_tokens: 4000, // proxy clamps trial keys to 4000; a full 6×3 map fits well under
        messages: [{ role: 'user', content: prompt }],
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message || err.error || `Generation failed: ${res.status}`)
      }
      const json = await res.json()
      const parsed = parseMindMap(json.content?.[0]?.text || '')
      if (!parsed) throw new Error(tx('mindMap.failed', 'Could not build the mind map. Try again.'))
      const lang = language === 'auto' ? detectLanguage(job) : language
      const next = { ...parsed, lang, guidance, generatedAt: new Date().toISOString() }
      setData(next)
      onSave?.(job.id, { mindMap: next })
      notify(`✅ ${tx('mindMap.saved', 'Saved to this candidature')}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Writes {} rather than null: buildExtras skips null and the extras write is a
  // union, so null would leave the old map on the server and it would come back
  // on the next poll. hasMindMap() treats {} as "no map".
  const reset = () => {
    if (!window.confirm(tx('mindMap.resetConfirm', 'Delete this mind map? You can build a new one afterwards.'))) return
    onSave?.(job.id, { mindMap: {} })
    setData(null); setGuidance(''); setError(null)
    notify(`↺ ${tx('mindMap.resetDone', 'Mind map reset')}`)
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      {snapPreview}
      <div className="bg-white rounded-2xl shadow-2xl w-11/12 max-h-[90vh] flex flex-col max-w-5xl" style={panelStyle}>
        {/* Header */}
        <div onPointerDown={startDrag} className="flex items-center justify-between p-4 border-b border-gray-200 cursor-move select-none">
          <div>
            <h2 className="text-lg font-bold text-gray-800">🧠 {tx('mindMap.title', 'Interview mind map')}</h2>
            <p className="text-xs text-gray-500">{job.company} – {job.position}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
          <p className="text-xs text-gray-500">{tx('mindMap.subtitle', 'Your prep on one page: themes → keywords → the story each keyword unlocks. Memorise a handful of keywords and every question maps back to an answer.')}</p>

          {/* Optional focus — steers the next (re)generation. */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">{tx('interviews.focusLabel', 'Anything specific to work on? (optional)')}</label>
            <textarea value={guidance} onChange={(e) => setGuidance(e.target.value)} disabled={loading} rows={data ? 1 : 2}
              placeholder={tx('interviews.focusPlaceholder', 'e.g. drill my weak spot on system design, or focus on leadership scenarios')}
              className="w-full resize-none text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50" />
          </div>

          {!data && !loading && (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">🧠</div>
              <p className="text-sm text-gray-600 mb-1">{tx('mindMap.empty', 'Build a memory map of your stories for this interview.')}</p>
              <p className="text-xs text-gray-400">
                {tx('mindMap.sources', 'Uses your CV, {stars} saved STAR answer(s) and {examples} example question(s) for this application.')
                  .replace('{stars}', stars.length).replace('{examples}', exampleQuestions.length)}
              </p>
            </div>
          )}

          {loading && <div className="text-center py-10 text-sm text-gray-500">⏳ {tx('mindMap.generating', 'Mapping your stories…')}</div>}

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3"><p className="text-xs text-red-700">{error}</p></div>}

          {data && !loading && <MindMapWorkspace key={data.generatedAt} map={data} job={job} t={t} />}

          {flash && <p className="text-xs text-gray-500">{flash}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 gap-2 flex-wrap">
          <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-100">
            {tx('common.close', 'Close')}
          </button>
          <div className="flex items-center gap-2">
            {data && (
              <button onClick={reset} disabled={loading}
                className="text-sm text-gray-600 hover:text-red-600 px-3 py-2 rounded-lg border border-gray-300 hover:border-red-300 hover:bg-red-50 transition-colors disabled:opacity-50">
                ↺ {tx('mindMap.reset', 'Reset')}
              </button>
            )}
            <select value={language} onChange={e => setLanguage(e.target.value)} disabled={loading}
              className="text-sm border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="auto">{tx('negotiation.langAuto', 'Detect (auto)')}</option>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
            <button onClick={generate} disabled={loading}
              className="text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
              {loading ? `⏳ ${tx('mindMap.generating', 'Mapping your stories…')}` : data ? `🔄 ${tx('common.regenerate', 'Regenerate')}` : `✨ ${tx('mindMap.generate', 'Build my mind map')}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
