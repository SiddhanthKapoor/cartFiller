import type { AiSettings, FillJob, SavedMeal, Settings, ShoppingList } from './types'
import { DEFAULT_SETTINGS } from './types'
import { AI_PROVIDERS, defaultModelFor, type AiProviderKey } from './aiProviders'

const KEYS = {
  settings: 'cookcart.settings',
  meals: 'cookcart.meals',
  activeJob: 'cookcart.activeJob',
  captures: 'cookcart.captures',
} as const

const MAX_CAPTURES = 30

const MAX_MEALS = 30

// ---------- settings ----------

/** Shape used before per-provider keys existed (v1). */
interface LegacyAiSettings {
  apiKey: string
  baseUrl: string
  model: string
}

function migrateAi(stored: unknown): AiSettings {
  if (!stored || typeof stored !== 'object') return DEFAULT_SETTINGS.ai

  // v1 -> v2: single apiKey + baseUrl becomes provider + per-provider keys
  if ('apiKey' in stored) {
    const legacy = stored as LegacyAiSettings
    const provider: AiProviderKey = legacy.baseUrl?.includes('googleapis')
      ? 'gemini'
      : legacy.baseUrl?.includes('groq')
        ? 'groq'
        : legacy.baseUrl?.includes('openrouter')
          ? 'openrouter'
          : 'openai'
    return {
      provider,
      model: AI_PROVIDERS[provider].models.includes(legacy.model)
        ? legacy.model
        : defaultModelFor(provider),
      keys: legacy.apiKey ? { [provider]: legacy.apiKey } : {},
    }
  }

  const ai = { ...DEFAULT_SETTINGS.ai, ...(stored as Partial<AiSettings>) }
  if (!AI_PROVIDERS[ai.provider]) ai.provider = DEFAULT_SETTINGS.ai.provider
  if (!AI_PROVIDERS[ai.provider].models.includes(ai.model)) {
    ai.model = defaultModelFor(ai.provider)
  }
  return ai
}

export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(KEYS.settings)
  const stored = raw[KEYS.settings] as Partial<Settings> | undefined
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    ai: migrateAi(stored?.ai),
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEYS.settings]: settings })
}

// ---------- observed API captures (developer tool) ----------

/** One tapped store request/response, as recorded by the page observer. */
export interface ApiCapture {
  at: number
  kind: 'fetch' | 'xhr'
  method: string
  url: string
  reqHeaders: Record<string, string>
  reqBody: string | null
  status: number
  respBody: string
  isCart: boolean
}

export async function getCaptures(): Promise<ApiCapture[]> {
  const raw = await chrome.storage.local.get(KEYS.captures)
  const list = raw[KEYS.captures]
  return Array.isArray(list) ? (list as ApiCapture[]) : []
}

/** Append newly observed calls, keeping only the most recent MAX_CAPTURES. */
export async function appendCaptures(items: ApiCapture[]): Promise<void> {
  if (items.length === 0) return
  const existing = await getCaptures()
  const next = [...existing, ...items].slice(-MAX_CAPTURES)
  await chrome.storage.local.set({ [KEYS.captures]: next })
}

export async function clearCaptures(): Promise<void> {
  await chrome.storage.local.remove(KEYS.captures)
}

// ---------- saved meals (history + favorites) ----------

export async function getMeals(): Promise<SavedMeal[]> {
  const raw = await chrome.storage.local.get(KEYS.meals)
  return (raw[KEYS.meals] as SavedMeal[] | undefined) ?? []
}

/** Insert or refresh a meal at the top of history, keeping favorites safe from eviction. */
export async function saveMeal(list: ShoppingList): Promise<void> {
  const meals = await getMeals()
  const existing = meals.find((m) => m.list.id === list.id)
  const next: SavedMeal = {
    list,
    favorite: existing?.favorite ?? false,
    lastUsedAt: Date.now(),
  }
  const rest = meals.filter((m) => m.list.id !== list.id)
  const merged = [next, ...rest].sort((a, b) => b.lastUsedAt - a.lastUsedAt)

  const favorites = merged.filter((m) => m.favorite)
  const others = merged.filter((m) => !m.favorite).slice(0, MAX_MEALS - favorites.length)
  await chrome.storage.local.set({
    [KEYS.meals]: [...favorites, ...others].sort((a, b) => b.lastUsedAt - a.lastUsedAt),
  })
}

export async function toggleFavorite(listId: string): Promise<SavedMeal[]> {
  const meals = await getMeals()
  const next = meals.map((m) =>
    m.list.id === listId ? { ...m, favorite: !m.favorite } : m,
  )
  await chrome.storage.local.set({ [KEYS.meals]: next })
  return next
}

export async function deleteMeal(listId: string): Promise<SavedMeal[]> {
  const next = (await getMeals()).filter((m) => m.list.id !== listId)
  await chrome.storage.local.set({ [KEYS.meals]: next })
  return next
}

// ---------- active fill job ----------

export async function getActiveJob(): Promise<FillJob | null> {
  const raw = await chrome.storage.local.get(KEYS.activeJob)
  return (raw[KEYS.activeJob] as FillJob | undefined) ?? null
}

export async function setActiveJob(job: FillJob | null): Promise<void> {
  if (job === null) await chrome.storage.local.remove(KEYS.activeJob)
  else await chrome.storage.local.set({ [KEYS.activeJob]: job })
}

/** Subscribe to job changes (popup live progress). Returns an unsubscribe fn. */
export function onActiveJobChange(callback: (job: FillJob | null) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== 'local' || !(KEYS.activeJob in changes)) return
    callback((changes[KEYS.activeJob].newValue as FillJob | undefined) ?? null)
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
