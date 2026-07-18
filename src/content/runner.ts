import { chooseBest, tokenize } from '@/shared/matching'
import type { CardHandle } from './scrape'
import type { ContentCommand } from '@/shared/messages'
import type { MatchedProduct } from '@/shared/types'
import { currentSearchQuery } from '@/shared/providers'
import { pause, waitFor, waitForQuietDom } from './dom'
import { adapterFor } from './providers'
import { storeCartCount } from './providers/storeCart'
import { blinkitClientSearch } from './providers/blinkitNav'
import { clientSearch } from './providers/clientSearch'

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
  // Blinkit and Zepto are SPAs whose search box routes in-app; driving it beats
  // a full reload per ingredient (faster, and it dodges the blank-results pages
  // repeated navigations cause). Zepto also *signs* its search request, so this
  // is the only way to search it — the store performs and signs its own call.
  const useClientSearch = isBlinkit || command.provider === 'zepto'

  const url = new URL(location.href)
  const query = (currentSearchQuery(url) ?? '').trim().toLowerCase()
  const need = item.searchQuery.trim().toLowerCase()
  if (!adapter.isSearchPage(url) || query !== need) {
    if (useClientSearch) {
      // Search in-app (no full reload).
      const searched = isBlinkit
        ? await blinkitClientSearch(item.searchQuery)
        : await clientSearch(item.searchQuery)
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

  // Pick the product from the rendered results. On Blinkit we first wait for
  // the cards to actually reflect this query (not stale cards from the
  // previous ingredient) before ranking — no extra network calls, so no
  // rate limiting.
  const cards = await waitFor(
    () => {
      const scraped = adapter.scrapeCards()
      if (scraped.length === 0) return null
      if (useClientSearch && !cardsMatchQuery(scraped, item.searchQuery)) return null
      return scraped
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

  const pick = pickViaDom(command, cards)
  if (!pick) {
    return {
      kind: 'result',
      status: 'skipped',
      error: `Nothing matched “${item.ingredient.name}” closely enough`,
    }
  }
  const { card, best } = pick

  // Ground-truth cart size before we touch anything (Zepto exposes this in
  // localStorage; other providers fall back to the DOM signal).
  const provider = command.provider
  const countBefore = storeCartCount(provider)
  const canVerify = countBefore !== null

  await pause()
  const clicked = await adapter.addToCart(card)
  let landed = await confirmAdded(canVerify, countBefore, clicked, provider)

  // One retry for items that need a second gesture (variant sheet, slow
  // paint) — but only if the first attempt genuinely didn't land, so we
  // never double-add something that just registered late.
  if (!landed && canVerify && countBefore !== null) {
    const now = storeCartCount(provider)
    if (now !== null && now > countBefore) {
      landed = true
    } else {
      await pause(400, 700)
      await adapter.addToCart(card)
      landed = await confirmAdded(canVerify, countBefore, true, provider)
    }
  }

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
    const beforeStep = storeCartCount(provider)
    const bumped = await adapter.incrementQuantity(card)
    if (!bumped) break
    if (beforeStep !== null) {
      const ok = await waitFor(
        () => {
          const c = storeCartCount(provider)
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
 * Do the rendered cards actually correspond to this query? After an in-app
 * search the previous ingredient's cards linger for a moment; requiring a
 * card whose name shares a token with the query ensures we rank the right
 * results and never click a stale card.
 */
function cardsMatchQuery(cards: CardHandle[], searchQuery: string): boolean {
  const want = tokenize(searchQuery)
  if (want.length === 0) return true
  return cards.some((c) => {
    const have = new Set(tokenize(c.product.name))
    return want.some((t) => have.has(t))
  })
}

/**
 * When the store's cart count is readable (Blinkit, Zepto), trust only a
 * genuine rise in it — the same number the "My Cart" badge shows — so we
 * never report "added" for something that didn't land. Otherwise fall back
 * to the adapter's DOM signal (a stepper appearing).
 */
async function confirmAdded(
  canVerify: boolean,
  countBefore: number | null,
  clicked: boolean,
  provider: RunItemCommand['provider'],
): Promise<boolean> {
  if (canVerify && countBefore !== null) {
    const ok = await waitFor(
      () => {
        const c = storeCartCount(provider)
        return c !== null && c > countBefore ? c : null
      },
      { timeoutMs: 8_000, intervalMs: 250 },
    )
    return ok !== null
  }
  // Fallback: the adapter's own confirmation (stepper appeared / button gone).
  return clicked
}
