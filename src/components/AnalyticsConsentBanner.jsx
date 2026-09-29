import { useEffect, useState } from 'react'
import { getAnalyticsConsent, setAnalyticsConsent, ANALYTICS_CONSENT_EVENT } from '../services/analytics'

// Opt-in prompt for product analytics (Mixpanel). Shown once per device, after
// sign-in, until the user picks. Refuse and accept carry the same weight — a
// refusal must be as easy as an acceptance. The choice can be changed later in
// Settings → Data.
export default function AnalyticsConsentBanner({ t = (k) => k }) {
  const [consent, setConsent] = useState(getAnalyticsConsent)

  useEffect(() => {
    const onChange = () => setConsent(getAnalyticsConsent())
    window.addEventListener(ANALYTICS_CONSENT_EVENT, onChange)
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, onChange)
  }, [])

  if (consent) return null

  const btn = 'flex-1 sm:flex-none text-sm font-semibold px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 transition-colors'

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t('analyticsConsent.title')}
      className="fixed z-[90] left-3 right-3 bottom-20 md:bottom-4 md:left-auto md:right-6 md:max-w-md bg-white border border-gray-200 rounded-2xl shadow-xl p-4"
    >
      <p className="text-sm font-semibold text-gray-900">📊 {t('analyticsConsent.title')}</p>
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
