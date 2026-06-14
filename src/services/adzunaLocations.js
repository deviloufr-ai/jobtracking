// Adzuna-compatible French locations mapping
// Adzuna accepts region names and major cities in France
export const FRENCH_LOCATIONS = [
  // National
  { label: 'France entière', value: 'france', region: null },

  // Île-de-France
  { label: 'Paris', value: 'Paris', region: 'Île-de-France' },
  { label: 'Boulogne-Billancourt', value: 'Boulogne-Billancourt', region: 'Île-de-France' },
  { label: 'Saint-Denis', value: 'Saint-Denis', region: 'Île-de-France' },
  { label: 'Versailles', value: 'Versailles', region: 'Île-de-France' },
  { label: 'Île-de-France', value: 'Île-de-France', region: 'Île-de-France' },

  // Auvergne-Rhône-Alpes / Auvergne-Rhône-Alpes
  { label: 'Lyon', value: 'Lyon', region: 'Auvergne-Rhône-Alpes' },
  { label: 'Saint-Étienne', value: 'Saint-Étienne', region: 'Auvergne-Rhône-Alpes' },
  { label: 'Grenoble', value: 'Grenoble', region: 'Auvergne-Rhône-Alpes' },
  { label: 'Auvergne-Rhône-Alpes', value: 'Auvergne-Rhône-Alpes', region: 'Auvergne-Rhône-Alpes' },

  // Provence-Alpes-Côte d'Azur
  { label: 'Marseille', value: 'Marseille', region: 'Provence-Alpes-Côte d\'Azur' },
  { label: 'Nice', value: 'Nice', region: 'Provence-Alpes-Côte d\'Azur' },
  { label: 'Toulon', value: 'Toulon', region: 'Provence-Alpes-Côte d\'Azur' },
  { label: 'Provence-Alpes-Côte d\'Azur', value: 'Provence-Alpes-Côte d\'Azur', region: 'Provence-Alpes-Côte d\'Azur' },

  // Nouvelle-Aquitaine
  { label: 'Bordeaux', value: 'Bordeaux', region: 'Nouvelle-Aquitaine' },
  { label: 'Limoges', value: 'Limoges', region: 'Nouvelle-Aquitaine' },
  { label: 'Poitiers', value: 'Poitiers', region: 'Nouvelle-Aquitaine' },
  { label: 'Nouvelle-Aquitaine', value: 'Nouvelle-Aquitaine', region: 'Nouvelle-Aquitaine' },

  // Occitanie
  { label: 'Toulouse', value: 'Toulouse', region: 'Occitanie' },
  { label: 'Montpellier', value: 'Montpellier', region: 'Occitanie' },
  { label: 'Nîmes', value: 'Nîmes', region: 'Occitanie' },
  { label: 'Occitanie', value: 'Occitanie', region: 'Occitanie' },

  // Pays de la Loire
  { label: 'Nantes', value: 'Nantes', region: 'Pays de la Loire' },
  { label: 'Le Mans', value: 'Le Mans', region: 'Pays de la Loire' },
  { label: 'Angers', value: 'Angers', region: 'Pays de la Loire' },
  { label: 'Pays de la Loire', value: 'Pays de la Loire', region: 'Pays de la Loire' },

  // Bretagne
  { label: 'Rennes', value: 'Rennes', region: 'Bretagne' },
  { label: 'Brest', value: 'Brest', region: 'Bretagne' },
  { label: 'Quimper', value: 'Quimper', region: 'Bretagne' },
  { label: 'Bretagne', value: 'Bretagne', region: 'Bretagne' },

  // Bourgogne-Franche-Comté
  { label: 'Dijon', value: 'Dijon', region: 'Bourgogne-Franche-Comté' },
  { label: 'Besançon', value: 'Besançon', region: 'Bourgogne-Franche-Comté' },
  { label: 'Bourgogne-Franche-Comté', value: 'Bourgogne-Franche-Comté', region: 'Bourgogne-Franche-Comté' },

  // Grand Est
  { label: 'Strasbourg', value: 'Strasbourg', region: 'Grand Est' },
  { label: 'Metz', value: 'Metz', region: 'Grand Est' },
  { label: 'Reims', value: 'Reims', region: 'Grand Est' },
  { label: 'Grand Est', value: 'Grand Est', region: 'Grand Est' },

  // Normandie
  { label: 'Rouen', value: 'Rouen', region: 'Normandie' },
  { label: 'Caen', value: 'Caen', region: 'Normandie' },
  { label: 'Le Havre', value: 'Le Havre', region: 'Normandie' },
  { label: 'Normandie', value: 'Normandie', region: 'Normandie' },

  // Hauts-de-France
  { label: 'Lille', value: 'Lille', region: 'Hauts-de-France' },
  { label: 'Amiens', value: 'Amiens', region: 'Hauts-de-France' },
  { label: 'Douai', value: 'Douai', region: 'Hauts-de-France' },
  { label: 'Hauts-de-France', value: 'Hauts-de-France', region: 'Hauts-de-France' },

  // Centre-Val de Loire
  { label: 'Orléans', value: 'Orléans', region: 'Centre-Val de Loire' },
  { label: 'Tours', value: 'Tours', region: 'Centre-Val de Loire' },
  { label: 'Centre-Val de Loire', value: 'Centre-Val de Loire', region: 'Centre-Val de Loire' },

  // Corsica
  { label: 'Ajaccio', value: 'Ajaccio', region: 'Corse' },
  { label: 'Bastia', value: 'Bastia', region: 'Corse' },
  { label: 'Corse', value: 'Corse', region: 'Corse' },
]

export function getLocationLabel(value) {
  const loc = FRENCH_LOCATIONS.find(l => l.value === value)
  return loc ? loc.label : value
}

export function getLocationsByQuery(query) {
  if (!query) return FRENCH_LOCATIONS
  const q = query.toLowerCase()
  return FRENCH_LOCATIONS.filter(l =>
    l.label.toLowerCase().includes(q) ||
    (l.region && l.region.toLowerCase().includes(q))
  )
}
