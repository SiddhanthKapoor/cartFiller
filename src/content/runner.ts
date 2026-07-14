import { chooseBest } from '@/shared/matching'
import type { ContentCommand } from '@/shared/messages'
import type { MatchedProduct } from '@/shared/types'
import { currentSearchQuery } from '@/shared/providers'
import { pause, waitFor, waitForQuietDom } from './dom'
import { adapterFor } from './providers'
import {
  blinkitApiAddToCart,
  blinkitApiSearch,
  hasLocation,
} from './providers/blinkitApi'

type RunItemCommand = Extract<ContentCommand, { type: 'RUN_ITEM' }>

export type ItemOutcome =
  | { kind: 'navigated' }
  | { kind: 'result'; status: 'added' | 'skipped' | 'failed'; matched?: MatchedProduct; error?: string }

/**
 * Once the API cart-write proves it works (or doesn't) on this session, we
 * stop second-guessing it: all-API on success, straight-to-DOM on failure.
 * `null` = untried this session.
 */
let apiAddWorks: boolean | null = null

/**
 * Process one ingredient.
 *
 * Blinkit path is API-first: search + match + add all happen via Blinkit's
 * own internal API on the current page (no navigation, no scraping), with an
 * automatic fall-through to the DOM adapter if the API can't do the job.
 * Zepto/Instamart stay on the DOM adapter.
 */
export async function runItem(command: RunItemCommand): Promise<ItemOutcome> {
  if (command.provider === 'blinkit') {
    const viaApi = await tryApi(command)
    if (viaApi) return viaApi
    // else: fall through to the DOM adapter below
  }
  return runItemViaDom(command)
}

// ---------- API path (Blinkit) ----------

async function tryApi(command: RunItemCommand): Promise<ItemOutcome | null> {
  const { item } = command

  // API cart-write already proved unavailable this session — skip straight
  // to DOM instead of wasting a search request per item.
  if (apiAddWorks === false) return null

  // Need the user's delivery location for the API to return products.
  if (!hasLocation()) return null

  let products
  try {
    products = await blinkitApiSearch(item.searchQuery)
  } catch {
    // Search API unavailable (headers/location/redesign) — hand off to DOM.
    return null
  }

  if (products.length === 0) {
    return {
      kind: 'result',
      status: 'skipped',
      error: `No products found for “${item.searchQuery}”`,
    }
  }

  const best = chooseBest(
    item.ingredient,
    item.searchQuery,
    products.map((p) => p.scraped),
  )
  if (!best) {
    return {
      kind: 'result',
      status: 'skipped',
      error: `Nothing matched “${item.ingredient.name}” closely enough`,
    }
  }

  const chosen = products[best.cardIndex]
  const result = await blinkitApiAddToCart(chosen.cartItem, best.unitsToAdd)

  if (result.ok) {
    apiAddWorks = true
    return {
      kind: 'result',
      status: 'added',
      matched: {
        name: best.name,
        priceInr: best.priceInr,
        packText: best.packText,
        unitsAdded: best.unitsToAdd,
      },
    }
  }

  // First API-add failure: remember it and let DOM take over from here.
  apiAddWorks = false
  return null
}

// ---------- DOM path (fallback + Zepto/Instamart) ----------

async function runItemViaDom(command: RunItemCommand): Promise<ItemOutcome> {
  const adapter = adapterFor(command.provider)
  const { item } = command

  const url = new URL(location.href)
  const query = (currentSearchQuery(url) ?? '').trim().toLowerCase()
  if (!adapter.isSearchPage(url) || query !== item.searchQuery.trim().toLowerCase()) {
    await pause(150, 350)
    location.href = adapter.searchUrl(item.searchQuery)
    return { kind: 'navigated' }
  }

  await waitForQuietDom()
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

  const best = chooseBest(
    item.ingredient,
    item.searchQuery,
    cards.map((c) => c.product),
  )
  if (!best) {
    return {
      kind: 'result',
      status: 'skipped',
      error: `Nothing matched “${item.ingredient.name}” closely enough`,
    }
  }

  const card = cards[best.cardIndex]
  await pause()
  const added = await adapter.addToCart(card)
  if (!added) {
    return {
      kind: 'result',
      status: 'failed',
      error: `“${best.name}” didn't register in the cart`,
    }
  }

  let unitsAdded = 1
  for (let i = 1; i < best.unitsToAdd; i++) {
    await pause(300, 600)
    if (await adapter.incrementQuantity(card)) unitsAdded++
    else break
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
