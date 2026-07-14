import { createAdapter } from './adapter'

/**
 * Swiggy Instamart — swiggy.com/instamart
 * Search: /instamart/search?custom_back=true&query=<query>
 * Known DOM: item widgets have used data-testid="default_container_ux4" and
 * "ItemWidgetContainer"; Add controls are divs labelled "ADD". Heuristics
 * cover the frequent renames.
 */
export const instamart = createAdapter('instamart', {
  cardSelectors: [
    '[data-testid="ItemWidgetContainer"]',
    '[data-testid="default_container_ux4"]',
    '[data-testid*="item-widget"]',
  ],
})
