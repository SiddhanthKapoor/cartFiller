import { chooseBest } from '@/shared/matching'
import type { ContentCommand } from '@/shared/messages'
import type { MatchedProduct } from '@/shared/types'
import { currentSearchQuery } from '@/shared/providers'
import { pause, waitFor, waitForQuietDom } from './dom'
import { adapterFor } from './providers'

type RunItemCommand = Extract<ContentCommand, { type: 'RUN_ITEM' }>

export type ItemOutcome =
  | { kind: 'navigated' }
  | { kind: 'result'; status: 'added' | 'skipped' | 'failed'; matched?: MatchedProduct; error?: string }

/**
 * Process one ingredient on the current page.
 *
 * The runner is deliberately stateless across page loads: if we're not on
 * the right search page yet, we navigate and let the reload cycle bring us
 * back here (background re-issues RUN_ITEM on CONTENT_READY).
 */
export async function runItem(command: RunItemCommand): Promise<ItemOutcome> {
  const adapter = adapterFor(command.provider)
  const { item } = command

  const url = new URL(location.href)
  const query = (currentSearchQuery(url) ?? '').trim().toLowerCase()
  if (!adapter.isSearchPage(url) || query !== item.searchQuery.trim().toLowerCase()) {
    await pause(300, 700)
    location.href = adapter.searchUrl(item.searchQuery)
    return { kind: 'navigated' }
  }

  // Let the SPA settle, then wait for product cards to exist.
  await waitForQuietDom()
  const cards = await waitFor(
    () => {
      const scraped = adapter.scrapeCards()
      return scraped.length > 0 ? scraped : null
    },
    { timeoutMs: 15_000, intervalMs: 400 },
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
    await pause(500, 1000)
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
