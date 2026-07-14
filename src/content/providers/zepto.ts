import { createAdapter } from './adapter'

/**
 * Zepto — zeptonow.com
 * Search: /search?query=<query>
 * Known DOM: product tiles are anchors with data-testid="product-card";
 * name/price/pack carry product-card-* testids. The base adapter's
 * heuristics take over if these rotate.
 */
export const zepto = createAdapter('zepto', {
  cardSelectors: [
    '[data-testid="product-card"]',
    'a[href*="/pn/"]',
  ],
})
