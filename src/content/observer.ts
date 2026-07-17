/**
 * API observer — runs in the PAGE's own JS context (world: 'MAIN'), so it can
 * see the real requests the store app makes, including signed/authenticated
 * ones the extension itself can't reproduce from an isolated content script.
 *
 * It's inert until you turn it on: the isolated content script mirrors the
 * "observe" setting onto <html data-cookcart-observe="1">, and only then does
 * this patch log or capture anything. When on, it:
 *   1. logs each store API call (method, URL, request headers/body, response)
 *      to the page's DevTools console, and
 *   2. posts a trimmed copy to the isolated world so it can be buffered in
 *      chrome.storage and copied out from Settings.
 *
 * Nothing is blocked, rewritten or delayed — it's a passive tap on fetch/XHR.
 */

interface Capture {
  at: number
  kind: 'fetch' | 'xhr'
  method: string
  url: string
  reqHeaders: Record<string, string>
  reqBody: string | null
  status: number
  respBody: string
  isCart: boolean
}

const ACCENT = 'color:#219ebd;font-weight:bold'
const CART = 'color:#c2121f;font-weight:bold'

// Only the calls we actually need to reverse-engineer right now: product
// search / autosuggest, and cart / checkout. Everything else (homepage feed,
// pass, ads, telemetry) is ignored so the capture buffer stays small.
const SEARCH_RE = /(search|auto-?suggest|auto-?complete|suggest|catalog)/i
const CART_RE = /(cart|atc|add-?to-?cart|add_to_cart|checkout|basket)/i
const SKIP_RE =
  /\.(js|mjs|css|png|jpe?g|webp|avif|svg|gif|ico|woff2?|ttf|mp4|m3u8)(\?|$)|(google-analytics|googletagmanager|doubleclick|facebook|clevertap|branch\.io|sentry|datadog|mixpanel|segment|amplitude|hotjar|newrelic|_rsc=)/i

const observing = (): boolean =>
  document.documentElement?.dataset.cookcartObserve === '1'

const isInteresting = (url: string): boolean =>
  (SEARCH_RE.test(url) || CART_RE.test(url)) && !SKIP_RE.test(url)

function headersToObject(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!h) return out
  try {
    if (h instanceof Headers) h.forEach((v, k) => (out[k] = v))
    else if (Array.isArray(h)) h.forEach(([k, v]) => (out[k] = String(v)))
    else Object.entries(h).forEach(([k, v]) => (out[k] = String(v)))
  } catch {
    /* ignore malformed header inits */
  }
  return out
}

function bodyToString(body: unknown): string | null {
  if (body == null) return null
  if (typeof body === 'string') return body.slice(0, 4000)
  try {
    if (body instanceof URLSearchParams) return body.toString().slice(0, 4000)
    if (body instanceof FormData) {
      const parts: string[] = []
      body.forEach((v, k) => parts.push(`${k}=${typeof v === 'string' ? v : '[file]'}`))
      return parts.join('&').slice(0, 4000)
    }
  } catch {
    /* fall through */
  }
  return '[non-text body]'
}

function report(c: Capture): void {
  const label = c.isCart ? `🛒 ${c.method} ${c.url}` : `${c.method} ${c.url}`
  // eslint-disable-next-line no-console
  console.groupCollapsed(`%c[CookCart observe] ${label}`, c.isCart ? CART : ACCENT)
  // eslint-disable-next-line no-console
  console.log('status:', c.status)
  if (Object.keys(c.reqHeaders).length) console.log('request headers:', c.reqHeaders)
  if (c.reqBody) console.log('request body:', c.reqBody)
  if (c.respBody) {
    try {
      console.log('response:', JSON.parse(c.respBody))
    } catch {
      console.log('response:', c.respBody)
    }
  }
  // eslint-disable-next-line no-console
  console.groupEnd()

  // Hand a trimmed copy to the isolated world for buffering / export.
  window.postMessage(
    {
      source: 'cookcart-observe',
      capture: { ...c, respBody: c.respBody.slice(0, 6000), reqBody: c.reqBody?.slice(0, 2000) ?? null },
    },
    '*',
  )
}

// ---- patch fetch --------------------------------------------------------
const origFetch = window.fetch
window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = (
    init?.method ??
    (input instanceof Request ? input.method : 'GET')
  ).toUpperCase()
  const reqHeaders = {
    ...(input instanceof Request ? headersToObject(input.headers) : {}),
    ...headersToObject(init?.headers),
  }
  const reqBody = bodyToString(init?.body)

  const promise = origFetch.apply(this, arguments as never) as Promise<Response>
  if (observing() && isInteresting(url)) {
    promise
      .then((res) => {
        res
          .clone()
          .text()
          .then((text) =>
            report({
              at: Date.now(),
              kind: 'fetch',
              method,
              url,
              reqHeaders,
              reqBody,
              status: res.status,
              respBody: text,
              isCart: CART_RE.test(url) || CART_RE.test(reqBody ?? ''),
            }),
          )
          .catch(() => undefined)
      })
      .catch(() => undefined)
  }
  return promise
}

// ---- patch XMLHttpRequest ----------------------------------------------
interface Tapped extends XMLHttpRequest {
  __cc?: { method: string; url: string; headers: Record<string, string>; body: string | null }
}

const origOpen = XMLHttpRequest.prototype.open
const origSetHeader = XMLHttpRequest.prototype.setRequestHeader
const origSend = XMLHttpRequest.prototype.send

XMLHttpRequest.prototype.open = function (this: Tapped, method: string, url: string) {
  this.__cc = { method: (method || 'GET').toUpperCase(), url: String(url), headers: {}, body: null }
  // eslint-disable-next-line prefer-rest-params
  return origOpen.apply(this, arguments as never)
}

XMLHttpRequest.prototype.setRequestHeader = function (this: Tapped, name: string, value: string) {
  if (this.__cc) this.__cc.headers[name] = value
  // eslint-disable-next-line prefer-rest-params
  return origSetHeader.apply(this, arguments as never)
}

XMLHttpRequest.prototype.send = function (this: Tapped, body?: Document | XMLHttpRequestBodyInit | null) {
  const cc = this.__cc
  if (cc) {
    cc.body = bodyToString(body)
    this.addEventListener('load', () => {
      if (!observing() || !isInteresting(cc.url)) return
      let respBody = ''
      try {
        respBody = this.responseType === '' || this.responseType === 'text' ? this.responseText : '[non-text response]'
      } catch {
        respBody = '[unreadable response]'
      }
      report({
        at: Date.now(),
        kind: 'xhr',
        method: cc.method,
        url: cc.url,
        reqHeaders: cc.headers,
        reqBody: cc.body,
        status: this.status,
        respBody,
        isCart: CART_RE.test(cc.url) || CART_RE.test(cc.body ?? ''),
      })
    })
  }
  // eslint-disable-next-line prefer-rest-params
  return origSend.apply(this, arguments as never)
}

// Signal to anyone watching that the tap is live.
if (observing()) {
  // eslint-disable-next-line no-console
  console.log(
    '%c[CookCart observe] tap active — store API calls will be logged here. Turn off in the extension settings.',
    ACCENT,
  )
}
