import type { Unit } from './types'

export type Dimension = 'mass' | 'volume' | 'count'

interface UnitInfo {
  dimension: Dimension
  /** multiplier into the base unit of the dimension: g, ml or piece */
  toBase: number
}

export const UNIT_INFO: Record<Unit, UnitInfo> = {
  g: { dimension: 'mass', toBase: 1 },
  kg: { dimension: 'mass', toBase: 1000 },
  ml: { dimension: 'volume', toBase: 1 },
  l: { dimension: 'volume', toBase: 1000 },
  piece: { dimension: 'count', toBase: 1 },
  packet: { dimension: 'count', toBase: 1 },
  bunch: { dimension: 'count', toBase: 1 },
  // cooking measures — approximations good enough for shopping decisions
  cup: { dimension: 'volume', toBase: 240 },
  tbsp: { dimension: 'volume', toBase: 15 },
  tsp: { dimension: 'volume', toBase: 5 },
  pinch: { dimension: 'mass', toBase: 0.5 },
}

export interface BaseQuantity {
  value: number
  dimension: Dimension
}

export function toBase(quantity: number, unit: Unit): BaseQuantity {
  const info = UNIT_INFO[unit]
  return { value: quantity * info.toBase, dimension: info.dimension }
}

/**
 * Human-friendly formatting: 1500 g -> "1.5 kg", 500 ml -> "500 ml",
 * 3 piece -> "3 pcs". Cooking measures are kept as-is ("2 tbsp").
 */
export function formatQuantity(quantity: number, unit: Unit): string {
  const round = (n: number) => (Number.isInteger(n) ? n : Number(n.toFixed(1)))
  if (unit === 'g' && quantity >= 1000) return `${round(quantity / 1000)} kg`
  if (unit === 'ml' && quantity >= 1000) return `${round(quantity / 1000)} L`
  if (unit === 'kg' && quantity < 1) return `${round(quantity * 1000)} g`
  if (unit === 'l' && quantity < 1) return `${round(quantity * 1000)} ml`
  if (unit === 'piece') return `${round(quantity)} ${quantity === 1 ? 'pc' : 'pcs'}`
  if (unit === 'packet') return `${round(quantity)} ${quantity === 1 ? 'packet' : 'packets'}`
  if (unit === 'l') return `${round(quantity)} L`
  return `${round(quantity)} ${unit}`
}

/** Sensible steps for the +/- quantity controls in the popup. */
export function quantityStep(unit: Unit): number {
  switch (unit) {
    case 'g':
      return 50
    case 'kg':
      return 0.25
    case 'ml':
      return 50
    case 'l':
      return 0.25
    case 'cup':
      return 0.5
    case 'tbsp':
    case 'tsp':
      return 1
    default:
      return 1
  }
}

/** Scale a quantity when the user changes servings, snapped to a clean step. */
export function scaleQuantity(quantity: number, unit: Unit, factor: number): number {
  const raw = quantity * factor
  const step = quantityStep(unit)
  const snapped = Math.round(raw / step) * step
  return Math.max(step, Number(snapped.toFixed(2)))
}
