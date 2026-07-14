# Network Instrumentation Harness

A reverse-engineering observer for Blinkit's frontend. It **does not touch the
extension's automation** — it reproduces the same browser actions (search →
open product → add to cart → increase quantity) on a plain page and records
every network request/response, bucketed by the action that caused it. Then it
analyses the capture and writes a report.

## Run

```bash
# 1. capture (headed so you can sign in; a persistent profile is kept in out/)
npm run instrument:capture

# 2. analyse the capture into a report
npm run instrument:analyze
```

Outputs land in `instrument/out/` (gitignored — they contain your session):

- `session.json` — raw, timestamped, action-bucketed request/response log
- `network-report.md` — the human report (endpoints, groups, param templates,
  add-to-cart confidence ranking, flow graph, replay snippets, verdict)

### Flags (capture)

```bash
node instrument/capture.mjs --headless                 # no window, search-only
node instrument/capture.mjs --queries rice,paneer,dal  # diff these searches
node instrument/capture.mjs --login-wait 60000         # 60s pause to sign in
```

## Important: log in for cart endpoints

Search works without an account, so a headless run already captures
`POST /v1/layout/search` with real product data. But **cart and checkout
requests only fire when you're signed in with a delivery location set.** Run
headed once, sign in and set your location during the login-wait pause, and the
add-to-cart endpoint will appear in the report's confidence ranking (§3). The
persistent profile in `out/brave-profile` keeps you logged in for later runs.

## What it captures

Per request: timestamp, sequence #, URL, method, headers (sensitive values
masked), query params, POST body, cookies (masked), resource type, frame,
initiator (type + top JS stack frame), and the action bucket. Per response:
status, headers, body, parsed JSON, timing, content type, size.

## Safety

This observes traffic on **your own** logged-in session for personal
interoperability. Blinkit has no public API — these are private endpoints, and
calling them directly may violate their Terms and trip anti-abuse. Keep any
replay personal-scale and human-paced. Masking keeps tokens/cookies out of the
report, but `session.json` still holds real data — it stays gitignored; don't
share it.
