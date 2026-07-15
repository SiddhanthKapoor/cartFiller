import blinkit from './brands/blinkit.svg'
import zepto from './brands/zepto.svg'
import swiggy from './brands/swiggy.svg'
import gemini from './brands/gemini.svg'
import claude from './brands/claude.svg'
import openai from './brands/openai.svg'
import groq from './brands/groq.svg'
import openrouter from './brands/openrouter.svg'
import type { ProviderId } from '@/shared/types'
import type { AiProviderKey } from '@/shared/aiProviders'

/** Real brand marks (downloaded SVGs), rendered as <img>. */
export const AI_LOGO: Record<AiProviderKey, string> = {
  gemini,
  claude,
  openai,
  groq,
  openrouter,
}

export const STORE_LOGO: Record<ProviderId, string> = {
  blinkit,
  zepto,
  instamart: swiggy,
}
