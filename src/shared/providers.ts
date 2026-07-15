import type { ProviderId } from './types'

/**
 * URL-level knowledge about each store, shared by the service worker
 * (opens tabs) and content scripts (detect page type, navigate).
 * DOM-level knowledge lives in src/content/providers/.
 */
export interface ProviderUrls {
  id: ProviderId
  origin: string
  searchUrl(query: string): string
  cartHint: string
  isSearchPage(url: URL): boolean
  matches(url: URL): boolean
}

export const PROVIDER_URLS: Record<ProviderId, ProviderUrls> = {
  blinkit: {
    id: 'blinkit',
    origin: 'https://blinkit.com',
    searchUrl: (q) => `https://blinkit.com/s/?q=${encodeURIComponent(q)}`,
    cartHint: 'Open the cart from the top-right of Blinkit to check out.',
    isSearchPage: (url) => url.hostname === 'blinkit.com' && url.pathname.startsWith('/s'),
    matches: (url) => url.hostname === 'blinkit.com',
  },
  zepto: {
    id: 'zepto',
    origin: 'https://www.zeptonow.com',
    searchUrl: (q) => `https://www.zeptonow.com/search?query=${encodeURIComponent(q)}`,
    cartHint: 'Open the cart from the top-right of Zepto to check out.',
    isSearchPage: (url) =>
      /^www\.zepto(now)?\.com$/.test(url.hostname) && url.pathname.startsWith('/search'),
    matches: (url) => /^www\.zepto(now)?\.com$/.test(url.hostname),
  },
  instamart: {
    id: 'instamart',
    origin: 'https://www.swiggy.com',
    searchUrl: (q) =>
      `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(q)}`,
    cartHint: 'Open the cart from the Instamart header to check out.',
    isSearchPage: (url) =>
      url.hostname === 'www.swiggy.com' && url.pathname.startsWith('/instamart/search'),
    matches: (url) =>
      url.hostname === 'www.swiggy.com' && url.pathname.startsWith('/instamart'),
  },
}

export function providerForUrl(url: URL): ProviderUrls | null {
  return Object.values(PROVIDER_URLS).find((p) => p.matches(url)) ?? null
}

export function currentSearchQuery(url: URL): string | null {
  return url.searchParams.get('q') ?? url.searchParams.get('query')
}
