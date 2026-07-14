import type { ScrapedProduct } from '../matching'

/**
 * The add-to-cart payload Blinkit embeds in every product card of a
 * /v1/layout/search response. This exact object is what the cart endpoint
 * (/v5/carts) consumes — we pass it straight through.
 */
export interface BlinkitCartItem {
  product_id: number
  merchant_id: number
  product_name: string
  quantity: number
  price: number
  mrp?: number
  unit?: string
  inventory?: number
  group_id?: number
  merchant_type?: string
  brand?: string
  [key: string]: unknown
}

export interface BlinkitProduct {
  /** normalized for the shared matching engine */
  scraped: ScrapedProduct
  cartItem: BlinkitCartItem
  soldOut: boolean
  inventory: number
}

interface Snippet {
  widget_type?: string
  data?: {
    name?: { text?: string }
    variant?: { text?: string }
    normal_price?: { text?: string }
    mrp?: { text?: string }
    is_sold_out?: boolean
    inventory?: number
    atc_action?: { add_to_cart?: { cart_item?: BlinkitCartItem } }
  }
}

interface SearchResponse {
  response?: { snippets?: Snippet[] }
  // some deployments nest under a top-level `is_success`
  is_success?: boolean
}

function priceFromText(text: string | undefined): number | null {
  if (!text) return null
  const m = /₹\s?([\d,]+(?:\.\d+)?)/.exec(text)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

/**
 * Turn a Blinkit search response into ranked-engine-ready products, each
 * carrying the raw cart_item needed to add it via the API. Sold-out items
 * are kept but flagged so the caller can skip them.
 */
export function parseBlinkitSearch(json: unknown): BlinkitProduct[] {
  const snippets = (json as SearchResponse)?.response?.snippets
  if (!Array.isArray(snippets)) return []

  const products: BlinkitProduct[] = []
  for (const snippet of snippets) {
    if (!snippet.widget_type?.includes('product_card')) continue
    const data = snippet.data
    const cartItem = data?.atc_action?.add_to_cart?.cart_item
    if (!data || !cartItem || typeof cartItem.product_id !== 'number') continue

    const name = cartItem.product_name || data.name?.text || ''
    if (!name) continue

    const price =
      typeof cartItem.price === 'number'
        ? cartItem.price
        : (priceFromText(data.normal_price?.text) ?? null)

    products.push({
      scraped: {
        name,
        packText: cartItem.unit || data.variant?.text || '',
        priceInr: price,
        cardIndex: products.length,
      },
      cartItem,
      soldOut: data.is_sold_out === true,
      inventory: typeof cartItem.inventory === 'number' ? cartItem.inventory : (data.inventory ?? 0),
    })
  }
  return products
}
