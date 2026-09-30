import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isInsufficientScopeError, GmailScopeError, GmailReauthRequiredError, encodeMimeHeader,
  dedupeFetchedEmails, ensureValidToken, autoReuseStoredTokens,
} from './gmail'

describe('dedupeFetchedEmails — secondary key must not merge distinct same-day mails', () => {
  const indeed = (id, snippet) => ({
    id, from: 'noreply@indeed.com', subject: 'Candidature envoyée', date: '2026-09-30', snippet, body: snippet,
  })

  it('keeps two different Indeed confirmations sent the same day', () => {
    const out = dedupeFetchedEmails([[indeed('m1', 'envoyés à Hublo'), indeed('m2', 'envoyés à Doctolib')]])
    expect(out.map(e => e.id)).toEqual(['m1', 'm2'])
  })

  it('still collapses the same mail seen through two mailboxes (different Gmail ids)', () => {
    const out = dedupeFetchedEmails([[indeed('acct-a-1', 'envoyés à Hublo')], [indeed('acct-b-7', 'envoyés à Hublo')]])
    expect(out.map(e => e.id)).toEqual(['acct-a-1'])
  })

  it('collapses the same message id returned by two queries', () => {
    const out = dedupeFetchedEmails([[indeed('m1', 'x')], [indeed('m1', 'x')]])
    expect(out).toHaveLength(1)
  })
})

describe('ensureValidToken — background callers never open the OAuth popup', () => {
  const EMAIL = 'me@example.com'
  const seed = (acct) => {
    localStorage.setItem('jt_gmail_accounts', JSON.stringify({ [EMAIL]: { token: 'stale', user: { email: EMAIL }, ...acct } }))
    autoReuseStoredTokens()
  }
  const expired = new Date(Date.now() - 60000).toISOString()
  const oauthResponse = (status, body) => ({ ok: status < 300, status, json: async () => body })
  let initCodeClient

  beforeEach(() => {
    localStorage.clear()
    initCodeClient = vi.fn()
    window.google = { accounts: { oauth2: { initCodeClient } } }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete window.google
    localStorage.clear()
    autoReuseStoredTokens()
  })

  it('returns the stored token untouched while it is still valid', async () => {
    seed({ refreshToken: 'r', tokenExpiry: new Date(Date.now() + 3600000).toISOString() })
    vi.spyOn(globalThis, 'fetch')
    await expect(ensureValidToken(EMAIL)).resolves.toBe('stale')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('silently refreshes an expiring token', async () => {
    seed({ refreshToken: 'r', tokenExpiry: expired })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(oauthResponse(200, { accessToken: 'fresh', expiresIn: 3600 }))
    await expect(ensureValidToken(EMAIL)).resolves.toBe('fresh')
    expect(JSON.parse(localStorage.getItem('jt_gmail_accounts'))[EMAIL].token).toBe('fresh')
  })

  it('throws a typed GmailReauthRequiredError when Google refuses the refresh token (no popup)', async () => {
    seed({ refreshToken: 'r', tokenExpiry: expired })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(oauthResponse(400, { error: 'invalid_grant' }))
    const err = await ensureValidToken(EMAIL).catch(e => e)
    expect(err).toBeInstanceOf(GmailReauthRequiredError)
    expect(err.account).toBe(EMAIL)
    expect(err.message).toMatch(/invalid_grant/)
    // The existing "reconnect X" prompts key off this predicate.
    expect(isInsufficientScopeError(err)).toBe(true)
    expect(initCodeClient).not.toHaveBeenCalled()
  })

  it('throws a plain error on a transient failure (5xx / network) — not a reconnect prompt', async () => {
    seed({ refreshToken: 'r', tokenExpiry: expired })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(oauthResponse(500, { error: 'Server misconfigured' }))
    let err = await ensureValidToken(EMAIL).catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(GmailScopeError)

    fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    err = await ensureValidToken(EMAIL).catch(e => e)
    expect(err).toBeInstanceOf(TypeError)
    expect(initCodeClient).not.toHaveBeenCalled()
  })

  it('throws GmailReauthRequiredError for an old-format account with no refresh token', async () => {
    seed({ tokenExpiry: expired })
    await expect(ensureValidToken(EMAIL)).rejects.toBeInstanceOf(GmailReauthRequiredError)
    expect(initCodeClient).not.toHaveBeenCalled()
  })

  it('interactive: true falls back to the popup, and a blocked popup now rejects instead of hanging', async () => {
    seed({ refreshToken: 'r', tokenExpiry: expired })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(oauthResponse(400, { error: 'invalid_grant' }))
    initCodeClient.mockImplementation((opts) => ({
      // GIS reports a blocked popup ONLY through error_callback.
      requestCode: () => opts.error_callback({ type: 'popup_failed_to_open', message: 'Popup blocked' }),
    }))
    // connectGmail rejected → last-resort stale token, exactly as before.
    await expect(ensureValidToken(EMAIL, { interactive: true })).resolves.toBe('stale')
    expect(initCodeClient).toHaveBeenCalledTimes(1)
  })
})

describe('encodeMimeHeader', () => {
  it('leaves plain ASCII headers untouched', () => {
    expect(encodeMimeHeader('Follow-up: Product Builder')).toBe('Follow-up: Product Builder')
  })

  it('wraps non-ASCII text in an RFC 2047 UTF-8 encoded-word that round-trips', () => {
    const subject = 'Suivi candidature — Product Builder (Léa)'
    const out = encodeMimeHeader(subject)
    const m = out.match(/^=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=$/)
    expect(m).not.toBeNull()
    expect(new TextDecoder().decode(Uint8Array.from(atob(m[1]), c => c.charCodeAt(0)))).toBe(subject)
  })

  it('handles empty / missing values', () => {
    expect(encodeMimeHeader('')).toBe('')
    expect(encodeMimeHeader()).toBe('')
  })
})

describe('isInsufficientScopeError', () => {
  it('matches the Gmail API 403 scope message (any casing)', () => {
    expect(isInsufficientScopeError(new Error('Request had insufficient authentication scopes.'))).toBe(true)
    expect(isInsufficientScopeError(new Error('INSUFFICIENT AUTHENTICATION SCOPES'))).toBe(true)
  })

  it('matches the OAuth insufficient_scope / insufficientPermissions variants', () => {
    expect(isInsufficientScopeError(new Error('insufficient_scope'))).toBe(true)
    expect(isInsufficientScopeError(new Error('403 insufficientPermissions'))).toBe(true)
  })

  it('recognizes a typed GmailScopeError and carries the account', () => {
    const e = new GmailScopeError('deviloufr@gmail.com')
    expect(isInsufficientScopeError(e)).toBe(true)
    expect(e.account).toBe('deviloufr@gmail.com')
    expect(e.name).toBe('GmailScopeError')
  })

  it('does NOT match unrelated errors (401, network, nullish)', () => {
    expect(isInsufficientScopeError(new Error('401 invalid token'))).toBe(false)
    expect(isInsufficientScopeError(new Error('Failed to fetch'))).toBe(false)
    expect(isInsufficientScopeError(null)).toBe(false)
    expect(isInsufficientScopeError(undefined)).toBe(false)
  })
})
