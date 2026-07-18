import type { OverlayState } from '@/shared/messages'
import type { ProviderId } from '@/shared/types'
import blinkitLogo from '@/popup/assets/brands/blinkit.svg?raw'
import zeptoLogo from '@/popup/assets/brands/zepto.svg?raw'

/**
 * Floating progress card rendered into a shadow root so the host page's
 * styles can't touch it (and vice versa).
 */

const STORE_LOGO: Record<ProviderId, string> = {
  blinkit: blinkitLogo,
  zepto: zeptoLogo,
}
const STORE_ACCENT: Record<ProviderId, string> = {
  blinkit: '#ffc53d',
  zepto: '#9b5de5',
}

let host: HTMLDivElement | null = null
let shadow: ShadowRoot | null = null

const STYLES = `
  :host { all: initial; }
  .card {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483647;
    width: 320px;
    max-height: 72vh;
    display: flex;
    flex-direction: column;
    background: #fffadf;
    border: 3px solid #000000;
    box-shadow: 6px 6px 0 #000000;
    color: #013048;
    font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
    overflow: hidden;
    animation: rise 0.35s cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: none; }
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px 10px;
  }
  .logo {
    width: 26px; height: 26px; flex: none;
    background: #000000; color: #fff;
    display: grid; place-items: center; font-size: 13px;
  }
  .title { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
  .subtitle { font-size: 10px; color: #6b6b6b; margin-top: 2px; letter-spacing: 0.04em; text-transform: uppercase; }
  .cancel {
    margin-left: auto; cursor: pointer;
    background: #fff; color: #000000; border: 2px solid #000000;
    font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    padding: 5px 9px; font-family: inherit; transition: all 0.15s;
  }
  .cancel:hover { background: #000000; color: #fff; }
  .bar {
    height: 10px; margin: 2px 14px 0; border: 2px solid #000000; overflow: hidden;
  }
  .bar-fill { height: 100%; background: #000000; transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1); }
  .items { padding: 10px 10px 12px; overflow-y: auto; }
  .items::-webkit-scrollbar { width: 6px; }
  .items::-webkit-scrollbar-thumb { background: #000000; }
  .item {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 8px; font-size: 11.5px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.03em; color: #000000;
    border: 2px solid transparent; margin-bottom: 2px;
  }
  .item.running { border-color: #000000; }
  .icon { width: 16px; height: 16px; flex: none; display: grid; place-items: center; font-size: 12px; font-weight: 700; }
  .icon.pending { color: #c8c8c8; }
  .icon.added { color: #17a34a; }
  .icon.skipped { color: #9cb0bb; }
  .icon.failed { color: #c2121f; }
  .spinner {
    width: 13px; height: 13px; border-radius: 50%;
    border: 2px solid rgba(255,90,31,0.3);
    border-top-color: #219ebd;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .done-note {
    padding: 6px 14px 14px; font-size: 10.5px; color: #6b6b6b; line-height: 1.5;
  }
`

const STATUS_ICON: Record<string, string> = {
  pending: '○',
  added: '✓',
  skipped: '−',
  failed: '✕',
}

function ensureHost(): ShadowRoot {
  if (host && shadow && host.isConnected) return shadow
  host = document.createElement('div')
  host.id = 'cookcart-overlay'
  shadow = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = STYLES
  shadow.appendChild(style)
  document.documentElement.appendChild(host)
  return shadow
}

export function renderOverlay(state: OverlayState, onCancel: () => void): void {
  const root = ensureHost()
  root.querySelector('.card')?.remove()

  const doneCount = state.items.filter((i) =>
    ['added', 'skipped', 'failed'].includes(i.status),
  ).length
  const total = state.items.length
  const addedCount = state.items.filter((i) => i.status === 'added').length

  const card = document.createElement('div')
  card.className = 'card'

  const accent = STORE_ACCENT[state.provider]

  const head = document.createElement('div')
  head.className = 'head'
  const logo = document.createElement('div')
  logo.className = 'logo'
  // real store logo, on a white chip so brand colours read
  logo.style.background = '#fff'
  logo.innerHTML = STORE_LOGO[state.provider] ?? ''
  const svg = logo.querySelector('svg')
  if (svg) {
    svg.setAttribute('width', '20')
    svg.setAttribute('height', '20')
    svg.style.maxWidth = '20px'
    svg.style.maxHeight = '20px'
  }
  const titles = document.createElement('div')
  const title = document.createElement('div')
  title.className = 'title'
  title.textContent = state.done ? 'Cart filled' : `Filling cart · ${state.dish}`
  const subtitle = document.createElement('div')
  subtitle.className = 'subtitle'
  subtitle.textContent = state.done
    ? `${addedCount} of ${total} items added`
    : `${doneCount} / ${total} items`
  titles.append(title, subtitle)
  head.append(logo, titles)

  const cancel = document.createElement('button')
  cancel.className = 'cancel'
  cancel.textContent = state.done ? 'Close' : 'Stop'
  cancel.addEventListener('click', () => {
    if (state.done) removeOverlay()
    else onCancel()
  })
  head.appendChild(cancel)
  card.appendChild(head)

  const bar = document.createElement('div')
  bar.className = 'bar'
  const fill = document.createElement('div')
  fill.className = 'bar-fill'
  fill.style.background = accent
  fill.style.width = `${total === 0 ? 0 : Math.round((doneCount / total) * 100)}%`
  bar.appendChild(fill)
  card.appendChild(bar)

  const items = document.createElement('div')
  items.className = 'items'
  state.items.forEach((item, index) => {
    const row = document.createElement('div')
    row.className = `item${item.status === 'running' ? ' running' : ''}`
    const icon = document.createElement('span')
    icon.className = `icon ${item.status}`
    if (item.status === 'running') {
      row.style.background = `${accent}22`
      const spinner = document.createElement('span')
      spinner.className = 'spinner'
      spinner.style.borderTopColor = accent
      icon.appendChild(spinner)
    } else {
      icon.textContent = STATUS_ICON[item.status] ?? '○'
    }
    const label = document.createElement('span')
    label.textContent = item.name
    row.append(icon, label)
    items.appendChild(row)
    if (item.status === 'running' && index > 2) {
      queueMicrotask(() => row.scrollIntoView({ block: 'nearest' }))
    }
  })
  card.appendChild(items)

  if (state.done) {
    const note = document.createElement('div')
    note.className = 'done-note'
    note.textContent = 'Review your cart before checking out — quantities are our best match.'
    card.appendChild(note)
  }

  root.appendChild(card)
}

export function removeOverlay(): void {
  host?.remove()
  host = null
  shadow = null
}
