import { describe, expect, it } from 'vitest'
import type { Ingredient } from './types'
import { chooseBest, nameSimilarity, packFit, parsePack, type ScrapedProduct } from './matching'

const ing = (overrides: Partial<Ingredient>): Ingredient => ({
  id: 't',
  name: 'Rice',
  quantity: 500,
  unit: 'g',
  optional: false,
  pantryStaple: false,
  category: 'grains-staples',
  ...overrides,
})

const product = (name: string, packText: string, priceInr: number, cardIndex = 0): ScrapedProduct => ({
  name,
  packText,
  priceInr,
  cardIndex,
})

describe('parsePack', () => {
  it('parses simple packs', () => {
    expect(parsePack('500 g')).toEqual({ baseValue: 500, dimension: 'mass' })
    expect(parsePack('1 kg')).toEqual({ baseValue: 1000, dimension: 'mass' })
    expect(parsePack('1 L')).toEqual({ baseValue: 1000, dimension: 'volume' })
    expect(parsePack('6 pcs')).toEqual({ baseValue: 6, dimension: 'count' })
  })

  it('parses multipacks and ranges', () => {
    expect(parsePack('2 x 500 ml')).toEqual({ baseValue: 1000, dimension: 'volume' })
    expect(parsePack('450-550 g')).toEqual({ baseValue: 500, dimension: 'mass' })
  })

  it('prefers weight over count when both present', () => {
    expect(parsePack('1 pc (approx 500 g)')).toEqual({ baseValue: 500, dimension: 'mass' })
  })

  it('returns null for unparseable text', () => {
    expect(parsePack('best quality')).toBeNull()
    expect(parsePack('')).toBeNull()
  })
})

describe('nameSimilarity', () => {
  it('scores exact and near matches high', () => {
    expect(nameSimilarity('basmati rice', 'India Gate Basmati Rice')).toBeGreaterThan(0.8)
    expect(nameSimilarity('tomato', 'Tomato Local')).toBeGreaterThan(0.8)
  })

  it('punishes processed variants of raw ingredients', () => {
    const raw = nameSimilarity('tomato', 'Tomato Hybrid')
    const ketchup = nameSimilarity('tomato', 'Tomato Ketchup')
    expect(raw).toBeGreaterThan(ketchup)
    expect(ketchup).toBeLessThan(0.7)
  })

  it('rejects unrelated products', () => {
    expect(nameSimilarity('paneer', 'Amul Cheese Slices')).toBeLessThan(0.4)
  })
})

describe('packFit', () => {
  it('prefers 1 kg over 5 kg when 500 g is needed', () => {
    const need = { baseValue: 500, dimension: 'mass' as const }
    const oneKg = packFit(need, { baseValue: 1000, dimension: 'mass' })
    const fiveKg = packFit(need, { baseValue: 5000, dimension: 'mass' })
    expect(oneKg.score).toBeGreaterThan(fiveKg.score)
    expect(oneKg.unitsToAdd).toBe(1)
  })

  it('buys multiple packs when one is not enough', () => {
    const need = { baseValue: 750, dimension: 'mass' as const }
    const fit = packFit(need, { baseValue: 500, dimension: 'mass' })
    expect(fit.unitsToAdd).toBe(2)
  })

  it('converts pieces to grams via typical piece weight', () => {
    // 3 tomatoes (~100 g each) vs a 500 g pack -> one pack
    const need = { baseValue: 3, dimension: 'count' as const, pieceWeightG: 100 }
    const fit = packFit(need, { baseValue: 500, dimension: 'mass' })
    expect(fit.unitsToAdd).toBe(1)
    expect(fit.score).toBeGreaterThan(0.3)
  })
})

