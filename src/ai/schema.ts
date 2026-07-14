import { z } from 'zod'
import type { Unit } from '@/shared/types'

/** Coerce the unit strings LLMs actually produce into our canonical units. */
const UNIT_ALIASES: Record<string, Unit> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  gm: 'g',
  gms: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  piece: 'piece',
  pieces: 'piece',
  pc: 'piece',
  pcs: 'piece',
  unit: 'piece',
  units: 'piece',
  count: 'piece',
  whole: 'piece',
  packet: 'packet',
  packets: 'packet',
  pack: 'packet',
  packs: 'packet',
  bunch: 'bunch',
  bunches: 'bunch',
  sprig: 'bunch',
  sprigs: 'bunch',
  cup: 'cup',
  cups: 'cup',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  pinch: 'pinch',
  pinches: 'pinch',
  dash: 'pinch',
  'to taste': 'pinch',
}

const unitSchema = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? (UNIT_ALIASES[value.toLowerCase().trim()] ?? 'piece')
      : value,
  z.enum(['g', 'kg', 'ml', 'l', 'piece', 'packet', 'bunch', 'cup', 'tbsp', 'tsp', 'pinch']),
)

// Coerce loose LLM output: numbers arrive as "200" or "1/2" sometimes.
const looseNumber = z.preprocess((v) => {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(v.trim())
    if (frac) return Number(frac[1]) / Number(frac[2])
    const n = parseFloat(v.replace(/[^\d.]/g, ''))
    return Number.isFinite(n) ? n : undefined
  }
  return v
}, z.number())

export const aiIngredientSchema = z.object({
  name: z.string().trim().min(1).max(80),
  quantity: looseNumber.pipe(z.number().positive().max(100_000)),
  unit: unitSchema,
  optional: z.coerce.boolean().default(false),
})

export type AiIngredient = z.infer<typeof aiIngredientSchema>

// Top-level fields are validated leniently in client.ts (bad ingredients are
// dropped rather than failing the whole recipe); this stays for typing.
export const aiResponseSchema = z.object({
  dish: z.string().trim().min(1).max(120),
  servings: z.number().int().min(1).max(50),
  cuisine: z.string().trim().max(60).optional(),
  ingredients: z.array(aiIngredientSchema).min(1).max(80),
  estimatedCostInr: z.number().nonnegative().max(1_000_000).optional(),
  nutrition: z
    .object({
      caloriesPerServing: z.number().nonnegative().max(10_000),
      proteinG: z.number().nonnegative().max(1_000),
      carbsG: z.number().nonnegative().max(1_000),
      fatG: z.number().nonnegative().max(1_000),
    })
    .optional(),
})

export type AiResponse = z.infer<typeof aiResponseSchema>
