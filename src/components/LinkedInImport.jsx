import { useState, useEffect, useRef } from 'react'
import { STATUSES, getStatusLabel } from '../hooks/useJobs'
import { useDragDock } from '../hooks/useDragDock'
import { extractUrl, isLinkedInUrl } from '../services/linkedinShare'

// Statuses a freshly-shared candidature realistically starts in. Sharing a job
// link is usually "I found this and want to track it", so we default to "todo".
const START_STATUSES = ['todo', 'sent', 'reviewing', 'interview', 'waiting', 'offer']

const today = () => new Date().toISOString().split('T')[0]

// Ask the server (which reads LinkedIn's public guest fragment) for the job's
// company / position / location. Falls back gracefully — the caller lets the
// user fill anything we couldn't read.
async function resolveJob(url) {
  const res = await fetch('/api/fetch-jd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) {
    let code = null
    try { code = (await res.json())?.code } catch { /* non-JSON body */ }
    const err = new Error(`HTTP ${res.status}`)
    err.code = code
    throw err
  }
  return res.json() // { text, url, meta?: { company, position, location } }
}

/**
 * Add a candidature from a LinkedIn share link.
 *
 * @param initialUrl  URL to pre-fill (from the Android share sheet), or ''.
 * @param onImport    called with a single job object to add.
 * @param onClose     close the modal.
 * @param existingJobs used to warn about a duplicate before adding.
 * @param t           translator.
 */
