import type { ScrapedProduct } from '@/shared/matching'
import { isVisible, textOf } from './dom'

/**
 * Heuristic product-card discovery.
 *
 * Quick-commerce sites change their class names constantly, so instead of
 * relying on brittle selectors we anchor on the two things every listing
 * card must have: an "Add" control and a ₹ price. Provider adapters can
 * layer known selectors on top (tried first), but this keeps working when
 * those rot.
 */

const PRICE_RE = /₹\s?([\d,]+(?:\.\d+)?)/
const PACK_RE =
  /\b\d+(?:\.\d+)?\s*(?:x\s*\d+(?:\.\d+)?\s*)?(?:kg|gms?|grams?|ltr|litres?|liters?|ml|l|pcs?|pieces?|units?|packs?|dozen|g)\b/i

export interface CardHandle {
  element: HTMLElement
  addButton: HTMLElement
  product: ScrapedProduct
}

function normalizedLabel(el: HTMLElement): string {
  return textOf(el).toLowerCase().replace(/\+/g, '').trim()
}

const ADD_LABELS = new Set(['add', 'add to cart', 'add item'])

/** Find visible "Add" controls anywhere under `root`. */
export function findAddButtons(root: ParentNode = document): HTMLElement[] {
  const candidates = root.querySelectorAll<HTMLElement>(
    'button, [role="button"], div, span',
  )
  const buttons: HTMLElement[] = []
  for (const el of candidates) {
    const label = normalizedLabel(el)
    if (!ADD_LABELS.has(label)) continue
    if (!isVisible(el)) continue
    // Take the innermost element carrying the label to avoid duplicates.
    const inner = [...el.querySelectorAll<HTMLElement>('*')].some(
      (child) => normalizedLabel(child) === label,
    )
    if (!inner) buttons.push(el)
  }
  return buttons
}

/**
 * Walk up from an Add button to the smallest ancestor that looks like a
 * complete product card (has a price and a plausible product name).
 */
export function cardFromAddButton(button: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = button.parentElement
  for (let depth = 0; node && depth < 10; depth++) {
    const text = textOf(node)
    if (PRICE_RE.test(text)) {
      const hasName = node.querySelector('img[alt]') !== null || text.length > 20
      if (hasName) return node
    }
    node = node.parentElement
  }
  return null
}

function isNameLeaf(text: string): boolean {
  if (text.length < 3) return false
  if (PRICE_RE.test(text)) return false // "₹36"
  if (/^\d/.test(text)) return false // "500 g", "10% OFF"
  if (/^(add|adding|save|sold out|out of stock|off|ad)$/i.test(text)) return false
  if (/^\d+\s*(min|mins)/i.test(text)) return false // "8 MINS"
  return true
}

function extractName(card: HTMLElement): string {
  // Image alt is cleanest when present.
  for (const img of card.querySelectorAll<HTMLImageElement>('img[alt]')) {
    const alt = img.alt.trim()
    if (alt.length > 2 && !/^₹/.test(alt) && alt.toLowerCase() !== 'image') return alt
  }
  // Blinkit (and similar) render the product name as its own text node,
  // separate from price and pack. Reading the whole card's textContent glues
  // them ("...Ketchup415 g"), which breaks tokenized matching — so pick the
  // first *leaf* element that reads like a name.
  for (const el of card.querySelectorAll<HTMLElement>('*')) {
    if (el.children.length > 0) continue
    const t = textOf(el)
    if (isNameLeaf(t)) return t
  }
  return ''
}

export function extractProduct(card: HTMLElement, cardIndex: number): ScrapedProduct {
  const text = textOf(card)
  const priceMatch = PRICE_RE.exec(text)
  const packMatch = PACK_RE.exec(text)
  return {
    name: extractName(card),
    priceInr: priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : null,
    packText: packMatch ? packMatch[0] : '',
    cardIndex,
  }
}

/** Scan the page for product cards using the generic heuristics. */
export function scrapeCardsHeuristic(root: ParentNode = document): CardHandle[] {
  const handles: CardHandle[] = []
  const seen = new Set<HTMLElement>()
  for (const addButton of findAddButtons(root)) {
    const element = cardFromAddButton(addButton)
    if (!element || seen.has(element)) continue
    seen.add(element)
    handles.push({
      element,
      addButton,
      product: extractProduct(element, handles.length),
    })
  }
  return handles
}

// ---------- quantity steppers ----------

/**
 * After adding, cards swap the Add button for a stepper like  [−] 1 [+].
 * Find the current quantity and the increment control inside a card.
 */
export interface Stepper {
  quantity: number
  increment: HTMLElement | null
}

export function findStepper(card: HTMLElement): Stepper | null {
  const controls = card.querySelectorAll<HTMLElement>('button, [role="button"], div, span')
  let plus: HTMLElement | null = null
  let minus: HTMLElement | null = null
  for (const el of controls) {
    const label = textOf(el)
    const aria = (el.getAttribute('aria-label') ?? '').toLowerCase()
    if (label === '+' || aria.includes('increase') || aria.includes('increment')) plus = el
    if (label === '−' || label === '-' || aria.includes('decrease') || aria.includes('decrement'))
      minus = el
  }
  if (!plus && !minus) return null

  // The quantity is a small standalone number rendered between the controls.
  let quantity = 1
  for (const el of card.querySelectorAll<HTMLElement>('*')) {
    if (el.children.length > 0) continue
    const label = textOf(el)
    if (/^\d{1,2}$/.test(label) && isVisible(el)) {
      quantity = Number(label)
      break
    }
  }
  return { quantity, increment: plus }
}
