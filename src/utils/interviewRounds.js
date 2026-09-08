// interviewRounds — classify an interview step by its CONTENT (round / type).
//
// The app stores every interview as a history entry with status `interview`
// (`test` for assessments, `done` for a resolved-past interview); the round/type
// lives only in the free-text `note`, which is fed from BOTH the calendar event
// title (detectEventType in calendar.js) and the parsed email (claude.js). This
// module turns that free text into a stable round key so the Interviews board can
// split interviews by content — "initial screen", "technical", "final", etc. —
// bilingual (FR/EN), deterministic, no AI call.
//
// Keys are stable identifiers; the human label + icon + color live here as
// fallbacks, and callers localize via t(`interviewRounds.<key>`).

export const INTERVIEW_ROUND_META = {
  screening: { label: 'Initial screen', icon: '🔍', color: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
  technical: { label: 'Technical',      icon: '🛠️', color: 'bg-blue-50 text-blue-700',     dot: 'bg-blue-500' },
  manager:   { label: 'Manager',        icon: '👔', color: 'bg-amber-50 text-amber-700',   dot: 'bg-amber-500' },
  panel:     { label: 'Panel / team',   icon: '👥', color: 'bg-teal-50 text-teal-700',     dot: 'bg-teal-500' },
  final:     { label: 'Final',          icon: '🏁', color: 'bg-green-50 text-green-700',    dot: 'bg-green-500' },
  interview: { label: 'Interview',      icon: '💬', color: 'bg-slate-100 text-slate-600',  dot: 'bg-slate-400' },
}

// The order the board shows round chips / filters in (pipeline order), so a row
// reads screening → technical → manager → panel → final regardless of match order.
export const INTERVIEW_ROUND_ORDER = ['screening', 'technical', 'manager', 'panel', 'final', 'interview']

// Match rules, checked most-specific first so a "final technical round" reads as
// technical and a bare "final round" as final. Each regex is bilingual FR/EN.
const RULES = [
  ['technical', /\b(technique|techniques|technical|tech\b|test|tests|assessment|case[ -]?study|étude de cas|etude de cas|cas pratique|live[ -]?coding|coding|codingame|hackerrank|leetcode|exercice|practical|take[ -]?home|home ?work|devoir|use[ -]?case|business case)\b/i],
  ['final', /\b(final|finale|finaux|dernier|derniere|dernière|last round|direction|dirigeant|dirigeante|décideur|decideur|comex|codir|c-?level|ceo|cto|cfo|coo|founder|fondateur|fondatrice|associé|associe|\bvp\b|executive|exécutif|super ?day|closing)\b/i],
  ['manager', /\b(manager|managériale?|manageur|hiring manager|n\+1|n1\b|responsable|opérationnel|operationnel|team ?lead|business|métier|metier|directeur|directrice|head of)\b/i],
  ['panel', /\b(panel|onsite|on-?site|sur[ -]?site|journée|journee|équipe|equipe|\bteam\b|collectif|jury|group|groupe|assessment center|assessment centre)\b/i],
  ['screening', /\b(screening|screen|échange|echange|discovery|découverte|decouverte|pré-?qualif\w*|prequalif\w*|phone screen|recruteur|recruteuse|recruiter|talent|\brh\b|\bhr\b|premier|1er|1re|1ère|première|introduction|\bintro\b|prise de contact|initial|préliminaire|preliminaire|qualification)\b/i],
]

// Classify one interview's free text (note + optional title) into a round key.
// Falls back to the generic `interview` when nothing distinctive is found.
export function classifyInterviewRound(text = '') {
  const s = String(text || '')
  if (!s.trim()) return 'interview'
  for (const [key, re] of RULES) {
    if (re.test(s)) return key
  }
  return 'interview'
}

// Is this history entry part of the interview process (interview / test / the
// resolved-past `done` form)? These are the entries we classify by round.
export function isInterviewEntry(h) {
  return !!h && (h.status === 'interview' || h.status === 'test' || h.status === 'done')
}

// Chronological list of a job's interview steps, each tagged with its round key,
// a 1-based ordinal (for numbering generic "Interview N" rounds), its date/note,
// and a resolved label. Used by the board and the drawer to split by content.
export function jobInterviewRounds(job) {
  const steps = (job?.history || [])
    .filter(h => h?.date && isInterviewEntry(h))
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
  return steps.map((h, i) => {
    const key = classifyInterviewRound(`${h.note || ''} ${h.title || ''}`)
    return { key, number: i + 1, date: h.date, note: h.note || '', status: h.status }
  })
}

// The DISTINCT round keys a job's interviews cover, in pipeline order — the chips
// shown on a board row ("Screening · Technical · Final").
export function jobRoundKeys(job) {
  const present = new Set(jobInterviewRounds(job).map(r => r.key))
  return INTERVIEW_ROUND_ORDER.filter(k => present.has(k))
}

// Localized label for a round key. `number` numbers generic rounds ("Interview 2")
// so a candidature with several untyped rounds still reads as a sequence.
export function roundLabel(key, t = (k) => k, number = null) {
  const fallback = INTERVIEW_ROUND_META[key]?.label || key
  const base = t(`interviewRounds.${key}`) || fallback
  if (key === 'interview' && number != null) return `${base} ${number}`
  return base
}
