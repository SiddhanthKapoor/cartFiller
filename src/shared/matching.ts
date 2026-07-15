import type { Ingredient } from './types'
import { toBase, type Dimension } from './units'
import { cleanName, normalizeIngredient } from './normalize'

/** A product card as scraped from a store listing page. */
export interface ScrapedProduct {
  name: string
  /** e.g. "500 g", "1 kg", "2 x 500 ml", "6 pcs" */
  packText: string
  priceInr: number | null
  /** opaque index so the content script can find the card again */
  cardIndex: number
}

export interface ParsedPack {
  /** total content in base units (g / ml / piece) */
  baseValue: number
  dimension: Dimension
}

export interface RankedProduct extends ScrapedProduct {
  score: number
  nameScore: number
  packScore: number
  /** how many of this pack to add to the cart */
  unitsToAdd: number
  pack: ParsedPack | null
}

const PACK_UNIT_TO_BASE: Record<string, { dimension: Dimension; toBase: number }> = {
  kg: { dimension: 'mass', toBase: 1000 },
  g: { dimension: 'mass', toBase: 1 },
  gm: { dimension: 'mass', toBase: 1 },
  gms: { dimension: 'mass', toBase: 1 },
  gram: { dimension: 'mass', toBase: 1 },
  grams: { dimension: 'mass', toBase: 1 },
  mg: { dimension: 'mass', toBase: 0.001 },
  l: { dimension: 'volume', toBase: 1000 },
  ltr: { dimension: 'volume', toBase: 1000 },
  litre: { dimension: 'volume', toBase: 1000 },
  litres: { dimension: 'volume', toBase: 1000 },
  liter: { dimension: 'volume', toBase: 1000 },
  liters: { dimension: 'volume', toBase: 1000 },
  ml: { dimension: 'volume', toBase: 1 },
  pc: { dimension: 'count', toBase: 1 },
  pcs: { dimension: 'count', toBase: 1 },
  piece: { dimension: 'count', toBase: 1 },
  pieces: { dimension: 'count', toBase: 1 },
  unit: { dimension: 'count', toBase: 1 },
  units: { dimension: 'count', toBase: 1 },
  pack: { dimension: 'count', toBase: 1 },
  packs: { dimension: 'count', toBase: 1 },
  dozen: { dimension: 'count', toBase: 12 },
}

const PACK_RE =
  /(\d+(?:\.\d+)?)\s*(kg|gms?|grams?|mg|ltr|litres?|liters?|ml|l|pcs?|pieces?|units?|packs?|dozen|g)\b/i
const MULTI_PACK_RE = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|gms?|grams?|ml|l|ltr|litres?|liters?|g)\b/i
const RANGE_PACK_RE = /(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(kg|gms?|grams?|ml|l|g)\b/i

/**
 * Parse a store pack description into base units.
 * Handles "500 g", "1 kg", "2 x 500 ml", "6 pcs", "1 pc (450-550 g)", "1 dozen".
 */
export function parsePack(text: string): ParsedPack | null {
  if (!text) return null
  const normalized = text.toLowerCase().replace(/,/g, '')

  const multi = MULTI_PACK_RE.exec(normalized)
  if (multi) {
    const unit = PACK_UNIT_TO_BASE[multi[3]]
    if (unit) {
      return {
        baseValue: Number(multi[1]) * Number(multi[2]) * unit.toBase,
        dimension: unit.dimension,
      }
    }
  }

  // "450-550 g" -> use the midpoint
  const range = RANGE_PACK_RE.exec(normalized)
  if (range) {
    const unit = PACK_UNIT_TO_BASE[range[3]]
    if (unit) {
      const mid = (Number(range[1]) + Number(range[2])) / 2
      return { baseValue: mid * unit.toBase, dimension: unit.dimension }
    }
  }

  // Prefer a mass/volume mention over a count mention when both exist:
  // "1 pc (approx 500 g)" should parse as 500 g.
  let count: ParsedPack | null = null
  const re = new RegExp(PACK_RE.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(normalized))) {
    const unit = PACK_UNIT_TO_BASE[m[2].toLowerCase()]
    if (!unit) continue
    const pack: ParsedPack = {
      baseValue: Number(m[1]) * unit.toBase,
      dimension: unit.dimension,
    }
    if (pack.dimension !== 'count') return pack
    count = count ?? pack
  }
  return count
}

// ---------- name similarity ----------

/**
 * Tokens that indicate a *processed* variant of a raw ingredient.
 * If the query doesn't mention them, a product containing them is
 * probably the wrong thing ("tomato" -> "tomato ketchup").
 */
