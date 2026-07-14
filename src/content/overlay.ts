import type { OverlayState } from '@/shared/messages'

/**
 * Floating progress card rendered into a shadow root so the host page's
 * styles can't touch it (and vice versa).
 */

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
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    border-radius: 18px;
    background: rgba(19, 19, 24, 0.86);
    backdrop-filter: blur(24px) saturate(160%);
    -webkit-backdrop-filter: blur(24px) saturate(160%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
    color: #f5f5f7;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
    animation: rise 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(16px) scale(0.98); }
    to { opacity: 1; transform: none; }
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px 10px;
  }
  .logo {
    width: 26px; height: 26px; border-radius: 8px; flex: none;
    background: linear-gradient(180deg, #34db66, #22b14c);
    display: grid; place-items: center; font-size: 14px;
  }
  .title { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
  .subtitle { font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 1px; }
  .cancel {
    margin-left: auto; border: 0; cursor: pointer;
    background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7);
    border-radius: 8px; font-size: 11px; padding: 5px 10px;
    font-family: inherit; transition: background 0.2s;
  }
  .cancel:hover { background: rgba(255,255,255,0.16); }
  .bar {
    height: 3px; margin: 0 16px; border-radius: 2px;
    background: rgba(255,255,255,0.08); overflow: hidden;
  }
  .bar-fill {
    height: 100%; border-radius: 2px;
    background: linear-gradient(90deg, #34db66, #22b14c);
    transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .items { padding: 10px 8px 12px; overflow-y: auto; }
  .items::-webkit-scrollbar { width: 5px; }
  .items::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 3px; }
  .item {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 10px; border-radius: 10px; font-size: 12px;
    color: rgba(255,255,255,0.8);
  }
  .item.running { background: rgba(48, 209, 88, 0.1); color: #fff; }
  .icon { width: 16px; height: 16px; flex: none; display: grid; place-items: center; font-size: 11px; }
  .icon.pending { color: rgba(255,255,255,0.3); }
  .icon.added { color: #30d158; }
  .icon.skipped { color: #ffd60a; }
  .icon.failed { color: #ff453a; }
  .spinner {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid rgba(48, 209, 88, 0.25);
    border-top-color: #30d158;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .done-note {
    padding: 4px 16px 14px; font-size: 12px; color: rgba(255,255,255,0.6);
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

  const head = document.createElement('div')
  head.className = 'head'
  const logo = document.createElement('div')
  logo.className = 'logo'
  logo.textContent = '🛒'
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
      const spinner = document.createElement('span')
      spinner.className = 'spinner'
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
