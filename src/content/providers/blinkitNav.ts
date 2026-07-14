import { waitFor } from '../dom'
import { currentSearchQuery } from '@/shared/providers'

/**
 * Search on Blinkit by driving its own header search box, client-side — no
 * full page navigation.
 *
 * Why: repeatedly setting `location.href` to a new search URL (one full
 * reload per ingredient) makes Blinkit's SPA intermittently render a blank
 * results page after a handful of items. Typing into the site's real search
 * box performs an in-app route instead, which renders reliably and keeps the
 * content script alive across the whole fill.
 */

function findSearchInput(): HTMLInputElement | null {
  const inputs = [...document.querySelectorAll<HTMLInputElement>('input')]
  // The product search box is the wide input pinned to the header.
  const byPosition = inputs.find((el) => {
    const r = el.getBoundingClientRect()
    return r.y < 90 && r.width > 400
  })
  if (byPosition) return byPosition
  return (
    inputs.find((el) => /search for|atta|dal and more/i.test(el.getAttribute('placeholder') ?? '')) ??
    null
  )
}

/** React tracks its own value; set through the native setter so it notices. */
function setNativeValue(el: HTMLInputElement, value: string): void {
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
  if (desc?.set) desc.set.call(el, value)
  else el.value = value
}

/**
 * Type `query` into the search box and submit. Resolves true once the page
 * URL reflects the new query (so the caller can then wait for cards).
 * Returns false if the input can't be found or the route doesn't change,
 * letting the caller fall back to a full navigation.
 */
export async function blinkitClientSearch(query: string): Promise<boolean> {
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
