// CookCart — network session analyzer.
//
// Reads instrument/out/session.json (from capture.mjs) and produces
// instrument/out/network-report.md: endpoint catalogue, API-group buckets,
// per-action timeline, parameter templates, an add-to-cart confidence
// ranking, a flow graph, replay snippets (curl / fetch / axios / python),
// and a final verdict on whether the browser automation can be replaced by
// direct API calls.
//
// Usage: node instrument/analyze.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, 'out')

const session = JSON.parse(readFileSync(join(OUT_DIR, 'session.json'), 'utf8'))
const records = session.records ?? []

// ---------- helpers ----------
const pathOf = (url) => {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}
const hostOf = (url) => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}
const isXhr = (r) => r.resourceType === 'XHR' || r.resourceType === 'Fetch'

// Collapse numeric IDs in a path so /v1/.../12264 templatizes cleanly.
const templatePath = (p) =>
  p
    .replace(/\/\d{3,}/g, '/{id}')
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/{uuid}')

// ---------- API grouping ----------
// Third-party hosts are always telemetry/ads, whatever their path looks like.
const THIRD_PARTY_ANALYTICS =
  /(google|googletagmanager|google-analytics|doubleclick|gstatic|facebook|fbcdn|sentry|clevertap|branch\.io|segment|mixpanel|bing|criteo|moengage|hotjar|amplitude|cloudflareinsights)/i

// Order matters: Analytics is checked first so misleading substrings in a
// telemetry URL (e.g. "collect", "conversion") can't leak into a real group.
// All matching is on host + pathname only — never query params, which carry
// noise like `cart_ab_test_variant` that would create phantom groups.
const GROUPS = [
  ['Analytics', /(analytics|\/event|\/track|\/collect|mixpanel|segment|sentry|clevertap|branch|google-?analytics|gtm|conversion|metric|telemetry|\/log\b|rum|pagead|rmkt)/i],
  ['Authentication', /(\/auth|\/login|\/otp|\/verify|token|\/session|signin|sign_in|auth_key|accounts)/i],
  ['Location', /(location|geo|serviceab|pincode|address|lat_?long|\/eta\b|consumerweb\/eta)/i],
  ['Search', /(\/search|layout\/search|autocomplete|auto_?suggest|typeahead|empty_search)/i],
  ['Cart', /(\/cart\b|\/cart\/|add_to_cart|\/atc\b|remove_from_cart|\/rfc\b|\/basket)/i],
  ['Checkout', /(checkout|\/order\b|place_?order|\/slot|payment_?method_?list)/i],
  ['Payments', /(payment|\/pay\b|upi|juspay|razorpay|paytm|wallet)/i],
  ['Recommendations', /(recommend|product_recommendations|\/reco\b|widget|\/feed\b|tag_collection|listing_?widget)/i],
  ['Inventory', /(inventory|stock|merchant|product\/\d|\/prn\b|\/pdp\b|product_detail|secondary-data)/i],
  ['Profile', /(profile|\/user\b|customer|preferences|\/saved\b)/i],
]

function groupOf(url) {
  if (THIRD_PARTY_ANALYTICS.test(hostOf(url))) return 'Analytics'
  const hay = `${hostOf(url)}${pathOf(url)}`
  for (const [name, re] of GROUPS) {
    if (re.test(hay)) return name
  }
  return 'Other'
}

// ---------- endpoint catalogue ----------
// key: METHOD host+templatePath
const endpoints = new Map()
for (const r of records) {
  if (!isXhr(r) && r.resourceType !== 'Document') continue
  const key = `${r.method} ${hostOf(r.url)}${templatePath(pathOf(r.url))}`
  if (!endpoints.has(key)) {
    endpoints.set(key, {
      key,
      method: r.method,
      host: hostOf(r.url),
      templatePath: templatePath(pathOf(r.url)),
      group: groupOf(r.url),
      samples: [],
    })
  }
  endpoints.get(key).samples.push(r)
}

