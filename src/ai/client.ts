import type { AiSettings, Ingredient, ShoppingList } from '@/shared/types'
import { activeApiKey } from '@/shared/types'
import { AI_PROVIDERS } from '@/shared/aiProviders'
import { normalizeIngredient } from '@/shared/normalize'
import { toBase, UNIT_INFO } from '@/shared/units'
import { aiResponseSchema, type AiResponse } from './schema'
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt'

export type AiErrorCode = 'no-key' | 'auth' | 'http' | 'network' | 'parse'

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AiError'
  }
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

async function chatCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  userPrompt: string,
  useJsonMode: boolean,
): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
  } catch {
    throw new AiError('network', 'Could not reach the AI provider. Check your connection.')
  }

  if (response.status === 401 || response.status === 403) {
    throw new AiError('auth', 'The API key was rejected. Check it in Settings.')
  }

  if (!response.ok) {
    // Some OpenAI-compatible providers reject response_format — retry once without it.
    if (useJsonMode && response.status === 400) {
      return chatCompletion(baseUrl, apiKey, model, userPrompt, false)
    }
    const body = (await response.json().catch(() => null)) as ChatCompletionResponse | null
    throw new AiError('http', body?.error?.message ?? `AI request failed (${response.status}).`)
  }

  const body = (await response.json()) as ChatCompletionResponse
  const content = body.choices?.[0]?.message?.content
  if (!content) throw new AiError('parse', 'The AI returned an empty response.')
  return content
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>
  error?: { message?: string }
}

async function anthropicCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  userPrompt: string,
): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
  } catch {
    throw new AiError('network', 'Could not reach Anthropic. Check your connection.')
  }

  if (response.status === 401 || response.status === 403) {
    throw new AiError('auth', 'The API key was rejected. Check it in Settings.')
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as AnthropicResponse | null
    throw new AiError('http', body?.error?.message ?? `AI request failed (${response.status}).`)
  }

  const body = (await response.json()) as AnthropicResponse
  const content = body.content?.find((block) => block.type === 'text')?.text
  if (!content) throw new AiError('parse', 'The AI returned an empty response.')
  return content
}

/** Strip code fences and any stray prose around the JSON object. */
export function extractJson(raw: string): unknown {
  const unfenced = raw.replace(/```(?:json)?/gi, '').trim()
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start === -1 || end <= start) throw new AiError('parse', 'No JSON object in AI response.')
  try {
    return JSON.parse(unfenced.slice(start, end + 1))
  } catch {
    throw new AiError('parse', 'The AI returned malformed JSON.')
  }
}

/**
 * Backstop against the classic LLM failure of confusing what a recipe
 * consumes with what a store sells ("1 kg salt"). Seasonings and staples
 * carry a per-serving ceiling in the dictionary; anything above it is
 * clamped down to the ceiling.
 */
function clampToRecipeScale(ingredient: Ingredient, servings: number): Ingredient {
  const { maxPerServingBase } = normalizeIngredient(ingredient.name)
  if (!maxPerServingBase) return ingredient

  const base = toBase(ingredient.quantity, ingredient.unit)
  if (base.dimension === 'count') return ingredient

  const cap = maxPerServingBase * Math.max(1, servings)
  if (base.value <= cap) return ingredient

  return {
    ...ingredient,
    quantity: Math.round(cap * 10) / 10,
    unit: base.dimension === 'volume' ? 'ml' : 'g',
  }
}

/**
 * Validated AI response -> app ShoppingList:
 * normalizes names, merges duplicates, tags pantry staples and categories.
 */
export function toShoppingList(response: AiResponse): ShoppingList {
  const merged = new Map<string, Ingredient>()

  for (const item of response.ingredients) {
    const normalized = normalizeIngredient(item.name)
    const displayName = normalized.canonical
      .split(' ')
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ')

    const existing = merged.get(normalized.canonical)
    if (
      existing &&
      UNIT_INFO[existing.unit].dimension === UNIT_INFO[item.unit].dimension
    ) {
      // Same ingredient twice (e.g. "onion" for gravy + garnish): sum in base units.
      const sumBase =
        existing.quantity * UNIT_INFO[existing.unit].toBase +
        item.quantity * UNIT_INFO[item.unit].toBase
      merged.set(normalized.canonical, {
        ...existing,
        quantity: Number((sumBase / UNIT_INFO[existing.unit].toBase).toFixed(2)),
        optional: existing.optional && item.optional,
      })
      continue
    }
    if (existing) continue // dimension clash — keep the first occurrence

    merged.set(normalized.canonical, {
      id: crypto.randomUUID(),
      name: displayName,
      quantity: item.quantity,
      unit: item.unit,
      optional: item.optional,
      pantryStaple: normalized.pantryStaple,
      category: normalized.category,
    })
  }

  return {
    id: crypto.randomUUID(),
    dish: response.dish,
    servings: response.servings,
    cuisine: response.cuisine,
    ingredients: [...merged.values()].map((ing) =>
      clampToRecipeScale(ing, response.servings),
    ),
    estimatedCostInr: Math.round(response.estimatedCostInr ?? 0),
    nutrition: response.nutrition,
    createdAt: Date.now(),
  }
}

/** The main entry: dish request in, validated shopping list out. */
export async function generateShoppingList(
  query: string,
  settings: AiSettings,
): Promise<ShoppingList> {
  const apiKey = activeApiKey(settings)
  if (!apiKey) {
    throw new AiError('no-key', 'Add your API key in Settings to generate lists.')
  }

  const provider = AI_PROVIDERS[settings.provider]
  const userPrompt = buildUserPrompt(query)
  const content =
    provider.kind === 'anthropic'
      ? await anthropicCompletion(provider.baseUrl, apiKey, settings.model, userPrompt)
      : await chatCompletion(provider.baseUrl, apiKey, settings.model, userPrompt, true)
  const json = extractJson(content)

  const parsed = aiResponseSchema.safeParse(json)
  if (!parsed.success) {
    throw new AiError('parse', 'The AI response did not match the expected format. Try again.')
  }

  return toShoppingList(parsed.data)
}
