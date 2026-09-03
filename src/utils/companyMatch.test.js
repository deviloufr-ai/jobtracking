import { describe, it, expect } from 'vitest'
import {
  normalizeCompanyText, companyTokens, distinctiveCompanyToken, textMatchesCompany,
} from './companyMatch'

describe('normalizeCompanyText', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalizeCompanyText('Wivoo, a Wavestone Company')).toBe('wivoo a wavestone company')
    expect(normalizeCompanyText('Société Générale')).toBe('societe generale')
  })
})

describe('companyTokens', () => {
  it('keeps distinctive tokens and drops legal / generic words', () => {
    expect(companyTokens('Wivoo, a Wavestone Company')).toEqual(['wivoo', 'wavestone'])
    expect(companyTokens('Acme Technologies SAS')).toEqual(['acme'])
    expect(companyTokens('Groupe SEB')).toEqual(['seb'])
  })
})

describe('distinctiveCompanyToken', () => {
  it('returns the first distinctive token for a calendar/Gmail query', () => {
    expect(distinctiveCompanyToken('Wivoo, a Wavestone Company')).toBe('wivoo')
    expect(distinctiveCompanyToken('Indeed')).toBe('indeed')
  })
  it('falls back to the longest word when everything is a stopword', () => {
    expect(distinctiveCompanyToken('The Group')).toBe('group')
  })
})

describe('textMatchesCompany', () => {
  it('matches a calendar title to a job on a shared distinctive token', () => {
    // The bug: job company "Wivoo, a Wavestone Company" vs invite title below.
    expect(
      textMatchesCompany('Alexandre x Sophie : Premier échange Wivoo', 'Wivoo, a Wavestone Company')
    ).toBe(true)
  })
  it('still matches on full-name containment (legacy behavior)', () => {
    expect(textMatchesCompany('Entretien Datadog RH', 'Datadog')).toBe(true)
  })
  it('does not match on an unrelated title', () => {
    expect(textMatchesCompany('Rendez-vous dentiste', 'Wivoo, a Wavestone Company')).toBe(false)
  })
  it('token matching is whole-word, not substring', () => {
    // "ion" (a token of "Ion Trading") must NOT match "Champion" via substring.
    expect(textMatchesCompany('Champion offsite', 'Ion Trading')).toBe(false)
  })
})
