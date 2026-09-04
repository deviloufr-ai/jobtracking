import { useState, useEffect } from 'react'
import { useDragDock } from '../hooks/useDragDock'
import { detectLanguage } from '../utils/detectLanguage'
import { isConnected, sendEmail, connectGmail, getCachedUser, getReplyContext } from '../services/gmail'
import { withUserApiKey } from '../services/apiKey'
import { trackFollowUpDrafted } from '../services/analytics'

// Map the UI email type to the Mixpanel follow_up_type taxonomy.
// 'relance' = chasing a silent application → inactivity_nudge;
// 'remerciement' = replying to a rejection → reply_check.
const FOLLOW_UP_TYPE = { relance: 'inactivity_nudge', remerciement: 'reply_check' }

const IS_DEV = import.meta.env.DEV

function loadProfile() {
  try { const r = localStorage.getItem('jobtrackr_profile'); return r ? JSON.parse(r) : null } catch { return null }
}

// Build a deterministic signature block from the profile so contact details are
// always correct (never invented by the model). Closing line is localized.
function buildSignature(profile, lang) {
  const closing = lang === 'en' ? 'Best regards,' : 'Cordialement,'
  return [closing, profile?.name, profile?.title, profile?.phone, profile?.linkedin]
    .filter(Boolean)
    .join('\n')
}

export const NO_REPLY_RE = /^(no[-_.]?reply|noreply|do[-_.]?not[-_.]?reply|donotreply|notifications?|alerts?|mailer[-_.]?daemon|postmaster|bounce|auto[-_.]?reply|automessage)@/i

export function isNoReply(email) {
  if (!email) return true
  return NO_REPLY_RE.test(email)
    || email.includes('ats.')
    || email.includes('@ashbyhq') || email.includes('@greenhouse') || email.includes('@lever.co')
    || email.includes('@workable') || email.includes('@teamtailor')
    // Job board automated senders — never a real recruiter contact
    || email.includes('@linkedin.com') || email.includes('@indeedemail.com') || email.includes('@indeed.com')
    || email.includes('@welcometothejungle') || email.includes('@wttj.') || email.includes('@apec.fr')
    || email.includes('@monster.') || email.includes('@cadremploi') || email.includes('@hellowork')
    || email.includes('@jobteaser') || email.includes('@smartrecruiters') || email.includes('@jobvite')
    || email.includes('@myworkdayjobs') || email.includes('@taleo.')
}

// Extract which Gmail account received the emails for this job
export function extractReceivedByAccount(job) {
  for (const h of (job?.history || [])) {
    if (h.source === 'email' && h.receivedBy) return h.receivedBy
  }
  return null
}

// Extract recruiter email from job history (entry.from) or notes text
// Skips no-reply and ATS system addresses
export function extractRecipientEmail(job) {
  // 1. Parse entry.from fields from inbound emails — most reliable source
  for (const h of (job?.history || [])) {
    if (h.fromMe || !h.from) continue
    const raw = h.from.trim()
    const angleMatch = raw.match(/<([^>]+@[^>]+)>/)
    const email = angleMatch ? angleMatch[1].trim() : (raw.includes('@') && !raw.includes(' ') ? raw : null)
    if (email && !isNoReply(email)) return email
  }
  // 2. Fallback: regex scan notes, also filter no-reply
  const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g
  const corpus = [job?.notes || '', ...(job?.history || []).map(h => h.note || '')].join(' ')
  const matches = corpus.match(EMAIL_RE) || []
  return matches.find(e => !isNoReply(e)) || ''
}

// Pull the recruiter's actual refusal message from history so the thank-you can
// rebound on the specific reason given. Prefers the most recent rejection entry's
// email body, falling back to its note. HTML is stripped and length capped to
// keep the prompt small.
export function extractRefusalEntry(job) {
  const hist = job?.history || []
  return (
    [...hist].reverse().find(h => (h.status === 'rejected' || h.status === 'rejected_ats') && (h.body || h.note))
    || [...hist].reverse().find(h => !h.fromMe && (h.body || h.note))
    || null
  )
}

export function extractRefusalContent(job) {
  const refusal = extractRefusalEntry(job)
  if (!refusal) return ''
  const raw = (refusal.body || refusal.note || '')
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200)
}

