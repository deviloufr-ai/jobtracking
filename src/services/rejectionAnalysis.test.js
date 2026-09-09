import { describe, it, expect } from 'vitest'
import { parseAnalysisJson } from './rejectionAnalysis'

describe('parseAnalysisJson', () => {
  it('parses clean JSON', () => {
    expect(parseAnalysisJson('{"summary":"ok","findings":[]}')).toEqual({ summary: 'ok', findings: [] })
  })

  it('strips a ```json fence', () => {
    const raw = '```json\n{"summary":"ok"}\n```'
    expect(parseAnalysisJson(raw)).toEqual({ summary: 'ok' })
  })

  it('drops preamble prose before the object', () => {
    expect(parseAnalysisJson('Here is your analysis:\n{"leak":"before_reply"}')).toEqual({ leak: 'before_reply' })
  })

  it('drops trailing prose after the object', () => {
    expect(parseAnalysisJson('{"leak":"mixed"} Hope this helps!')).toEqual({ leak: 'mixed' })
  })

  it('salvages a response truncated mid-string (the max_tokens bug)', () => {
    // Model was cut off inside the last finding's "detail" value.
    const raw = '{"summary":"Two leaks.","findings":[{"title":"ATS filtered","detail":"Your CV impact is low and the postin'
    const out = parseAnalysisJson(raw)
    expect(out.summary).toBe('Two leaks.')
    expect(out.findings[0].title).toBe('ATS filtered')
    // the partial detail is preserved (closed), not lost
    expect(out.findings[0].detail).toContain('Your CV impact is low')
  })

  it('salvages truncation right after a dangling key', () => {
    const raw = '{"summary":"ok","findings":[{"title":"X","detail":'
    const out = parseAnalysisJson(raw)
    expect(out.summary).toBe('ok')
    expect(out.findings[0].title).toBe('X')
  })

  it('salvages a truncated array with one complete element', () => {
    const raw = '{"cvRules":["Lead with quantified impact","Mirror the seniority tit'
    const out = parseAnalysisJson(raw)
    expect(out.cvRules[0]).toBe('Lead with quantified impact')
    expect(out.cvRules.length).toBeGreaterThanOrEqual(1)
  })

  it('throws a clear error when there is no JSON at all', () => {
    expect(() => parseAnalysisJson('the model refused')).toThrow(/No JSON object/)
  })
})
