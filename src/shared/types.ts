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
    accent: '#F8CB46',
  },
  zepto: {
    id: 'zepto',
    label: 'Zepto',
    host: 'www.zeptonow.com',
    accent: '#950EDB',
  },
  instamart: {
    id: 'instamart',
    label: 'Instamart',
    host: 'www.swiggy.com',
    accent: '#FC8019',
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
}

// ---------- Settings ----------

export interface AiSettings {
  apiKey: string
  baseUrl: string
  model: string
}

export interface Settings {
  ai: AiSettings
  skipPantryStaples: boolean
  budgetInr: number | null
}

export const DEFAULT_SETTINGS: Settings = {
  ai: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  skipPantryStaples: false,
  budgetInr: null,
}

export interface SavedMeal {
  list: ShoppingList
  favorite: boolean
  lastUsedAt: number
}