// ---------- parameter analysis per endpoint ----------
function analyzeParams(ep) {
  const keys = new Set()
  ep.samples.forEach((s) => Object.keys(s.queryParams || {}).forEach((k) => keys.add(k)))
  const params = {}
  for (const k of keys) {
    const values = ep.samples.map((s) => (s.queryParams || {})[k]).filter((v) => v !== undefined)
    const distinct = [...new Set(values)]
    let kind = 'static'
    if (/token|auth|session|key|sig|nonce|device|gr_1_/i.test(k)) kind = 'auth'
    else if (/offset|limit|page|cursor|count|index/i.test(k)) kind = 'pagination'
    else if (distinct.length > 1) kind = 'dynamic'
    params[k] = { kind, example: values[0], distinct: distinct.slice(0, 4) }
  }
  return params
}

// ---------- add-to-cart confidence ranking ----------
// Look at requests fired during the add_to_cart action window and rank how
// likely each is the request that actually mutates the cart.
function rankAddToCart() {
  const inWindow = records.filter((r) => r.action === 'add_to_cart' && isXhr(r))
  const scored = inWindow.map((r) => {
    const p = pathOf(r.url).toLowerCase()
    const body = (r.postData || '') + JSON.stringify(r.response?.json ?? '')
    let score = 0
    const reasons = []
    if (r.method === 'POST' || r.method === 'PUT') {
      score += 2
      reasons.push('mutating method')
    }
    if (/cart|atc|add_to_cart|basket/.test(p)) {
      score += 4
      reasons.push('cart-like path')
    }
    if (/product_id|cart_item|"quantity"|merchant_id/i.test(body)) {
      score += 3
      reasons.push('carries product/quantity payload')
    }
    if (/analytics|event|track|collect|mixpanel|segment|sentry|clevertap/.test(p)) {
      score -= 5
      reasons.push('analytics endpoint')
    }
    if (/recommend|reco|widget/.test(p)) {
      score -= 2
      reasons.push('recommendation refresh')
    }
    if (r.response && r.response.status >= 200 && r.response.status < 300) {
      score += 1
      reasons.push('2xx response')
    }
    const confidence = score >= 6 ? 'HIGH' : score >= 3 ? 'MEDIUM' : 'LOW'
    return { r, score, confidence, reasons }
  })
  return scored.sort((a, b) => b.score - a.score)
}

// ---------- replay codegen ----------
function replaySnippets(ep) {
  const s = ep.samples[0]
  const url = s.url
  const method = ep.method
  const bodyIsJson = /json/i.test(s.requestHeaders?.['content-type'] || s.requestHeaders?.['Content-Type'] || '')
  const postData = s.postData
  const authNote = '  // auth/session cookies required — copy from a logged-in session'

  const curl = [
    `curl -X ${method} '${url}' \\`,
    `  -H 'content-type: ${bodyIsJson ? 'application/json' : 'application/x-www-form-urlencoded'}' \\`,
    `  -H 'cookie: <YOUR_SESSION_COOKIES>' \\`,
    postData ? `  --data '${postData.replace(/'/g, "'\\''").slice(0, 600)}'` : `  # no body`,
  ].join('\n')

  const fetchTs = [
    `await fetch(${JSON.stringify(url)}, {`,
    `  method: ${JSON.stringify(method)},`,
    `  headers: {`,
    `    'content-type': '${bodyIsJson ? 'application/json' : 'application/x-www-form-urlencoded'}',`,
    `    // cookies ride along automatically in-browser; server-side, set them here`,
    `  },`,
    `  credentials: 'include',`,
    postData ? `  body: ${bodyIsJson ? `JSON.stringify(${safeJson(postData)})` : JSON.stringify(postData)},` : `  // no body`,
    `})`,
  ].join('\n')

  const axios = [
    `axios({`,
    `  url: ${JSON.stringify(url)},`,
    `  method: ${JSON.stringify(method.toLowerCase())},`,
    `  withCredentials: true,`,
    postData ? `  data: ${bodyIsJson ? safeJson(postData) : JSON.stringify(postData)},` : `  // no body`,
    `})`,
  ].join('\n')

  const py = [
    `import requests, json`,
    postData && bodyIsJson ? `body = json.loads(r'''${safeJson(postData)}''')` : null,
    `requests.${method.toLowerCase()}(`,
    `    ${JSON.stringify(url)},`,
    `    headers={'content-type': '${bodyIsJson ? 'application/json' : 'application/x-www-form-urlencoded'}'},`,
    `    cookies=SESSION_COOKIES,  # dict from a logged-in session`,
    postData ? (bodyIsJson ? `    json=body,` : `    data=${JSON.stringify(postData)},`) : `    # no body`,
    `)`,
  ]
    .filter(Boolean)
    .join('\n')

  return { curl, fetchTs, axios, py, authNote }
}

