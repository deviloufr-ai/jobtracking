// ROME Codes - French job classification reference
// Maps job titles (in French & English) to ROME codes for accurate searching
export const ROME_CODES = [
  // Management & Product
  { code: 'M1402', label: 'Chargé de produit', keywords: ['chargé de produit', 'product manager', 'responsable produit', 'pm', 'product'] },
  { code: 'M1403', label: 'Chef de projet', keywords: ['chef de projet', 'project manager', 'pm', 'project lead'] },
  { code: 'M1201', label: 'Directeur général', keywords: ['directeur général', 'ceo', 'president', 'director', 'directeur'] },

  // IT & Development
  { code: 'H2202', label: 'Développeur informatique', keywords: ['développeur', 'developer', 'dev', 'programmer', 'fullstack', 'frontend', 'backend', 'javascript', 'python', 'java'] },
  { code: 'H2302', label: 'Architecte informatique', keywords: ['architecte', 'architect', 'architecte système', 'chief architect'] },
  { code: 'H1201', label: 'Administrateur système', keywords: ['administrateur', 'sysadmin', 'devops', 'infrastructure', 'admin système'] },

  // Sales & Commerce
  { code: 'D1402', label: 'Commercial', keywords: ['commercial', 'sales', 'représentant commercial', 'salesman', 'vendor', 'account executive'] },
  { code: 'D1401', label: 'Chef de vente', keywords: ['chef de vente', 'sales manager', 'sales lead'] },
  { code: 'D1104', label: 'Vendeur', keywords: ['vendeur', 'seller', 'cashier', 'caissier', 'retail'] },

  // Marketing & Communication
  { code: 'M1705', label: 'Responsable marketing', keywords: ['marketing', 'responsable marketing', 'marketing manager', 'marketeur'] },
  { code: 'M1706', label: 'Chargé de communication', keywords: ['communication', 'community manager', 'communication officer', 'social media'] },

  // HR
  { code: 'M1502', label: 'Responsable RH', keywords: ['rh', 'hr', 'ressources humaines', 'human resources', 'hr manager', 'talent'] },
  { code: 'M1501', label: 'Gestionnaire de paie', keywords: ['paie', 'payroll', 'gestionnaire paie', 'comptabilité'] },

  // Finance
  { code: 'M1401', label: 'Comptable', keywords: ['comptable', 'accountant', 'accounting', 'finance', 'cfo'] },
  { code: 'M1402', label: 'Contrôleur de gestion', keywords: ['contrôleur', 'controller', 'business analyst'] },

  // Customer Service
  { code: 'K2402', label: 'Agent de relation client', keywords: ['service client', 'customer service', 'support', 'agent service'] },
  { code: 'K2401', label: 'Responsable service client', keywords: ['responsable service client', 'support manager', 'customer success'] },

  // Food & Hospitality
  { code: 'D1102', label: 'Boulanger', keywords: ['boulanger', 'baker', 'boulangerie'] },
  { code: 'G1802', label: 'Cuisinier', keywords: ['cuisinier', 'chef', 'cook', 'cuisine'] },
  { code: 'G1803', label: 'Serveur', keywords: ['serveur', 'waiter', 'server', 'restaurant'] },

  // Logistics
  { code: 'N4101', label: 'Agent de manutention', keywords: ['manutention', 'warehouse', 'logistique', 'logistics'] },
  { code: 'N1302', label: 'Responsable logistique', keywords: ['responsable logistique', 'logistics manager', 'supply chain'] },
]

// Auto-detect ROME code from job title query
export function detectRomeCode(query) {
  if (!query) return null
  const q = query.toLowerCase().trim()

  // Exact code match
  const codeMatch = ROME_CODES.find(r => r.code.toLowerCase() === q)
  if (codeMatch) return codeMatch.code

  // Keyword match
  for (const rome of ROME_CODES) {
    if (rome.keywords.some(kw => q.includes(kw) || kw.includes(q))) {
      return rome.code
    }
  }

  return null
}

export function searchRomeCodes(query) {
  if (!query) return ROME_CODES
  const q = query.toLowerCase()
  return ROME_CODES.filter(r =>
    r.code.toLowerCase().includes(q) ||
    r.label.toLowerCase().includes(q) ||
    r.keywords.some(kw => kw.includes(q) || q.includes(kw))
  )
}

export function getRomeLabel(code) {
  const rome = ROME_CODES.find(r => r.code === code)
  return rome ? rome.label : code
}
