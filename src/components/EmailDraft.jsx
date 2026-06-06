import { useState, useEffect } from 'react'
import { detectLanguage } from '../utils/detectLanguage'
import { isConnected, sendEmail, connectGmail, getCachedUser } from '../services/gmail'

const IS_DEV = import.meta.env.DEV

function loadProfile() {
  try { const r = localStorage.getItem('jobtrackr_profile'); return r ? JSON.parse(r) : null } catch { return null }
}

// Extract recruiter email from job history (entry.from) or notes text
function extractRecipientEmail(job) {
  // 1. Parse entry.from fields from inbound emails — most reliable source
  for (const h of (job?.history || [])) {
    if (h.fromMe || !h.from) continue
    const raw = h.from.trim()
    // "Name <email@domain.com>"
    const angleMatch = raw.match(/<([^>]+@[^>]+)>/)
    if (angleMatch) return angleMatch[1].trim()
    // bare "email@domain.com"
    if (raw.includes('@') && !raw.includes(' ')) return raw
  }
  // 2. Fallback: regex scan notes
  const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g
  const corpus = [job?.notes || '', ...(job?.history || []).map(h => h.note || '')].join(' ')
  return corpus.match(EMAIL_RE)?.[0] || ''
}

const PROMPTS = {
  remerciement: {
    fr: (job, profile) => `Rédige un email de remerciement après un refus de candidature pour le poste de ${job.position} chez ${job.company}.

Candidat : ${profile?.name || 'le candidat'}

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
    en: (job, profile) => `Write a thank-you email after a job rejection for the ${job.position} role at ${job.company}.

Candidate: ${profile?.name || 'the candidate'}

Strict rules:
- 3 to 4 sentences maximum — short and impactful
- Start by thanking them for their time and the update
- Briefly express that the company remains attractive long-term
- Subtly ask for feedback if possible
- End with a simple, direct closing
- Professional but human tone — no hollow HR phrases
- FORBIDDEN: em dashes (—), "Please don't hesitate", "I take the liberty"
- Sign with first name only (${profile?.name?.split(' ')[0] || 'first name'})

Reply with the email only, no subject line or formatting.`,
  },
  relance: {
    fr: (job, profile) => `Rédige un email de relance pour une candidature sans réponse depuis plusieurs semaines pour le poste de ${job.position} chez ${job.company}.

Candidat : ${profile?.name || 'le candidat'}

Règles strictes :
- 3 phrases maximum — bref et direct
- Rappelle ta candidature avec la date approximative
- Réaffirme ton intérêt de manière concrète (1 élément spécifique sur l'entreprise)
- Demande une mise à jour sur le statut
- INTERDIT : tirets longs, formules creuses, "Je me permets de relancer"
- Signe avec le prénom uniquement

Réponds avec l'email uniquement, sans objet ni mise en forme.`,
    en: (job, profile) => `Write a follow-up email for a job application with no response after several weeks for the ${job.position} role at ${job.company}.

Candidate: ${profile?.name || 'the candidate'}

Strict rules:
- 3 sentences maximum — brief and direct
- Reference your application with the approximate date
- Reaffirm your interest with one concrete, specific element about the company
- Ask for a status update
- FORBIDDEN: em dashes, hollow phrases, "I am following up to"
- Sign with first name only

Reply with the email only, no subject line or formatting.`,
  },
}

const EMAIL_TYPES = {
  remerciement: {
    icon: '💌',
    title: { fr: 'Email de remerciement', en: 'Thank-you email' },
    color: 'from-pink-500 to-rose-500',
  },
  relance: {
    icon: '📨',
    title: { fr: 'Email de relance', en: 'Follow-up email' },
    color: 'from-indigo-500 to-blue-500',
  },
}

export default function EmailDraft({ job, type = 'remerciement', onClose }) {
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [to, setTo] = useState(() => extractRecipientEmail(job))
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState(null) // 'sent' | 'error' | null
  const [gmailConnected, setGmailConnected] = useState(isConnected)

  const lang = detectLanguage(job)
  const cfg = EMAIL_TYPES[type] || EMAIL_TYPES.remerciement
  const title = typeof cfg.title === 'object' ? cfg.title[lang] : cfg.title

  useEffect(() => { generate() }, [])

  async function handleConnectGmail() {
    try {
      await connectGmail()
      setGmailConnected(true)
    } catch (e) {
      setError(lang === 'en' ? 'Gmail connection failed: ' + e.message : 'Connexion Gmail échouée : ' + e.message)
    }
  }

  async function handleSendViaGmail() {
    if (!to.trim()) {
      setError(lang === 'en' ? 'Please enter a recipient email address.' : 'Veuillez entrer l\'adresse email du destinataire.')
      return
    }
    setSending(true)
    setSendStatus(null)
    setError(null)
    const subject = lang === 'en'
      ? (type === 'remerciement' ? `${job.position} application — Thank you` : `${job.position} application — Following up`)
      : (type === 'remerciement' ? `Candidature ${job.position} — Merci` : `Suivi candidature — ${job.position}`)
    try {
      await sendEmail({ to: to.trim(), subject, body: draft })
      setSendStatus('sent')
      setTimeout(() => setSendStatus(null), 4000)
    } catch (e) {
      // Token expired — try reconnecting
      if (e.message.includes('401') || e.message.includes('Non connecté')) {
        setGmailConnected(false)
        setError(lang === 'en' ? 'Gmail session expired — reconnect below.' : 'Session Gmail expirée — reconnecte-toi ci-dessous.')
      } else {
        setSendStatus('error')
        setError(e.message)
      }
    }
    setSending(false)
  }

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
    const promptFn = PROMPTS[type]?.[lang] || PROMPTS[type]?.fr
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          messages: [{ role: 'user', content: promptFn(job, profile) }]
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
    const subject = encodeURIComponent(lang === 'en'
      ? (type === 'remerciement' ? `${job.position} application — Thank you` : `${job.position} application — Following up`)
      : (type === 'remerciement' ? `Candidature ${job.position} — Merci` : `Suivi candidature — ${job.position}`)
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
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-900 text-sm">{title}</h2>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${lang === 'en' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'}`}>
                {lang === 'en' ? '🇬🇧 EN' : '🇫🇷 FR'}
              </span>
            </div>
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

        {/* To field + send actions */}
        {!loading && draft && (
          <div className="px-5 pb-4 space-y-3 border-t border-gray-50 pt-3">

            {/* To: input */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 w-6 shrink-0">To</label>
              <input
                type="email"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder={lang === 'en' ? 'recruiter@company.com' : 'recruteur@entreprise.com'}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
              />
            </div>

            {/* Action row */}
            <div className="flex items-center gap-2">
              <button onClick={generate} className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all">
                🔄
              </button>
              <button
                onClick={handleCopy}
                className={`text-sm font-semibold px-3 py-2 rounded-xl border transition-all ${copied ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
              >
                {copied ? '✓' : '📋'}
              </button>
              <button onClick={handleMailto} className="text-sm px-3 py-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all" title={lang === 'en' ? 'Open in Mail app' : 'Ouvrir dans Mail'}>
                📬
              </button>

              <div className="flex-1" />

              {/* Gmail send — primary CTA */}
              {gmailConnected ? (
                <button
                  onClick={handleSendViaGmail}
                  disabled={sending || !to.trim()}
                  className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                    sendStatus === 'sent'
                      ? 'bg-green-500 text-white'
                      : sendStatus === 'error'
                      ? 'bg-red-500 text-white'
                      : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:opacity-90'
                  }`}
                >
                  {sending
                    ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />{lang === 'en' ? 'Sending…' : 'Envoi…'}</>
                    : sendStatus === 'sent'
                    ? (lang === 'en' ? '✓ Sent!' : '✓ Envoyé !')
                    : sendStatus === 'error'
                    ? (lang === 'en' ? '✗ Failed' : '✗ Échec')
                    : <><span>✉️</span>{lang === 'en' ? 'Send via Gmail' : 'Envoyer via Gmail'}</>
                  }
                </button>
              ) : (
                <button
                  onClick={handleConnectGmail}
                  className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl bg-gray-800 text-white hover:bg-gray-700 active:scale-95 transition-all shadow-sm"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  {lang === 'en' ? 'Connect Gmail to send' : 'Connecter Gmail pour envoyer'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