const PROCESSED_TOKENS = new Set([
  'ketchup',
  'sauce',
  'chutney',
  'puree',
  'powder',
  // distinct product categories that share a head noun with an ingredient:
  // "fresh cream" must not match "cream cheese", "milk" not "milk cake" etc.
  'cheese',
  'cake',
  'shake',
  'biscuit',
  'cookie',
  'dried',
  'flakes',
  'granules',
  'concentrate',
  'extract',
  'canned',
  'tinned',
  'seeds', // "coriander seeds" when the recipe wants fresh coriander leaves
  'seed',
  'dip',
  'pickle',
  'achar',
  'sirka', // "sirka pyaz" = pickling onions, not cooking onions
  'spring', // "spring onion" is a distinct ingredient from onion

  'chips',
  'crisps',
  'juice',
  'jam',
  'candy',
  'flavour',
  'flavored',
  'flavoured',
  'vanilla',
  'chocolate',
  'instant',
  'ready',
  'mix',
  'premix',
  'syrup',
  'essence',
  'papad',
  'soup',
  'cube',
  'seasoning',
  'namkeen',
  'wafers',
  // "paneer" must not buy "shahi paneer masala"; "butter" must not buy
  // "plant-based butter spread"; "fresh cream" must not buy "whipping cream"
  'masala',
  'spread',
  'whipping',
  'whipped',
  'plant',
  'vegan',
  'roasted',
  'salted',
  'fried',
  'paste',
])

/**
 * Brands with wide trust in Indian grocery. On quick-commerce listing pages
 * there are no ratings or review counts in the DOM, so a curated brand
 * prior is the strongest quality signal available.
 */
const TRUSTED_BRANDS = new Set([
  'amul',
  'mother',       // Mother Dairy
  'nandini',
  'gowardhan',
  'milky',        // Milky Mist
  'britannia',
  'nestle',
  'tata',
  'fortune',
  'aashirvaad',
  'saffola',
  'everest',
  'mdh',
  'catch',
  'aachi',
  'eastern',
  'daawat',
  'india',        // India Gate
  'kohinoor',
  'lal',          // Lal Qilla
  'twentyfour',   // 24 Mantra
  'licious',
  'fresho',
  'zappfresh',
  'id',           // iD fresh
  'haldiram',
  'haldirams',
  'bikaji',
  'dabur',
  'patanjali',
  'kissan',
  'delmonte',
  'veeba',
  'funfoods',
  'urban',        // Urban Platter
  'happilo',
  'farmley',
  'nutraj',
])

/** 0 or 1: does the product title carry a trusted brand? */
export function brandScore(productName: string): number {
  return tokenize(productName).some((t) => TRUSTED_BRANDS.has(t)) ? 1 : 0
}

const STOPWORDS = new Set(['the', 'and', 'with', 'combo', 'pack', 'of', 'per'])

export function tokenize(text: string): string[] {
  return cleanName(text)
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

/** Dice coefficient over character bigrams — tolerant of small spelling drift. */
function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const bigrams = new Map<string, number>()
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2)
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1)
  }
  let hits = 0
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2)
    const n = bigrams.get(bg) ?? 0
    if (n > 0) {
      hits++
      bigrams.set(bg, n - 1)
    }
  }
  return (2 * hits) / (a.length - 1 + (b.length - 1))
}

/**
 * Score how well a product title matches the search query, 0..1.
 * Every query token should appear (fuzzily) in the title; extra
 * "processed food" tokens are penalized so raw ingredients win.
 */
export function nameSimilarity(query: string, productName: string): number {
  const queryTokens = tokenize(query)
  const productTokens = tokenize(productName)
  if (queryTokens.length === 0 || productTokens.length === 0) return 0

  let covered = 0
  for (const qt of queryTokens) {
    let best = 0
    for (const pt of productTokens) {
      best = Math.max(best, bigramSimilarity(qt, pt))
      if (best === 1) break
    }
    covered += best
  }
  const coverage = covered / queryTokens.length

  const querySet = new Set(queryTokens)
  let processedPenalty = 0
  let noisePenalty = 0
  for (const pt of productTokens) {
    if (querySet.has(pt)) continue
    if (PROCESSED_TOKENS.has(pt)) processedPenalty += 0.35
    else if (!TRUSTED_BRANDS.has(pt)) noisePenalty += 0.05
  }

  return Math.max(0, coverage - processedPenalty - Math.min(noisePenalty, 0.3))
}

/**
 * Do two product titles refer to the same product? Used to map an
 * API-chosen product onto its rendered DOM card so we can click the right
 * Add button. Robust to brand/pack noise via token overlap + bigram backup.
 */
export function sameProduct(a: string, b: string): boolean {
  const ca = cleanName(a)
  const cb = cleanName(b)
  if (ca && ca === cb) return true

  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.length === 0 || tb.length === 0) return false
  const setB = new Set(tb)
  const shared = ta.filter((t) => setB.has(t)).length
  // Need real overlap: two shared tokens (so "tomato" ⊄ "tomato ketchup"),
  // and most of the shorter title accounted for.
  if (shared >= 2 && shared / Math.min(ta.length, tb.length) >= 0.6) return true
  // brands/spellings differ but the strings are near-identical overall
  return bigramSimilarity(ca, cb) >= 0.82
}

// ---------- pack fit ----------

export interface Need {
  baseValue: number
  dimension: Dimension
  /** grams per piece, when converting count <-> mass */
  pieceWeightG?: number
}

