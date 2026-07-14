import { describe, expect, it } from 'vitest'
import { parseBlinkitSearch } from './parseSearch'
import fixture from './__fixtures__/search-chicken.json'
import type { Ingredient } from '../types'
import { rankProducts, sameProduct } from '../matching'

describe('parseBlinkitSearch (real captured response)', () => {
  const products = parseBlinkitSearch(fixture)

  it('extracts every product card with a clean name, pack, price and id', () => {
    expect(products.length).toBe(6)
    for (const p of products) {
      expect(p.productId).toBeGreaterThan(0)
      expect(p.scraped.name.length).toBeGreaterThan(0)
    }
  })

  it('feeds the shared ranking engine and recovers the product id', () => {
    const ingredient: Ingredient = {
      id: 'x',
      name: 'Chicken',
      quantity: 500,
      unit: 'g',
      optional: false,
      pantryStaple: false,
      category: 'meat-fish',
    }
    const ranked = rankProducts(
      ingredient,
      'chicken curry cut',
      products.map((p) => p.scraped),
    )
    expect(ranked.length).toBeGreaterThan(0)
    const winner = products[ranked[0].cardIndex]
    expect(winner.productId).toBeGreaterThan(0)
  })

  it('returns [] for junk input', () => {
    expect(parseBlinkitSearch(null)).toEqual([])
    expect(parseBlinkitSearch({})).toEqual([])
  })
})

describe('sameProduct (map an API pick onto its DOM card)', () => {
  it('matches the same product across brand/pack noise', () => {
    expect(sameProduct('Amul Malai Paneer', 'Amul Malai Paneer 200 g')).toBe(true)
    expect(sameProduct('Milky Mist Paneer', 'Milky Mist Paneer Block')).toBe(true)
  })

  it('rejects different products', () => {
    expect(sameProduct('Amul Paneer', 'Amul Butter')).toBe(false)
    expect(sameProduct('Fresh Tomato', 'Tomato Ketchup')).toBe(false)
  })
})
