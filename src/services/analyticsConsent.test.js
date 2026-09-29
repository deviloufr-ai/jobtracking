import { describe, it, expect, beforeEach } from 'vitest'
import { getAnalyticsConsent, setAnalyticsConsent, ANALYTICS_CONSENT_EVENT } from './analytics'

describe('analytics consent (opt-in)', () => {
  beforeEach(() => localStorage.clear())

  it('is undecided until the user chooses', () => {
    expect(getAnalyticsConsent()).toBeNull()
  })

  it('persists an explicit choice and notifies listeners', () => {
    const seen = []
    const on = (e) => seen.push(e.detail)
    window.addEventListener(ANALYTICS_CONSENT_EVENT, on)
    setAnalyticsConsent('granted')
    expect(getAnalyticsConsent()).toBe('granted')
    setAnalyticsConsent('denied')
    expect(getAnalyticsConsent()).toBe('denied')
    window.removeEventListener(ANALYTICS_CONSENT_EVENT, on)
    expect(seen).toEqual(['granted', 'denied'])
  })

  it('ignores anything that is not an explicit yes/no', () => {
    setAnalyticsConsent('maybe')
    expect(getAnalyticsConsent()).toBeNull()
    localStorage.setItem('jobtrackr_analytics_consent', 'garbage')
    expect(getAnalyticsConsent()).toBeNull()
  })
})
