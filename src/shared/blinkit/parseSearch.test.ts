import { describe, expect, it } from 'vitest'
import { parseBlinkitSearch } from './parseSearch'
import fixture from './__fixtures__/search-chicken.json'
import type { Ingredient } from '../types'
import { chooseBest } from '../matching'

describe('parseBlinkitSearch (real captured response)', () => {
  const products = parseBlinkitSearch(fixture)

  it('extracts every product card with its cart_item', () => {
    expect(products.length).toBe(6)
    for (const p of products) {
      expect(p.cartItem.product_id).toBeGreaterThan(0)
      expect(p.cartItem.merchant_id).toBeGreaterThan(0)
      expect(p.scraped.name.length).toBeGreaterThan(0)
    }
  })

  it('maps pack size and price into the matching-engine shape', () => {
    const breast = products.find((p) => p.scraped.name.includes('Boneless Chicken Breast'))!
    expect(breast.scraped.packText).toBe('400 g')
    expect(breast.scraped.priceInr).toBe(229)
  })

  it('feeds straight into the shared ranking engine', () => {
    const ingredient: Ingredient = {
      id: 'x',
      name: 'Chicken',
      quantity: 500,
      unit: 'g',
      optional: false,
      pantryStaple: false,
      category: 'meat-fish',
    }
    const best = chooseBest(
      ingredient,
      'chicken curry cut',
      products.map((p) => p.scraped),
    )
    expect(best).not.toBeNull()
    // whatever wins, we can recover the exact cart_item to POST
    const chosen = products[best!.cardIndex]
    expect(chosen.cartItem.product_id).toBeGreaterThan(0)
    expect(chosen.scraped.name.toLowerCase()).toContain('chicken')
  })

  it('returns [] for junk input', () => {
    expect(parseBlinkitSearch(null)).toEqual([])
    expect(parseBlinkitSearch({})).toEqual([])
    expect(parseBlinkitSearch({ response: { snippets: [] } })).toEqual([])
  })
})
