import { describe, expect, it } from 'vitest'
import { cleanName, normalizeIngredient } from './normalize'

describe('cleanName', () => {
  it('strips descriptors and parentheticals', () => {
    expect(cleanName('Freshly Chopped Coriander (for garnish)')).toBe('coriander')
    expect(cleanName('2 Large Ripe Tomatoes')).toBe('2 tomato')
  })

  it('singularizes common plurals', () => {
    expect(cleanName('Tomatoes')).toBe('tomato')
    expect(cleanName('Onions')).toBe('onion')
  })

  it('keeps names that should stay plural', () => {
    expect(cleanName('Curry Leaves')).toBe('curry leaves')
    expect(cleanName('Noodles')).toBe('noodles')
  })
})

describe('normalizeIngredient', () => {
  it('maps aliases onto one canonical ingredient', () => {
    for (const raw of ['Tomatoes', 'Fresh Tomato', 'Red Tomatoes']) {
      expect(normalizeIngredient(raw).canonical).toBe('tomato')
    }
  })

  it('maps dairy variants sensibly', () => {
    expect(normalizeIngredient('Unsalted Butter').canonical).toBe('butter')
    expect(normalizeIngredient('Full Cream Milk').canonical).toBe('milk')
    expect(normalizeIngredient('Whole Milk').canonical).toBe('milk')
    expect(normalizeIngredient('Greek Yogurt').canonical).toBe('curd')
  })

  it('maps hindi names', () => {
    expect(normalizeIngredient('Dhania').canonical).toBe('coriander')
    expect(normalizeIngredient('Haldi').canonical).toBe('turmeric powder')
    expect(normalizeIngredient('Kaju').canonical).toBe('cashews')
  })

  it('produces store-friendly search queries', () => {
    expect(normalizeIngredient('Chicken').searchQuery).toBe('chicken curry cut')
    expect(normalizeIngredient('Coriander Leaves').searchQuery).toBe('coriander leaves')
  })

  it('recovers canonical form from noisy compound names', () => {
    expect(normalizeIngredient('Boneless Chicken Breast').canonical).toBe('chicken breast')
    expect(normalizeIngredient('Paneer Cubes').canonical).toBe('paneer')
  })

  it('flags pantry staples', () => {
    expect(normalizeIngredient('Salt').pantryStaple).toBe(true)
    expect(normalizeIngredient('Turmeric Powder').pantryStaple).toBe(true)
    expect(normalizeIngredient('Paneer').pantryStaple).toBe(false)
  })

  it('passes unknown ingredients through cleaned', () => {
    const result = normalizeIngredient('Gochujang Paste')
    expect(result.canonical).toBe('gochujang paste')
    expect(result.category).toBe('other')
  })
})
