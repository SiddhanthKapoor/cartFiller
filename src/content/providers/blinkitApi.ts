import {
  parseBlinkitSearch,
  type BlinkitCartItem,
  type BlinkitProduct,
} from '@/shared/blinkit/parseSearch'

/**
 * Blinkit internal-API client, run from the content script so it inherits
 * the user's own logged-in session (cookies) and selected delivery location.
 * No credentials are scraped or bypassed — these are the same requests the
 * page itself makes, reverse-engineered from Blinkit's JS bundle:
 *
 *   search: POST /v1/layout/search?q=..&search_type=type_to_search
 *   cart:   POST /v5/carts/           (first add → creates cart)
 *           PUT  /v5/carts/{cartId}   (subsequent updates)
 *
 * The search request needs app + location headers or it 400s; lat/lon come
 * from the location the user already set on Blinkit.
 */

const ORIGIN = 'https://blinkit.com'

// Static client identifiers the web app sends (verified against live traffic).
const APP_HEADERS: Record<string, string> = {
  app_client: 'consumer_web',
  app_version: '1010101010',
  web_app_version: '1008010016',
}

function cookie(name: string): string | null {
  const hit = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null
}

/** Delivery location the user already picked, needed as request headers. */
export function readLatLon(): { lat: string; lon: string } | null {
  try {
    const loc = JSON.parse(localStorage.getItem('location') || 'null')
    const c = loc?.coords
    if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) {
      return { lat: String(c.lat), lon: String(c.lon) }
    }
  } catch {
    /* fall through to cookies */
  }
  const lat = cookie('gr_1_lat')
  const lon = cookie('gr_1_lon')
  return lat && lon ? { lat, lon } : null
}

/** Device id the cart endpoint requires as a header (from Blinkit's cookie). */
export function readDeviceId(): string | null {
  return cookie('gr_1_deviceId')
}

function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const ll = readLatLon()
  return {
    'content-type': 'application/json',
    ...APP_HEADERS,
    ...(ll ? { lat: ll.lat, lon: ll.lon } : {}),
    ...extra,
  }
}

export function hasLocation(): boolean {
  return readLatLon() !== null
}

/** Search products via the layout API. Throws on non-2xx so the caller can fall back. */
export async function blinkitApiSearch(query: string): Promise<BlinkitProduct[]> {
  const url = `${ORIGIN}/v1/layout/search?q=${encodeURIComponent(query)}&search_type=type_to_search`
  const res = await fetch(url, {
    method: 'POST',
    headers: apiHeaders(),
    credentials: 'include',
    body: JSON.stringify({ applied_filters: null, previous_search_query: query }),
  })
  if (!res.ok) throw new Error(`search HTTP ${res.status}`)
  const json = await res.json()
  return parseBlinkitSearch(json).filter((p) => !p.soldOut)
}

export interface CartAddResult {
  ok: boolean
  reason?: string
}

/**
 * Add a product to the cart at the given quantity via /v5/carts.
 * Returns ok:false (rather than throwing) so the runner can fall back to the
 * DOM click. Because we can only confirm this write on a live logged-in
 * session, the success check is deliberately strict.
 */
export async function blinkitApiAddToCart(
  item: BlinkitCartItem,
  quantity: number,
): Promise<CartAddResult> {
  const qty = Math.max(1, Math.min(quantity, item.inventory ?? quantity))
  const body = {
    items: [
      {
        product_id: item.product_id,
        quantity: qty,
        merchant_id: item.merchant_id,
        ...(item.group_id ? { group_id: item.group_id } : {}),
      },
    ],
  }

  const deviceId = readDeviceId()
  if (!deviceId) return { ok: false, reason: 'no device id' }

  let res: Response
  try {
    res = await fetch(`${ORIGIN}/v5/carts/`, {
      method: 'POST',
      headers: apiHeaders({ qd_sdk_request: 'true', device_id: deviceId }),
      credentials: 'include',
      body: JSON.stringify(body),
    })
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'network' }
  }
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  return cartResponseContains(json, item.product_id)
    ? { ok: true }
    : { ok: false, reason: 'item not reflected in cart response' }
}

/** Best-effort check that the cart response actually contains our product. */
function cartResponseContains(json: unknown, productId: number): boolean {
  if (!json || typeof json !== 'object') return false
  if ((json as { is_success?: boolean }).is_success === false) return false
  // A rejected write comes back as an error envelope, not a cart.
  if ('error_message' in json || 'response_data' in json) return false
  const text = JSON.stringify(json)
  if (!text.includes(String(productId))) return false
  // Require a cart-shaped key so a stray id match can't false-positive.
  // (Verified success shape: {"cart_type":"product", ...,"total_items":N,"items":[…]})
  return /"cart_type"|"total_items"|"cart_items"|"cart_id"|"cartId"|"total_quantity"/.test(text)
}

export type { BlinkitProduct, BlinkitCartItem }
