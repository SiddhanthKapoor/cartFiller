export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** A humanized pause so we do not hammer the page faster than a user could. */
export const pause = (min = 150, max = 400): Promise<void> =>
  sleep(min + Math.random() * (max - min))

export interface WaitOptions {
  timeoutMs?: number
  intervalMs?: number
}

/** Poll `probe` until it returns a truthy value or the timeout elapses. */
export async function waitFor<T>(
  probe: () => T | null | undefined | false,
  { timeoutMs = 12_000, intervalMs = 250 }: WaitOptions = {},
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = probe()
    if (result) return result
    await sleep(intervalMs)
  }
  return null
}

/** Wait until the DOM stops mutating for `quietMs` (or timeout). */
export function waitForQuietDom(quietMs = 400, timeoutMs = 5_000): Promise<void> {
  return new Promise((resolve) => {
    let timer = setTimeout(finish, quietMs)
    const hardStop = setTimeout(finish, timeoutMs)
    const observer = new MutationObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(finish, quietMs)
    })
    function finish() {
      observer.disconnect()
      clearTimeout(timer)
      clearTimeout(hardStop)
      resolve()
    }
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

export function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return false
  const style = getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
}

/**
 * Dispatch a full pointer event sequence — React and other frameworks often
 * listen on pointerdown/mousedown rather than click.
 */
export function fireClick(el: HTMLElement): void {
  el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
  const rect = el.getBoundingClientRect()
  const opts = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  }
  el.dispatchEvent(new PointerEvent('pointerdown', opts))
  el.dispatchEvent(new MouseEvent('mousedown', opts))
  el.dispatchEvent(new PointerEvent('pointerup', opts))
  el.dispatchEvent(new MouseEvent('mouseup', opts))
  el.click()
}

/** Trimmed, whitespace-collapsed text of an element. */
export function textOf(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}
