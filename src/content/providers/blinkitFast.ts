import { chooseBest } from '@/shared/matching'
import type { Ingredient } from '@/shared/types'
import { toBase } from '@/shared/units'
import {
  parseBlinkitSearch,
  type BlinkitApiProduct,
  type BlinkitCartItem,
} from '@/shared/blinkit/parseSearch'

/**
 * Fast Blinkit fill.
 *
 * Blinkit keeps the live cart entirely in the page's own localStorage (`cart`)
 * — adding an item fires no server request; the app syncs to the account cart
 * at checkout. So instead of searching and clicking each ingredient in the DOM
 * (seconds per item), we look every ingredient up via the search API in
 * parallel, build the whole cart object, write it once, and reload so the app
 * hydrates it. A full cart lands in ~1s instead of minutes, on the current
 * tab, with no per-item automation to stall.
 *
 * These are the same requests + storage the site itself uses, on the user's
 * own logged-in session — nothing is scraped and no auth is bypassed.
 */

const ORIGIN = 'https://blinkit.com'
const APP_HEADERS: Record<string, string> = {
  app_client: 'consumer_web',
  app_version: '1010101010',
  web_app_version: '1008010016',
}
const CONCURRENCY = 4 // keeps us under Blinkit's search rate limit (no 429s)

function cookie(name: string): string | null {
  const hit = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null
}

function readLatLon(): { lat: string; lon: string } | null {
  try {
    const loc = JSON.parse(localStorage.getItem('location') || 'null')
    const c = loc?.coords
    if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) {
      return { lat: String(c.lat), lon: String(c.lon) }
    }
  } catch {
    /* cookies */
  }
  const lat = cookie('gr_1_lat')
  const lon = cookie('gr_1_lon')
  return lat && lon ? { lat, lon } : null
}

export function blinkitReady(): boolean {
  return readLatLon() !== null
}

/** Wait for the page to hydrate its delivery location (set async after load). */
export async function waitForBlinkitReady(timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (readLatLon() !== null) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

async function searchProducts(
  query: string,
  headers: Record<string, string>,
  attempt = 0,
): Promise<BlinkitApiProduct[]> {
  let res: Response
  try {
    res = await fetch(
      `${ORIGIN}/v1/layout/search?q=${encodeURIComponent(query)}&search_type=type_to_search`,
      {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ applied_filters: null, previous_search_query: query }),
        signal: AbortSignal.timeout(8_000),
      },
    )
  } catch {
    return []
  }
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    return searchProducts(query, headers, attempt + 1)
  }
  if (!res.ok) return []
  return parseBlinkitSearch(await res.json().catch(() => null)).filter((p) => !p.soldOut)
}

/** How many packs of the chosen product to cover the recipe quantity. */
function unitsFor(ingredient: Ingredient, product: BlinkitApiProduct): number {
  const pack = product.cartItem.unit
  const packMatch = pack ? /(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i.exec(pack) : null
  if (!packMatch) return 1
  const packBase =
    Number(packMatch[1]) * (/kg|l/i.test(packMatch[2]) ? 1000 : 1)
  const need = toBase(ingredient.quantity, ingredient.unit)
  if (need.dimension === 'count' || packBase <= 0) return 1
  return Math.min(5, Math.max(1, Math.ceil(need.value / packBase)))
}

export interface FastItem {
  ingredient: Ingredient
  searchQuery: string
}

export interface FastResult {
  index: number
  status: 'added' | 'skipped'
  matched?: { name: string; priceInr: number | null; packText: string; unitsAdded: number }
  error?: string
}

interface Chosen {
  result: FastResult
  cartItem?: BlinkitCartItem
  quantity: number
}

/** Search every ingredient (bounded concurrency) and choose the best match. */
async function chooseAll(items: FastItem[]): Promise<Chosen[]> {
  const headers = { 'content-type': 'application/json', ...APP_HEADERS, ...readLatLon() }
  const out: Chosen[] = new Array(items.length)
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++
      const { ingredient, searchQuery } = items[index]
      const products = await searchProducts(searchQuery, headers)
      const best = products.length
        ? chooseBest(
            ingredient,
            searchQuery,
            products.map((p) => p.scraped),
          )
        : null
      if (!best) {
        out[index] = {
          quantity: 0,
          result: {
            index,
            status: 'skipped',
            error: products.length
              ? `Nothing matched “${ingredient.name}”`
              : `No products for “${searchQuery}”`,
          },
        }
        continue
      }
      const product = products[best.cardIndex]
      const quantity = unitsFor(ingredient, product)
      out[index] = {
        quantity,
        cartItem: product.cartItem,
        result: {
          index,
          status: 'added',
          matched: {
            name: product.name,
            priceInr: product.cartItem.price,
            packText: product.cartItem.unit ?? '',
            unitsAdded: quantity,
          },
        },
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker))
  return out
}

interface StoredCart {
  count: number
  total: number
  chargeableDeliveryCost: number
  items: Record<string, { product: BlinkitCartItem; quantity: number }>
  promoInfo: unknown[]
  paymentMode: unknown
  step: unknown[]
  version: number
  promo_id: string
  CartAddressScreenVisible: boolean
  uniqueSkuInCart: number
  cart_type: string
}

/** Merge chosen products into the existing localStorage cart and persist it. */
function writeCart(chosen: Chosen[]): void {
  let cart: Partial<StoredCart> = {}
  try {
    cart = JSON.parse(localStorage.getItem('cart') || '{}')
  } catch {
    /* start fresh */
  }
  const items = cart.items ?? {}

  for (const c of chosen) {
    if (!c.cartItem) continue
    const key = String(c.cartItem.product_id)
    const existingQty = items[key]?.quantity ?? 0
    items[key] = { product: c.cartItem, quantity: Math.max(existingQty, c.quantity) }
  }

  const values = Object.values(items)
  const count = values.reduce((s, x) => s + x.quantity, 0)
  const total = values.reduce((s, x) => s + (x.product.price || 0) * x.quantity, 0)

  const next: StoredCart = {
    count,
    total,
    chargeableDeliveryCost: cart.chargeableDeliveryCost ?? 0,
    items,
    promoInfo: cart.promoInfo ?? [],
    paymentMode: cart.paymentMode ?? null,
    step: cart.step ?? [],
    version: cart.version ?? 1,
    promo_id: cart.promo_id ?? '',
    CartAddressScreenVisible: false,
    uniqueSkuInCart: values.length,
    cart_type: cart.cart_type ?? '',
  }
  localStorage.setItem('cart', JSON.stringify(next))
}

/**
 * Fill the whole cart. Returns per-item results. Writes localStorage.cart but
 * does NOT reload — the caller reloads so the app hydrates the new cart.
 */
export async function blinkitFastFill(items: FastItem[]): Promise<FastResult[]> {
  const chosen = await chooseAll(items)
  writeCart(chosen)
  return chosen.map((c) => c.result)
}
