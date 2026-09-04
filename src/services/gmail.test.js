import { describe, it, expect } from 'vitest'
import { isInsufficientScopeError, GmailScopeError } from './gmail'

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
