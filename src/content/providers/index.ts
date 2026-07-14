import type { ProviderId } from '@/shared/types'
import { providerForUrl } from '@/shared/providers'
import type { ProviderAdapter } from './adapter'
import { blinkit } from './blinkit'
import { zepto } from './zepto'
import { instamart } from './instamart'

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  blinkit,
  zepto,
  instamart,
}

export function adapterFor(id: ProviderId): ProviderAdapter {
  return ADAPTERS[id]
}

export function adapterForCurrentPage(): ProviderAdapter | null {
  const provider = providerForUrl(new URL(location.href))
  return provider ? ADAPTERS[provider.id] : null
}

export type { ProviderAdapter } from './adapter'
