import type { ContentCommand, ContentMessage, OverlayState, PopupMessage } from '@/shared/messages'
import type { FillJob, JobItem, ProviderId, ShoppingList } from '@/shared/types'
import { PROVIDER_URLS } from '@/shared/providers'
import { normalizeIngredient } from '@/shared/normalize'
import { getActiveJob, setActiveJob } from '@/shared/storage'

/**
 * Orchestrator. Deliberately stateless: the active job lives in
 * chrome.storage so an MV3 service-worker restart mid-fill loses nothing —
 * the next CONTENT_READY simply picks the job back up.
 */

const WATCHDOG_ALARM = 'cookcart-watchdog'
const ITEM_TIMEOUT_MS = 75_000

chrome.runtime.onMessage.addListener(
  (message: PopupMessage | ContentMessage, sender, sendResponse) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((error) => {
        console.error('[CookCart]', error)
        sendResponse({ type: 'IDLE' } satisfies ContentCommand)
      })
    return true // async response
  },
)

async function handleMessage(
  message: PopupMessage | ContentMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
    case 'START_FILL':
      return startFill(message.list, message.provider, message.skipPantryStaples)
    case 'CANCEL_FILL':
      return cancelFill()
    case 'GET_JOB':
      return getActiveJob()
    case 'CONTENT_READY':
      return commandForTab(sender.tab?.id)
    case 'ITEM_RESULT':
      return onItemResult(message, sender.tab?.id)
    default:
      return undefined
  }
}

// ---------- job lifecycle ----------

async function startFill(
  list: ShoppingList,
  provider: ProviderId,
  skipPantryStaples: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  const items: JobItem[] = list.ingredients
    .filter((ing) => !(skipPantryStaples && ing.pantryStaple))
    .map((ing) => ({
      ingredient: ing,
      searchQuery: normalizeIngredient(ing.name).searchQuery,
      status: 'pending',
    }))

  if (items.length === 0) return { ok: false, reason: 'Nothing to add' }

  const tab = await chrome.tabs.create({
    url: PROVIDER_URLS[provider].searchUrl(items[0].searchQuery),
    active: true,
  })
  if (tab.id === undefined) return { ok: false, reason: 'Could not open the store tab' }

  const job: FillJob = {
    id: crypto.randomUUID(),
    provider,
    dish: list.dish,
    tabId: tab.id,
    items,
    currentIndex: 0,
    status: 'running',
    startedAt: Date.now(),
    lastProgressAt: Date.now(),
  }
  await publish(job)
  await chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 0.5 })
  return { ok: true }
}

async function cancelFill(): Promise<{ ok: boolean }> {
  const job = await getActiveJob()
  if (!job || job.status !== 'running') return { ok: true }
  job.items.forEach((item) => {
    if (item.status === 'running') item.status = 'failed'
  })
  await publish({ ...job, status: 'cancelled' })
  pushToTab(job.tabId, { type: 'IDLE' })
  return { ok: true }
}

/** Reply to a content script that just loaded in some store tab. */
async function commandForTab(tabId: number | undefined): Promise<ContentCommand> {
  const job = await getActiveJob()
  if (!job || tabId === undefined || job.tabId !== tabId) return { type: 'IDLE' }
  if (job.status === 'done') return { type: 'JOB_COMPLETE', overlay: overlayFrom(job) }
  if (job.status !== 'running') return { type: 'IDLE' }
  return runCommand(job)
}

async function onItemResult(
  result: Extract<ContentMessage, { type: 'ITEM_RESULT' }>,
  tabId: number | undefined,
): Promise<ContentCommand> {
  const job = await getActiveJob()
  if (!job || job.id !== result.jobId || job.tabId !== tabId || job.status !== 'running') {
    return { type: 'IDLE' }
  }
  if (result.index !== job.currentIndex) {
    // Stale result (e.g. watchdog already advanced) — resume from current state.
    return runCommand(job)
  }

  const item = job.items[result.index]
  item.status = result.status
  item.matched = result.matched
  item.error = result.error

  return advance(job)
}

/** Move to the next pending item, or finish the job. */
async function advance(job: FillJob): Promise<ContentCommand> {
  const nextIndex = job.items.findIndex(
    (item, i) => i > job.currentIndex && item.status === 'pending',
  )
  if (nextIndex === -1) {
    job.status = 'done'
    job.lastProgressAt = Date.now()
    await publish(job)
    await chrome.alarms.clear(WATCHDOG_ALARM)
    return { type: 'JOB_COMPLETE', overlay: overlayFrom(job) }
  }
  job.currentIndex = nextIndex
  return runCommand(job)
}

/** Mark the current item running, persist, and build its RUN_ITEM command. */
async function runCommand(job: FillJob): Promise<ContentCommand> {
  const item = job.items[job.currentIndex]
  item.status = 'running'
  job.lastProgressAt = Date.now()
  await publish(job)
  return {
    type: 'RUN_ITEM',
    jobId: job.id,
    provider: job.provider,
    dish: job.dish,
    item,
    index: job.currentIndex,
    total: job.items.length,
    overlay: overlayFrom(job),
  }
}

// ---------- helpers ----------

function overlayFrom(job: FillJob): OverlayState {
  return {
    dish: job.dish,
    provider: job.provider,
    items: job.items.map((item) => ({ name: item.ingredient.name, status: item.status })),
    currentIndex: job.currentIndex,
    done: job.status !== 'running',
  }
}

/** Persist + broadcast + badge in one place. */
async function publish(job: FillJob): Promise<void> {
  await setActiveJob(job)
  void chrome.runtime.sendMessage({ type: 'JOB_UPDATE', job }).catch(() => undefined)

  if (job.status === 'running') {
    const done = job.items.filter((i) =>
      ['added', 'skipped', 'failed'].includes(i.status),
    ).length
    void chrome.action.setBadgeBackgroundColor({ color: '#30d158' })
    void chrome.action.setBadgeText({ text: `${done}/${job.items.length}` })
  } else {
    void chrome.action.setBadgeText({ text: '' })
  }
}

function pushToTab(tabId: number, command: ContentCommand): void {
  void chrome.tabs.sendMessage(tabId, command).catch(() => undefined)
}

// ---------- watchdog: skip items that stall ----------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== WATCHDOG_ALARM) return
  void (async () => {
    const job = await getActiveJob()
    if (!job || job.status !== 'running') {
      await chrome.alarms.clear(WATCHDOG_ALARM)
      return
    }
    if (Date.now() - job.lastProgressAt < ITEM_TIMEOUT_MS) return

    const item = job.items[job.currentIndex]
    item.status = 'failed'
    item.error = 'Timed out'
    const command = await advance(job)
    pushToTab(job.tabId, command)
  })()
})

// If the store tab is closed mid-fill, the job is over.
chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    const job = await getActiveJob()
    if (job && job.status === 'running' && job.tabId === tabId) {
      await publish({ ...job, status: 'cancelled' })
      await chrome.alarms.clear(WATCHDOG_ALARM)
    }
  })()
})
