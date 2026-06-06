import { useState, useEffect } from 'react'

const IS_DEV = import.meta.env.DEV

function loadProfile() {
  try { const r = localStorage.getItem('jobtrackr_profile'); return r ? JSON.parse(r) : null } catch { return null }
}

const MOCK_STARS = [
  {
    question: "Décris une situation où tu as dû piloter une roadmap avec des ressources limitées.",
    S: "Chez Wargaming, mon équipe de 3 devs devait livrer une refonte du système de matchmaking en 6 semaines.",
    T: "Je devais arbitrer entre 12 features demandées par le business et livrer dans les délais avec 0 marge.",
    A: "J'ai appliqué un scoring RICE brutal, éliminé 8 features non-essentielles, et négocié un report de 2 stories avec le VP Product.",
    R: "Livré en 5 semaines, DAU +18% sur la cohorte test, roadmap acceptée sans friction lors du prochain comité."
  },
  {
    question: "Comment as-tu géré un désaccord fort avec un stakeholder sur une décision produit ?",
    S: "En 2022, le CTO voulait intégrer une feature de recommandation ML complexe dans le sprint suivant.",
    T: "Je devais m'opposer à un décideur senior tout en maintenant la relation et la confiance.",
    A: "J'ai préparé une analyse data montrant que la feature ciblait 3% des users actifs. J'ai proposé un A/B test light à la place, avec critères de succès clairs et timeline 4 semaines.",
    R: "Le CTO a accepté. L'A/B test a montré 0 impact significatif — la feature complexe a été déprioritisée définitivement."
  },
  {
    question: "Donne un exemple où tu as utilisé la data pour changer une décision produit.",
    S: "Notre taux de rétention J7 stagnait à 34% depuis 3 mois malgré plusieurs tentatives d'amélioration.",
    T: "Identifier la vraie cause racine et proposer une solution validée data.",
    A: "J'ai construit un funnel SQL segmenté par cohorte et source d'acquisition. J'ai identifié que les users venant des pubs sociales avaient un J7 de 12% vs 51% pour l'organique. J'ai proposé de couper le budget pub et de doubler l'effort SEO.",
    R: "Rétention J7 remontée à 46% en 8 semaines. Coût d'acquisition divisé par 2.3."
  }
]

export default function STARGenerator({ job, onClose }) {
  const [stars, setStars] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)
  const [expanded, setExpanded] = useState(0)

  useEffect(() => { generate() }, [])

  async function generate() {
    setLoading(true)
    setError(null)

    if (IS_DEV) {
      await new Promise(r => setTimeout(r, 800))
      setStars(MOCK_STARS)
      setLoading(false)
      return
    }

    const profile = loadProfile()
    const profileText = profile
      ? [
          profile.name && `Nom : ${profile.name}`,
          profile.title && `Titre : ${profile.title}`,
          profile.experience && `Expérience : ${profile.experience}`,
          profile.skills && `Compétences : ${profile.skills}`,
        ].filter(Boolean).join('\n')
      : 'Candidat senior en product management'

    const historyText = (job.history || []).slice(-6)
      .map(h => `${h.date} : ${h.note || h.status}`).join('\n')

    const prompt = `Génère 3 réponses STAR pour préparer un entretien de ${job.position} chez ${job.company}.

Profil candidat :
${profileText}

Contexte candidature :
${job.notes || ''}
${historyText}

Pour chaque réponse :
- Choisis une question d'entretien typique et exigeante pour ce niveau de poste
- La réponse doit être basée sur le profil (invente des détails crédibles si nécessaire)
- Chaque partie S/T/A/R : 1-2 phrases percutantes, chiffrées quand possible
- Ton direct, naturel, comme si le candidat parlait

Réponds UNIQUEMENT en JSON valide (sans backticks) :
[{"question":"...","S":"...","T":"...","A":"...","R":"..."},...]`

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1800,
          messages: [{ role: 'user', content: prompt }]
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur API')
      const raw = (data.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim()
      const start = raw.indexOf('['), end = raw.lastIndexOf(']')
      const parsed = JSON.parse(start !== -1 ? raw.slice(start, end + 1) : '[]')
      setStars(parsed)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  function copyAll() {
    const text = stars.map((s, i) =>
      `STAR ${i + 1} — ${s.question}\n\nSituation : ${s.S}\nTâche : ${s.T}\nAction : ${s.A}\nRésultat : ${s.R}`
    ).join('\n\n---\n\n')
    navigator.clipboard.writeText(text)
    setCopied('all')
    setTimeout(() => setCopied(null), 2000)
  }

  function copySingle(i) {
    const s = stars[i]
    const text = `${s.question}\n\nSituation : ${s.S}\nTâche : ${s.T}\nAction : ${s.A}\nRésultat : ${s.R}`
    navigator.clipboard.writeText(text)
    setCopied(i)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-base">🎯</div>
          <div>
            <h2 className="font-bold text-gray-900 text-sm">Réponses STAR</h2>
            <p className="text-xs text-gray-400">{job.position} · {job.company}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {stars.length > 0 && (
              <button onClick={copyAll} className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${copied === 'all' ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {copied === 'all' ? '✓ Copié' : '📋 Tout copier'}
              </button>
            )}
            {!loading && (
              <button onClick={generate} title="Régénérer" className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all">
                🔄
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
              <p className="text-sm text-gray-400">Génération des réponses STAR…</p>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-sm text-red-500 mb-3">{error}</p>
              <button onClick={generate} className="text-sm text-indigo-600 underline">Réessayer</button>
            </div>
          )}

          {!loading && stars.map((s, i) => (
            <div key={i} className={`border rounded-xl overflow-hidden transition-all ${expanded === i ? 'border-indigo-200' : 'border-gray-100'}`}>
              {/* Question row */}
              <button
                onClick={() => setExpanded(expanded === i ? -1 : i)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors text-left"
              >
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                <p className="flex-1 text-sm font-medium text-gray-800">{s.question}</p>
                <span className="text-gray-300 text-xs mt-0.5">{expanded === i ? '▲' : '▼'}</span>
              </button>

              {expanded === i && (
                <div className="px-4 pb-4 space-y-2 border-t border-gray-50">
                  {[['S', 'Situation', 'bg-blue-50 text-blue-700'],
                    ['T', 'Tâche', 'bg-violet-50 text-violet-700'],
                    ['A', 'Action', 'bg-amber-50 text-amber-700'],
                    ['R', 'Résultat', 'bg-green-50 text-green-700']
                  ].map(([key, label, cls]) => (
                    <div key={key} className="flex gap-2.5 mt-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${cls}`}>{label}</span>
                      <p className="text-sm text-gray-700 leading-relaxed">{s[key]}</p>
                    </div>
                  ))}
                  <div className="flex justify-end pt-1">
                    <button onClick={() => copySingle(i)} className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-all ${copied === i ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      {copied === i ? '✓ Copié' : 'Copier'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50">
          <p className="text-[11px] text-gray-400 text-center">Adapte les détails à ta réalité — STAR = base, pas script.</p>
        </div>
      </div>
    </div>
  )
}
