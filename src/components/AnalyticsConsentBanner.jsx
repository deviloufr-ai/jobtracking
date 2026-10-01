import { useEffect, useState } from 'react'
import { getAnalyticsConsent, setAnalyticsConsent, ANALYTICS_CONSENT_EVENT } from '../services/analytics'

const SNOOZE_KEY = 'jobtrackr_analytics_consent_snoozed'

// Opt-in prompt for product analytics (Mixpanel). Shown once per device, after
// sign-in, until the user picks. Refuse and accept carry the same weight — a
// refusal must be as easy as an acceptance. The choice can be changed later in
// Settings → Data.
//
// "Plus tard" (✕) hides it for the current browser session without recording a
// choice — nothing is sent while there is no answer, so snoozing is safe. Without
// it the card sat on top of the page (covering the bottom-right controls, and
// most of a phone screen) on every load until a choice was made.
export default function AnalyticsConsentBanner({ t = (k) => k }) {
  const [consent, setConsent] = useState(getAnalyticsConsent)
  const [snoozed, setSnoozed] = useState(() => {
    try { return sessionStorage.getItem(SNOOZE_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    const onChange = () => setConsent(getAnalyticsConsent())
    window.addEventListener(ANALYTICS_CONSENT_EVENT, onChange)
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, onChange)
  }, [])

  if (consent || snoozed) return null

  const snooze = () => {
    try { sessionStorage.setItem(SNOOZE_KEY, '1') } catch { /* ignore */ }
    setSnoozed(true)
  }

  const btn = 'flex-1 sm:flex-none text-sm font-semibold px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 transition-colors'

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t('analyticsConsent.title')}
      className="fixed z-[90] left-3 right-3 bottom-20 md:bottom-4 md:left-auto md:right-6 md:max-w-md bg-white border border-gray-200 rounded-2xl shadow-xl p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">📊 {t('analyticsConsent.title')}</p>
        <button
          type="button"
          onClick={snooze}
          title={t('analyticsConsent.later')}
          aria-label={t('analyticsConsent.later')}
          className="-mt-1 -mr-1 w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          ✕
        </button>
      </div>
      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
        {t('analyticsConsent.body')}{' '}
        <a href="/privacy-policy.html" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
          {t('analyticsConsent.more')}
        </a>
      </p>
      <div className="flex gap-2 mt-3 sm:justify-end">
        <button type="button" className={btn} onClick={() => setAnalyticsConsent('denied')}>
          {t('analyticsConsent.decline')}
        </button>
        <button type="button" className={btn} onClick={() => setAnalyticsConsent('granted')}>
          {t('analyticsConsent.accept')}
        </button>
      </div>
    </div>
  )
}
