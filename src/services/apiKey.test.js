import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { aiText, TrialExhaustedError } from './apiKey'

const reply = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })

describe('aiText', () => {
  let fetchSpy
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch') })
  afterEach(() => { fetchSpy.mockRestore(); localStorage.clear() })

  it('POSTs to /api/claude and returns the first text block + stop reason', async () => {
    fetchSpy.mockReturnValue(reply(200, { content: [{ type: 'text', text: 'hello' }], stop_reason: 'end_turn' }))
    const out = await aiText({ model: 'm', max_tokens: 10, messages: [] })
    expect(out).toMatchObject({ text: 'hello', stopReason: 'end_turn' })
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/claude')
    // withUserApiKey may swap `model` for the configured provider's; the rest passes through.
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toMatchObject({ max_tokens: 10, provider: expect.any(String) })
  })

  it('surfaces the proxy error message whether it is a string or an {message} object', async () => {
    fetchSpy.mockReturnValueOnce(reply(500, { error: 'upstream down' }))
    await expect(aiText({})).rejects.toThrow('upstream down')
    fetchSpy.mockReturnValueOnce(reply(400, { error: { type: 'invalid_request_error', message: 'bad prompt' } }))
    await expect(aiText({})).rejects.toThrow('bad prompt')
    fetchSpy.mockReturnValueOnce(reply(502, 'not json'))
    await expect(aiText({})).rejects.toThrow('Generation failed: 502')
  })

  it('lets the 402 trial-exhausted signal through untouched', async () => {
    fetchSpy.mockReturnValue(reply(402, { error: 'trial over', code: 'TRIAL_EXHAUSTED' }))
    await expect(aiText({})).rejects.toBeInstanceOf(TrialExhaustedError)
  })
})
