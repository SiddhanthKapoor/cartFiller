import type { ProviderId } from '@/shared/types'

/**
 * Ground truth for whether an add actually landed: the store's own cart, read
 * from the page's localStorage. Watching this count rise is far more reliable
 * than guessing from the DOM — it's the number the "My Cart" badge shows, and
 * the cart the checkout reads.
 */
export function storeCartCount(provider: ProviderId): number | null {
  try {
    const raw = localStorage.getItem('cart')
    if (!raw) return null
    const cart = JSON.parse(raw)

    if (provider === 'blinkit') {
      return typeof cart?.count === 'number' ? cart.count : null
    }
    if (provider === 'zepto') {
      // zustand store: { state: { cartContent: { <id>: { quantity } } } }
      const items = cart?.state?.cartContent
      if (!items || typeof items !== 'object') return null
      return Object.values(items as Record<string, { quantity?: number }>).reduce(
        (sum, i) => sum + (typeof i?.quantity === 'number' ? i.quantity : 1),
        0,
      )
    }
    return null // Instamart: no known localStorage cart — fall back to DOM signal
  } catch {
    return null
  }
}
