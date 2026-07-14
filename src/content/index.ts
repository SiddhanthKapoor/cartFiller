import type { ContentCommand, ContentMessage } from '@/shared/messages'
import { sleep } from './dom'
import { runItem, type ItemOutcome } from './runner'
import { removeOverlay, renderOverlay } from './overlay'

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

async function handleCommand(command: ContentCommand | undefined): Promise<void> {
  if (!command) return

  switch (command.type) {
    case 'IDLE':
      removeOverlay()
      return

    case 'JOB_COMPLETE':
      renderOverlay(command.overlay, cancelJob)
      return

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

// Pushed commands (watchdog advance, cancellation) — not request/response.
chrome.runtime.onMessage.addListener((message: ContentCommand) => {
  if (message?.type === 'IDLE' || message?.type === 'JOB_COMPLETE') {
    void handleCommand(message)
  } else if (message?.type === 'RUN_ITEM' && !busy) {
    void handleCommand(message)
  }
})

async function announce(): Promise<void> {
  const command = await send({ type: 'CONTENT_READY', href: location.href })
  await handleCommand(command)
}

void announce()
