import { chooseBest, rankProducts, sameProduct } from '@/shared/matching'
import type { CardHandle } from './scrape'
import type { ContentCommand } from '@/shared/messages'
import type { MatchedProduct } from '@/shared/types'
import { currentSearchQuery } from '@/shared/providers'
import { pause, waitFor, waitForQuietDom } from './dom'
import { adapterFor } from './providers'
import { blinkitCartCount } from './providers/blinkitCart'
import { blinkitApiSearch, hasLocation } from './providers/blinkitSearch'
import { blinkitClientSearch } from './providers/blinkitNav'

type RunItemCommand = Extract<ContentCommand, { type: 'RUN_ITEM' }>

export type ItemOutcome =
  | { kind: 'navigated' }
  | { kind: 'result'; status: 'added' | 'skipped' | 'failed'; matched?: MatchedProduct; error?: string }

/**
 * Process one ingredient by driving the real page: search → pick the best
 * product → click its Add → confirm it actually landed in the cart.
 *
 * We add via the store's own Add button on purpose. Blinkit's cart lives in
 * app state (a direct cart API call returns 200 but writes to a throwaway
 * cart that never reaches checkout), so the only add that truly counts is
 * the one the page itself performs. For Blinkit we then verify against the
 * live cart count — the same number the "My Cart" badge shows — so a fill
 * is never reported as added unless it genuinely is.
 */
export async function runItem(command: RunItemCommand): Promise<ItemOutcome> {
  const adapter = adapterFor(command.provider)
  const { item } = command
  const isBlinkit = command.provider === 'blinkit'

  const url = new URL(location.href)
  const query = (currentSearchQuery(url) ?? '').trim().toLowerCase()
  const need = item.searchQuery.trim().toLowerCase()
  if (!adapter.isSearchPage(url) || query !== need) {
    if (isBlinkit) {
      // Search in-app (no full reload) — reliable where repeated full
      // navigations make Blinkit render blank result pages.
      const searched = await blinkitClientSearch(item.searchQuery)
      if (!searched) {
        await pause(150, 350)
        location.href = adapter.searchUrl(item.searchQuery)
        return { kind: 'navigated' }
      }
      // stay on the page; fall through to wait for the new results
    } else {
      await pause(150, 350)
      location.href = adapter.searchUrl(item.searchQuery)
      return { kind: 'navigated' }
    }
  }

  await waitForQuietDom()

  // Pick the product. On Blinkit we select from the clean search API and
  // wait for the matching card to render — this both gives better matches
  // and guarantees the DOM has refreshed to the new query (so we never click
  // a stale card left over from the previous ingredient).
  let pick: Pick | null = null
  if (isBlinkit && hasLocation()) {
    pick = await pickBlinkit(command, adapter)
  }
  if (!pick) {
    const cards = await waitFor(
      () => {
        const scraped = adapter.scrapeCards()
        return scraped.length > 0 ? scraped : null
      },
      { timeoutMs: 12_000, intervalMs: 300 },
    )
    if (!cards) {
      return {
        kind: 'result',
        status: 'skipped',
        error: `No products found for “${item.searchQuery}”`,
      }
    }
    pick = pickViaDom(command, cards)
  }

  if (!pick) {
    return {
      kind: 'result',
      status: 'skipped',
      error: `Nothing matched “${item.ingredient.name}” closely enough`,
    }
  }
  const { card, best } = pick

  // Ground-truth cart size before we touch anything (Blinkit only).
  const countBefore = isBlinkit ? blinkitCartCount() : null

  await pause()
  const clicked = await adapter.addToCart(card)

  // Confirm the item is really in the cart.
  const landed = await confirmAdded(isBlinkit, countBefore, clicked)
  if (!landed) {
    return {
      kind: 'result',
      status: 'failed',
      error: `“${best.name}” didn't land in the cart`,
    }
  }

  // Bump quantity for multi-pack needs, verifying each step where we can.
  let unitsAdded = 1
  for (let i = 1; i < best.unitsToAdd; i++) {
    await pause(300, 600)
    const beforeStep = isBlinkit ? blinkitCartCount() : null
    const bumped = await adapter.incrementQuantity(card)
    if (!bumped) break
    if (isBlinkit && beforeStep !== null) {
      const ok = await waitFor(
        () => {
          const c = blinkitCartCount()
          return c !== null && c > beforeStep ? c : null
        },
        { timeoutMs: 4_000, intervalMs: 200 },
      )
      if (!ok) break
    }
    unitsAdded++
  }

  return {
    kind: 'result',
    status: 'added',
    matched: {
      name: best.name,
      priceInr: best.priceInr,
      packText: best.packText,
      unitsAdded,
    },
  }
}

interface Pick {
  card: CardHandle
  best: { name: string; priceInr: number | null; packText: string; unitsToAdd: number }
}

/** Match against scraped DOM cards (fallback, and non-Blinkit providers). */
function pickViaDom(command: RunItemCommand, cards: CardHandle[]): Pick | null {
  const best = chooseBest(
    command.item.ingredient,
    command.item.searchQuery,
    cards.map((c) => c.product),
  )
  return best ? { card: cards[best.cardIndex], best } : null
}

/**
 * Rank products from Blinkit's clean search API, then wait for the best-
 * ranked one to appear as a rendered card we can click. Waiting on the
 * API-chosen product doubles as proof the DOM has refreshed to this query
 * (not stale cards from the previous ingredient). Returns null if the API
 * is unavailable so the caller can fall back to DOM scraping.
 */
async function pickBlinkit(
  command: RunItemCommand,
  adapter: ReturnType<typeof adapterFor>,
): Promise<Pick | null> {
  let apiProducts
  try {
    apiProducts = await blinkitApiSearch(command.item.searchQuery)
  } catch {
    return null
  }
  if (apiProducts.length === 0) return null

  const ranked = rankProducts(
    command.item.ingredient,
    command.item.searchQuery,
    apiProducts.map((p) => p.scraped),
  )
  if (ranked.length === 0) return null

  return waitFor(
    () => {
      const cards = adapter.scrapeCards()
      for (const product of ranked) {
        const card = cards.find((c) => sameProduct(product.name, c.product.name))
        if (card) return { card, best: product }
      }
      return null
    },
    { timeoutMs: 12_000, intervalMs: 300 },
  )
}

/**
 * Blinkit: trust only a rise in the live cart count. Other providers: trust
 * the adapter's DOM signal (a stepper appearing) since they expose no
 * equally reliable count to the content script.
 */
async function confirmAdded(
  isBlinkit: boolean,
  countBefore: number | null,
  clicked: boolean,
): Promise<boolean> {
  if (isBlinkit && countBefore !== null) {
    const ok = await waitFor(
      () => {
        const c = blinkitCartCount()
        return c !== null && c > countBefore ? c : null
      },
      { timeoutMs: 6_000, intervalMs: 250 },
    )
    return ok !== null
  }
  // Fallback: the adapter's own confirmation (stepper appeared / button gone).
  return clicked
}
