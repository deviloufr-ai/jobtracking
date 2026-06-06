import { useState, useEffect } from 'react'

const IS_DEV = import.meta.env.DEV

function loadProfile() {
  try { const r = localStorage.getItem('jobtrackr_profile'); return r ? JSON.parse(r) : null } catch { return null }
}

const EMAIL_TYPES = {
  remerciement: {
    icon: '💌',
    title: 'Email de remerciement',
    color: 'from-pink-500 to-rose-500',
    prompt: (job, profile) => `Rédige un email de remerciement après un refus de candidature pour le poste de ${job.position} chez ${job.company}.

Candidat : ${profile?.name || 'le candidat'}
Poste visé : ${job.position}
Entreprise : ${job.company}

Règles strictes :
- 3 à 4 phrases maximum — court et percutant
- Commence par remercier pour le temps accordé et le retour
- Exprime brièvement que l'entreprise reste attractive à long terme
- Demande subtilement un feedback si possible
- Termine par une formule de congé simple et directe
- Ton professionnel mais humain — pas de formules creuses RH
- INTERDIT : tirets longs (—), "Je me permets", "N'hésitez pas", "Fort de"
- Signe uniquement avec le prénom (${profile?.name?.split(' ')[0] || 'le prénom'})

Réponds avec l'email uniquement, sans objet ni mise en forme.`,
  },
  relance: {
    icon: '📨',
    title: 'Email de relance',
    color: 'from-indigo-500 to-blue-500',
    prompt: (job, profile) => `Rédige un email de relance pour une candidature sans réponse depuis plusieurs semaines pour le poste de ${job.position} chez ${job.company}.

Candidat : ${profile?.name || 'le candidat'}

Règles strictes :
- 3 phrases maximum — bref et direct
- Rappelle ta candidature avec la date approximative
- Réaffirme ton intérêt de manière concrète (1 élément spécifique sur l'entreprise)
- Demande une mise à jour sur le statut
- INTERDIT : tirets longs, formules creuses, "Je me permets de relancer"
- Signe avec le prénom uniquement

Réponds avec l'email uniquement, sans objet ni mise en forme.`,
  },
}

export default function EmailDraft({ job, type = 'remerciement', onClose }) {
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)

  const cfg = EMAIL_TYPES[type] || EMAIL_TYPES.remerciement

  useEffect(() => { generate() }, [])

  async function generate() {
    setLoading(true)
    setError(null)
    setEditing(false)

    if (IS_DEV) {
      await new Promise(r => setTimeout(r, 700))
      const profile = loadProfile()
      const firstName = profile?.name?.split(' ')[0] || 'Alexandre'
      if (type === 'remerciement') {
        setDraft(`Merci pour votre retour concernant ma candidature au poste de ${job.position}.\n\nBien que cette nouvelle soit décevante, je reste très intéressé par ${job.company} et son approche produit. Si vous avez des retours sur ma candidature, je suis preneur — cela m'aide à progresser.\n\nBonne continuation,\n${firstName}`)
      } else {
        setDraft(`Je me permets de revenir vers vous concernant ma candidature au poste de ${job.position}, déposée il y a quelques semaines.\n\nSuivant de près l'actualité de ${job.company}, notamment vos récentes initiatives, je reste très motivé par cette opportunité.\n\nPourriez-vous me donner un point sur le statut de ma candidature ?\n\nCordialement,\n${firstName}`)
      }
      setLoading(false)
      return
    }

    const profile = loadProfile()
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          messages: [{ role: 'user', content: cfg.prompt(job, profile) }]
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur API')
      const text = (data.content?.[0]?.text || '').trim()
        .replace(/\s*—\s*/g, ', ')
        .replace(/…/g, '.')
      setDraft(text)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  function handleCopy() {
    navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleMailto() {
    const subject = encodeURIComponent(
      type === 'remerciement'
        ? `Candidature ${job.position} — Merci`
        : `Suivi candidature — ${job.position}`
    )
    window.open(`mailto:?subject=${subject}&body=${encodeURIComponent(draft)}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cfg.color} flex items-center justify-center text-white text-base`}>{cfg.icon}</div>
          <div>
            <h2 className="font-bold text-gray-900 text-sm">{cfg.title}</h2>
            <p className="text-xs text-gray-400">{job.position} · {job.company}</p>
          </div>
          <button onClick={onClose} className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">✕</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-7 h-7 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
              <p className="text-sm text-gray-400">Rédaction en cours…</p>
            </div>
          )}

          {error && (
            <div className="text-center py-6">
              <p className="text-sm text-red-500 mb-3">{error}</p>
              <button onClick={generate} className="text-sm text-indigo-600 underline">Réessayer</button>
            </div>
          )}

          {!loading && draft && (
            <>
              {editing ? (
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  className="w-full text-sm text-gray-700 leading-relaxed border border-indigo-200 rounded-xl p-4 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  rows={8}
                  autoFocus
                />
              ) : (
                <div
                  onClick={() => setEditing(true)}
                  className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-xl p-4 cursor-text hover:bg-gray-100/80 transition-colors border border-gray-100"
                  title="Cliquer pour modifier"
                >
                  {draft}
                </div>
              )}
              <p className="text-[10px] text-gray-400 mt-2 text-center">
                {editing ? 'Cliquer ailleurs pour terminer l\'édition' : 'Cliquer sur le texte pour modifier'}
              </p>
            </>
          )}
        </div>

        {/* Footer actions */}
        {!loading && draft && (
          <div className="flex items-center gap-2 px-5 pb-4">
            <button
              onClick={generate}
              className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all"
            >
              🔄 Régénérer
            </button>
            <div className="flex-1" />
            <button
              onClick={handleCopy}
              className={`text-sm font-semibold px-4 py-2 rounded-xl border transition-all ${
                copied ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {copied ? '✓ Copié !' : '📋 Copier'}
            </button>
            <button
              onClick={handleMailto}
              className="text-sm font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:opacity-90 active:scale-95 transition-all shadow-sm"
            >
              ✉️ Ouvrir dans Mail
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