export default function LinkedInImport({ initialUrl = '', onImport, onClose, existingJobs = [], t }) {
  const { startDrag, panelStyle, snapPreview } = useDragDock({ width: 512 })
  // step: input | fetching | review
  const [step, setStep] = useState('input')
  const [url, setUrl] = useState(initialUrl)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    company: '', position: '', companyAddress: '', jobDescription: '',
    status: 'todo', date: today(), notes: '',
  })
  const autoRan = useRef(false)

  const tr = (key, fallback) => {
    const v = t ? t(key) : null
    return v && v !== key ? v : fallback
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const duplicate = existingJobs.find(j =>
    j.company?.trim().toLowerCase() === form.company.trim().toLowerCase() &&
    j.position?.trim().toLowerCase() === form.position.trim().toLowerCase() &&
    form.company.trim() && form.position.trim()
  )

  const runFetch = async (rawUrl) => {
    const clean = extractUrl(rawUrl) || (rawUrl || '').trim()
    if (!clean) {
      setError(tr('linkedinImport.errNoUrl', 'Colle un lien LinkedIn.'))
      return
    }
    setUrl(clean)
    setError(null)
    setStep('fetching')
    try {
      const data = await resolveJob(clean)
      const meta = data.meta || {}
      setForm(f => ({
        ...f,
        company: meta.company || f.company,
        position: meta.position || f.position,
        companyAddress: meta.location || f.companyAddress,
        jobDescription: (data.text && data.text.length >= 40) ? data.text : f.jobDescription,
      }))
      setStep('review')
      if (!meta.company && !meta.position) {
        setError(tr('linkedinImport.errPartial', "Lecture partielle — complète l'entreprise et le poste ci-dessous."))
      }
    } catch (e) {
      // Even when the fetch fails we keep the URL and let the user fill the rest
      // by hand, so a shared link is never a dead end.
      setStep('review')
      setError(e.code === 'JD_UNREADABLE'
        ? tr('linkedinImport.errUnreadable', "Offre illisible automatiquement — saisis l'entreprise et le poste.")
        : tr('linkedinImport.errFetch', "Impossible de lire l'offre — saisis les infos manuellement."))
    }
  }

  // Auto-fetch when opened from a share (URL already provided).
  useEffect(() => {
    if (initialUrl && !autoRan.current) {
      autoRan.current = true
      runFetch(initialUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl])

  const handleAdd = () => {
    if (!form.company.trim() || !form.position.trim()) {
      setError(tr('linkedinImport.errRequired', "L'entreprise et le poste sont requis."))
      return
    }
    onImport({
      company: form.company.trim(),
      position: form.position.trim(),
      url,
      companyAddress: form.companyAddress.trim(),
      status: form.status,
      date: form.date,
      notes: form.notes.trim(),
      jobDescription: form.jobDescription.trim(),
    })
    onClose()
  }

  const badLink = url && !isLinkedInUrl(extractUrl(url) || url)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={step !== 'fetching' ? onClose : undefined} />
      {snapPreview}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg z-10 overflow-hidden" style={panelStyle}>

        {/* Header */}
        <div onPointerDown={startDrag} className="flex items-center justify-between px-6 py-4 border-b border-gray-100 cursor-move select-none">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#0A66C2]/10 flex items-center justify-center text-lg">💼</div>
            <div>
              <h2 className="font-semibold text-gray-800 text-sm">{tr('linkedinImport.title', 'Ajouter depuis LinkedIn')}</h2>
              <p className="text-xs text-gray-400">{tr('linkedinImport.subtitle', "Colle ou partage un lien d'offre LinkedIn")}</p>
            </div>
          </div>
          {step !== 'fetching' && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          )}
        </div>

        <div className="px-6 py-5">

          {/* Step: input — paste a link */}
          {step === 'input' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tr('linkedinImport.urlLabel', "Lien de l'offre LinkedIn")}</label>
              <input
                type="url"
                autoFocus
                inputMode="url"
                value={url}
                onChange={e => { setUrl(e.target.value); setError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') runFetch(url) }}
                placeholder="https://www.linkedin.com/jobs/view/…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/40"
              />
              {badLink && <p className="text-xs text-orange-500 mt-1">{tr('linkedinImport.notLinkedin', "Ce lien n'a pas l'air d'être une offre LinkedIn — tu peux quand même essayer.")}</p>}
              {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-3 mt-3">{error}</p>}
              <p className="text-xs text-gray-400 mt-3">
                {tr('linkedinImport.hint', "Astuce : sur l'appli LinkedIn, touche Partager sur une offre puis choisis SmartJobTracker.")}
              </p>
            </div>
          )}

          {/* Step: fetching */}
          {step === 'fetching' && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#0A66C2]/10 mb-3">
                <svg className="w-6 h-6 text-[#0A66C2] animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <p className="font-medium text-gray-700">{tr('linkedinImport.reading', "Lecture de l'offre…")}</p>
              <p className="text-xs text-gray-400 mt-1 break-all px-4">{url}</p>
            </div>
          )}

          {/* Step: review — confirm / complete the fields */}
          {step === 'review' && (
            <div className="space-y-3">
              {error && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3">{error}</p>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{tr('jobModal.companyLabel', 'Entreprise')} *</label>
                  <input value={form.company} onChange={e => set('company', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/40" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{tr('jobModal.positionLabel', 'Poste')} *</label>
                  <input value={form.position} onChange={e => set('position', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/40" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">📍 {tr('jobModal.companyAddressLabel', 'Localisation')}</label>
                <input value={form.companyAddress} onChange={e => set('companyAddress', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/40" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{tr('jobModal.statusLabel', 'Statut')}</label>
                  <select value={form.status} onChange={e => set('status', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/40">
                    {STATUSES.filter(s => START_STATUSES.includes(s.key)).map(s => (
                      <option key={s.key} value={s.key}>{getStatusLabel(s.key, t)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{tr('jobModal.dateLabel', 'Date')}</label>
                  <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/40" />
                </div>
              </div>

              {duplicate && (
                <p className="text-xs text-orange-600 bg-orange-50 rounded-lg p-2.5">
                  ⚠️ {tr('linkedinImport.duplicate', 'Une candidature existe déjà pour cette entreprise et ce poste.')}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-gray-400 truncate flex-1">🔗 {url}</span>
                <button onClick={() => { setStep('input'); setError(null) }} className="text-xs text-[#0A66C2] hover:underline shrink-0">
                  {tr('linkedinImport.changeLink', 'Changer le lien')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">
            {tr('common.cancel', 'Annuler')}
          </button>
          {step === 'input' && (
            <button onClick={() => runFetch(url)} disabled={!url.trim()}
              className="px-5 py-2 text-sm font-medium bg-[#0A66C2] text-white rounded-lg hover:bg-[#08528f] disabled:opacity-40 transition-colors">
              {tr('linkedinImport.fetch', 'Lire l’offre')}
            </button>
          )}
          {step === 'review' && (
            <button onClick={handleAdd} disabled={!form.company.trim() || !form.position.trim()}
              className="px-5 py-2 text-sm font-medium bg-[#0A66C2] text-white rounded-lg hover:bg-[#08528f] disabled:opacity-40 transition-colors">
              {tr('linkedinImport.add', 'Ajouter la candidature')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