function safeJson(str) {
  try {
    return JSON.stringify(JSON.parse(str))
  } catch {
    return JSON.stringify(str)
  }
}

// ---------- markdown assembly ----------
const md = []
const P = (s = '') => md.push(s)

P('# Blinkit Network Reverse-Engineering Report')
P()
P(`_Generated by \`instrument/analyze.mjs\` from a capture on ${session.capturedAt}._`)
P()
P(
  `> Session: ${records.length} total requests across ${new Set(records.map((r) => r.action)).size} ` +
    `browser actions. Queries: ${(session.queries || []).join(', ')}. ` +
    `Authenticated: ${session.loggedInHint ? 'attempted (login window shown)' : 'no (search-only)'}.`,
)
P()
P('⚠️ **Scope & ethics.** This observes traffic on your own logged-in session for personal-')
P('use interoperability. Blinkit exposes no public API; these are private endpoints and')
P('hitting them directly may violate their Terms and can trip anti-abuse. Keep any replay')
P('personal-scale and human-paced. This report documents; it does not authorize abuse.')
P()

// 1. Timeline
P('## 1. Timeline (by action)')
P()
const byAction = new Map()
for (const r of records) {
  if (!byAction.has(r.action)) byAction.set(r.action, [])
  byAction.get(r.action).push(r)
}
P('| # | Action | Requests | XHR/Fetch | Groups touched |')
P('|---|--------|----------|-----------|----------------|')
let ai = 0
for (const [action, rs] of byAction) {
  const xhr = rs.filter(isXhr).length
  const groups = [...new Set(rs.filter(isXhr).map((r) => groupOf(r.url)))].join(', ') || '—'
  P(`| ${++ai} | \`${action}\` | ${rs.length} | ${xhr} | ${groups} |`)
}
P()

// 2. API groups
P('## 2. Endpoints by API group')
P()
const epList = [...endpoints.values()]
const byGroup = new Map()
for (const ep of epList) {
  if (!byGroup.has(ep.group)) byGroup.set(ep.group, [])
  byGroup.get(ep.group).push(ep)
}
const GROUP_PURPOSE = {
  Authentication: 'Sign-in / session — not needed once cookies exist.',
  Location: 'Delivery serviceability & store selection — gates whether products/cart work.',
  Search: 'Product discovery. Server-driven UI: response embeds the add-to-cart payload.',
  Recommendations: 'Widgets / "people also bought" — cosmetic, ignore for automation.',
  Cart: 'Cart mutation (add / remove / update quantity). The prize.',
  Inventory: 'Product detail / stock / ETA.',
  Checkout: 'Order placement & slots — intentionally out of scope for a cart-filler.',
  Payments: 'Payment rails — out of scope.',
  Profile: 'Account data.',
  Analytics: 'Telemetry only. 100% ignorable for automation.',
  Other: 'Unclassified.',
}
for (const [group, eps] of [...byGroup.entries()].sort()) {
  P(`### ${group}`)
  P(`_${GROUP_PURPOSE[group] ?? ''}_`)
  P()
  P('| Method | Endpoint | Hits | Status |')
  P('|--------|----------|------|--------|')
  for (const ep of eps.sort((a, b) => b.samples.length - a.samples.length)) {
    const statuses = [...new Set(ep.samples.map((s) => s.response?.status ?? s.failure?.errorText ?? '—'))].join('/')
    P(`| ${ep.method} | \`${ep.templatePath}\` | ${ep.samples.length} | ${statuses} |`)
  }
  P()
}

