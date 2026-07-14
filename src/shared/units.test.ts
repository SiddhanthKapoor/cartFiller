import { describe, expect, it } from 'vitest'
import { formatQuantity, scaleQuantity, toBase } from './units'

describe('toBase', () => {
  it('converts mass units to grams', () => {
    expect(toBase(1.5, 'kg')).toEqual({ value: 1500, dimension: 'mass' })
    expect(toBase(500, 'g')).toEqual({ value: 500, dimension: 'mass' })
  })

  it('converts volume units to ml', () => {
    expect(toBase(2, 'l')).toEqual({ value: 2000, dimension: 'volume' })
    expect(toBase(3, 'tbsp')).toEqual({ value: 45, dimension: 'volume' })
    expect(toBase(2, 'tsp')).toEqual({ value: 10, dimension: 'volume' })
    expect(toBase(1, 'cup')).toEqual({ value: 240, dimension: 'volume' })
  })

  it('treats pieces, packets and bunches as counts', () => {
    expect(toBase(3, 'piece').dimension).toBe('count')
    expect(toBase(2, 'bunch').dimension).toBe('count')
  })
})

describe('formatQuantity', () => {
  it('promotes grams to kg past 1000', () => {
    expect(formatQuantity(1500, 'g')).toBe('1.5 kg')
    expect(formatQuantity(750, 'g')).toBe('750 g')
  })

  it('promotes ml to L past 1000', () => {
    expect(formatQuantity(1250, 'ml')).toBe('1.3 L')
  })

  it('pluralizes pieces', () => {
    expect(formatQuantity(1, 'piece')).toBe('1 pc')
    expect(formatQuantity(4, 'piece')).toBe('4 pcs')
  })
})

describe('scaleQuantity', () => {
  it('scales and snaps to clean steps', () => {
    // 750 g for 4 servings -> 6 servings = 1125 g, snapped to 50 g step
    expect(scaleQuantity(750, 'g', 6 / 4)).toBe(1150)
    expect(scaleQuantity(2, 'piece', 2)).toBe(4)
  })

  it('never scales below one step', () => {
    expect(scaleQuantity(1, 'piece', 0.1)).toBe(1)
    expect(scaleQuantity(50, 'g', 0.01)).toBe(50)
  })
})
