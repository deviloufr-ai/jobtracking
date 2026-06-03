import { useState } from 'react'

const IS_DEV = import.meta.env.DEV

// Static advice by status
const STATIC_ADVICE = {
  sent: [
    "Personnalise chaque candidature avec des mots-clés de l'offre",
    "Prépare un message de relance poli pour J+14 si pas de réponse",
    "Connecte-toi sur LinkedIn avec le recruteur ou un employé de l'entreprise",
  ],
  reviewing: [
    "Consulte les avis Glassdoor pour mieux connaître la culture d'entreprise",
    "Prépare 3-5 questions pertinentes à poser lors d'un éventuel entretien",
    "Vérifie que ton profil LinkedIn est cohérent avec ton CV",
  ],
  interview: [
    "Prépare des réponses STAR (Situation, Tâche, Action, Résultat) pour chaque expérience clé",
    "Recherche les dernières actualités de l'entreprise (levées de fonds, lancements produit)",
    "Prépare une réponse claire à 'Pourquoi voulez-vous nous rejoindre ?'",
    "Prévois 5-10 minutes de marge avant la visio pour tester la connexion",
    "Envoie un email de remerciement dans les 24h après l'entretien",
  ],
  waiting: [
    "Relance poliment après 5-7 jours ouvrés si pas de retour",
    "Continue de candidater activement — ne mets pas tous tes œufs dans le même panier",
    "Note les points forts et faibles de cet entretien pour les prochains",
  ],
  offer: [
    "Ne jamais accepter une offre sans avoir négocié — même une première réponse positive",
    "Négocie le salaire, les jours de télétravail, la date de prise de poste et les avantages",
    "Demande un délai de réflexion de 48-72h — c'est tout à fait normal",
    "Compare avec les salaires du marché (Glassdoor, LinkedIn Salary, Levels.fyi)",
  ],
  rejected: [
    "Envoie un email de remerciement — ça te différencie et maintient la relation",
    "Demande un feedback constructif : 'Que puis-je améliorer pour de futures opportunités ?'",
    "Identifie les compétences manquantes et crée un plan de développement",
  ],
  rejected_ats: [
    "Analyse les mots-clés de l'offre et intègre-les dans ton CV",
    "Utilise le même vocabulaire que l'offre (ex: 'Product Owner' vs 'Product Manager')",
    "Évite les CV en tableau ou multi-colonnes — les ATS les lisent mal",
    "Reformule tes expériences avec des verbes d'action quantifiés",
  ],
}

async function generateAIAdvice(company, position, status, notes, history) {
  if (IS_DEV) {
    return [
      `Pour ${company}, mets en avant ton expérience en gestion de roadmap produit`,
      `Le poste de ${position} demande souvent une maîtrise des métriques — prépare des exemples chiffrés`,
      `Recherche les derniers articles sur ${company} pour montrer ton intérêt lors de l'entretien`,
    ]
  }

  const historyText = (history || [])
    .slice(-5)
    .map(h => `${h.date}: ${h.note || h.status}`)
    .join('\n')

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Tu es un coach en recherche d'emploi. Donne 3 conseils personnalisés et actionnables pour cette candidature.

Entreprise: ${company}
Poste: ${position}
Statut actuel: ${status}
Notes: ${notes || 'aucune'}
Historique récent:
${historyText}

Règles :
- Conseils courts et pratiques (1-2 phrases max chacun)
- Spécifiques à cette entreprise/poste si possible
- Adaptés au statut actuel
- Pas de conseils génériques

Réponds UNIQUEMENT avec un tableau JSON de 3 strings, sans texte avant ou après, sans backticks.
Exemple: ["Conseil 1", "Conseil 2", "Conseil 3"]`
      }]
    })
  })

  if (!res.ok) throw new Error('Erreur API')
  const data = await res.json()
  const text = data.content?.[0]?.text || '[]'
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch { return [] }
}

export default function AdvicePanel({ job }) {
  const [aiAdvice, setAiAdvice] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)

  const staticAdvice = STATIC_ADVICE[job.status] || []

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const advice = await generateAIAdvice(
        job.company, job.position, job.status, job.notes, job.history
      )
      setAiAdvice(advice)
      setExpanded(true)
    } catch (e) {
      setError('Erreur lors de la génération')
    }
    setLoading(false)
  }

  return (
    <div className="mt-3 ml-7">
      {/* Toggle advice */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-800 hover:bg-amber-50 px-2 py-1 rounded-lg transition-colors"
      >
        <span>{expanded ? '▾' : '▸'}</span>
        💡 {expanded ? 'Masquer les conseils' : 'Voir les conseils'}
      </button>

      {expanded && (
        <div className="mt-2 bg-amber-50/60 border border-amber-100 rounded-xl p-3">
          {/* Static advice */}
          {staticAdvice.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-amber-700 mb-1.5">📌 Conseils généraux</p>
              <ul className="space-y-1">
                {staticAdvice.map((tip, i) => (
                  <li key={i} className="flex gap-1.5 text-xs text-amber-800">
                    <span className="text-amber-400 flex-shrink-0 mt-0.5">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI advice */}
          {aiAdvice ? (
            <div>
              <p className="text-xs font-semibold text-indigo-700 mb-1.5">✨ Conseils personnalisés pour {job.company}</p>
              <ul className="space-y-1">
                {aiAdvice.map((tip, i) => (
                  <li key={i} className="flex gap-1.5 text-xs text-indigo-800">
                    <span className="text-indigo-400 flex-shrink-0 mt-0.5">→</span>
                    {tip}
                  </li>
                ))}
              </ul>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 hover:underline disabled:opacity-50"
              >
                {loading ? '⏳ Génération...' : '↺ Regénérer'}
              </button>
            </div>
          ) : (
            <div>
              {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                {loading ? '⏳ Génération en cours...' : '✨ Générer des conseils IA pour ' + job.company}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