describe('chooseBest', () => {
  it('chooses the 1 kg pack for 500 g of rice', () => {
    const best = chooseBest(ing({ name: 'Basmati Rice' }), 'basmati rice', [
      product('Daawat Basmati Rice', '5 kg', 800, 0),
      product('India Gate Basmati Rice', '1 kg', 180, 1),
      product('Fortune Basmati Rice', '10 kg', 1400, 2),
    ])
    expect(best?.cardIndex).toBe(1)
    expect(best?.unitsToAdd).toBe(1)
  })

  it('avoids ketchup when shopping for tomatoes', () => {
    const best = chooseBest(
      ing({ name: 'Tomatoes', quantity: 3, unit: 'piece' }),
      'tomato',
      [
        product('Kissan Tomato Ketchup', '500 g', 120, 0),
        product('Tomato Local', '500 g', 30, 1),
      ],
    )
    expect(best?.cardIndex).toBe(1)
  })

  it('avoids chutney/puree for fresh tomato and powder for fresh coriander', () => {
    const tomato = chooseBest(ing({ name: 'Tomato', quantity: 3, unit: 'piece' }), 'tomato', [
      product('iD Tomato Chutney', '260 g', 90, 0),
      product('Kissan Fresh Tomato Puree', '200 g', 45, 1),
      product('Fresh Tomato', '500 g', 32, 2),
    ])
    expect(tomato?.cardIndex).toBe(2)

    const coriander = chooseBest(
      ing({ name: 'Coriander', quantity: 1, unit: 'bunch' }),
      'coriander leaves',
      [
        product('Catch Coriander Powder', '100 g', 60, 0),
        product('Fresh Coriander Leaves', '100 g', 15, 1),
      ],
    )
    expect(coriander?.cardIndex).toBe(1)

    // but a spice whose query *is* the powder must still match the powder
    const spice = chooseBest(
      ing({ name: 'Turmeric Powder', quantity: 20, unit: 'g' }),
      'turmeric powder',
      [product('Everest Turmeric Powder', '100 g', 40, 0)],
    )
    expect(spice?.cardIndex).toBe(0)
  })

  it('returns null when nothing plausibly matches', () => {
    const best = chooseBest(ing({ name: 'Saffron' }), 'saffron', [
      product('Sunflower Oil', '1 L', 150, 0),
      product('Basmati Rice', '1 kg', 180, 1),
    ])
    expect(best).toBeNull()
  })

  it('prefers better value for money between equally good matches', () => {
    const best = chooseBest(ing({ name: 'Curd', quantity: 400, unit: 'g' }), 'curd', [
      product('Nestle Curd', '400 g', 75, 0),
      product('Amul Curd', '400 g', 35, 1),
    ])
    expect(best?.cardIndex).toBe(1)
  })

  it('buys actual paneer, not shahi paneer masala', () => {
    const best = chooseBest(ing({ name: 'Paneer', quantity: 400, unit: 'g' }), 'paneer', [
      product('Everest Shahi Paneer Masala', '50 g', 52, 0),
      product('Amul Malai Paneer', '200 g', 95, 1),
    ])
    expect(best?.cardIndex).toBe(1)
    expect(best?.unitsToAdd).toBe(2)
  })

  it('buys butter, not plant-based butter spread', () => {
    const best = chooseBest(ing({ name: 'Butter', quantity: 100, unit: 'g' }), 'butter', [
      product('Nutralite Activ Plant Based Butter Spread', '100 g', 89, 0),
      product('Amul Butter', '100 g', 62, 1),
    ])
    expect(best?.cardIndex).toBe(1)
  })

  it('buys fresh cream, not vanilla whipping cream', () => {
    const best = chooseBest(
      ing({ name: 'Fresh Cream', quantity: 100, unit: 'ml' }),
      'fresh cream',
      [
        product('Puramate Vanilla Whipping Cream', '100 g', 112, 0),
        product('Amul Fresh Cream', '250 ml', 85, 1),
      ],
    )
    expect(best?.cardIndex).toBe(1)
  })

  it('gives trusted brands the edge at equal price and pack', () => {
    const best = chooseBest(ing({ name: 'Curd', quantity: 400, unit: 'g' }), 'curd', [
      product('Dailyfit Curd', '400 g', 50, 0),
      product('Amul Curd', '400 g', 50, 1),
    ])
    expect(best?.cardIndex).toBe(1)
  })
})
