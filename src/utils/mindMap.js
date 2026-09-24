// Interview mind map — prompt, parsing and shape helpers (pure, no React).
//
// A mind map is the candidate's interview prep on one page: 5-6 THEMES the
// interviewers will probe (branches) → 2-3 KEYWORDS each (1-3 word memory
// triggers) → per keyword, the story it unlocks, the questions it answers, telegraphic
// S/T/A/R cues and the one proof point to land. Memorise the keywords, and each one
// brings its answer back. Stored on job.mindMap (rides jobs.extras).

const MAX_BRANCHES = 6
const MAX_KEYWORDS = 3   // more than 3 leaves per branch collide on the radial map
const MAX_QUESTIONS = 3

const clip = (v, max) => { const s = String(v || ''); return s.length > max ? s.slice(0, max) + '…' : s }

// Collapse whitespace and cap length so a chatty model can't break the layout.
const str = (v, max) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}
const list = (v) => (Array.isArray(v) ? v : v ? [v] : [])

export const hasMindMap = (job) => !!job?.mindMap?.branches?.length

// First letter of a label, accents and leading emoji/punctuation stripped.
export const initialOf = (label = '') =>
  (String(label).normalize('NFD').replace(/[^\p{L}\p{N}]/gu, '')[0] || '').toUpperCase()

// The memory key shown above the map. The model is asked for an acronym built from
// the branch initials; we only trust its word (and the sentence explaining it) when
// it really matches the initials, otherwise we fall back to the raw initials.
export function mnemonicFor(map) {
  const letters = (map?.branches || []).map(b => initialOf(b.label))
  const word = String(map?.mnemonic?.word || '').normalize('NFD').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase()
  const matches = !!word && word === letters.join('')
  return { letters, sentence: matches ? (map.mnemonic.sentence || '') : '' }
}

export function normalizeMindMap(raw) {
  if (!raw || !Array.isArray(raw.branches)) return null
  const branches = raw.branches.slice(0, MAX_BRANCHES).map(b => ({
    label: str(b?.label, 28),
    icon: str(b?.icon, 8),
    keywords: list(b?.keywords).slice(0, MAX_KEYWORDS).map(k => ({
      word: str(k?.word, 32),
      story: str(k?.story, 90),
      questions: list(k?.questions).map(q => str(q, 200)).filter(Boolean).slice(0, MAX_QUESTIONS),
      cue: { S: str(k?.cue?.S, 90), T: str(k?.cue?.T, 90), A: str(k?.cue?.A, 90), R: str(k?.cue?.R, 90) },
      proof: str(k?.proof, 90),
    })).filter(k => k.word),
  })).filter(b => b.label && b.keywords.length)
  if (!branches.length) return null
  return {
    pitch: str(raw.pitch, 260),
    mnemonic: { word: str(raw.mnemonic?.word, 12), sentence: str(raw.mnemonic?.sentence, 160) },
    tips: list(raw.tips).map(t => str(t, 200)).filter(Boolean).slice(0, 4),
    branches,
  }
}

// Tolerates code fences and prose around the JSON object.
export function parseMindMap(text) {
  const src = String(text || '').replace(/```json|```/gi, '').trim()
  const start = src.indexOf('{'), end = src.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try { return normalizeMindMap(JSON.parse(src.slice(start, end + 1))) } catch { return null }
}

// Every (question → branch/keyword) pair, for the drill: see a question, recall
// which keyword answers it.
export function drillDeck(map) {
  const deck = []
  ;(map?.branches || []).forEach((b, bi) => b.keywords.forEach((k, ki) =>
    k.questions.forEach(q => deck.push({ q, bi, ki }))))
  return deck
}

// Prep material already saved on the job — the map should reuse these stories
// rather than invent new ones.
export function mindMapSources(job) {
  const stars = job?.starSaved?.stars || []
  const exampleQuestions = [...new Set(
    Object.values(job?.interviewExamples || {})
      .flatMap(e => e?.data?.questions || [])
      .map(q => q?.q).filter(Boolean),
  )]
  return { stars, exampleQuestions }
}

