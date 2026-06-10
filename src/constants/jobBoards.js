// Centralized job board detection — used across email parsing and filtering
export const JOB_BOARD_NAMES = new Set([
  'linkedin', 'indeed', 'welcometothejungle', 'wttj', 'apec', 'monster', 'cadremploi',
  'hellowork', 'freework', 'malt', 'jobteaser', 'glassdoor', 'meteojob', 'regionsjob',
  'keljob', 'poleemploi', 'francetravail', 'talentio', 'otta', 'remixjobs', 'remotive',
  'jobboard', 'smartrecruiters', 'workday', 'greenhouse', 'lever', 'ashby', 'jobvite',
  'bamboohr', 'icims', 'taleo', 'successfactors', 'teamtailor', 'breezy', 'pinpoint',
  'dover', 'comeet', 'jazz', 'rippling', 'notion.so', 'recruitee', 'ziprecruiter',
])

export function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function isJobBoard(companyName) {
  return JOB_BOARD_NAMES.has(normalize(companyName))
}
