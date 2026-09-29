import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  normalizeProvider,
  systemToText,
  toGeminiParts,
  toOpenAIContent,
  resolveAiCredentials,
  missingKeyMessage,
  callAiMessages,
  geminiMaxOutputTokens,
  GEMINI_THINKING_HEADROOM,
} from '../../api/_lib/aiProvider.js'

afterEach(() => { vi.unstubAllGlobals() })

describe('normalizeProvider', () => {
  it('passes known providers and defaults everything else to anthropic', () => {
    expect(normalizeProvider('gemini')).toBe('gemini')
    expect(normalizeProvider('OpenAI')).toBe('openai')
    expect(normalizeProvider('anthropic')).toBe('anthropic')
    expect(normalizeProvider('unknown')).toBe('anthropic')
    expect(normalizeProvider(undefined)).toBe('anthropic')
  })
})

describe('systemToText', () => {
  it('flattens string, cache-control array, and empty inputs', () => {
    expect(systemToText('hi')).toBe('hi')
    expect(systemToText([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])).toBe('a\nb')
    expect(systemToText(undefined)).toBe('')
  })
})

describe('toGeminiParts', () => {
  it('maps a plain string to a single text part', () => {
    expect(toGeminiParts('hello')).toEqual([{ text: 'hello' }])
  })
  it('maps text + image/document blocks to inline_data', () => {
    const parts = toGeminiParts([
      { type: 'text', text: 'describe' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBB' } },
    ])
    expect(parts).toEqual([
      { text: 'describe' },
      { inline_data: { mime_type: 'image/png', data: 'AAA' } },
      { inline_data: { mime_type: 'application/pdf', data: 'BBB' } },
    ])
  })
})

describe('toOpenAIContent', () => {
  it('keeps a string as-is and collapses an all-text array', () => {
    expect(toOpenAIContent('hi')).toBe('hi')
    expect(toOpenAIContent([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])).toBe('a\nb')
  })
  it('emits image_url for images and DROPS PDF document blocks', () => {
    const out = toOpenAIContent([
      { type: 'text', text: 'look' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'ZZZ' } },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'PDF' } },
    ])
    expect(out).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,ZZZ' } },
    ])
  })
})

describe('resolveAiCredentials', () => {
  it('anthropic with a user key: not shared, keeps the endpoint default model', () => {
    const c = resolveAiCredentials({ body: { provider: 'anthropic', apiKey: 'sk-ant-x' } }, 'claude-haiku-4-5-20251001')
    expect(c).toMatchObject({ provider: 'anthropic', apiKey: 'sk-ant-x', usesSharedKey: false, missingKey: false, model: 'claude-haiku-4-5-20251001' })
  })
  it('gemini requires a user key and uses the sent model', () => {
    expect(resolveAiCredentials({ body: { provider: 'gemini' } }).missingKey).toBe(true)
    const c = resolveAiCredentials({ body: { provider: 'gemini', apiKey: 'AIza', model: 'gemini-2.5-pro' } })
    expect(c).toMatchObject({ provider: 'gemini', apiKey: 'AIza', model: 'gemini-2.5-pro', usesSharedKey: false, missingKey: false })
  })
  it('openai needs BOTH a key and a base URL', () => {
    expect(resolveAiCredentials({ body: { provider: 'openai', apiKey: 'k' } }).missingKey).toBe(true)
    expect(resolveAiCredentials({ body: { provider: 'openai', baseUrl: 'https://x/v1' } }).missingKey).toBe(true)
    const c = resolveAiCredentials({ body: { provider: 'openai', apiKey: 'k', baseUrl: 'https://x/v1', model: 'llama' } })
    expect(c).toMatchObject({ provider: 'openai', apiKey: 'k', baseUrl: 'https://x/v1', missingKey: false })
  })
})

describe('missingKeyMessage', () => {
  it('mentions the base URL for OpenAI-compatible, just the key otherwise', () => {
    expect(missingKeyMessage({ provider: 'openai', baseUrl: null })).toMatch(/base URL/i)
    expect(missingKeyMessage({ provider: 'gemini' })).toMatch(/key/i)
  })
})

describe('callAiMessages → Gemini', () => {
  it('translates the request and maps the response back to Anthropic shape', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Hi ' }, { text: 'there' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 },
      }),
    }))
    vi.stubGlobal('fetch', mockFetch)

    const out = await callAiMessages({
      provider: 'gemini', apiKey: 'AIza', model: 'gemini-2.5-flash',
      system: 'sys', messages: [{ role: 'user', content: 'hello' }], max_tokens: 100,
    })

    expect(out.status).toBe(200)
    expect(out.data.content[0].text).toBe('Hi there')
    expect(out.data.stop_reason).toBe('end_turn')

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('models/gemini-2.5-flash:generateContent')
    expect(opts.headers['x-goog-api-key']).toBe('AIza')
    const body = JSON.parse(opts.body)
    expect(body.system_instruction.parts[0].text).toBe('sys')
    expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'hello' }] })
    // Thinking model → the caller's budget plus thinking headroom.
    expect(body.generationConfig.maxOutputTokens).toBe(100 + GEMINI_THINKING_HEADROOM)
  })

  it('adds no thinking headroom for non-thinking 1.x / 2.0 models', () => {
    expect(geminiMaxOutputTokens('gemini-2.0-flash', 600)).toBe(600)
    expect(geminiMaxOutputTokens('gemini-1.5-pro', 600)).toBe(600)
    expect(geminiMaxOutputTokens('gemini-3.6-flash', 600)).toBe(600 + GEMINI_THINKING_HEADROOM)
  })

  it('turns an empty / blocked answer into an error, not an empty success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }),
    })))
    const out = await callAiMessages({ provider: 'gemini', apiKey: 'k', model: 'gemini-3.6-flash', messages: [{ role: 'user', content: 'x' }] })
    expect(out.status).toBe(502)
    expect(out.data.error).toMatch(/MAX_TOKENS/)

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }),
    })))
    const blocked = await callAiMessages({ provider: 'gemini', apiKey: 'k', model: 'gemini-3.6-flash', messages: [{ role: 'user', content: 'x' }] })
    expect(blocked.status).toBe(502)
    expect(blocked.data.error).toMatch(/SAFETY/)
  })

  it('drops thought-summary parts from the answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"ok":1}' }] }, finishReason: 'STOP' }] }),
    })))
    const out = await callAiMessages({ provider: 'gemini', apiKey: 'k', model: 'gemini-3.6-flash', messages: [{ role: 'user', content: 'x' }] })
    expect(out.data.content[0].text).toBe('{"ok":1}')
  })

  it('passes a provider error through as { status, data.error }', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 400,
      json: async () => ({ error: { message: 'API key not valid' } }),
    })))

    const out = await callAiMessages({ provider: 'gemini', apiKey: 'bad', model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'x' }] })
    expect(out.status).toBe(400)
    expect(out.data.error).toBe('API key not valid')
  })
})