export function buildMindMapPrompt({ job, cv, profile, rounds = [], language = 'auto', guidance = '' }) {
  const company = job?.company || 'the company'
  const position = job?.position || 'this role'
  const langLine = language === 'fr' ? 'Write ALL text values in FRENCH (keep the JSON keys in English).'
    : language === 'en' ? 'Write ALL text values in ENGLISH.'
    : 'DETECT the language from the role/company/description below and write ALL text values in THAT language (keep the JSON keys in English). If unsure, use French.'

  const { stars, exampleQuestions } = mindMapSources(job)
  const description = job?.description || job?.jobDescription
  const profileText = profile ? [
    profile.title && `Title: ${profile.title}`,
    profile.experience && `Background: ${clip(profile.experience, 1200)}`,
    profile.key_achievements?.length && `Key achievements: ${clip(profile.key_achievements.join(' | '), 1000)}`,
  ].filter(Boolean).join('\n') : ''

  const ctx = [
    description && `Job description (excerpt):\n${clip(description, 900)}`,
    cv && `Candidate CV (excerpt):\n${clip(cv, 1500)}`,
    profileText && `Candidate profile:\n${profileText}`,
    stars.length && `Candidate's prepared STAR stories (REUSE these as the stories behind keywords):\n${stars.slice(0, 5).map((s, i) =>
      `${i + 1}. Q: ${clip(s.question, 200)}\n   S: ${clip(s.S, 200)} | T: ${clip(s.T, 200)} | A: ${clip(s.A, 250)} | R: ${clip(s.R, 200)}`).join('\n')}`,
    exampleQuestions.length && `Questions already expected for this application (make sure each one maps to a keyword):\n${exampleQuestions.slice(0, 12).map(q => `- ${clip(q, 200)}`).join('\n')}`,
    rounds.length && `Interview rounds reached so far: ${rounds.join(', ')}`,
    guidance?.trim() && `CANDIDATE'S REQUESTED FOCUS — make the map reflect this: ${guidance.trim()}`,
  ].filter(Boolean).join('\n\n')

  return `You are an interview coach. Build a MEMORY MIND MAP that helps this candidate remember, under pressure, what to say in their interviews for the role of ${position} at ${company}.

${langLine}

The map must be small enough to memorise: 5 or 6 branches (the themes interviewers will probe for THIS role — always include one branch on why ${company} / this role, and one on the questions to ask them), each with 2 or 3 keywords. A keyword is a 1-3 word memory trigger (max 20 characters) that unlocks ONE story or argument from the candidate's real background. One story can serve several questions — that's the point: fewer stories, well rehearsed.

For each keyword give:
- story: short name of the story or argument (max 8 words)
- questions: 1 to 3 likely interview questions this keyword answers, as the interviewer would ask them
- cue: S/T/A/R memory cues, each 3-8 words, telegraphic (not full sentences). For the "questions to ask them" branch, use the cue to note why the question matters.
- proof: the ONE number or fact to land (e.g. "+18% DAU in 5 weeks"); use a bracketed placeholder like [your metric] if unknown

Also give:
- pitch: the candidate's one-sentence hook for "tell me about yourself" (max 30 words)
- mnemonic: a word or acronym made of the FIRST LETTER of each branch label, in order, plus a short sentence to remember it. Choose the branch labels (max 18 characters each) so the initials form a memorable word if you can.
- tips: 3 short, concrete tips for memorising and using this map (e.g. walk the branches clockwise the morning of the interview)

${ctx}

Reply ONLY with valid JSON — no markdown, no backticks, no comments:
{"pitch":"...","mnemonic":{"word":"...","sentence":"..."},"tips":["..."],"branches":[{"label":"...","icon":"<one emoji>","keywords":[{"word":"...","story":"...","questions":["..."],"cue":{"S":"...","T":"...","A":"...","R":"..."},"proof":"..."}]}]}`
}
