# CookCart AI

Type any dish. CookCart figures out every ingredient in realistic cooking quantities and fills your **Blinkit**, **Zepto** or **Instamart** cart automatically.

`"Chicken biryani for 6"` → reviewed ingredient list → one tap → a filled cart.

## How it works

1. **Ask** — describe what you want to cook in the popup: a dish, a budget (`under ₹500`), servings, or a whole week of meal prep.
2. **Review** — the AI returns ingredients with quantities, estimated cost and rough nutrition. Rename, remove, resize, change servings, or skip pantry staples you already have.
3. **Fill** — pick a store. The extension opens it, searches each ingredient, picks the best-matching product and pack size, adds it to the cart, and shows live progress both on the page and in the popup.

You stay logged in with your own account in your own browser session — the extension never touches credentials, never bypasses auth, and never checks out on your behalf. It stops at a filled cart for you to review.

## Install (developer mode)

```bash
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `dist/` folder.

### Connect an AI provider

Open the popup → gear icon → pick a provider, pick a model from the dropdown, paste that provider's API key. Endpoints are handled internally; each provider keeps its own key.

| Provider   | Default model             | Get a key at                        |
| ---------- | ------------------------- | ----------------------------------- |
| **Gemini** (default) | `gemini-2.5-flash`   | aistudio.google.com/apikey (free tier) |
| Claude     | `claude-sonnet-5`         | console.anthropic.com               |
| OpenAI     | `gpt-4o-mini`             | platform.openai.com                 |
| Groq       | `llama-3.3-70b-versatile` | console.groq.com (free tier)        |
| OpenRouter | `google/gemini-2.5-flash` | openrouter.ai                       |

Gemini, OpenAI, Groq and OpenRouter share one OpenAI-compatible client; Claude speaks the Anthropic Messages API natively.

The key lives in `chrome.storage.local` on your machine and is only ever sent to the provider you configured.

## Architecture

```
src/
├── ai/            OpenAI-compatible client, prompt, Zod schema
├── background/    service worker — job orchestration, watchdog, badge
├── content/       runs inside store pages
│   ├── providers/ per-store adapters (Blinkit, Zepto, Instamart)
│   ├── scrape.ts  heuristic product-card discovery
│   ├── runner.ts  per-ingredient state machine
│   └── overlay.ts shadow-DOM progress card
├── popup/         React UI (home / review / progress / settings)
└── shared/        types, messages, units, normalization, matching, storage
```

Design decisions worth knowing:

- **Storage-backed jobs.** The active fill job lives in `chrome.storage`, not in service-worker memory. MV3 workers get killed at will; a restart mid-fill loses nothing because every page load re-announces itself and the job resumes from state.
- **Blinkit runs API-first.** Reverse-engineered from Blinkit's own frontend, the content script calls `POST /v1/layout/search` (products come back as JSON with the add-to-cart payload embedded per card) and `POST /v5/carts` (the cart write), using the user's own session cookies, delivery location and device id — the exact requests the page itself makes. No scraping, no per-item navigation: a whole cart fills in a few seconds. If the API can't complete (no location set, or a future change), it falls back automatically to the DOM adapter, so it never silently breaks. See [`instrument/`](instrument/) for the harness that discovered these endpoints.
- **Selectors are quarantined.** DOM knowledge (the Blinkit fallback, plus Zepto/Instamart) lives in `content/providers/`. Each adapter tries known selectors first, then falls back to generic heuristics that anchor on the two things every listing card must have: an *Add* control and a ₹ price. A store redesign degrades gracefully instead of breaking.
- **Matching is a pure module.** Pack parsing (`2 x 500 ml`, `1 pc (450-550 g)`), bigram fuzzy name scoring with processed-food penalties (searching *tomato* must not buy ketchup; *paneer* must not buy shahi paneer masala), unit/weight conversion and pack optimization (`need 750 g, packs of 500 g → add 2`) are all pure functions with unit tests — no DOM required.
- **Ranking shops like a person.** `score = 0.56·relevance + 0.26·pack-fit + 0.10·value-for-money (₹ per 100 g, not sticker price) + 0.08·trusted-brand`. Quick-commerce listing pages expose no ratings or review counts in the DOM, so a curated brand prior (Amul, Tata, Everest, Fortune, …) stands in as the quality signal.
- **Recipe quantity ≠ purchase quantity.** The AI is instructed to output what the recipe *consumes* (1 tsp salt, 3 tbsp oil), and a dictionary of per-serving ceilings clamps anything absurd ("1 kg salt") as a backstop. The store pack is chosen separately by the matcher.
- **Nothing goes missing silently.** After the first pass, every skipped or failed ingredient gets exactly one retry with a simplified search query; the final summary shows exactly what was added, substituted or skipped, with product names and prices.
- **Normalization layer.** `Fresh Tomatoes`, `Tomato`, `Red Tomatoes` all collapse to one canonical ingredient with a store-friendly search query, via a dictionary tuned for Indian quick-commerce (Hindi aliases included). Duplicates in AI output are merged by summing quantities.
- **AI output is untrusted.** Responses are fence-stripped, parsed, unit-coerced and validated with a strict Zod schema before anything touches the UI.

## Development

```bash
npm run dev        # vite dev server with CRXJS HMR
npm test           # vitest — matching, normalization, units, AI parsing
npm run build      # typecheck + production build into dist/
```

## Honest limitations

- Quick-commerce sites change their DOM without notice. The heuristic fallback survives most redesigns, but if a store overhauls how "Add" works, that adapter needs a selector refresh — that's a one-file fix by design.
- Product choice is a best-effort ranking. It's right most of the time; the overlay and progress screen show exactly what was added (name, pack, price) so you can swap anything before checkout.
- You must already be logged in to the store (and have a delivery address set) in your browser. If the store shows a location/login gate, items will be skipped until you clear it.

## Disclaimer

CookCart AI is an independent project, not affiliated with or endorsed by Blinkit, Zepto or Swiggy Instamart. It automates the same clicks you would make yourself, on your own logged-in session, at human-like speed. Use it for your own groceries.
