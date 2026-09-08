import { describe, it, expect } from 'vitest'
import { sanitizeFilename } from './fileSave'

describe('sanitizeFilename', () => {
  it('replaces the "/" in French job titles (H/F) that broke native writeFile', () => {
    expect(sanitizeFilename('Jean Dupont - Product Manager H/F.pdf'))
      .toBe('Jean Dupont - Product Manager H-F.pdf')
  })
  it('replaces every path-illegal character', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j.pdf')).toBe('a-b-c-d-e-f-g-h-i-j.pdf')
  })
  it('keeps the extension dot and inner dots', () => {
    expect(sanitizeFilename('CV v1.2.pdf')).toBe('CV v1.2.pdf')
  })
  it('trims leading/trailing dots and spaces', () => {
    expect(sanitizeFilename('  ..résumé..  ')).toBe('résumé')
  })
  it('falls back to a default when the name cleans to empty', () => {
    expect(sanitizeFilename('')).toBe('download')
    expect(sanitizeFilename(null)).toBe('download')
    expect(sanitizeFilename('   ...   ')).toBe('download')
  })
})