// 3. Add-to-cart ranking
P('## 3. Which request adds to cart? (confidence ranking)')
P()
const atc = rankAddToCart()
if (atc.length === 0) {
  P('No XHR/Fetch requests were captured during the `add_to_cart` action.')
  P()
  P("Most likely cause: not logged in / no delivery location set, so the click did not")
  P('reach a real product. Re-run headed, sign in, set a location, and the cart POST will')
  P('appear here. **What the search response already tells us** (see §5) is that each')
  P('product card embeds an `atc_action.add_to_cart.cart_item` object — that object is the')
  P('body the cart endpoint expects.')
} else {
  P('| Confidence | Method | Endpoint | Status | Why |')
  P('|-----------|--------|----------|--------|-----|')
  for (const { r, confidence, reasons } of atc.slice(0, 12)) {
    P(
      `| ${confidence} | ${r.method} | \`${pathOf(r.url)}\` | ${r.response?.status ?? '—'} | ${reasons.join('; ')} |`,
    )
  }
}
P()

// 4. Parameter templates (Search, since we diff multiple queries)
P('## 4. Parameter analysis & templates')
P()
const searchEps = epList.filter((e) => e.group === 'Search' && e.samples.length >= 1)
if (searchEps.length === 0) {
  P('_No search API captured._')
} else {
  for (const ep of searchEps.slice(0, 2)) {
    P(`### \`${ep.method} ${ep.templatePath}\``)
    P()
    const params = analyzeParams(ep)
    P('| Param | Kind | Example | Distinct values seen |')
    P('|-------|------|---------|----------------------|')
    for (const [k, v] of Object.entries(params)) {
      P(`| \`${k}\` | ${v.kind} | \`${v.example ?? ''}\` | ${v.distinct.map((d) => `\`${d}\``).join(', ')} |`)
    }
    P()
    // reusable template
    const dynamic = Object.entries(params).filter(([, v]) => v.kind === 'dynamic' || v.kind === 'pagination')
    const staticP = Object.entries(params).filter(([, v]) => v.kind === 'static' || v.kind === 'auth')
    const tpl =
      `${ep.host}${ep.templatePath}?` +
      [
        ...dynamic.map(([k]) => `${k}={${k}}`),
        ...staticP.map(([k, v]) => `${k}=${v.example ?? ''}`),
      ].join('&')
    P('**Reusable template**')
    P('```')
    P(`${ep.method} https://${tpl}`)
    P('```')
    P()
  }
}

// 5. Request / response examples
P('## 5. Request & response examples')
P()
function exampleBlock(ep, maxBody = 1400) {
  const s =
    ep.samples.find((x) => x.response?.status >= 200 && x.response?.status < 300) ?? ep.samples[0]
  P(`### \`${ep.method} ${ep.templatePath}\`  _(group: ${ep.group})_`)
  P()
  P(`- **URL:** \`${s.url.slice(0, 240)}\``)
  P(`- **Status:** ${s.response?.status ?? s.failure?.errorText ?? '—'}  ·  **Type:** ${s.response?.mimeType ?? '—'}  ·  **Size:** ${s.response?.sizeBytes ?? '—'} B`)
  if (s.initiator?.stackTop) P(`- **Initiator:** ${s.initiator.type} — ${s.initiator.stackTop}`)
  if (s.postData) {
    P('- **Request body:**')
    P('```json')
    P(s.postData.slice(0, maxBody))
    P('```')
  }
  if (s.response?.json) {
    P('- **Response (trimmed):**')
    P('```json')
    P(JSON.stringify(s.response.json, null, 2).slice(0, maxBody))
    P('```')
  }
  P()
}
// show the most interesting endpoints first
const interesting = epList
  .filter((e) => ['Search', 'Cart', 'Location', 'Inventory', 'Checkout'].includes(e.group))
  .sort((a, b) => b.samples.length - a.samples.length)
  .slice(0, 6)
for (const ep of interesting) exampleBlock(ep)
if (interesting.length === 0) P('_No product/cart endpoints captured — see §3 note._')

