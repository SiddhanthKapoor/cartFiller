import { createAdapter } from './adapter'

/**
 * Blinkit — blinkit.com
 * Search: /s/?q=<query>
 * Known DOM (drifts often, hence the heuristic fallback in the base adapter):
 * product tiles have historically carried data-test-id="plp-product" and a
 * role=button Add pill labelled "ADD".
 */
export const blinkit = createAdapter('blinkit', {
  cardSelectors: [
    '[data-test-id="plp-product"]',
    '[data-testid="plp-product"]',
    '[id^="plp-product"]',
  ],
})
