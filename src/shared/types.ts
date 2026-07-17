import { defaultModelFor, type AiProviderKey } from './aiProviders'

export type Unit =
  | 'g'
  | 'kg'
  | 'ml'
  | 'l'
  | 'piece'
  | 'packet'
  | 'bunch'
  | 'cup'
  | 'tbsp'
  | 'tsp'
  | 'pinch'

export type IngredientCategory =
  | 'produce'
  | 'dairy'
  | 'meat-fish'
  | 'grains-staples'
  | 'spices'
  | 'condiments'
  | 'packaged'
  | 'other'

export interface Ingredient {
  id: string
  name: string
  quantity: number
  unit: Unit
  optional: boolean
  pantryStaple: boolean
  category: IngredientCategory
  note?: string
}

export interface NutritionEstimate {
  caloriesPerServing: number
  proteinG: number
  carbsG: number
  fatG: number
}

export interface ShoppingList {
  id: string
  dish: string
  servings: number
  cuisine?: string
  ingredients: Ingredient[]
  estimatedCostInr: number
  nutrition?: NutritionEstimate
  createdAt: number
}

export type ProviderId = 'blinkit' | 'zepto' | 'instamart'

export interface ProviderMeta {
  id: ProviderId
  label: string
  host: string
  accent: string
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  blinkit: {
    id: 'blinkit',
    label: 'Blinkit',
    host: 'blinkit.com',
    accent: '#ffc53d', // yellow
  },
  zepto: {
    id: 'zepto',
    label: 'Zepto',
    host: 'www.zeptonow.com',
    accent: '#9b5de5', // purple
  },
  instamart: {
    id: 'instamart',
    label: 'Instamart',
    host: 'www.swiggy.com',
    accent: '#ff6a4d',
  },
}

// ---------- Cart-fill job ----------

export type ItemStatus =
  | 'pending'
  | 'running'
  | 'added'
  | 'skipped'
  | 'failed'

export interface MatchedProduct {
  name: string
  priceInr: number | null
  packText: string
  unitsAdded: number
}

export interface JobItem {
  ingredient: Ingredient
  searchQuery: string
  status: ItemStatus
  matched?: MatchedProduct
  error?: string
  /** set once the item has used its second-chance retry */
  retried?: boolean
  /** set after a stall already triggered one tab reload for this item */
  stalled?: boolean
}

export type JobStatus = 'running' | 'done' | 'cancelled' | 'error'

export interface FillJob {
  id: string
  provider: ProviderId
  dish: string
  tabId: number
  items: JobItem[]
  currentIndex: number
  status: JobStatus
  startedAt: number
  /** watchdog: last time the job made observable progress */
  lastProgressAt: number
  /** 'fast' = one-shot cart write (Blinkit); 'stepwise' = DOM per item */
  mode: 'fast' | 'stepwise'
  /** fast mode: whether the fill command has already been sent to the tab */
  dispatched?: boolean
  /** fast mode: how many times the watchdog has reloaded + retried the fill */
  fastRetries?: number
  /** set once a failed fast (API) fill has fallen back to the DOM click flow */
  fellBackToDom?: boolean
}

// ---------- Settings ----------

export interface AiSettings {
  provider: AiProviderKey
  model: string
  /** one key per provider — switching providers never leaks a key across */
  keys: Partial<Record<AiProviderKey, string>>
}

export interface Settings {
  ai: AiSettings
  skipPantryStaples: boolean
  budgetInr: number | null
}

export const DEFAULT_SETTINGS: Settings = {
  ai: {
    provider: 'gemini',
    model: defaultModelFor('gemini'),
    keys: {},
  },
  skipPantryStaples: false,
  budgetInr: null,
}

/** The key for the currently selected provider, if any. */
export function activeApiKey(ai: AiSettings): string {
  return ai.keys[ai.provider]?.trim() ?? ''
}

export interface SavedMeal {
  list: ShoppingList
  favorite: boolean
  lastUsedAt: number
}
