// ROME Codes - French job classification reference
// Common ROME codes for job search filtering
export const ROME_CODES = [
  // Management & Product
  { code: 'M1402', label: 'Chargé de produit (Product Manager)' },
  { code: 'M1403', label: 'Chef de projet (Project Manager)' },
  { code: 'M1402', label: 'Responsable produit' },
  { code: 'M1201', label: 'Directeur général' },

  // IT & Development
  { code: 'H2202', label: 'Développeur informatique (Software Developer)' },
  { code: 'H2302', label: 'Architecte informatique' },
  { code: 'H1201', label: 'Administrateur système' },

  // Sales & Commerce
  { code: 'D1402', label: 'Commercial (Sales Representative)' },
  { code: 'D1401', label: 'Chef de vente' },
  { code: 'D1104', label: 'Vendeur-caissier' },

  // Marketing & Communication
  { code: 'M1705', label: 'Responsable marketing' },
  { code: 'M1706', label: 'Chargé de communication' },

  // HR
  { code: 'M1502', label: 'Responsable RH' },
  { code: 'M1501', label: 'Gestionnaire de paie' },

  // Finance
  { code: 'M1401', label: 'Comptable' },
  { code: 'M1402', label: 'Contrôleur de gestion' },

  // Customer Service
  { code: 'K2402', label: 'Agent de relation client' },
  { code: 'K2401', label: 'Responsable service client' },

  // Food & Hospitality
  { code: 'D1102', label: 'Boulanger (Baker)' },
  { code: 'G1802', label: 'Cuisinier (Chef)' },
  { code: 'G1803', label: 'Serveur' },

  // Logistics
  { code: 'N4101', label: 'Agent de manutention' },
  { code: 'N1302', label: 'Responsable logistique' },
]

export function searchRomeCodes(query) {
  if (!query) return ROME_CODES
  const q = query.toLowerCase()
  return ROME_CODES.filter(r =>
    r.code.toLowerCase().includes(q) ||
    r.label.toLowerCase().includes(q)
  )
}

export function getRomeLabel(code) {
  const rome = ROME_CODES.find(r => r.code === code)
  return rome ? rome.label : code
}
