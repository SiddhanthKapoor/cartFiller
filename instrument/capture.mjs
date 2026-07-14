// CookCart — network instrumentation harness.
//
// Treats a scripted Blinkit browsing flow as a reverse-engineering session:
// attaches a CDP Network recorder BEFORE any interaction, buckets every
// request/response under the browser action that caused it, and writes a
// raw session file that analyze.mjs turns into network-report.md.
//
// It does NOT touch the extension's automation. It reproduces the same
// actions (search → open product → add to cart → increase quantity) on a
// plain page purely to observe the traffic they generate.
//
// Usage:
//   node instrument/capture.mjs                 # default flow, headed
//   node instrument/capture.mjs --headless
//   node instrument/capture.mjs --queries rice,paneer,chicken
//
// Cart/checkout endpoints only fire when you are logged in with a delivery
// location set. Run once headed, sign in + set location in the window that
// opens, then let the flow proceed — the persistent profile keeps you
// logged in for later runs.

import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, 'out')
const PROFILE_DIR = join(OUT_DIR, 'brave-profile')

const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// ---------- args ----------
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}
const HEADLESS = flag('--headless')
const QUERIES = opt('--queries', 'chicken,paneer,rice')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const LOGIN_WAIT_MS = Number(opt('--login-wait', HEADLESS ? '0' : '45000'))
const MAX_BODY = 2_000_000 // cap stored response bodies at ~2 MB

import { existsSync } from 'node:fs'
const EXECUTABLE = existsSync(CHROME) ? CHROME : BRAVE

// ---------- sensitive-value masking ----------
const SENSITIVE_HEADER = /cookie|authorization|auth_key|access[-_]?token|x-api-key|session|csrf|device|gr_1_/i
const SENSITIVE_COOKIE = /token|session|auth|gr_1_|jwt|otp|_ga|device/i

function maskValue(value) {
  if (typeof value !== 'string' || value.length <= 8) return value ? '***' : value
  return `${value.slice(0, 3)}…${value.slice(-2)} [${value.length} chars, masked]`
}
function maskHeaders(headers = {}) {
  const out = {}
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADER.test(k) ? maskValue(String(v)) : v
  }
  return out
}
function maskCookieHeader(cookieStr) {
  if (!cookieStr) return cookieStr
  return cookieStr
    .split(';')
    .map((pair) => {
      const [k, ...rest] = pair.split('=')
      const key = k.trim()
      const val = rest.join('=')
      return SENSITIVE_COOKIE.test(key) ? `${key}=${maskValue(val)}` : `${key}=${val}`
    })
    .join('; ')
}

function parseQuery(url) {
  try {
    const u = new URL(url)
    return Object.fromEntries(u.searchParams.entries())
  } catch {
    return {}
  }
}

// ---------- recorder ----------
const records = new Map() // requestId -> record
const finished = [] // completed records in order
let seq = 0
let currentAction = 'startup'
const actionOrder = []

function setAction(name) {
  currentAction = name
  actionOrder.push({ action: name, at: Date.now() })
}

async function attachRecorder(cdp) {
  await cdp.send('Network.enable', {
    maxResourceBufferSize: 200_000_000,
    maxTotalBufferSize: 500_000_000,
  })

  cdp.on('Network.requestWillBeSent', (e) => {
    const { request } = e
    records.set(e.requestId, {
      seq: seq++,
      action: currentAction,
      timestamp: new Date().toISOString(),
      wallTime: e.wallTime,
      requestId: e.requestId,
      url: request.url,
      method: request.method,
      resourceType: e.type,
      frameUrl: e.frameId,
      documentUrl: e.documentURL,
      initiator: {
        type: e.initiator?.type,
        url: e.initiator?.url,
        // top stack frame only — enough to see what JS fired it
        stackTop: e.initiator?.stack?.callFrames?.[0]
          ? `${e.initiator.stack.callFrames[0].functionName || '(anon)'} @ ${e.initiator.stack.callFrames[0].url}:${e.initiator.stack.callFrames[0].lineNumber}`
          : null,
      },
      requestHeaders: maskHeaders(request.headers),
      queryParams: parseQuery(request.url),
      postData: request.postData ? request.postData.slice(0, MAX_BODY) : null,
      hasPostData: request.hasPostData ?? Boolean(request.postData),
      response: null,
      failure: null,
    })
  })

  cdp.on('Network.requestWillBeSentExtraInfo', (e) => {
    const rec = records.get(e.requestId)
    if (!rec) return
    const cookieHeader = e.headers?.Cookie ?? e.headers?.cookie
    if (cookieHeader) rec.requestCookies = maskCookieHeader(cookieHeader)
  })

  cdp.on('Network.responseReceived', (e) => {
    const rec = records.get(e.requestId)
    if (!rec) return
    const r = e.response
    rec.response = {
      status: r.status,
      statusText: r.statusText,
      headers: maskHeaders(r.headers),
      mimeType: r.mimeType,
      remoteIP: r.remoteIPAddress,
      fromCache: r.fromDiskCache || false,
      timingMs: r.timing
        ? Math.round((r.timing.receiveHeadersEnd ?? 0) - (r.timing.sendStart ?? 0))
        : null,
      body: null,
      json: null,
      sizeBytes: null,
    }
  })

  cdp.on('Network.loadingFinished', async (e) => {
    const rec = records.get(e.requestId)
    if (!rec) return
    if (rec.response) rec.response.sizeBytes = e.encodedDataLength ?? null
    // Only pull bodies for API-ish responses; skip images/fonts/media.
    const mime = rec.response?.mimeType ?? ''
    const wantsBody =
      /json|javascript|text|xml/.test(mime) &&
      !/\.(png|jpe?g|webp|gif|svg|woff2?|css)(\?|$)/i.test(rec.url)
    if (wantsBody) {
      try {
        const { body, base64Encoded } = await cdp.send('Network.getResponseBody', {
          requestId: e.requestId,
        })
        const text = base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body
        rec.response.body = text.slice(0, MAX_BODY)
        if (/json/.test(mime)) {
          try {
            rec.response.json = JSON.parse(text)
          } catch {
            /* not valid json despite mime */
          }
        }
      } catch {
        /* body already evicted */
      }
    }
    records.delete(e.requestId)
    finished.push(rec)
  })

  cdp.on('Network.loadingFailed', (e) => {
    const rec = records.get(e.requestId)
    if (!rec) return
    rec.failure = { errorText: e.errorText, canceled: e.canceled ?? false, blockedReason: e.blockedReason }
    records.delete(e.requestId)
    finished.push(rec)
  })
}

