import type { ScrapedProduct } from '../matching'

/**
 * Blinkit's /v1/layout/search response is a server-driven UI: each product
 * card carries clean, structured data (exact name, pack, price, product id).
 * We use it to *choose* the best product — the selection is far more
 * accurate than parsing rendered DOM text (which is noisy and ad-polluted).
 * The add itself is still performed by clicking the page's own button.
 */
export interface BlinkitApiProduct {
  productId: number
  scraped: ScrapedProduct
  soldOut: boolean
}

interface Snippet {
  widget_type?: string
  data?: {
    name?: { text?: string }
    variant?: { text?: string }
    normal_price?: { text?: string }
    is_sold_out?: boolean
    inventory?: number
    atc_action?: {
      add_to_cart?: {
        cart_item?: {
          product_id?: number
          product_name?: string
          price?: number
          unit?: string
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

/** Parse a search response into matching-engine-ready products. */
export function parseBlinkitSearch(json: unknown): BlinkitApiProduct[] {
  const snippets = (json as { response?: { snippets?: Snippet[] } })?.response?.snippets
  if (!Array.isArray(snippets)) return []

  const products: BlinkitApiProduct[] = []
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
        : priceFromText(data.normal_price?.text)

    products.push({
      productId: cartItem.product_id,
      scraped: {
        name,
        packText: cartItem.unit || data.variant?.text || '',
        priceInr: price,
        cardIndex: products.length,
      },
      soldOut: data.is_sold_out === true,
    })
  }
  return products
}
