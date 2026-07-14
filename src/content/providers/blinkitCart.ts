/**
 * Ground truth for whether a Blinkit add actually worked.
 *
 * Blinkit keeps the live cart in the page's own localStorage (`cart`), kept
 * in sync with the account cart the checkout reads. A content script shares
 * the page origin, so it can read this directly. Watching this count go up
 * is far more reliable than guessing from the DOM (a stepper appearing, an
 * out-of-band API 200) — it's the same number the "My Cart" badge shows.
 */
export function blinkitCartCount(): number | null {
  try {
    const cart = JSON.parse(localStorage.getItem('cart') || 'null') as {
      count?: number
    } | null
    return typeof cart?.count === 'number' ? cart.count : null
  } catch {
    return null
  }
}
