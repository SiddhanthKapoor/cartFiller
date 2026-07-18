import { chooseBest } from '@/shared/matching'
import type { Ingredient } from '@/shared/types'
import {
  dropSoldOut,
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
const CONCURRENCY = 3 // stay under Blinkit's search rate limit, esp. on repeat runs

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
  // Rate limited (happens when the same list is filled again quickly) — back
  // off and retry generously so items don't get silently dropped. Honour the
  // server's Retry-After when present; otherwise exponential backoff + jitter.
  if ((res.status === 429 || res.status === 503) && attempt < 6) {
    const retryAfter = Number(res.headers.get('retry-after'))
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(8_000, retryAfter * 1000)
      : Math.min(6_000, 500 * 2 ** attempt) + Math.random() * 400
    await new Promise((r) => setTimeout(r, backoff))
    return searchProducts(query, headers, attempt + 1)
  }
  if (!res.ok) return []
  return dropSoldOut(parseBlinkitSearch(await res.json().catch(() => null)))
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
      // Use the shared ranking engine's pack math (handles count items like
      // eggs, multipacks, and count↔mass) so fast (Blinkit) and DOM (Zepto)
      // fills buy the same quantity for the same recipe.
      const quantity = Math.max(1, best.unitsToAdd)
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
    // Existing entries may not be in our shape (Blinkit rewrites the cart on
    // reload) — read the quantity defensively, never assume `.product`.
    const prev = items[key] as { quantity?: number } | undefined
    const existingQty = typeof prev?.quantity === 'number' ? prev.quantity : 0
    items[key] = { product: c.cartItem, quantity: Math.max(existingQty, c.quantity) }
  }

  // Guard every read: a foreign-shaped entry (no `.product`, no numeric
  // `.quantity`) must never throw here — a throw aborts the whole fill and the
  // cart silently doesn't fill. This is the "stops working after a refresh"
  // case, since after the first fill+reload the cart holds Blinkit's own entries.
  const values = Object.values(items) as Array<{ product?: { price?: number }; quantity?: number }>
  const count = values.reduce((s, x) => s + (typeof x?.quantity === 'number' ? x.quantity : 0), 0)
  const total = values.reduce(
    (s, x) => s + (x?.product?.price ?? 0) * (typeof x?.quantity === 'number' ? x.quantity : 0),
    0,
  )

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
 *
 * If `signal` aborts before the write (e.g. the caller's timeout already won
 * and the job fell back to the DOM flow), we skip the cart write so a
 * superseded fill can't clobber the cart the fallback is building.
 */
export async function blinkitFastFill(
  items: FastItem[],
  signal?: AbortSignal,
): Promise<FastResult[]> {
  const chosen = await chooseAll(items)
  if (!signal?.aborted) writeCart(chosen)
  return chosen.map((c) => c.result)
}
