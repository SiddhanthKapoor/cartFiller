import { appendCaptures, getSettings, type ApiCapture } from '@/shared/storage'

/**
 * Bridge between the main-world API observer and the extension.
 *
 * The observer (page context) can't read chrome.storage, so here — in the
 * isolated content script — we:
 *   1. mirror the "observe" setting onto <html data-cookcart-observe>, which is
 *      the only thing the observer checks before it logs/captures, and
 *   2. receive the captures it postMessages and buffer them into
 *      chrome.storage so Settings can copy them out.
 */

const FLAG = 'cookcartObserve'
const SETTINGS_KEY = 'cookcart.settings'

function setFlag(on: boolean): void {
  const el = document.documentElement
  if (!el) return
  if (on) el.dataset[FLAG] = '1'
  else delete el.dataset[FLAG]
}

let queue: ApiCapture[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    const batch = queue
    queue = []
    void appendCaptures(batch)
  }, 800)
}

function isCapture(data: unknown): data is { source: string; capture: ApiCapture } {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as { source?: unknown }).source === 'cookcart-observe' &&
    typeof (data as { capture?: unknown }).capture === 'object'
  )
}

export async function startObserveBridge(): Promise<void> {
  const settings = await getSettings().catch(() => null)
  setFlag(settings?.observeApi === true)

  // React to the toggle flipping in Settings without a page reload.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return
    const next = changes[SETTINGS_KEY].newValue as { observeApi?: boolean } | undefined
    setFlag(next?.observeApi === true)
  })

  // Collect what the page-context observer taps. Same-window messages only.
  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    if (!isCapture(event.data)) return
    queue.push(event.data.capture)
    scheduleFlush()
  })
}
