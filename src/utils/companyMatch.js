// Company-name matching helpers.
//
// A tracked job's company is often a full legal / marketing name
// ("Wivoo, a Wavestone Company") while a calendar invite or email only carries a
// distinctive token ("Alexandre x Sophie : premier échange Wivoo"). Matching on
// full-string containment therefore misses real links. These helpers reduce a
// company name to its distinctive token(s) so calendar / Gmail free-text search
// and event↔job matching work on the part that actually identifies the company.
//
// NOTE: intentionally separate from useJobs.js `normalizeCompany`, which squashes
// a name into a single spaceless dedup key ("wivooawavestonecompany") — that form
// can't be tokenized. Keep the two apart so dedup behavior is unaffected.

// Non-distinctive words: legal forms + connective / marketing / generic
// descriptors. Words < 3 chars (sa, co, ab, bv, nv, ag, oy…) are dropped by the
// length filter, so they don't need to be listed here.
const COMPANY_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'part', 'les', 'des', 'una', 'une', 'del',
  'inc', 'llc', 'ltd', 'sas', 'spa', 'plc', 'sarl', 'sasu', 'gmbh', 'srl',
  'corp', 'corporation', 'incorporated', 'limited', 'holding', 'holdings',
  'company', 'companies', 'compagnie', 'group', 'groupe', 'ventures',
  'technologies', 'technology', 'digital', 'solutions', 'services', 'consulting',
  'innovation', 'labs', 'studio', 'studios', 'agency', 'software', 'systems',
  'tech', 'france', 'international', 'global', 'europe', 'project', 'projects',
])

// Lowercase, strip accents and punctuation, collapse whitespace.
export function normalizeCompanyText(text = '') {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Distinctive tokens (>= 3 chars, not a stopword) of a company name.
export function companyTokens(company = '') {
  return normalizeCompanyText(company)
    .split(' ')
    .filter(w => w.length >= 3 && !COMPANY_STOPWORDS.has(w))
}

// Best single token to use as a calendar / Gmail free-text search query:
// the first distinctive token, else the longest word, else the trimmed name.
export function distinctiveCompanyToken(company = '') {
  const tokens = companyTokens(company)
  if (tokens.length) return tokens[0]
  const words = normalizeCompanyText(company).split(' ').filter(Boolean)
  if (words.length) return words.slice().sort((a, b) => b.length - a.length)[0]
  return (company || '').trim()
}

// True when `text` (e.g. a calendar event title) plausibly refers to `company`:
// either the normalized names contain one another (legacy behavior) OR they
// share a distinctive whole-word token ("Wivoo"). Whole-word (not substring)
// token matching keeps short tokens from matching unrelated events.
export function textMatchesCompany(text = '', company = '') {
  const nt = normalizeCompanyText(text)
  const nc = normalizeCompanyText(company)
  if (!nt || !nc) return false
  if (nc.length >= 3 && (nt.includes(nc) || nc.includes(nt))) return true
  const textWords = new Set(nt.split(' ').filter(Boolean))
  return companyTokens(company).some(tok => textWords.has(tok))
}
