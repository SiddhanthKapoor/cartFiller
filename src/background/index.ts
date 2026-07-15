import type { ContentCommand, ContentMessage, OverlayState, PopupMessage } from '@/shared/messages'
import type { FillJob, JobItem, ProviderId, ShoppingList } from '@/shared/types'
import { PROVIDER_URLS } from '@/shared/providers'
import { cleanName, normalizeIngredient } from '@/shared/normalize'
import { getActiveJob, setActiveJob } from '@/shared/storage'

/**
 * Orchestrator. Deliberately stateless: the active job lives in
 * chrome.storage so an MV3 service-worker restart mid-fill loses nothing —
 * the next CONTENT_READY simply picks the job back up.
 */

const WATCHDOG_ALARM = 'cookcart-watchdog'
const ITEM_TIMEOUT_MS = 40_000

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
    case 'FILL_DONE':
      return onFillDone(message)
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

  const urls = PROVIDER_URLS[provider]
  // Reuse the tab the user is already on if it's this store — no pointless
  // second tab. Otherwise open one.
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  let tabId: number | undefined
  let reused = false
  if (active?.id !== undefined && active.url && urls.matches(new URL(active.url))) {
    tabId = active.id
    reused = true
  } else {
    const tab = await chrome.tabs.create({ url: urls.searchUrl(items[0].searchQuery), active: true })
    tabId = tab.id
  }
  if (tabId === undefined) return { ok: false, reason: 'Could not open the store tab' }

  // Only Blinkit supports the instant one-shot fill (open, unsigned search
  // API). Zepto/Instamart sign their requests, so they use the DOM flow.
  const mode: FillJob['mode'] = provider === 'blinkit' ? 'fast' : 'stepwise'
  const job: FillJob = {
    id: crypto.randomUUID(),
    provider,
    dish: list.dish,
    tabId,
    items,
    currentIndex: 0,
    status: 'running',
    startedAt: Date.now(),
    lastProgressAt: Date.now(),
    mode,
  }
  await publish(job)

  if (mode === 'fast') {
    // A newly created tab already has a fresh content script. But a REUSED
    // tab may hold a content script orphaned by the last extension reload —
    // it silently ignores messages ("stuck at 0/N"). Reload it so a live
    // script runs; it announces CONTENT_READY and gets RUN_ALL (commandForTab).
    if (reused) {
      try {
        await chrome.tabs.update(tabId, { url: urls.searchUrl(items[0].searchQuery), active: true })
      } catch {
        return { ok: false, reason: 'Could not open the store tab' }
      }
    }
  } else {
    await chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 0.5 })
  }
  return { ok: true }
}

function runAllCommand(job: FillJob): ContentCommand {
  return {
    type: 'RUN_ALL',
    jobId: job.id,
    provider: job.provider,
    dish: job.dish,
    items: job.items,
    overlay: overlayFrom(job),
  }
}

async function onFillDone(
  message: Extract<ContentMessage, { type: 'FILL_DONE' }>,
): Promise<ContentCommand> {
  const job = await getActiveJob()
  if (!job || job.id !== message.jobId || job.status !== 'running') return { type: 'IDLE' }

  for (const r of message.results) {
    const item = job.items[r.index]
    if (!item) continue
    item.status = r.status
    item.matched = r.matched
    item.error = r.error
  }
  job.status = 'done'
  job.lastProgressAt = Date.now()
  await publish(job)
  return { type: 'JOB_COMPLETE', overlay: overlayFrom(job) }
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
  // Fast mode: hand the whole list to the fresh content script once (it
  // reloads the page after writing the cart, and re-announces here — by then
  // the job is done and it gets JOB_COMPLETE above).
  if (job.mode === 'fast') {
    if (!job.dispatched) {
      job.dispatched = true
      await setActiveJob(job)
    }
    return runAllCommand(job)
  }
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

/**
 * A simpler query for the retry round: "chicken curry cut" -> "chicken",
 * or the cleaned raw name when the dictionary query already failed.
 */
function fallbackQuery(item: JobItem): string {
  const cleaned = cleanName(item.ingredient.name)
  if (cleaned && cleaned !== item.searchQuery) return cleaned
  const words = item.searchQuery.split(' ')
  return words.length > 1 ? words[0] : item.searchQuery
}

/** Move to the next pending item, retry misses once, or finish the job. */
async function advance(job: FillJob): Promise<ContentCommand> {
  let nextIndex = job.items.findIndex((item) => item.status === 'pending')

  if (nextIndex === -1) {
    // Verification pass: anything skipped/failed gets exactly one more
    // attempt with a simpler search query before we call the job done.
    const retryable = job.items.filter(
      (item) => (item.status === 'skipped' || item.status === 'failed') && !item.retried,
    )
    for (const item of retryable) {
      item.retried = true
      item.status = 'pending'
      item.error = undefined
      item.searchQuery = fallbackQuery(item)
    }
    if (retryable.length > 0) {
      nextIndex = job.items.findIndex((item) => item.status === 'pending')
    }
  }

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

// ---------- watchdog: physically recover stalled fills ----------

/**
 * Reload the job tab at a search URL. A navigation re-injects the manifest
 * content script, so this recovers even a dead script (e.g. its context was
 * invalidated by an extension reload). Never message a script that may not
 * be listening — drive the tab instead.
 */
async function reloadTabAt(job: FillJob, query: string): Promise<void> {
  try {
    await chrome.tabs.update(job.tabId, {
      url: PROVIDER_URLS[job.provider].searchUrl(query),
    })
  } catch {
    await publish({ ...job, status: 'cancelled' })
    await chrome.alarms.clear(WATCHDOG_ALARM)
  }
}

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
    if (!item.stalled) {
      // First stall on this item: reload the tab and retry it in place.
      item.stalled = true
      item.status = 'pending'
      job.lastProgressAt = Date.now()
      await publish(job)
      await reloadTabAt(job, item.searchQuery)
      return
    }

    // Second stall: give up on this item and physically move to the next.
    item.status = 'failed'
    item.error = 'Timed out'
    const command = await advance(job)
    if (command.type === 'RUN_ITEM') await reloadTabAt(job, command.item.searchQuery)
    else pushToTab(job.tabId, command)
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
