import type { ScrapedProduct } from '../matching'

/** The exact product shape Blinkit stores in its client-side cart. */
export interface BlinkitCartItem {
  product_id: number
  price: number
  image_url?: string
  unit?: string
  mrp?: number
  group_id?: number
}

export interface BlinkitApiProduct {
  /** for the shared ranking engine */
  scraped: ScrapedProduct
  /** what we write into localStorage.cart */
  cartItem: BlinkitCartItem
  name: string
  soldOut: boolean
}

interface Snippet {
  widget_type?: string
  data?: {
    name?: { text?: string }
    variant?: { text?: string }
    normal_price?: { text?: string }
    is_sold_out?: boolean
    atc_action?: {
      add_to_cart?: {
        cart_item?: {
          product_id?: number
          product_name?: string
          price?: number
          mrp?: number
          unit?: string
          group_id?: number
          image_url?: string
        }
      }
    }
  }
}

function priceFromText(text: string | undefined): number | null {
  if (!text) return null
  const m = /₹\s?([\d,]+(?:\.\d+)?)/.exec(text)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

/** Parse a /v1/layout/search response into ranked-ready products + cart items. */
export function parseBlinkitSearch(json: unknown): BlinkitApiProduct[] {
  const snippets = (json as { response?: { snippets?: Snippet[] } })?.response?.snippets
  if (!Array.isArray(snippets)) return []

  const products: BlinkitApiProduct[] = []
  for (const snippet of snippets) {
    if (!snippet.widget_type?.includes('product_card')) continue
    const data = snippet.data
    const ci = data?.atc_action?.add_to_cart?.cart_item
    if (!data || !ci || typeof ci.product_id !== 'number' || typeof ci.price !== 'number') continue

    const name = ci.product_name || data.name?.text || ''
    if (!name) continue

    products.push({
      name,
      scraped: {
        name,
        packText: ci.unit || data.variant?.text || '',
        priceInr: ci.price ?? priceFromText(data.normal_price?.text),
        cardIndex: products.length,
      },
      cartItem: {
        product_id: ci.product_id,
        price: ci.price,
        image_url: ci.image_url,
        unit: ci.unit,
        mrp: ci.mrp,
        group_id: ci.group_id,
      },
      soldOut: data.is_sold_out === true,
    })
  }
  return products
}
