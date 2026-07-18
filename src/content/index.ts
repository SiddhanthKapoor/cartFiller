import type { ContentCommand, ContentMessage, FastItemResult } from '@/shared/messages'
import { sleep } from './dom'
import { runItem, type ItemOutcome } from './runner'
import { removeOverlay, renderOverlay } from './overlay'
import { blinkitFastFill, waitForBlinkitReady } from './providers/blinkitFast'

/**
 * Content script lifecycle:
 * 1. On every page load inside a supported store, announce readiness.
 * 2. Background replies with a command (run an item / show done / idle).
 * 3. Item results go back to background, which replies with the next command.
 * The background can also push commands (watchdog advance, cancel).
 */

let busy = false

function send(message: ContentMessage): Promise<ContentCommand | undefined> {
  return chrome.runtime.sendMessage(message).catch(() => undefined)
}

function cancelJob(): void {
  void chrome.runtime.sendMessage({ type: 'CANCEL_FILL' }).catch(() => undefined)
  removeOverlay()
}

/** Report a fast fill, then reload so the store app hydrates the new cart. */
async function finishFastFill(jobId: string, results: FastItemResult[]): Promise<void> {
  await send({ type: 'FILL_DONE', jobId, results })
  if (results.some((r) => r.status === 'added')) {
    setTimeout(() => location.reload(), 250)
  } else {
    busy = false
  }
}

async function handleCommand(command: ContentCommand | undefined): Promise<void> {
  if (!command) return

  switch (command.type) {
    case 'IDLE':
      removeOverlay()
      return

    case 'JOB_COMPLETE':
      renderOverlay(command.overlay, cancelJob)
      return

    case 'RUN_ALL': {
      if (busy) return
      busy = true
      renderOverlay(command.overlay, cancelJob)

      const skipAll = (error: string): FastItemResult[] =>
        command.items.map((_, index) => ({ index, status: 'skipped', error }))

      let results: FastItemResult[]
      // The page sets its delivery location a moment after load — wait for it.
      if (!(await waitForBlinkitReady())) {
        results = skipAll('Open Blinkit and set a delivery location first')
      } else {
        const abort = new AbortController()
        try {
          results = await Promise.race([
            blinkitFastFill(
              command.items.map((it) => ({ ingredient: it.ingredient, searchQuery: it.searchQuery })),
              abort.signal,
            ),
            // Generous ceiling so rate-limit retries (up to ~20s/item, bounded
            // concurrency) complete instead of being cut to "Timed out". On
            // timeout, abort so the loser can't still write the cart.
            sleep(55_000).then(() => {
              abort.abort()
              return skipAll('Timed out')
            }),
          ])
        } catch {
          results = skipAll('Fill failed')
        }
      }
      await finishFastFill(command.jobId, results)
      return
    }

    case 'RUN_ITEM': {
      if (busy) return
      busy = true
      renderOverlay(command.overlay, cancelJob)
      try {
        // Hard deadline: whatever happens inside the automation, the
        // background always hears back and the job always moves on.
        const outcome = await Promise.race<ItemOutcome>([
          runItem(command),
          sleep(30_000).then(
            (): ItemOutcome => ({
              kind: 'result',
              status: 'failed',
              error: 'Automation deadline exceeded',
            }),
          ),
        ])
        if (outcome.kind === 'navigated') return // reload will re-announce
        const next = await send({
          type: 'ITEM_RESULT',
          jobId: command.jobId,
          index: command.index,
          status: outcome.status,
          matched: outcome.matched,
          error: outcome.error,
        })
        busy = false
        await handleCommand(next)
      } catch (error) {
        const next = await send({
          type: 'ITEM_RESULT',
          jobId: command.jobId,
          index: command.index,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unexpected automation error',
        })
        busy = false
        await handleCommand(next)
      }
      return
    }
  }
}

// Pushed commands (fast fill, watchdog advance, cancellation).
chrome.runtime.onMessage.addListener((message: ContentCommand, sender) => {
  // Defense-in-depth: only ever act on messages from our own extension.
  if (sender.id && sender.id !== chrome.runtime.id) return
  if (message?.type === 'IDLE' || message?.type === 'JOB_COMPLETE') {
    void handleCommand(message)
  } else if ((message?.type === 'RUN_ITEM' || message?.type === 'RUN_ALL') && !busy) {
    void handleCommand(message)
  }
})

/**
 * Troubleshooter: the store sometimes serves a 5xx / "bad gateway" / blank
 * page that would otherwise leave a fill stuck. Detect it and reload a couple
 * of times (these are usually transient) before letting the normal flow run.
 * Only kicks in when there's an active job for this tab.
 */
function looksBroken(): boolean {
  const body = (document.body?.innerText ?? '').slice(0, 800).toLowerCase()
  if (document.body && document.body.innerText.trim().length < 40) return true
  return /(502|503|504|bad gateway|gateway time-?out|service unavailable|temporarily unavailable|something went wrong|site can'?t be reached|try again)/.test(
    body,
  )
}

const RELOAD_KEY = 'cookcart_pageReloads'

async function recoverIfBroken(): Promise<boolean> {
  const job = await chrome.runtime
    .sendMessage({ type: 'GET_JOB' })
    .catch(() => null)
  // Only self-heal when a fill for THIS tab is actually in progress.
  const active =
    job &&
    typeof job === 'object' &&
    (job as { status?: string }).status === 'running'
  if (!active || !looksBroken()) return false

  const tries = Number(sessionStorage.getItem(RELOAD_KEY) || '0')
  if (tries >= 3) return false
  sessionStorage.setItem(RELOAD_KEY, String(tries + 1))
  await sleep(1500 + tries * 1500)
  location.reload()
  return true
}

async function announce(): Promise<void> {
  if (await recoverIfBroken()) return // reloading — will re-announce on load
  sessionStorage.removeItem(RELOAD_KEY) // page is fine; reset the counter
  const command = await send({ type: 'CONTENT_READY', href: location.href })
  await handleCommand(command)
}

void announce()
