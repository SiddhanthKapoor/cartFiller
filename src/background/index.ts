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
    // Only accept messages from this extension's own popup and content
    // scripts — never from web pages (there's no externally_connectable, but
    // this makes that guarantee explicit).
    if (sender.id !== chrome.runtime.id) return false
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

  // Only Blinkit supports the instant one-shot fill (open, unsigned search
  // API). Zepto signs its requests, so it uses the DOM flow.
  const mode: FillJob['mode'] = provider === 'blinkit' ? 'fast' : 'stepwise'

  const urls = PROVIDER_URLS[provider]
  // Land (and later reload) on the first item's SEARCH page. For Blinkit this
  // is load-bearing, not cosmetic: reloading on the home page makes the app
  // re-initialise an empty cart and discard the cart we wrote, whereas the
  // search page preserves it. So the fast fill must sit on a search page.
  const landingUrl = urls.searchUrl(items[0].searchQuery)

  // Reuse the tab the user is already on if it's this store — no pointless
  // second tab. Otherwise open one.
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  let tabId: number | undefined
  let reused = false
  if (active?.id !== undefined && active.url && urls.matches(new URL(active.url))) {
    tabId = active.id
    reused = true
  } else {
    const tab = await chrome.tabs.create({ url: landingUrl, active: true })
    tabId = tab.id
  }
  if (tabId === undefined) return { ok: false, reason: 'Could not open the store tab' }
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

  // A newly created tab already has a fresh content script. A REUSED tab may
  // hold a content script orphaned by the last extension reload — it silently
  // ignores messages (the "stuck / products don't open" symptom). Reload it so
  // a live script runs; it announces CONTENT_READY and gets its command back
  // (see commandForTab). Applies to both fast (Blinkit) and step-wise (Zepto).
  if (reused) {
    try {
      // Guarantee a FRESH content script every time (a script orphaned by an
      // extension reload silently ignores the fill). Both branches reload the
      // tab: reload() if it's already on a search page (keeps the cart-safe
      // search-page landing), otherwise navigate to one. This is robust to
      // URL-string differences that an exact match would miss.
      const onSearchPage = active?.url ? urls.isSearchPage(new URL(active.url)) : false
      if (onSearchPage) await chrome.tabs.reload(tabId)
      else await chrome.tabs.update(tabId, { url: landingUrl, active: true })
    } catch {
      return { ok: false, reason: 'Could not open the store tab' }
    }
  }

  // Both modes get the watchdog: it recovers a fill that never ran because
  // the tab's content script was orphaned by an extension reload.
  await chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 0.5 })
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

  // Fallback: if the fast (API) fill landed nothing — the search API was
  // blocked/erroring, not merely "no location" — switch this Blinkit job to
  // the step-wise DOM click flow and try again. The DOM path uses the page's
  // own Add buttons, so it works even when the API refuses us.
  const addedCount = job.items.filter((i) => i.status === 'added').length
  const needsLocation = job.items.some((i) => /location/i.test(i.error ?? ''))
  if (job.provider === 'blinkit' && addedCount === 0 && !needsLocation && !job.fellBackToDom) {
    job.fellBackToDom = true
    job.mode = 'stepwise'
    job.currentIndex = 0
    job.dispatched = false
    job.lastProgressAt = Date.now()
    job.items.forEach((it) => {
      it.status = 'pending'
      it.error = undefined
      it.retried = false
      it.stalled = false
    })
    await setActiveJob(job)
    await chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 0.5 })
    await reloadTabAt(job, job.items[0].searchQuery) // fresh page → RUN_ITEM flow
    return { type: 'IDLE' }
  }

  job.status = 'done'
  job.lastProgressAt = Date.now()
  await chrome.alarms.clear(WATCHDOG_ALARM)
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
  if (job.status === 'done') {
    // Show the "cart filled" overlay exactly once (on the auto-reload right
    // after the fill). A finished job stays in storage for the popup, but
    // re-covering the page on every later manual refresh reads as "broken".
    if (job.overlayShown) return { type: 'IDLE' }
    job.overlayShown = true
    await setActiveJob(job)
    return { type: 'JOB_COMPLETE', overlay: overlayFrom(job) }
  }
  if (job.status !== 'running') return { type: 'IDLE' }
  // Fast mode: hand the whole list to the fresh content script once (it
  // reloads the page after writing the cart, and re-announces here — by then
  // the job is done and it gets JOB_COMPLETE above).
  if (job.mode === 'fast') {
    // Re-hand the list on EVERY announce while running. If Blinkit reloads the
    // search page mid-fill (its SPA does), the fresh content script must get
    // RUN_ALL again — otherwise the fill silently never runs. The content-side
    // `busy` flag stops a genuine double-run within one page life, and a
    // re-write is idempotent (same items, Math.max quantity).
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
    // Always the search page — for Blinkit's fast fill this is what makes the
    // written cart survive the reload (home re-initialises an empty cart).
    await chrome.tabs.update(job.tabId, {
      url: PROVIDER_URLS[job.provider].searchUrl(query),
    })
  } catch {
    await publish({ ...job, status: 'cancelled' })
    await chrome.alarms.clear(WATCHDOG_ALARM)
  }
}

// Must exceed the content script's own fast-fill ceiling (55s) so the watchdog
// never reloads the tab mid-fill while retries are still in flight.
const FAST_TIMEOUT_MS = 65_000

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== WATCHDOG_ALARM) return
  void (async () => {
    const job = await getActiveJob()
    if (!job || job.status !== 'running') {
      await chrome.alarms.clear(WATCHDOG_ALARM)
      return
    }

    // ---- fast mode (Blinkit) ----
    // A fast fill finishes in a few seconds. If it hasn't, the content
    // script never ran the command (orphaned by an extension reload, or a
    // handshake race). Reload the tab — that injects a FRESH content script,
    // which re-announces and gets RUN_ALL — and retry a couple of times.
    if (job.mode === 'fast') {
      if (Date.now() - job.lastProgressAt < FAST_TIMEOUT_MS) return
      const retries = job.fastRetries ?? 0
      if (retries < 3) {
        job.fastRetries = retries + 1
        job.dispatched = false
        job.lastProgressAt = Date.now()
        await setActiveJob(job)
        await reloadTabAt(job, job.items[0].searchQuery)
      } else {
        job.items.forEach((it) => {
          if (it.status === 'pending' || it.status === 'running') {
            it.status = 'skipped'
            it.error = 'Could not reach the store — open it and set a delivery location'
          }
        })
        job.status = 'done'
        await publish(job)
        await chrome.alarms.clear(WATCHDOG_ALARM)
      }
      return
    }

    // ---- step-wise mode ----
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
