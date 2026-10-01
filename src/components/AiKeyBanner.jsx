import { useEffect, useState } from 'react'
import { getAiProvider, getProviderKey, TRIAL_EXHAUSTED_FLAG, AI_KEY_CHANGED_EVENT } from '../services/apiKey'
import { AI_PROVIDERS } from '../constants/aiProviders'

const DISMISS_KEY = 'jobtrackr_ai_key_banner_dismissed'

// Why AI features can't run on THIS device, or null when they can.
//   • Gemini / OpenAI-compatible selected but no key here — the provider choice
//     syncs across devices, the key never does, so a second device silently had
//     every AI call fail (scores, CV, letters, Gmail parsing) with no explanation.
//   • Claude with no personal key once the shared free trial is used up.
function aiKeyProblem() {
  const provider = getAiProvider()
  if (getProviderKey(provider)) return null
  if (provider !== 'anthropic') return { kind: 'noKey', provider }
  try {
    if (localStorage.getItem(TRIAL_EXHAUSTED_FLAG) === '1') return { kind: 'trialOver', provider }
  } catch { /* storage unavailable */ }
  return null
}

// Slim inline notice above the main content. Dismissible for the browser session
// (per problem), so it explains the situation without nagging on every screen.
export default function AiKeyBanner({ activeTab, onOpenSettings, t = (k) => k }) {
  const [problem, setProblem] = useState(aiKeyProblem)
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) || '' } catch { return '' }
  })

  // Re-evaluate when the key or the provider can have changed: a key saved in
  // Settings, a synced settings change, the trial running out, or a tab switch.
  useEffect(() => {
    const refresh = () => setProblem(aiKeyProblem())
    refresh()
    const events = [AI_KEY_CHANGED_EVENT, 'jobtrackr-settings-changed', 'jobtrackr:trial-exhausted']
    events.forEach(e => window.addEventListener(e, refresh))
    return () => events.forEach(e => window.removeEventListener(e, refresh))
  }, [activeTab])

  if (!problem) return null
  const id = `${problem.kind}:${problem.provider}`
  if (dismissed === id) return null

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, id) } catch { /* ignore */ }
    setDismissed(id)
  }
  const label = AI_PROVIDERS[problem.provider]?.label || problem.provider
  const message = problem.kind === 'noKey'
    ? t('aiKeyBanner.noKey').replace('{provider}', label)
    : t('aiKeyBanner.trialOver')

  return (
    <div role="status" className="mb-4 flex items-center gap-3 flex-wrap rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
      <span className="text-base leading-none" aria-hidden>🔑</span>
      <p className="flex-1 min-w-[12rem] text-sm text-amber-800">{message}</p>
      <button
        onClick={onOpenSettings}
        className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
      >
        {t('aiKeyBanner.cta')}
      </button>
      <button
        onClick={dismiss}
        aria-label={t('aiKeyBanner.dismiss')}
        title={t('aiKeyBanner.dismiss')}
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-amber-700 hover:bg-amber-100 transition-colors"
      >
        ✕
      </button>
    </div>
  )
}
