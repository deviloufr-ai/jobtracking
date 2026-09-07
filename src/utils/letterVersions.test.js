import { describe, it, expect } from 'vitest'
import { pushLetterVersion, restoreLetterVersion, MAX_LETTER_VERSIONS } from './letterVersions'

describe('pushLetterVersion', () => {
  it('creates the first version and sets it current', () => {
    const { letterSaved, letterVersions } = pushLetterVersion({}, 'Dear team, hello.')
    expect(letterSaved.content).toBe('Dear team, hello.')
    expect(letterVersions).toHaveLength(1)
    expect(letterVersions[0].content).toBe('Dear team, hello.')
    expect(letterVersions[0].id).toBeTruthy()
  })

  it('prepends a new version (newest first) when content changes', () => {
    const v1 = pushLetterVersion({}, 'first')
    const job = { letterSaved: v1.letterSaved, letterVersions: v1.letterVersions }
    const v2 = pushLetterVersion(job, 'second')
    expect(v2.letterVersions.map(v => v.content)).toEqual(['second', 'first'])
    expect(v2.letterSaved.content).toBe('second')
  })

  it('does not duplicate when saving identical content', () => {
    const v1 = pushLetterVersion({}, 'same')
    const job = { letterSaved: v1.letterSaved, letterVersions: v1.letterVersions }
    const v2 = pushLetterVersion(job, 'same')
    expect(v2.letterVersions).toHaveLength(1)
  })

  it('ignores blank content', () => {
    const job = { letterSaved: { content: 'keep' }, letterVersions: [{ id: 'x', content: 'keep' }] }
    const out = pushLetterVersion(job, '   ')
    expect(out.letterSaved.content).toBe('keep')
    expect(out.letterVersions).toHaveLength(1)
  })

  it('caps history at the maximum', () => {
    let job = {}
    for (let i = 0; i < MAX_LETTER_VERSIONS + 5; i++) {
      const out = pushLetterVersion(job, `version ${i}`)
      job = { letterSaved: out.letterSaved, letterVersions: out.letterVersions }
    }
    expect(job.letterVersions).toHaveLength(MAX_LETTER_VERSIONS)
    // Newest is kept, oldest dropped
    expect(job.letterVersions[0].content).toBe(`version ${MAX_LETTER_VERSIONS + 4}`)
  })
})

describe('restoreLetterVersion', () => {
  it('promotes a stored version back to current', () => {
    const v1 = pushLetterVersion({}, 'alpha')
    let job = { letterSaved: v1.letterSaved, letterVersions: v1.letterVersions }
    const v2 = pushLetterVersion(job, 'beta')
    job = { letterSaved: v2.letterSaved, letterVersions: v2.letterVersions }

    const alphaId = job.letterVersions.find(v => v.content === 'alpha').id
    const restored = restoreLetterVersion(job, alphaId)
    expect(restored.letterSaved.content).toBe('alpha')
    expect(restored.letterVersions[0].content).toBe('alpha')
  })

  it('returns null for an unknown version id', () => {
    expect(restoreLetterVersion({ letterVersions: [] }, 'nope')).toBeNull()
  })
})
