import type { IngredientCategory } from './types'

export interface NormalizedIngredient {
  /** canonical display name, e.g. "tomato" */
  canonical: string
  /** what we actually type into the store's search box */
  searchQuery: string
  category: IngredientCategory
  /** average weight of one piece in grams, for piece <-> mass conversion */
  pieceWeightG?: number
  pantryStaple: boolean
  /**
   * Sanity ceiling for seasonings/staples, in g or ml per serving.
   * A recipe never *consumes* more than this — anything above is the AI
   * confusing recipe quantity with retail pack size, and gets clamped.
   */
  maxPerServingBase?: number
}

interface CanonicalEntry extends Omit<NormalizedIngredient, 'canonical'> {
  canonical: string
  aliases: string[]
}

/**
 * Words the AI loves to prepend that carry no shopping signal.
 * Removed before lookup and before building a search query.
 */
const DESCRIPTORS = new Set([
  'fresh',
  'freshly',
  'chopped',
  'sliced',
  'diced',
  'minced',
  'grated',
  'crushed',
  'finely',
  'roughly',
  'thinly',
  'large',
  'medium',
  'small',
  'big',
  'ripe',
  'raw',
  'cooked',
  'boiled',
  'boneless',
  'skinless',
  'cubed',
  'julienned',
  'shredded',
  'peeled',
  'deseeded',
  'halved',
  'quartered',
  'organic',
  'quality',
  'good',
  'some',
  'a',
  'few',
  'of',
  'for',
  'garnish',
  'garnishing',
  'taste',
  'to',
  'as',
  'needed',
  'required',
  'optional',
])

const PLURAL_RULES: Array<[RegExp, string]> = [
  [/ies$/, 'y'], // berries -> berry
  [/oes$/, 'o'], // tomatoes -> tomato, potatoes -> potato
  [/ves$/, 'f'], // leaves -> leaf (we special-case curry leaves below)
  [/([^s])s$/, '$1'], // onions -> onion
]

/** Multi-word names where naive singularization would hurt search results. */
const KEEP_AS_IS = new Set([
  'curry leaves',
  'bay leaves',
  'spring onions',
  'noodles',
  'oats',
  'peas',
  'green peas',
  'sprouts',
  'bean sprouts',
  'chickpeas',
  'lemongrass',
])

function singularize(word: string): string {
  for (const [pattern, replacement] of PLURAL_RULES) {
    if (pattern.test(word)) return word.replace(pattern, replacement)
  }
  return word
}

export function cleanName(raw: string): string {
  const lowered = raw
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ') // "(for garnish)" etc.
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const words = lowered.split(' ').filter((w) => !DESCRIPTORS.has(w))
  const joined = words.join(' ')
  if (KEEP_AS_IS.has(joined)) return joined

  return words
    .map((w, i) => (i === words.length - 1 ? singularize(w) : w))
    .join(' ')
}

const C = (
  canonical: string,
  category: IngredientCategory,
  opts: {
    aliases?: string[]
    search?: string
    pieceWeightG?: number
    pantry?: boolean
    /** max g/ml a recipe plausibly consumes per serving */
    maxPerServing?: number
  } = {},
): CanonicalEntry => ({
  canonical,
  category,
  aliases: opts.aliases ?? [],
  searchQuery: opts.search ?? canonical,
  pieceWeightG: opts.pieceWeightG,
  pantryStaple: opts.pantry ?? false,
  maxPerServingBase: opts.maxPerServing,
})

/**
 * Curated dictionary tuned for Indian quick-commerce catalogues.
 * `search` is what actually returns good results on Blinkit/Zepto.
 */
