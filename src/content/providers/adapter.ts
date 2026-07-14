import type { ProviderId } from '@/shared/types'
import { PROVIDER_URLS } from '@/shared/providers'
import { fireClick, pause, waitFor } from '../dom'
import {
  extractProduct,
  findAddButtons,
  findStepper,
  scrapeCardsHeuristic,
  type CardHandle,
} from '../scrape'

/**
 * Everything the automation runner needs from a store, DOM-wise.
 * One adapter per provider; site-specific selectors stay inside it.
 */
export interface ProviderAdapter {
  id: ProviderId
  searchUrl(query: string): string
  isSearchPage(url: URL): boolean
  /** Scrape visible product cards on the current results page. */
  scrapeCards(): CardHandle[]
  /** Click Add on a card and wait until the cart reflects it. */
  addToCart(card: CardHandle): Promise<boolean>
  /** Bump quantity by one. Returns false when the control is missing. */
  incrementQuantity(card: CardHandle): Promise<boolean>
}

export interface AdapterHints {
  /**
   * Known card selectors, tried before the generic heuristics.
   * Each match must still contain an Add control and a price to count.
   */
  cardSelectors: string[]
}

/**
 * Config-driven adapter: known selectors first, generic heuristics as the
 * fallback so a site redesign degrades gracefully instead of breaking.
 */
export function createAdapter(id: ProviderId, hints: AdapterHints): ProviderAdapter {
  const urls = PROVIDER_URLS[id]

  function scrapeWithHints(): CardHandle[] {
    for (const selector of hints.cardSelectors) {
      const nodes = document.querySelectorAll<HTMLElement>(selector)
      if (nodes.length === 0) continue
      const handles: CardHandle[] = []
      nodes.forEach((element) => {
        const addButton = findAddButtons(element)[0]
        if (!addButton) return
        handles.push({
          element,
          addButton,
          product: extractProduct(element, handles.length),
        })
      })
      if (handles.length > 0) return handles
    }
    return []
  }

  return {
    id,
    searchUrl: urls.searchUrl,
    isSearchPage: urls.isSearchPage,

    scrapeCards() {
      const fromHints = scrapeWithHints()
      return fromHints.length > 0 ? fromHints : scrapeCardsHeuristic()
    },

    async addToCart(card) {
      fireClick(card.addButton)
      // Success = the Add button turned into a stepper (or vanished).
      const confirmed = await waitFor(
        () => findStepper(card.element) !== null || !card.addButton.isConnected,
        { timeoutMs: 5_000 },
      )
      if (confirmed) return true
      // One retry — first click sometimes only opens a variant drawer.
      fireClick(card.addButton)
      return (
        (await waitFor(() => findStepper(card.element) !== null || !card.addButton.isConnected, {
          timeoutMs: 4_000,
        })) !== null
      )
    },

    async incrementQuantity(card) {
      const stepper = findStepper(card.element)
      if (!stepper?.increment) return false
      const before = stepper.quantity
      fireClick(stepper.increment)
      await pause(500, 900)
      const after = findStepper(card.element)
      // If we cannot read the quantity, trust the click rather than looping.
      return after === null || after.quantity >= before
    },
  }
}
