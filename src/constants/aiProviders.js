// Catalogue of AI providers the app can talk to. All traffic still flows through
// the shared `/api/claude` proxy (which translates to the chosen provider), so
// adding a provider here is metadata only — no new Vercel function.
//
// Storage split (matches the "keys per-device, choice synced" decision):
//   • API keys        → per-provider localStorage key (NEVER synced). anthropic
//                       reuses the legacy 'jobtrackr_claude_api_key'.
//   • provider + model + base URL → live in the synced `settings` object
//     (settingsModelKey / settingsBaseUrlKey), so the choice follows the user
//     across devices while the secret key does not.
import { CLAUDE_MODEL } from './aiModel'

export const AI_PROVIDERS = {
  anthropic: {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    keyStorage: 'jobtrackr_claude_api_key',
    settingsModelKey: null, // pinned by VITE_CLAUDE_MODEL, not user-editable
    defaultModel: CLAUDE_MODEL,
    needsBaseUrl: false,
    free: false,
    keyPlaceholder: 'sk-ant-...',
    modelPlaceholder: CLAUDE_MODEL,
    keysUrl: 'https://console.anthropic.com/settings/keys',
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini (Google)',
    keyStorage: 'jobtrackr_ai_key_gemini',
    settingsModelKey: 'aiModelGemini',
    defaultModel: 'gemini-3.6-flash',
    needsBaseUrl: false,
    free: true,
    keyPlaceholder: 'AIza...',
    modelPlaceholder: 'gemini-3.6-flash',
    keysUrl: 'https://aistudio.google.com/app/apikey',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI-compatible (Groq, OpenRouter…)',
    keyStorage: 'jobtrackr_ai_key_openai',
    settingsModelKey: 'aiModelOpenai',
    settingsBaseUrlKey: 'aiBaseUrl',
    defaultModel: '',
    needsBaseUrl: true,
    free: true,
    keyPlaceholder: 'gsk_… / sk-or-…',
    modelPlaceholder: 'llama-3.3-70b-versatile',
    baseUrlPlaceholder: 'https://api.groq.com/openai/v1',
    keysUrl: 'https://console.groq.com/keys',
  },
}

export const AI_PROVIDER_IDS = ['anthropic', 'gemini', 'openai']
export const DEFAULT_AI_PROVIDER = 'anthropic'
