// Centralized "generic / unspecified position" detection.
// Previously this list was copy-pasted in 5+ places (one copy had the typo
// "non spécisifé"), which silently broke job de-duplication grouping.
export const GENERIC_POSITIONS = [
  'unknown',
  'unknown position',
  'poste non précisé',
  'non spécifié',
  'inconnu',
  '',
]

export const GENERIC_POSITIONS_SET = new Set(GENERIC_POSITIONS)

// Recruiter department names that Claude sometimes extracts as job positions.
// Treat them as generic so they collapse into the real position at the same company.
const RECRUITER_DEPARTMENTS = new Set([
  'talent acquisition', 'talent acquisition manager', 'talent acquisition specialist',
  'talent recruiter', 'talent manager', 'talent partner',
  'human resources', 'hr', 'hr manager', 'hr business partner',
  'recruitment', 'recruitment manager', 'recruiter', 'recrutement',
  'people operations', 'people ops', 'people team',
  'staffing', 'staffing manager',
  'chargé de recrutement', 'chargée de recrutement',
  'responsable recrutement', 'responsable rh',
  'directeur des ressources humaines', 'drh',
])

// True when a position string is empty/unknown/unspecified.
export function isGenericPosition(pos) {
  const norm = (pos || '').toLowerCase().trim()
  return GENERIC_POSITIONS_SET.has(norm) || RECRUITER_DEPARTMENTS.has(norm)
}
