// Deterministic tool/technology extractor.
//
// Powers the "Mes outils" (tools bank) card in Mon Profil: it mines the tools the
// user has been exposed to from two sources — the tools REQUIRED across their past
// candidatures (job title, notes, stored job description, and the match-score
// strengths/gaps), and the tools already present in their imported CV — so the
// user can one-click add them to the reusable set that feeds CV generation.
//
// Intentionally dictionary-based (no AI call): the app is at Vercel's 12-function
// cap and we want this to be instant and free. The dictionary maps each canonical
// tool NAME to the aliases that appear in real postings; matching is
// case-insensitive and bounded by non-alphanumerics so "git" never matches inside
// "GitHub", "C" never matches a stray letter, etc. Add entries as needed — a
// missing tool just isn't suggested (the user can still type it in by hand).

// Each entry: [canonicalName, [aliases...]]. The canonical name is what gets
// stored/displayed; aliases (incl. the canonical) are what we search for. Keep
// aliases lowercase.
const TOOL_DICTIONARY = [
  // ── Product / delivery ──────────────────────────────────────────────────────
  ['Jira', ['jira']],
  ['Confluence', ['confluence']],
  ['Notion', ['notion']],
  ['Asana', ['asana']],
  ['Trello', ['trello']],
  ['Monday.com', ['monday.com', 'monday com']],
  ['Linear', ['linear']],
  ['Productboard', ['productboard']],
  ['Aha!', ['aha!']],
  ['Miro', ['miro']],
  ['FigJam', ['figjam']],
  ['Amplitude', ['amplitude']],
  ['Mixpanel', ['mixpanel']],
  ['Pendo', ['pendo']],
  ['Heap', ['heap analytics']],
  ['Hotjar', ['hotjar']],
  ['Segment', ['segment']],
  ['Scrum', ['scrum']],
  ['Kanban', ['kanban']],
  ['Agile', ['agile', 'agile/scrum']],
  ['SAFe', ['safe agile', 'scaled agile']],
  ['OKR', ['okr', 'okrs']],
  ['A/B testing', ['a/b testing', 'a/b test', 'ab testing', 'a-b testing']],
  ['User research', ['user research', 'user interviews']],
  ['Roadmapping', ['roadmapping', 'roadmap']],

  // ── Design ──────────────────────────────────────────────────────────────────
  ['Figma', ['figma']],
  ['Sketch', ['sketch']],
  ['Adobe XD', ['adobe xd']],
  ['Photoshop', ['photoshop']],
  ['Illustrator', ['illustrator']],
  ['InVision', ['invision']],
  ['Zeplin', ['zeplin']],
  ['Canva', ['canva']],
  ['After Effects', ['after effects']],
  ['Premiere Pro', ['premiere pro']],

  // ── Data / analytics ─────────────────────────────────────────────────────────
  ['SQL', ['sql']],
  ['Python', ['python']],
  ['Tableau', ['tableau']],
  ['Power BI', ['power bi', 'powerbi']],
  ['Looker', ['looker']],
  ['Google Analytics', ['google analytics', 'ga4', 'google analytics 4']],
  ['BigQuery', ['bigquery', 'big query']],
  ['Snowflake', ['snowflake']],
  ['dbt', ['dbt']],
  ['Excel', ['excel', 'microsoft excel']],
  ['Google Sheets', ['google sheets']],
  ['Metabase', ['metabase']],
  ['Pandas', ['pandas']],
  ['Jupyter', ['jupyter']],
  ['Databricks', ['databricks']],

  // ── Engineering ──────────────────────────────────────────────────────────────
  ['JavaScript', ['javascript']],
  ['TypeScript', ['typescript']],
  ['React', ['react', 'react.js', 'reactjs']],
  ['Vue.js', ['vue.js', 'vuejs', 'vue js']],
  ['Angular', ['angular']],
  ['Node.js', ['node.js', 'nodejs', 'node js']],
  ['Next.js', ['next.js', 'nextjs']],
  ['HTML', ['html', 'html5']],
  ['CSS', ['css', 'css3']],
  ['Tailwind CSS', ['tailwind', 'tailwind css']],
  ['Java', ['java']],
  ['C++', ['c++']],
  ['C#', ['c#']],
  ['Go', ['golang']],
  ['Rust', ['rust']],
  ['PHP', ['php']],
  ['Ruby', ['ruby', 'ruby on rails', 'rails']],
  ['Swift', ['swift']],
  ['Kotlin', ['kotlin']],
  ['Django', ['django']],
  ['Flask', ['flask']],
  ['Spring', ['spring boot', 'spring framework']],
  ['.NET', ['.net', 'dotnet']],
  ['GraphQL', ['graphql']],
  ['REST API', ['rest api', 'restful']],
  ['Git', ['git']],
  ['GitHub', ['github']],
  ['GitLab', ['gitlab']],
  ['Docker', ['docker']],
  ['Kubernetes', ['kubernetes', 'k8s']],
  ['AWS', ['aws', 'amazon web services']],
  ['Azure', ['azure']],
  ['GCP', ['gcp', 'google cloud']],
  ['Terraform', ['terraform']],
  ['CI/CD', ['ci/cd', 'cicd']],
  ['Jenkins', ['jenkins']],
  ['MongoDB', ['mongodb', 'mongo db']],
  ['PostgreSQL', ['postgresql', 'postgres']],
  ['MySQL', ['mysql']],
  ['Redis', ['redis']],
  ['Elasticsearch', ['elasticsearch']],
  ['Kafka', ['kafka']],

  // ── Marketing / sales / CRM ──────────────────────────────────────────────────
  ['HubSpot', ['hubspot']],
  ['Salesforce', ['salesforce']],
  ['Marketo', ['marketo']],
  ['Mailchimp', ['mailchimp']],
  ['Google Ads', ['google ads', 'adwords']],
  ['Meta Ads', ['facebook ads', 'meta ads']],
  ['LinkedIn Ads', ['linkedin ads']],
  ['SEO', ['seo']],
  ['SEM', ['sem']],
  ['Zendesk', ['zendesk']],
  ['Intercom', ['intercom']],
  ['Pipedrive', ['pipedrive']],

  // ── Collaboration / office ───────────────────────────────────────────────────
  ['Slack', ['slack']],
  ['Microsoft Teams', ['microsoft teams', 'ms teams']],
  ['Zoom', ['zoom']],
  ['PowerPoint', ['powerpoint']],
  ['Airtable', ['airtable']],
  ['SharePoint', ['sharepoint']],

  // ── AI / ML ──────────────────────────────────────────────────────────────────
  ['Claude', ['claude']],
  ['ChatGPT', ['chatgpt']],
  ['OpenAI', ['openai']],
  ['LangChain', ['langchain']],
  ['Hugging Face', ['hugging face', 'huggingface']],
  ['TensorFlow', ['tensorflow']],
  ['PyTorch', ['pytorch']],
  ['Midjourney', ['midjourney']],
  ['Stable Diffusion', ['stable diffusion']],
]

