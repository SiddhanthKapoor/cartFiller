import { waitFor } from '../dom'
import { currentSearchQuery } from '@/shared/providers'

/**
 * Generic in-page search: drive a store's own header search box instead of
 * navigating to a fresh search URL per ingredient.
 *
 * Why: setting `location.href` to a new search URL is a full page reload for
 * every item — slow, and on SPA stores (Blinkit, Zepto) it intermittently
 * renders a blank results page after a few items. Typing into the site's real
 * search box performs an in-app route instead: much faster, reliable, and the
 * content script stays alive across the whole fill. The store also signs its
 * own search request, so this works even where the search API is signature-
 * protected (Zepto) and can't be called directly.
 */

function findSearchInput(): HTMLInputElement | null {
  const inputs = [...document.querySelectorAll<HTMLInputElement>('input')]
  // The product search box is the wide input pinned near the top of the page.
  const byPosition = inputs.find((el) => {
    const r = el.getBoundingClientRect()
    return r.y < 110 && r.width > 320
  })
  if (byPosition) return byPosition
  // Fallback: match on the placeholder copy these stores use.
  return (
    inputs.find((el) =>
      /search for|atta|dal and more|products|grocer/i.test(el.getAttribute('placeholder') ?? ''),
    ) ?? null
  )
}

/** React tracks its own value; set through the native setter so it notices. */
function setNativeValue(el: HTMLInputElement, value: string): void {
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
  if (desc?.set) desc.set.call(el, value)
  else el.value = value
}

/**
 * Type `query` into the search box and submit. Resolves true once the page URL
 * reflects the new query (so the caller can then wait for cards). Returns false
 * if the input can't be found or the route doesn't change, letting the caller
 * fall back to a full navigation.
 */
export async function clientSearch(query: string): Promise<boolean> {
  const input = findSearchInput()
  if (!input) return false

  input.focus()
  setNativeValue(input, '')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  setNativeValue(input, query)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  for (const type of ['keydown', 'keypress', 'keyup']) {
    input.dispatchEvent(
      new KeyboardEvent(type, {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
      }),
    )
  }
  input.form?.requestSubmit?.()

  const want = query.trim().toLowerCase()
  const ok = await waitFor(
    () => {
      const current = (currentSearchQuery(new URL(location.href)) ?? '').trim().toLowerCase()
      return current === want ? true : null
    },
    { timeoutMs: 8_000, intervalMs: 200 },
  )
  return ok !== null
}
