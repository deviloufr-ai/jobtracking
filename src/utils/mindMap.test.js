import { describe, it, expect } from 'vitest'
import {
  parseMindMap, normalizeMindMap, mnemonicFor, drillDeck, hasMindMap, buildMindMapPrompt, initialOf,
  askedQuestions, drillOrder, recordDrillResult, finishDrill, drillSummary,
} from './mindMap'

const kw = (word, questions = ['Q?']) => ({ word, story: 's', questions, cue: { S: 's', T: 't', A: 'a', R: 'r' }, proof: '+10%' })
const sample = {
  pitch: 'PM who ships.',
  mnemonic: { word: 'LID', sentence: 'Put a lid on it.' },
  tips: ['Walk it clockwise'],
  branches: [
    { label: 'Leadership', icon: '🧭', keywords: [kw('Squad of 3', ['Lead with few resources?', 'Tough deadline?'])] },
    { label: '🎯 Impact', icon: '📈', keywords: [kw('Retention J7')] },
    { label: 'Data', icon: '📊', keywords: [kw('SQL funnel')] },
  ],
}

describe('mindMap', () => {
  it('parses JSON wrapped in fences and prose', () => {
    const map = parseMindMap('Here you go:\n```json\n' + JSON.stringify(sample) + '\n```')
    expect(map.branches).toHaveLength(3)
    expect(map.branches[0].keywords[0].questions).toHaveLength(2)
  })

  it('returns null on unusable output', () => {
    expect(parseMindMap('no json here')).toBeNull()
    expect(parseMindMap('{"branches": [')).toBeNull()
    expect(normalizeMindMap({ branches: [{ label: 'x', keywords: [] }] })).toBeNull()
  })

  it('caps branches and keywords so the radial layout never overflows', () => {
    const big = { branches: Array.from({ length: 9 }, (_, i) => ({ label: `B${i}`, keywords: Array.from({ length: 6 }, (_, j) => kw(`k${j}`)) })) }
    const map = normalizeMindMap(big)
    expect(map.branches).toHaveLength(6)
    expect(map.branches.every(b => b.keywords.length === 3)).toBe(true)
  })

  it('trusts the mnemonic only when it matches the branch initials', () => {
    const map = normalizeMindMap(sample)
    expect(initialOf('🎯 Impact')).toBe('I')
    expect(mnemonicFor(map)).toEqual({ letters: ['L', 'I', 'D'], sentence: 'Put a lid on it.' })
    const wrong = normalizeMindMap({ ...sample, mnemonic: { word: 'NOPE', sentence: 'x' } })
    expect(mnemonicFor(wrong).sentence).toBe('')
  })

  it('builds one drill card per question', () => {
    const deck = drillDeck(normalizeMindMap(sample))
    expect(deck).toHaveLength(4)
    expect(deck[1]).toEqual({ q: 'Tough deadline?', bi: 0, ki: 0 })
  })

  it('treats a reset ({}) map as absent', () => {
    expect(hasMindMap({ mindMap: {} })).toBe(false)
    expect(hasMindMap({ mindMap: normalizeMindMap(sample) })).toBe(true)
  })

  it('feeds saved STAR stories and example questions into the prompt', () => {
    const prompt = buildMindMapPrompt({
      job: {
        company: 'Acme', position: 'PM',
        starSaved: { stars: [{ question: 'Conflict?', S: 'CTO wanted ML', T: 't', A: 'a', R: 'r' }] },
        interviewExamples: { screening: { data: { questions: [{ q: 'Why Acme?' }] } } },
      },
    })
    expect(prompt).toContain('CTO wanted ML')
    expect(prompt).toContain('- Why Acme?')
  })

  it('mines the questions an interviewer actually asked in saved mock sessions', () => {
    const job = {
      interviewSessions: [
        { kind: 'mock', transcript: [
          { role: 'interviewer', text: 'Good answer, concrete. Now, how did you prioritise when the CTO disagreed?' },
          { role: 'candidate', text: 'I ran a scoring workshop.' },
          { role: 'interviewer', text: 'Thanks, that is all.' },
        ] },
        { kind: 'real', transcript: [{ role: 'transcript', text: 'raw unlabelled text? maybe' }] },
      ],
    }
    expect(askedQuestions(job)).toEqual(['Now, how did you prioritise when the CTO disagreed?'])
    expect(buildMindMapPrompt({ job })).toContain('ACTUALLY asked')
  })

  it('orders a drill session weak-first, then never-drilled, then nailed', () => {
    const deck = [{ q: 'A' }, { q: 'B' }, { q: 'C' }]
    let drill = recordDrillResult(recordDrillResult({}, 'A', true), 'A', true)
    drill = recordDrillResult(recordDrillResult(drill, 'B', false), 'B', false)
    expect(drillOrder(deck, drill)).toEqual([1, 2, 0])
    expect(drill.results.B).toMatchObject({ got: 0, miss: 2, lastOk: false })
  })

  it('summarises the last completed session, and none before the first', () => {
    expect(drillSummary({ branches: [] })).toBeNull()
    const done = finishDrill(recordDrillResult({}, 'A', false), 4, 1)
    expect(done.sessions).toBe(1)
    expect(drillSummary({ drill: done })).toMatchObject({ sessions: 1, lastTotal: 4, lastMissed: 1 })
    // Model output never carries drill state, so a regenerated map starts clean.
    expect(normalizeMindMap({ branches: [{ label: 'x', keywords: [{ word: 'k' }] }], drill: done }).drill).toBeUndefined()
  })
})