// Escape a string for literal use inside a RegExp.
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Pre-compile one bounded, case-insensitive matcher per tool. The (?<![a-z0-9])
// / (?![a-z0-9]) guards make each alias match only as a standalone token — so
// "git" won't fire inside "github", "sql" won't fire inside "postgresql", and a
// symbol-bearing alias like "c++" or ".net" still matches cleanly.
const MATCHERS = TOOL_DICTIONARY.map(([name, aliases]) => ({
  name,
  re: new RegExp(`(?<![a-z0-9])(?:${aliases.map(escapeRe).join('|')})(?![a-z0-9])`, 'i'),
}))

// Canonical name → its position in the dictionary, so a set of found tools can be
// returned in a stable, curated order rather than match order.
const ORDER = new Map(TOOL_DICTIONARY.map(([name], i) => [name, i]))

// Return the canonical names of every dictionary tool present in `text` (deduped).
export function extractToolsFromText(text) {
  const t = (text || '').toString()
  if (!t.trim()) return []
  const found = []
  for (const { name, re } of MATCHERS) {
    if (re.test(t)) found.push(name)
  }
  return found
}

// Pull the searchable, tool-bearing text out of a single candidature. The full
// job description is often not stored (it's fetched on demand), so we lean on the
// fields that ARE persisted: the role title, the free-text notes, the stored JD
// when present, and the match-score strengths/gaps (which name concrete skills).
function jobToolText(job) {
  if (!job) return ''
  const parts = [job.position, job.notes, job.jobDescription]
  const sd = job.scoreDetails
  if (sd) {
    if (Array.isArray(sd.strengths)) parts.push(sd.strengths.join(' '))
    if (Array.isArray(sd.gaps)) parts.push(sd.gaps.join(' '))
    if (sd.summary) parts.push(sd.summary)
  }
  return parts.filter(Boolean).join('\n')
}

// Sort a Map of {tool → frequency} into a suggestion list: most-seen first, ties
// broken by the dictionary's curated order. Returns canonical names only.
function rankByFrequency(counts) {
  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || ((ORDER.get(a[0]) ?? 1e9) - (ORDER.get(b[0]) ?? 1e9)))
    .map(([name]) => name)
}

// Tools required across the user's past candidatures, ranked by how often they
// recur (a tool the user keeps applying against is the most useful to keep on
// hand). Deterministic and cheap — safe to call on every render behind a memo.
export function extractToolsFromJobs(jobs) {
  const counts = new Map()
  for (const job of (jobs || [])) {
    // One count per job per tool (a tool named twice in the same posting isn't
    // "more required"), so unique the per-job hits before tallying.
    for (const name of new Set(extractToolsFromText(jobToolText(job)))) {
      counts.set(name, (counts.get(name) || 0) + 1)
    }
  }
  return rankByFrequency(counts)
}

// Tools already present in the user's imported CV(s) — the ones they can claim
// today. Returned in curated order (frequency across CVs is not meaningful).
export function extractToolsFromCVs(cvs) {
  const set = new Set()
  for (const cv of (cvs || [])) {
    for (const name of extractToolsFromText(cv?.text)) set.add(name)
  }
  return [...set].sort((a, b) => (ORDER.get(a) ?? 1e9) - (ORDER.get(b) ?? 1e9))
}
