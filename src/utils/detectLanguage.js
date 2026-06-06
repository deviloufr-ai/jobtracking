/**
 * Detect language of a job posting from available signals.
 * Returns 'en' or 'fr'.
 */

const EN_SIGNALS = [
  'the ', ' and ', ' of ', ' for ', ' with ', ' you ', ' your ', ' our ', ' we ',
  'team', 'experience', 'requirements', 'responsibilities', 'skills', 'join',
  'looking', 'seeking', 'role', 'position', 'opportunity', 'background',
  'strong', 'ability', 'working', 'proven', 'drive', 'build', 'lead',
  'product manager', 'product owner', 'software engineer', 'data scientist',
]

const FR_SIGNALS = [
  ' le ', ' la ', ' les ', ' et ', ' de ', ' du ', ' des ', ' un ', ' une ',
  ' pour ', ' avec ', ' nous ', ' vous ', ' notre ', ' votre ',
  'équipe', 'expérience', 'compétences', 'missions', 'rejoindre',
  'recherchons', 'poste', 'profil', 'candidat', 'entreprise',
  'chef de produit', 'responsable', 'développeur', 'ingénieur',
]

export function detectLanguage(job) {
  const corpus = [
    job?.notes || '',
    job?.jobDescription || '',
    job?.position || '',
    job?.company || '',
    ...(job?.history || []).slice(-3).map(h => h.note || ''),
  ].join(' ').toLowerCase()

  if (!corpus.trim()) return 'fr'

  const enScore = EN_SIGNALS.filter(s => corpus.includes(s)).length
  const frScore = FR_SIGNALS.filter(s => corpus.includes(s)).length

  // Need a clear majority for English — default to French
  return enScore > frScore + 2 ? 'en' : 'fr'
}

export function isEnglish(job) {
  return detectLanguage(job) === 'en'
}