// Extract the recruiter's display name from an inbound email sender so the draft
// can greet them by name. Returns '' for automated/no-reply or generic team
// senders (e.g. "Recruiting Team") where a personal greeting would be wrong.
export function extractRecruiterName(job) {
  for (const h of (job?.history || [])) {
    if (h.fromMe || !h.from) continue
    const raw = h.from.trim()
    const angleMatch = raw.match(/<([^>]+@[^>]+)>/)
    const email = angleMatch ? angleMatch[1].trim() : (raw.includes('@') && !raw.includes(' ') ? raw : null)
    if (email && isNoReply(email)) continue
    // "Anita LECRECQ <anita@yubo.live>" → "Anita LECRECQ"
    const m = raw.match(/^"?([^"<]+?)"?\s*</)
    const name = (m ? m[1] : '').trim()
    if (!name || name.includes('@')) continue
    // Skip generic mailbox/team labels — no real person to address.
    if (/\b(team|équipe|recrutement|recruiting|recruitment|talent|careers?|jobs?|hr|rh|hello|contact|support|info|notifications?|no[-\s]?reply)\b/i.test(name)) continue
    return name
  }
  return ''
}

const PROMPTS = {
  remerciement: {
    fr: (job, profile, refusal, recruiterName) => `Rédige la salutation et le corps d'un email de remerciement après un refus de candidature pour le poste de ${job.position} chez ${job.company}.

Candidat : ${profile?.name || 'le candidat'}${recruiterName ? `\nRecruteur : ${recruiterName}` : ''}
${refusal ? `\nMessage de refus reçu (appuie-toi dessus pour rebondir sur la raison évoquée ou l'étape franchie, SANS le citer mot pour mot) :\n"""\n${refusal}\n"""\n` : ''}
FORMAT (respecte-le scrupuleusement) :
- Ligne 1 : ${recruiterName ? `salutation avec le prénom du recruteur (ex: "Bonjour ${recruiterName.split(' ')[0]},")` : 'salutation simple (ex: "Bonjour,")'}
- Une ligne vide
- Le corps en 2 ou 3 paragraphes courts, séparés par une ligne vide

Contenu du corps :
- Remercie pour le temps accordé et le retour
${refusal ? '- Rebondis sur un élément concret du message de refus (raison donnée, étape franchie) pour montrer que tu as lu et compris' : ''}
- Exprime que l'entreprise reste attractive et que tu resterais ouvert à de futures opportunités
- Demande subtilement un retour constructif sur ta candidature

Ton professionnel mais humain, pas de formules creuses RH.
INTERDIT : tirets longs (—), "Je me permets", "N'hésitez pas", "Fort de".
N'ajoute NI formule de politesse finale (pas de "Cordialement") NI signature : elles seront ajoutées automatiquement.

Réponds avec la salutation et le corps uniquement, sans objet.`,
    en: (job, profile, refusal, recruiterName) => `Write the greeting and body of a thank-you email after a job rejection for the ${job.position} role at ${job.company}.

Candidate: ${profile?.name || 'the candidate'}${recruiterName ? `\nRecruiter: ${recruiterName}` : ''}
${refusal ? `\nRejection message received (use it to rebound on the reason given or the stage reached, WITHOUT quoting it verbatim):\n"""\n${refusal}\n"""\n` : ''}
FORMAT (follow it exactly):
- Line 1: ${recruiterName ? `greeting using the recruiter's first name (e.g. "Hi ${recruiterName.split(' ')[0]},")` : 'a simple greeting (e.g. "Hello,")'}
- One blank line
- The body in 2 or 3 short paragraphs, separated by a blank line

Body content:
- Thank them for their time and the update
${refusal ? '- Rebound on a concrete element from the rejection message (reason given, stage reached) to show you read and understood it' : ''}
- Express that the company remains attractive and that you would stay open to future opportunities
- Subtly ask for constructive feedback on your application

Professional but human tone, no hollow HR phrases.
FORBIDDEN: em dashes (—), "Please don't hesitate", "I take the liberty".
Do NOT add a closing line (no "Best regards") or a signature: they will be appended automatically.

Reply with the greeting and body only, no subject line.`,
  },
  relance: {
    fr: (job, profile, refusal, recruiterName) => `Rédige la salutation et le corps d'un email de relance pour une candidature sans réponse depuis plusieurs semaines pour le poste de ${job.position} chez ${job.company}.

Candidat : ${profile?.name || 'le candidat'}${recruiterName ? `\nRecruteur : ${recruiterName}` : ''}

FORMAT (respecte-le scrupuleusement) :
- Ligne 1 : ${recruiterName ? `salutation avec le prénom du recruteur (ex: "Bonjour ${recruiterName.split(' ')[0]},")` : 'salutation simple (ex: "Bonjour,")'}
- Une ligne vide
- Le corps en 2 paragraphes courts, séparés par une ligne vide

Contenu du corps :
- Rappelle ta candidature avec la date approximative
- Réaffirme ton intérêt de manière concrète (1 élément spécifique sur l'entreprise)
- Demande une mise à jour sur le statut de ta candidature

Ton professionnel, bref et direct.
INTERDIT : tirets longs (—), formules creuses, "Je me permets de relancer".
N'ajoute NI formule de politesse finale NI signature : elles seront ajoutées automatiquement.

Réponds avec la salutation et le corps uniquement, sans objet.`,
    en: (job, profile, refusal, recruiterName) => `Write the greeting and body of a follow-up email for a job application with no response after several weeks for the ${job.position} role at ${job.company}.

Candidate: ${profile?.name || 'the candidate'}${recruiterName ? `\nRecruiter: ${recruiterName}` : ''}

FORMAT (follow it exactly):
- Line 1: ${recruiterName ? `greeting using the recruiter's first name (e.g. "Hi ${recruiterName.split(' ')[0]},")` : 'a simple greeting (e.g. "Hello,")'}
- One blank line
- The body in 2 short paragraphs, separated by a blank line

Body content:
- Reference your application with the approximate date
- Reaffirm your interest with one concrete, specific element about the company
- Ask for a status update on your application

Professional, brief and direct tone.
FORBIDDEN: em dashes (—), hollow phrases, "I am following up to".
Do NOT add a closing line or a signature: they will be appended automatically.

Reply with the greeting and body only, no subject line.`,
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

export default function EmailDraft({ job, type = 'remerciement', onClose, onEmailSent }) {
  const { startDrag, panelStyle, snapPreview } = useDragDock({ width: 512 })
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [to, setTo] = useState(() => extractRecipientEmail(job))
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState(null) // 'sent' | 'error' | null
  const [gmailConnected, setGmailConnected] = useState(isConnected)

  // For a refusal reply, answer in the language the recruiter actually used.
  const refusalEntry = type === 'remerciement' ? extractRefusalEntry(job) : null
  const refusalContent = type === 'remerciement' ? extractRefusalContent(job) : ''
  const recruiterName = extractRecruiterName(job)
  const lang = refusalContent ? detectLanguage({ notes: refusalContent }) : detectLanguage(job)
  const cfg = EMAIL_TYPES[type] || EMAIL_TYPES.remerciement
  const title = typeof cfg.title === 'object' ? cfg.title[lang] : cfg.title
  const receivedBy = extractReceivedByAccount(job)

  // Default subject — for a rejection reply, reuse the refusal subject as "Re: …"
  // so it reads as a real reply; otherwise a sensible per-type default.
  const defaultSubject = (() => {
    if (type === 'remerciement' && refusalEntry?.subject) {
      const b = refusalEntry.subject.trim()
      return /^re:/i.test(b) ? b : `Re: ${b}`
    }
    return lang === 'en'
      ? (type === 'remerciement' ? `${job.position} application — Thank you` : `${job.position} application — Following up`)
      : (type === 'remerciement' ? `Candidature ${job.position} — Merci` : `Suivi candidature — ${job.position}`)
  })()
  const [subject, setSubject] = useState(defaultSubject)

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

    // For a rejection reply, send it as a reply in the same Gmail thread as the
    // refusal email rather than starting a new conversation. The subject the user
    // sees/edits is used as-is.
    let threadId, inReplyTo
    if (type === 'remerciement' && refusalEntry?.gmailId) {
      const ctx = await getReplyContext(refusalEntry.gmailId, receivedBy || undefined)
      if (ctx?.threadId) {
        threadId = ctx.threadId
        inReplyTo = ctx.messageId || undefined
      }
    }
    try {
      await sendEmail({ to: to.trim(), subject: subject.trim(), body: draft, fromAccount: receivedBy || undefined, threadId, inReplyTo })
      setSendStatus('sent')

      // Notify parent to update job history
      if (onEmailSent) {
        onEmailSent(type, to.trim())
      }

      // Close modal after brief success feedback
      setTimeout(() => onClose?.(), 1500)
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

    const profile = loadProfile()
    const greetName = recruiterName ? recruiterName.split(' ')[0] : null
    const signature = buildSignature(profile, lang)

    if (IS_DEV) {
      await new Promise(r => setTimeout(r, 700))
      const hi = (lang === 'en' ? 'Hi' : 'Bonjour') + (greetName ? ` ${greetName},` : ',')
      const body = type === 'remerciement'
        ? `Merci pour votre retour concernant ma candidature au poste de ${job.position}.\n\nBien que cette nouvelle soit décevante, je reste très intéressé par ${job.company} et son approche produit, et resterais ouvert à de futures opportunités.\n\nSi vous aviez un retour constructif sur ma candidature, je suis preneur.`
        : `Je reviens vers vous concernant ma candidature au poste de ${job.position}, déposée il y a quelques semaines.\n\nJe reste très motivé par cette opportunité chez ${job.company}. Pourriez-vous me communiquer le statut de ma candidature ?`
      setDraft(`${hi}\n\n${body}\n\n${signature}`)
      try { trackFollowUpDrafted({ applicationId: job.id, followUpType: FOLLOW_UP_TYPE[type] }) } catch { /* ignore */ }
      setLoading(false)
      return
    }

    const promptFn = PROMPTS[type]?.[lang] || PROMPTS[type]?.fr
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withUserApiKey({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          // Feed the recruiter's actual refusal message into the thank-you so it
          // can rebound on the specific reason given, and their name so it greets
          // them personally.
          messages: [{ role: 'user', content: promptFn(job, profile, refusalContent, recruiterName) }]
        }))
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Erreur API')
      let text = (data.content?.[0]?.text || '').trim()
        .replace(/\s*—\s*/g, ', ')
        .replace(/…/g, '.')
      // Append the deterministic signature block (the model is told not to add
      // its own closing/signature). Guard against a stray closing it may add.
      if (signature) {
        text = text.replace(/\n+\s*(cordialement|bien (à|a) vous|best regards|kind regards|sincerely|regards)[\s,].*$/is, '').trimEnd()
        text = `${text}\n\n${signature}`
      }
      setDraft(text)
      try { trackFollowUpDrafted({ applicationId: job.id, followUpType: FOLLOW_UP_TYPE[type] }) } catch { /* ignore */ }
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
    const to_ = to.trim()
    window.open(`mailto:${encodeURIComponent(to_)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(draft)}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      {snapPreview}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]" style={panelStyle}>

        {/* Header */}
        <div onPointerDown={startDrag} className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 cursor-move select-none">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cfg.color} flex items-center justify-center text-white text-base`}>{cfg.icon}</div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-900 text-sm">{title}</h2>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${lang === 'en' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'}`}>
                {lang === 'en' ? '🇬🇧 EN' : '🇫🇷 FR'}
              </span>
            </div>
            <p className="text-xs text-gray-400">{job.position} · {job.company}</p>
            {receivedBy && (
              <p className="text-[11px] text-indigo-600 mt-0.5 flex items-center gap-1">
                <span>📬</span> Répondre depuis <strong>{receivedBy}</strong>
              </p>
            )}
          </div>
          <button onClick={onClose} className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">✕</button>
        </div>

        {/* Loading / error */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-7 h-7 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
            <p className="text-sm text-gray-400">{lang === 'en' ? 'Writing…' : 'Rédaction en cours…'}</p>
          </div>
        )}

        {error && (
          <div className="text-center py-6 px-5">
            <p className="text-sm text-red-500 mb-3">{error}</p>
            <button onClick={generate} className="text-sm text-indigo-600 underline">{lang === 'en' ? 'Retry' : 'Réessayer'}</button>
          </div>
        )}

        {/* Email composer */}
        {!loading && draft && (
          <div className="px-5 py-4 space-y-3">
            {/* To + Subject fields */}
            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-xs font-semibold text-gray-400 w-12 shrink-0">{lang === 'en' ? 'To' : 'À'}</span>
                <input
                  type="email"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  placeholder={lang === 'en' ? 'recruiter@company.com' : 'recruteur@entreprise.com'}
                  className="flex-1 text-sm bg-transparent focus:outline-none placeholder-gray-300 text-gray-700"
                />
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-xs font-semibold text-gray-400 w-12 shrink-0">{lang === 'en' ? 'Subject' : 'Objet'}</span>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="flex-1 text-sm bg-transparent focus:outline-none font-medium text-gray-800"
                />
              </div>
            </div>

            {/* Body — always editable */}
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={9}
              className="w-full text-sm text-gray-700 leading-relaxed bg-gray-50/60 border border-gray-200 rounded-xl p-4 resize-y min-h-[180px] focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
            />
          </div>
        )}

        {/* Send actions */}
        {!loading && draft && (
          <div className="px-5 pb-4 border-t border-gray-50 pt-3">
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
