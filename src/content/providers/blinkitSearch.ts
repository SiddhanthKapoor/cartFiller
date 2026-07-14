import { parseBlinkitSearch, type BlinkitApiProduct } from '@/shared/blinkit/parseSearch'

/**
 * Read-only Blinkit search via the site's own /v1/layout/search API, run
 * from the content script on the user's session. We use it purely to pick
 * the best product (clean structured data beats scraping noisy DOM text);
 * the add is still a real button click. No cart writes, no auth bypass.
 */

const ORIGIN = 'https://blinkit.com'
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

/** Delivery location the user already picked; the search API 400s without it. */
function readLatLon(): { lat: string; lon: string } | null {
  try {
    const loc = JSON.parse(localStorage.getItem('location') || 'null')
    const c = loc?.coords
    if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) {
      return { lat: String(c.lat), lon: String(c.lon) }
    }
  } catch {
    /* fall through */
  }
  const lat = cookie('gr_1_lat')
  const lon = cookie('gr_1_lon')
  return lat && lon ? { lat, lon } : null
}

export function hasLocation(): boolean {
  return readLatLon() !== null
}

/**
 * Returns products best-first-ish as the API ordered them (the shared
 * ranking engine re-scores later). Throws on any failure so the caller can
 * fall back to DOM scraping.
 */
export async function blinkitApiSearch(query: string): Promise<BlinkitApiProduct[]> {
  const ll = readLatLon()
  if (!ll) throw new Error('no location')

  const res = await fetch(
    `${ORIGIN}/v1/layout/search?q=${encodeURIComponent(query)}&search_type=type_to_search`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...APP_HEADERS, lat: ll.lat, lon: ll.lon },
      credentials: 'include',
      body: JSON.stringify({ applied_filters: null, previous_search_query: query }),
    },
  )
  if (!res.ok) throw new Error(`search HTTP ${res.status}`)
  const json = await res.json()
  return parseBlinkitSearch(json).filter((p) => !p.soldOut)
}