export function ingredientNeed(ingredient: Ingredient, pieceWeightG?: number): Need {
  const base = toBase(ingredient.quantity, ingredient.unit)
  return { baseValue: base.value, dimension: base.dimension, pieceWeightG }
}

/** Convert a need into the pack's dimension if possible (piece <-> mass via pieceWeightG). */
function alignNeed(need: Need, packDimension: Dimension): number | null {
  if (need.dimension === packDimension) return need.baseValue
  if (need.pieceWeightG) {
    if (need.dimension === 'count' && packDimension === 'mass')
      return need.baseValue * need.pieceWeightG
    if (need.dimension === 'mass' && packDimension === 'count')
      return need.baseValue / need.pieceWeightG
  }
  // volume <-> mass: assume density ~1 (fine for milk, curd, purees)
  if (
    (need.dimension === 'volume' && packDimension === 'mass') ||
    (need.dimension === 'mass' && packDimension === 'volume')
  )
    return need.baseValue
  return null
}

const MAX_UNITS_PER_PRODUCT = 5

export interface PackFit {
  score: number
  unitsToAdd: number
}

/**
 * How well does this pack size satisfy the need?
 * Perfect = smallest number of packs with least waste.
 */
export function packFit(need: Need, pack: ParsedPack | null): PackFit {
  if (!pack || pack.baseValue <= 0) return { score: 0.4, unitsToAdd: 1 }

  const aligned = alignNeed(need, pack.dimension)
  if (aligned === null || aligned <= 0) return { score: 0.35, unitsToAdd: 1 }

  const units = Math.min(MAX_UNITS_PER_PRODUCT, Math.max(1, Math.ceil(aligned / pack.baseValue)))
  const bought = units * pack.baseValue
  const waste = (bought - aligned) / aligned // 0 = exact
  const shortage = bought < aligned ? (aligned - bought) / aligned : 0

  // Waste decays slowly (buying 1 kg for 750 g is fine); shortage decays fast.
  const wasteScore = 1 / (1 + waste * 0.9)
  const unitScore = 1 / (1 + (units - 1) * 0.15)
  const shortagePenalty = shortage * 1.5

  return {
    score: Math.max(0, wasteScore * unitScore - shortagePenalty),
    unitsToAdd: units,
  }
}

// ---------- ranking ----------

// Weighted like a person shops: relevance first, then a sensible pack,
// then value for money, then a trusted brand as tiebreak.
const NAME_WEIGHT = 0.56
const PACK_WEIGHT = 0.26
const VALUE_WEIGHT = 0.1
const BRAND_WEIGHT = 0.08
const MIN_NAME_SCORE = 0.45

/**
 * Rank scraped products against an ingredient. Returns best-first.
 * Products whose names don't plausibly match are dropped entirely.
 */
export function rankProducts(
  ingredient: Ingredient,
  searchQuery: string,
  products: ScrapedProduct[],
): RankedProduct[] {
  const { pieceWeightG } = normalizeIngredient(ingredient.name)
  const need = ingredientNeed(ingredient, pieceWeightG)

  interface Candidate extends Omit<RankedProduct, 'score'> {
    perUnitPrice: number | null
  }

  const candidates: Candidate[] = []
  for (const product of products) {
    const nameScore = Math.max(
      nameSimilarity(searchQuery, product.name),
      nameSimilarity(ingredient.name, product.name),
    )
    if (nameScore < MIN_NAME_SCORE) continue

    const pack = parsePack(product.packText) ?? parsePack(product.name)
    const fit = packFit(need, pack)
    const perUnitPrice =
      pack && pack.baseValue > 0 && product.priceInr
        ? product.priceInr / pack.baseValue
        : null

    candidates.push({
      ...product,
      nameScore,
      packScore: fit.score,
      unitsToAdd: fit.unitsToAdd,
      pack,
      perUnitPrice,
    })
  }

  // Value for money = price per gram/ml relative to the best-value candidate,
  // not the absolute sticker price (a 50 g spice box "beating" 500 g of rice
  // on price is meaningless).
  const perUnitPrices = candidates
    .map((c) => c.perUnitPrice)
    .filter((p): p is number => p !== null)
  const bestPerUnit = perUnitPrices.length > 0 ? Math.min(...perUnitPrices) : null

  const ranked: RankedProduct[] = candidates.map(({ perUnitPrice, ...candidate }) => {
    const valueScore =
      bestPerUnit !== null && perUnitPrice !== null ? bestPerUnit / perUnitPrice : 0.5
    return {
      ...candidate,
      score:
        NAME_WEIGHT * candidate.nameScore +
        PACK_WEIGHT * candidate.packScore +
        VALUE_WEIGHT * valueScore +
        BRAND_WEIGHT * brandScore(candidate.name),
    }
  })

  return ranked.sort((a, b) => b.score - a.score)
}

export function chooseBest(
  ingredient: Ingredient,
  searchQuery: string,
  products: ScrapedProduct[],
): RankedProduct | null {
  return rankProducts(ingredient, searchQuery, products)[0] ?? null
}