const CANONICAL: CanonicalEntry[] = [
  // --- produce ---
  C('tomato', 'produce', { aliases: ['red tomato', 'tomato puree fresh'], pieceWeightG: 100 }),
  C('onion', 'produce', { aliases: ['red onion', 'white onion'], pieceWeightG: 120 }),
  C('potato', 'produce', { pieceWeightG: 150 }),
  C('garlic', 'produce', { aliases: ['garlic cloves', 'garlic clove', 'garlic paste'], pieceWeightG: 40 }),
  C('ginger', 'produce', { aliases: ['ginger root', 'ginger paste'], pieceWeightG: 50 }),
  C('ginger garlic paste', 'condiments', { aliases: ['ginger-garlic paste'], maxPerServing: 15 }),
  C('green chilli', 'produce', {
    aliases: ['green chili', 'green chillies', 'green chilies', 'hari mirch'],
    pieceWeightG: 8,
  }),
  C('coriander', 'produce', {
    aliases: ['coriander leaves', 'cilantro', 'dhania', 'fresh coriander'],
    search: 'coriander leaves',
    pieceWeightG: 100,
  }),
  C('mint', 'produce', { aliases: ['mint leaves', 'pudina'], search: 'mint leaves', pieceWeightG: 100 }),
  C('curry leaves', 'produce', { aliases: ['curry leaf', 'kadi patta'], pieceWeightG: 20 }),
  C('lemon', 'produce', { aliases: ['lime', 'lemon juice'], pieceWeightG: 60 }),
  C('capsicum', 'produce', { aliases: ['bell pepper', 'green capsicum', 'shimla mirch'], pieceWeightG: 150 }),
  C('carrot', 'produce', { pieceWeightG: 80 }),
  C('cucumber', 'produce', { pieceWeightG: 200 }),
  C('cabbage', 'produce', { pieceWeightG: 800 }),
  C('cauliflower', 'produce', { aliases: ['gobi'], pieceWeightG: 600 }),
  C('spinach', 'produce', { aliases: ['palak', 'spinach leaves'], pieceWeightG: 250 }),
  C('mushroom', 'produce', { aliases: ['button mushroom', 'mushrooms'], search: 'button mushroom' }),
  C('spring onion', 'produce', { aliases: ['scallion', 'green onion', 'spring onions'], pieceWeightG: 100 }),
  C('green peas', 'produce', { aliases: ['peas', 'matar', 'frozen peas'], search: 'green peas' }),
  C('beans', 'produce', { aliases: ['french beans', 'green beans'], search: 'french beans' }),
  C('brinjal', 'produce', { aliases: ['eggplant', 'aubergine', 'baingan'], pieceWeightG: 250 }),
  C('lady finger', 'produce', { aliases: ['okra', 'bhindi'] }),
  C('sweet corn', 'produce', { aliases: ['corn', 'corn kernels'] }),
  C('avocado', 'produce', { pieceWeightG: 200 }),

  // --- dairy & eggs ---
  C('milk', 'dairy', { aliases: ['full cream milk', 'whole milk', 'toned milk'], search: 'full cream milk' }),
  C('butter', 'dairy', { aliases: ['unsalted butter', 'salted butter'], maxPerServing: 25 }),
  C('ghee', 'dairy', { aliases: ['clarified butter', 'desi ghee'], maxPerServing: 15 }),
  C('paneer', 'dairy', { aliases: ['cottage cheese', 'indian cottage cheese'] }),
  C('curd', 'dairy', { aliases: ['yogurt', 'yoghurt', 'dahi', 'plain yogurt', 'greek yogurt'] }),
  C('fresh cream', 'dairy', { aliases: ['cream', 'heavy cream', 'cooking cream', 'whipping cream'] }),
  C('cheese', 'dairy', { aliases: ['cheddar cheese', 'processed cheese', 'cheese slice'] }),
  C('mozzarella', 'dairy', { aliases: ['mozzarella cheese'] }),
  C('parmesan', 'dairy', { aliases: ['parmesan cheese'] }),
  C('egg', 'dairy', { aliases: ['eggs', 'chicken eggs'], search: 'eggs', pieceWeightG: 55 }),
  C('condensed milk', 'dairy', {}),
  C('khoya', 'dairy', { aliases: ['mawa', 'khoa'] }),

  // --- meat & fish ---
  C('chicken', 'meat-fish', {
    aliases: ['chicken curry cut', 'whole chicken', 'chicken pieces', 'chicken thigh', 'chicken leg'],
    search: 'chicken curry cut',
  }),
  C('chicken breast', 'meat-fish', { aliases: ['chicken breast boneless'] }),
  C('mutton', 'meat-fish', { aliases: ['goat meat', 'lamb', 'mutton curry cut'], search: 'mutton curry cut' }),
  C('fish', 'meat-fish', { aliases: ['fish fillet', 'white fish'], search: 'fish fillet' }),
  C('prawns', 'meat-fish', { aliases: ['shrimp', 'prawn'] }),
  C('minced chicken', 'meat-fish', { aliases: ['chicken keema', 'chicken mince'] }),
  C('minced mutton', 'meat-fish', { aliases: ['mutton keema', 'mutton mince', 'keema'] }),

  // --- grains & staples ---
  C('basmati rice', 'grains-staples', { aliases: ['long grain rice', 'biryani rice'] }),
  C('rice', 'grains-staples', { aliases: ['white rice', 'raw rice', 'sona masoori rice'] }),
  C('atta', 'grains-staples', { aliases: ['wheat flour', 'whole wheat flour', 'chapati flour'], search: 'wheat atta' }),
  C('maida', 'grains-staples', { aliases: ['all purpose flour', 'refined flour', 'plain flour'] }),
  C('besan', 'grains-staples', { aliases: ['gram flour', 'chickpea flour'] }),
  C('rava', 'grains-staples', { aliases: ['semolina', 'sooji', 'suji'] }),
  C('poha', 'grains-staples', { aliases: ['flattened rice', 'beaten rice'] }),
  C('toor dal', 'grains-staples', { aliases: ['arhar dal', 'pigeon pea', 'tur dal'] }),
  C('moong dal', 'grains-staples', { aliases: ['yellow moong dal', 'green gram'] }),
  C('chana dal', 'grains-staples', { aliases: ['bengal gram'] }),
  C('urad dal', 'grains-staples', { aliases: ['black gram', 'black urad dal'] }),
  C('masoor dal', 'grains-staples', { aliases: ['red lentil', 'red lentils'] }),
  C('black urad whole', 'grains-staples', { aliases: ['whole black lentils', 'sabut urad', 'black lentils'] }),
  C('rajma', 'grains-staples', { aliases: ['kidney beans', 'red kidney beans'] }),
  C('chickpeas', 'grains-staples', { aliases: ['chole', 'kabuli chana', 'garbanzo beans', 'chana'] }),
  C('noodles', 'packaged', { aliases: ['hakka noodles', 'egg noodles', 'ramen noodles'] }),
  C('pasta', 'packaged', { aliases: ['penne', 'penne pasta', 'fusilli', 'spaghetti', 'macaroni'] }),
  C('bread', 'packaged', { aliases: ['white bread', 'bread slices', 'sandwich bread'], pieceWeightG: 400 }),
  C('oats', 'grains-staples', { aliases: ['rolled oats', 'instant oats'] }),
  C('quinoa', 'grains-staples', {}),

  // --- oils, spices & pantry ---
  C('cooking oil', 'grains-staples', {
    aliases: ['oil', 'vegetable oil', 'sunflower oil', 'refined oil'],
    search: 'sunflower oil',
    pantry: true,
    maxPerServing: 20,
  }),
  C('mustard oil', 'grains-staples', { pantry: true, maxPerServing: 20 }),
  C('olive oil', 'grains-staples', { aliases: ['extra virgin olive oil'], pantry: true, maxPerServing: 20 }),
  C('sesame oil', 'grains-staples', { aliases: ['til oil', 'gingelly oil'], pantry: true, maxPerServing: 10 }),
  C('salt', 'spices', { aliases: ['table salt', 'rock salt', 'sea salt'], pantry: true, maxPerServing: 3 }),
  C('sugar', 'spices', { aliases: ['white sugar', 'granulated sugar'], pantry: true, maxPerServing: 10 }),
  C('jaggery', 'spices', { aliases: ['gur', 'gud'], maxPerServing: 20 }),
  C('turmeric powder', 'spices', { aliases: ['turmeric', 'haldi', 'haldi powder'], pantry: true, maxPerServing: 2 }),
  C('red chilli powder', 'spices', {
    aliases: ['red chili powder', 'chilli powder', 'chili powder', 'lal mirch', 'kashmiri red chilli powder', 'cayenne'],
    pantry: true,
    maxPerServing: 3,
  }),
  C('coriander powder', 'spices', { aliases: ['dhania powder', 'ground coriander'], pantry: true, maxPerServing: 4 }),
  C('cumin seeds', 'spices', { aliases: ['jeera', 'cumin', 'whole cumin'], pantry: true, maxPerServing: 3 }),
  C('cumin powder', 'spices', { aliases: ['jeera powder', 'ground cumin', 'roasted cumin powder'], pantry: true, maxPerServing: 3 }),
  C('garam masala', 'spices', { pantry: true, maxPerServing: 3 }),
  C('biryani masala', 'spices', { maxPerServing: 8 }),
  C('chaat masala', 'spices', { maxPerServing: 3 }),
  C('pav bhaji masala', 'spices', { maxPerServing: 8 }),
  C('sambar powder', 'spices', { aliases: ['sambar masala'], maxPerServing: 8 }),
  C('mustard seeds', 'spices', { aliases: ['rai', 'sarson seeds'], pantry: true, maxPerServing: 2 }),
  C('black pepper', 'spices', { aliases: ['pepper', 'black pepper powder', 'peppercorns', 'kali mirch'], pantry: true, maxPerServing: 2 }),
  C('cardamom', 'spices', { aliases: ['green cardamom', 'elaichi', 'cardamom pods'], maxPerServing: 2 }),
  C('black cardamom', 'spices', { aliases: ['badi elaichi'], maxPerServing: 2 }),
  C('cloves', 'spices', { aliases: ['clove', 'laung'], maxPerServing: 1 }),
  C('cinnamon', 'spices', { aliases: ['cinnamon stick', 'dalchini'], maxPerServing: 2 }),
  C('bay leaves', 'spices', { aliases: ['bay leaf', 'tej patta'], maxPerServing: 1 }),
  C('star anise', 'spices', { maxPerServing: 1 }),
  C('saffron', 'spices', { aliases: ['kesar', 'saffron strands'], maxPerServing: 0.2 }),
  C('kasuri methi', 'spices', { aliases: ['dried fenugreek leaves', 'kasoori methi', 'fenugreek leaves'], maxPerServing: 2 }),
  C('fenugreek seeds', 'spices', { aliases: ['methi seeds', 'methi dana'], maxPerServing: 2 }),
  C('fennel seeds', 'spices', { aliases: ['saunf'], maxPerServing: 2 }),
  C('asafoetida', 'spices', { aliases: ['hing'], maxPerServing: 0.5 }),
  C('dry red chilli', 'spices', { aliases: ['dried red chillies', 'whole red chilli', 'dry red chillies'], maxPerServing: 3 }),
  C('baking soda', 'spices', { aliases: ['sodium bicarbonate'], pantry: true, maxPerServing: 2 }),
  C('baking powder', 'spices', { pantry: true, maxPerServing: 3 }),
  C('cornflour', 'grains-staples', { aliases: ['corn starch', 'cornstarch', 'corn flour'], pantry: true, maxPerServing: 10 }),

  // --- condiments & packaged ---
  C('soy sauce', 'condiments', { aliases: ['soya sauce', 'dark soy sauce', 'light soy sauce'], maxPerServing: 15 }),
  C('vinegar', 'condiments', { aliases: ['white vinegar', 'rice vinegar'], maxPerServing: 10 }),
  C('tomato ketchup', 'condiments', { aliases: ['ketchup'] }),
  C('tomato puree', 'condiments', { aliases: ['tomato paste'] }),
  C('green chilli sauce', 'condiments', { aliases: ['chilli sauce', 'chili sauce'] }),
  C('schezwan sauce', 'condiments', { aliases: ['schezwan chutney', 'szechuan sauce'] }),
  C('mayonnaise', 'condiments', { aliases: ['mayo', 'veg mayonnaise'] }),
  C('honey', 'condiments', { maxPerServing: 15 }),
  C('peanut butter', 'condiments', {}),
  C('coconut milk', 'packaged', { aliases: ['thick coconut milk'] }),
  C('coconut', 'produce', { aliases: ['fresh coconut', 'grated coconut'], pieceWeightG: 400 }),
  C('desiccated coconut', 'packaged', { aliases: ['dry coconut', 'coconut powder'] }),
  C('tamarind', 'condiments', { aliases: ['imli', 'tamarind paste', 'tamarind pulp'], maxPerServing: 10 }),
  C('tofu', 'packaged', {}),
  C('cashews', 'packaged', { aliases: ['cashew', 'cashew nuts', 'kaju'] }),
  C('almonds', 'packaged', { aliases: ['almond', 'badam'] }),
  C('raisins', 'packaged', { aliases: ['kishmish', 'golden raisins'] }),
  C('peanuts', 'packaged', { aliases: ['groundnut', 'groundnuts', 'raw peanuts'] }),
  C('fried onions', 'packaged', { aliases: ['birista', 'crispy fried onions'] }),
  C('rose water', 'packaged', { aliases: ['gulab jal'], maxPerServing: 5 }),
  C('paneer tikka masala paste', 'condiments', { aliases: ['tikka paste', 'tandoori paste'] }),
  C('momo wrapper', 'packaged', { aliases: ['dumpling wrappers', 'wonton wrappers', 'momo sheets'], search: 'momo sheets' }),
  C('sushi rice', 'grains-staples', { aliases: ['japanese rice', 'sticky rice'] }),
  C('nori', 'packaged', { aliases: ['seaweed sheets', 'nori sheets'] }),
  C('lasagna sheets', 'packaged', { aliases: ['lasagne sheets'] }),
  C('taco shells', 'packaged', { aliases: ['tortilla', 'tortillas', 'taco shell'] }),
  C('cheese spread', 'dairy', {}),
]

