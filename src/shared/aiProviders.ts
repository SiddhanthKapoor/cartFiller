export type AiProviderKey = 'gemini' | 'claude' | 'openai' | 'groq' | 'openrouter'

export interface AiProviderDef {
  key: AiProviderKey
  label: string
  /** which wire protocol the client should speak */
  kind: 'openai-compatible' | 'anthropic'
  /** handled internally — never shown in the UI */
  baseUrl: string
  /** first entry is the default */
  models: string[]
  keyHint: string
  keyPlaceholder: string
}

export const AI_PROVIDERS: Record<AiProviderKey, AiProviderDef> = {
  gemini: {
    key: 'gemini',
    label: 'Gemini',
    kind: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
    keyHint: 'Free key at aistudio.google.com/apikey',
    keyPlaceholder: 'AIza…',
  },
  claude: {
    key: 'claude',
    label: 'Claude',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-sonnet-5', 'claude-haiku-4-5-20251001', 'claude-opus-4-8'],
    keyHint: 'Key at console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
  },
  openai: {
    key: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    keyHint: 'Key at platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
  },
  groq: {
    key: 'groq',
    label: 'Groq',
    kind: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    keyHint: 'Free key at console.groq.com/keys',
    keyPlaceholder: 'gsk_…',
  },
  openrouter: {
    key: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      'google/gemini-2.5-flash',
      'openai/gpt-4o-mini',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    keyHint: 'Key at openrouter.ai/keys',
    keyPlaceholder: 'sk-or-…',
  },
}

export const AI_PROVIDER_LIST = Object.values(AI_PROVIDERS)

export function defaultModelFor(provider: AiProviderKey): string {
  return AI_PROVIDERS[provider].models[0]
}