// 6. Flow graph
P('## 6. Flow graph')
P()
P('```mermaid')
P('flowchart TD')
P('  U[User action] --> S')
const flowGroups = ['Location', 'Search', 'Recommendations', 'Inventory', 'Cart', 'Checkout']
const present = new Set(epList.map((e) => e.group))
const nodeId = { Location: 'L', Search: 'S', Recommendations: 'R', Inventory: 'I', Cart: 'C', Checkout: 'K' }
const labelFor = (g) => {
  const ep = epList.filter((e) => e.group === g).sort((a, b) => b.samples.length - a.samples.length)[0]
  return ep ? `${g}<br/>${ep.method} ${ep.templatePath}` : g
}
P(`  S["${labelFor('Search')}"] --> I["${present.has('Inventory') ? labelFor('Inventory') : 'Product detail (embedded in search)'}"]`)
P(`  I --> C["${present.has('Cart') ? labelFor('Cart') : 'Cart add (endpoint TBD on auth run)'}"]`)
P('  C --> C2["Cart update / increase qty"]')
P(`  C2 --> K["${present.has('Checkout') ? labelFor('Checkout') : 'Checkout (out of scope)'}"]`)
P('```')
P()

// 7. Replay snippets for the key endpoints
P('## 7. Replay snippets')
P()
const replayTargets = epList
  .filter((e) => ['Search', 'Cart', 'Location'].includes(e.group))
  .sort((a, b) => b.samples.length - a.samples.length)
  .slice(0, 3)
for (const ep of replayTargets) {
  const snip = replaySnippets(ep)
  P(`### \`${ep.method} ${ep.templatePath}\``)
  P()
  P('**cURL**')
  P('```bash')
  P(snip.curl)
  P('```')
  P('**TypeScript (fetch)**')
  P('```ts')
  P(snip.fetchTs)
  P('```')
  P('**Axios**')
  P('```ts')
  P(snip.axios)
  P('```')
  P('**Python (requests)**')
  P('```python')
  P(snip.py)
  P('```')
  P()
}
if (replayTargets.length === 0) P('_No replayable API endpoints captured yet — run authenticated._')

// 8. Verdict
P('## 8. Verdict — can the automation be replaced by direct API calls?')
P()
const hasSearch = present.has('Search')
const hasCart = present.has('Cart')
P(`**Search → product selection:** ${hasSearch ? '✅ Yes.' : '⚠️ Not captured this run, but the endpoint is known:'} \`POST /v1/layout/search\` returns the full product list, and each card embeds \`atc_action.add_to_cart.cart_item\` (product_id, merchant_id, price, unit, quantity). Product choice and pack matching can run entirely on that JSON — no DOM, no scraping.`)
P()
if (hasCart) {
  P('**Add to cart / increase quantity:** ✅ Captured. See §3 for the exact endpoint. The cart_item payload from the search response is what it consumes, so add and quantity-bump are one endpoint parameterised by `quantity`.')
} else {
  P('**Add to cart / increase quantity:** ⚠️ **Not captured this run** (no auth/location). This is the one missing piece. The search response strongly implies a single generic cart-mutation endpoint that accepts the embedded `cart_item`; run this harness logged-in with a delivery location and §3 will name it with HIGH confidence.')
}
P()
P('**Net answer:**')
P()
P('- **Discovery + matching:** fully replaceable by calling `/v1/layout/search` and reading the embedded payloads — this alone removes most of the slow, flaky DOM work.')
P('- **Cart mutation:** replaceable *if* the authenticated capture confirms the cart endpoint (very likely). It still needs your real session cookies + delivery location, exactly like the DOM approach — no auth is bypassed.')
P('- **Checkout/payment:** deliberately left to you in the UI.')
P()
P('**Recommended architecture:** hybrid. Use the API for search + matching (fast, robust), keep a thin DOM fallback for cart mutation until the endpoint is confirmed and stable. API-first cuts the per-item time from seconds of page loading to a couple of round-trips.')
P()

const outFile = join(OUT_DIR, 'network-report.md')
writeFileSync(outFile, md.join('\n'))
console.log(`✓ report → ${outFile}`)
console.log(`  endpoints: ${endpoints.size} · records: ${records.length} · groups: ${[...byGroup.keys()].join(', ')}`)