// ---------- flow ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function session(page, name, fn, settleMs = 3500) {
  console.log(`\n▶ ACTION: ${name}`)
  const before = finished.length
  setAction(name)
  try {
    await fn()
  } catch (err) {
    console.log(`  (action threw: ${err.message})`)
  }
  await sleep(settleMs)
  const count = finished.length - before
  console.log(`  captured ${count} requests`)
}

async function clickFirst(page, selectorList) {
  for (const sel of selectorList) {
    const el = page.locator(sel).first()
    if ((await el.count()) > 0) {
      try {
        await el.click({ timeout: 3000 })
        return sel
      } catch {
        /* try next */
      }
    }
  }
  return null
}

async function main() {
  if (!existsSync(EXECUTABLE)) {
    console.error(`No Chrome/Brave found at ${CHROME} or ${BRAVE}`)
    process.exit(1)
  }
  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`Browser: ${EXECUTABLE}`)
  console.log(`Queries: ${QUERIES.join(', ')}`)

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: EXECUTABLE,
    headless: HEADLESS,
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    args: ['--no-first-run'],
  })

  const page = context.pages()[0] ?? (await context.newPage())
  const cdp = await context.newCDPSession(page)
  await attachRecorder(cdp)

  // ---- action: cold home load ----
  await session(page, 'navigate_home', async () => {
    await page.goto('https://blinkit.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
  })

  if (LOGIN_WAIT_MS > 0) {
    console.log(
      `\n⏳ ${LOGIN_WAIT_MS / 1000}s to sign in + set delivery location in the window ` +
        `(needed for cart/checkout endpoints)…`,
    )
    setAction('user_login_location')
    await sleep(LOGIN_WAIT_MS)
  }

  // ---- action: searches (multiple, for parameter diffing) ----
  for (const q of QUERIES) {
    await session(page, `search:${q}`, async () => {
      await page.goto(`https://blinkit.com/s/?q=${encodeURIComponent(q)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      // nudge lazy-loading
      await page.mouse.wheel(0, 1200).catch(() => {})
    })
  }

  // ---- action: open a product ----
  await session(page, 'click_product', async () => {
    await clickFirst(page, [
      '[data-test-id="plp-product"]',
      'div[role="button"]:has(img)',
      'a[href*="/prn/"]',
    ])
  })

  // ---- action: add to cart ----
  const addSelectors = [
    'div[role="button"]:has-text("ADD")',
    'button:has-text("ADD")',
    'text=ADD',
  ]
  await session(page, 'add_to_cart', async () => {
    const hit = await clickFirst(page, addSelectors)
    console.log(`  add selector: ${hit ?? 'none matched'}`)
  })

  // ---- action: increase quantity ----
  await session(page, 'increase_quantity', async () => {
    await clickFirst(page, [
      'div[role="button"]:has-text("+")',
      'button:has-text("+")',
      '[aria-label*="ncrement"]',
    ])
  })

  // give trailing async calls a moment
  await sleep(2500)

  const out = {
    capturedAt: new Date().toISOString(),
    browser: EXECUTABLE,
    queries: QUERIES,
    loggedInHint: LOGIN_WAIT_MS > 0,
    actionOrder,
    records: finished.sort((a, b) => a.seq - b.seq),
  }
  const file = join(OUT_DIR, 'session.json')
  writeFileSync(file, JSON.stringify(out, null, 2))
  console.log(`\n✓ ${finished.length} requests → ${file}`)

  await context.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
