import { describe, it, expect } from 'vitest'
import { extractUrl, isLinkedInUrl, looksLikeLinkedInShare, linkedInJobId } from './linkedinShare'

describe('extractUrl', () => {
  it('returns a bare URL unchanged', () => {
    expect(extractUrl('https://www.linkedin.com/jobs/view/4464810205/'))
      .toBe('https://www.linkedin.com/jobs/view/4464810205/')
  })
  it('pulls the URL out of shared text that prepends a title', () => {
    expect(extractUrl('Senior Product Manager https://www.linkedin.com/jobs/view/4464810205/'))
      .toBe('https://www.linkedin.com/jobs/view/4464810205/')
  })
  it('trims trailing sentence punctuation', () => {
    expect(extractUrl('Check this out: https://lnkd.in/abcдEF.'))
      .toBe('https://lnkd.in/abcдEF')
  })
  it('returns empty string when there is no URL', () => {
    expect(extractUrl('no link here')).toBe('')
    expect(extractUrl('')).toBe('')
    expect(extractUrl(null)).toBe('')
  })
})

describe('isLinkedInUrl', () => {
  it('matches linkedin.com and its subdomains', () => {
    expect(isLinkedInUrl('https://www.linkedin.com/jobs/view/123456/')).toBe(true)
    expect(isLinkedInUrl('https://linkedin.com/jobs/view/123456')).toBe(true)
    expect(isLinkedInUrl('https://fr.linkedin.com/jobs/view/123456')).toBe(true)
  })
  it('matches the lnkd.in shortener', () => {
    expect(isLinkedInUrl('https://lnkd.in/abcDEF')).toBe(true)
  })
  it('rejects look-alike / unrelated hosts', () => {
    expect(isLinkedInUrl('https://notlinkedin.com/jobs/view/1')).toBe(false)
    expect(isLinkedInUrl('https://linkedin.com.evil.example/x')).toBe(false)
    expect(isLinkedInUrl('https://indeed.com/viewjob?jk=1')).toBe(false)
    expect(isLinkedInUrl('not a url')).toBe(false)
  })
})

describe('looksLikeLinkedInShare', () => {
  it('detects LinkedIn inside shared text', () => {
    expect(looksLikeLinkedInShare('Great role: https://www.linkedin.com/jobs/view/42/')).toBe(true)
  })
  it('is false for other job boards', () => {
    expect(looksLikeLinkedInShare('https://welcometothejungle.com/fr/jobs/x')).toBe(false)
  })
})

describe('linkedInJobId', () => {
  it('extracts the id from a canonical /jobs/view/<id> link', () => {
    expect(linkedInJobId('https://www.linkedin.com/jobs/view/4464810205/')).toBe('4464810205')
  })
  it('extracts the id from a slugged /jobs/view/<slug>-<id> link', () => {
    expect(linkedInJobId('https://www.linkedin.com/jobs/view/senior-product-manager-at-kanbios-4464810205'))
      .toBe('4464810205')
  })
  it('reads ?currentJobId from a collections/search page', () => {
    expect(linkedInJobId('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4464810205'))
      .toBe('4464810205')
  })
  it('returns null for a non-LinkedIn or id-less link', () => {
    expect(linkedInJobId('https://www.linkedin.com/feed/')).toBe(null)
    expect(linkedInJobId('https://indeed.com/viewjob?jk=abc')).toBe(null)
    expect(linkedInJobId('https://lnkd.in/abcDEF')).toBe(null)
  })
})
