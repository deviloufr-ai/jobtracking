// INSEE Code Reference - French city classification
// Maps French city names to their INSEE codes for France Travail API location filtering

export const INSEE_CODES = [
  // Île-de-France
  { code: '75056', city: 'Paris', region: 'Île-de-France' },
  { code: '92012', city: 'Boulogne-Billancourt', region: 'Île-de-France' },
  { code: '93066', city: 'Saint-Denis', region: 'Île-de-France' },
  { code: '78646', city: 'Versailles', region: 'Île-de-France' },

  // Auvergne-Rhône-Alpes
  { code: '69123', city: 'Lyon', region: 'Auvergne-Rhône-Alpes' },
  { code: '42218', city: 'Saint-Étienne', region: 'Auvergne-Rhône-Alpes' },
  { code: '38185', city: 'Grenoble', region: 'Auvergne-Rhône-Alpes' },

  // Provence-Alpes-Côte d'Azur
  { code: '13055', city: 'Marseille', region: 'Provence-Alpes-Côte d\'Azur' },
  { code: '06088', city: 'Nice', region: 'Provence-Alpes-Côte d\'Azur' },
  { code: '83137', city: 'Toulon', region: 'Provence-Alpes-Côte d\'Azur' },

  // Nouvelle-Aquitaine
  { code: '33063', city: 'Bordeaux', region: 'Nouvelle-Aquitaine' },
  { code: '87085', city: 'Limoges', region: 'Nouvelle-Aquitaine' },
  { code: '86194', city: 'Poitiers', region: 'Nouvelle-Aquitaine' },

  // Occitanie
  { code: '31555', city: 'Toulouse', region: 'Occitanie' },
  { code: '34172', city: 'Montpellier', region: 'Occitanie' },
  { code: '30189', city: 'Nîmes', region: 'Occitanie' },

  // Pays de la Loire
  { code: '44109', city: 'Nantes', region: 'Pays de la Loire' },
  { code: '72181', city: 'Le Mans', region: 'Pays de la Loire' },
  { code: '49007', city: 'Angers', region: 'Pays de la Loire' },

  // Bretagne
  { code: '35238', city: 'Rennes', region: 'Bretagne' },
  { code: '29019', city: 'Brest', region: 'Bretagne' },
  { code: '29232', city: 'Quimper', region: 'Bretagne' },

  // Bourgogne-Franche-Comté
  { code: '21231', city: 'Dijon', region: 'Bourgogne-Franche-Comté' },
  { code: '25056', city: 'Besançon', region: 'Bourgogne-Franche-Comté' },

  // Grand Est
  { code: '67482', city: 'Strasbourg', region: 'Grand Est' },
  { code: '57463', city: 'Metz', region: 'Grand Est' },
  { code: '51454', city: 'Reims', region: 'Grand Est' },

  // Normandie
  { code: '76540', city: 'Rouen', region: 'Normandie' },
  { code: '14118', city: 'Caen', region: 'Normandie' },
  { code: '76321', city: 'Le Havre', region: 'Normandie' },

  // Hauts-de-France
  { code: '59350', city: 'Lille', region: 'Hauts-de-France' },
  { code: '80021', city: 'Amiens', region: 'Hauts-de-France' },
  { code: '59178', city: 'Douai', region: 'Hauts-de-France' },

  // Centre-Val de Loire
  { code: '45234', city: 'Orléans', region: 'Centre-Val de Loire' },
  { code: '37261', city: 'Tours', region: 'Centre-Val de Loire' },

  // Corse
  { code: '20004', city: 'Ajaccio', region: 'Corse' },
  { code: '20033', city: 'Bastia', region: 'Corse' },
]

export function detectInseeCode(location) {
  if (!location || location === 'france') return null

  const query = location.toLowerCase().trim()

  // Exact code match (5 digits)
  if (/^\d{5}$/.test(query)) {
    return query
  }

  // City name match
  const found = INSEE_CODES.find(item =>
    item.city.toLowerCase() === query ||
    query.includes(item.city.toLowerCase())
  )

  return found ? found.code : null
}

export function getInseeLabel(code) {
  const item = INSEE_CODES.find(i => i.code === code)
  return item ? `${item.city} (${item.region})` : code
}