const ALIAS_INDEX = new Map<string, CanonicalEntry>()
for (const entry of CANONICAL) {
  ALIAS_INDEX.set(entry.canonical, entry)
  for (const alias of entry.aliases) ALIAS_INDEX.set(alias, entry)
}

/**
 * Normalize a raw AI-generated (or user-typed) ingredient name into a
 * canonical name + the query we'll type into the store search box.
 */
export function normalizeIngredient(raw: string): NormalizedIngredient {
  const cleaned = cleanName(raw)

  const direct = ALIAS_INDEX.get(cleaned)
  if (direct) return toNormalized(direct)

  // Try dropping leading words: "boneless chicken thigh" -> "chicken thigh" -> "chicken"
  const words = cleaned.split(' ')
  for (let start = 1; start < words.length; start++) {
    const candidate = words.slice(start).join(' ')
    const hit = ALIAS_INDEX.get(candidate)
    if (hit) return toNormalized(hit)
  }
  // Then trailing words: "paneer cubes" -> "paneer"
  for (let end = words.length - 1; end > 0; end--) {
    const candidate = words.slice(0, end).join(' ')
    const hit = ALIAS_INDEX.get(candidate)
    if (hit) return toNormalized(hit)
  }

  return {
    canonical: cleaned || raw.toLowerCase().trim(),
    searchQuery: cleaned || raw.toLowerCase().trim(),
    category: 'other',
    pantryStaple: false,
  }
}

function toNormalized(entry: CanonicalEntry): NormalizedIngredient {
  return {
    canonical: entry.canonical,
    searchQuery: entry.searchQuery,
    category: entry.category,
    pieceWeightG: entry.pieceWeightG,
    pantryStaple: entry.pantryStaple,
    maxPerServingBase: entry.maxPerServingBase,
  }
}

/** Merge duplicate ingredients (same canonical form) by summing quantities where dimensions agree. */
export function dedupeKey(name: string): string {
  return normalizeIngredient(name).canonical
}
