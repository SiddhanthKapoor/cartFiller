import { describe, expect, it } from 'vitest'
import { dropSoldOut, type BlinkitApiProduct } from './parseSearch'

function product(name: string, id: number, soldOut: boolean, cardIndex: number): BlinkitApiProduct {
  return {
    name,
    soldOut,
    cartItem: { product_id: id, price: 10 },
    scraped: { name, packText: '', priceInr: 10, cardIndex },
  }
}

describe('dropSoldOut', () => {
  it('keeps cardIndex aligned to array position after removing sold-out items', () => {
    // A(sold-out), B, C — as returned by parseBlinkitSearch with dense indices.
    const parsed = [
      product('A', 1, true, 0),
      product('B', 2, false, 1),
      product('C', 3, false, 2),
    ]
    const kept = dropSoldOut(parsed)

    expect(kept.map((p) => p.name)).toEqual(['B', 'C'])
    // Ranking a product then indexing kept[cardIndex] must return that product.
    kept.forEach((p, i) => {
      expect(p.scraped.cardIndex).toBe(i)
      expect(kept[p.scraped.cardIndex]).toBe(p)
    })
    // The pick that used to be wrong: choosing "B" (old index 1) must not yield C.
    const b = kept.find((p) => p.name === 'B')!
    expect(kept[b.scraped.cardIndex].cartItem.product_id).toBe(2)
  })

  it('returns an empty array when everything is sold out', () => {
    expect(dropSoldOut([product('A', 1, true, 0), product('B', 2, true, 1)])).toEqual([])
  })
})
