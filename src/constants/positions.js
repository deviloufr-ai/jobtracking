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

// True when a position string is empty/unknown/unspecified.
export function isGenericPosition(pos) {
  return GENERIC_POSITIONS_SET.has((pos || '').toLowerCase().trim())
}
