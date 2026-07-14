import { describe, expect, it } from 'vitest'
import { extractJson, toShoppingList } from './client'
import { aiResponseSchema } from './schema'

describe('extractJson', () => {
  it('parses clean JSON', () => {
    expect(extractJson('{"dish":"Ramen"}')).toEqual({ dish: 'Ramen' })
  })

  it('strips code fences and surrounding prose', () => {
    const raw = 'Here you go:\n```json\n{"dish":"Ramen"}\n```\nEnjoy!'
    expect(extractJson(raw)).toEqual({ dish: 'Ramen' })
  })

  it('throws on garbage', () => {
    expect(() => extractJson('no json here')).toThrow()
  })
})

describe('aiResponseSchema', () => {
  it('coerces sloppy unit names', () => {
    const parsed = aiResponseSchema.parse({
      dish: 'Dal',
      servings: 4,
      ingredients: [
        { name: 'Toor Dal', quantity: 200, unit: 'grams' },
        { name: 'Ghee', quantity: 2, unit: 'tablespoons' },
        { name: 'Onion', quantity: 2, unit: 'pieces' },
      ],
    })
    expect(parsed.ingredients.map((i) => i.unit)).toEqual(['g', 'tbsp', 'piece'])
  })

  it('rejects nonsense quantities', () => {
    const result = aiResponseSchema.safeParse({
      dish: 'Dal',
      servings: 4,
      ingredients: [{ name: 'Dal', quantity: -5, unit: 'g' }],
    })
    expect(result.success).toBe(false)
  })
})

describe('toShoppingList', () => {
  it('merges duplicate ingredients across aliases', () => {
    const list = toShoppingList(
      aiResponseSchema.parse({
        dish: 'Butter Chicken',
        servings: 4,
        ingredients: [
          { name: 'Fresh Tomatoes', quantity: 300, unit: 'g' },
          { name: 'Tomato', quantity: 200, unit: 'g' },
          { name: 'Butter', quantity: 100, unit: 'g' },
        ],
      }),
    )
    const tomato = list.ingredients.find((i) => i.name === 'Tomato')
    expect(list.ingredients).toHaveLength(2)
    expect(tomato?.quantity).toBe(500)
  })

  it('tags pantry staples from the dictionary', () => {
    const list = toShoppingList(
      aiResponseSchema.parse({
        dish: 'Test',
        servings: 2,
        ingredients: [
          { name: 'Salt', quantity: 1, unit: 'tsp' },
          { name: 'Paneer', quantity: 200, unit: 'g' },
        ],
      }),
    )
    expect(list.ingredients.find((i) => i.name === 'Salt')?.pantryStaple).toBe(true)
    expect(list.ingredients.find((i) => i.name === 'Paneer')?.pantryStaple).toBe(false)
  })
})
