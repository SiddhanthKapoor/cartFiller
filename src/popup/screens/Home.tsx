import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useMutation } from '@tanstack/react-query'
import type { SavedMeal, Settings, ShoppingList } from '@/shared/types'
import { activeApiKey } from '@/shared/types'
import { generateShoppingList, AiError } from '@/ai/client'
import { Screen, IconButton } from '../components/ui'
import { CookingLoader } from '../components/CookingLoader'
import {
  ArrowUpIcon,
  CartIcon,
  GearIcon,
  KeyIcon,
  LogoMark,
  StarIcon,
  TrashIcon,
} from '../components/icons'

const SUGGESTIONS = [
  'Chicken Biryani',
  'Butter Chicken for 6',
  'Paneer Butter Masala under ₹500',
  'High-protein breakfast for 5 days',
]

const TIP_KEY = 'cookcart.tipDismissed'

// each chip / card gets a rotating neon accent so the list feels alive
const NEON = [
  { text: 'text-lime', bg: 'bg-lime-soft', dot: 'bg-lime' },
  { text: 'text-amber', bg: 'bg-amber-soft', dot: 'bg-amber' },
  { text: 'text-grape', bg: 'bg-grape-soft', dot: 'bg-grape' },
  { text: 'text-coral', bg: 'bg-coral-soft', dot: 'bg-coral' },
]

/** One-time reminder: the fill runs on your own logged-in store session. */
function OnboardingTip() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    void chrome.storage.local.get(TIP_KEY).then((r) => setShow(!r[TIP_KEY]))
  }, [])
  if (!show) return null
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="mt-4 overflow-hidden"
    >
      <div className="card px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-grape-soft text-grape">
            <CartIcon size={14} />
          </span>
          <div className="flex-1">
            <p className="text-[11.5px] leading-relaxed text-mute">
              Open your store (Blinkit / Zepto / Instamart), be{' '}
              <span className="font-semibold text-ink">logged in</span> with a{' '}
              <span className="font-semibold text-ink">delivery location</span> set. CookCart fills
              the cart on your own session — it never sees your login.
            </p>
            <button
              onClick={() => {
                setShow(false)
                void chrome.storage.local.set({ [TIP_KEY]: true })
              }}
              className="label mt-2 text-[11px] text-lime"
            >
              Got it →
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function HomeScreen({
  settings,
  meals,
  onGenerated,
  onOpenMeal,
  onOpenSettings,
  onToggleFavorite,
  onDeleteMeal,
}: {
  settings: Settings
  meals: SavedMeal[]
  onGenerated: (list: ShoppingList) => void
  onOpenMeal: (list: ShoppingList) => void
  onOpenSettings: () => void
  onToggleFavorite: (id: string) => void
  onDeleteMeal: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const hasKey = activeApiKey(settings.ai).length > 0

  const generate = useMutation({
    mutationFn: (q: string) => {
      const budget =
        settings.budgetInr && !/under|₹|budget/i.test(q)
          ? `${q} (budget: under ₹${settings.budgetInr})`
          : q
      return generateShoppingList(budget, settings.ai)
    },
    onSuccess: onGenerated,
  })

  const submit = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || generate.isPending) return
    generate.mutate(trimmed)
  }

  const errorMessage =
    generate.error instanceof AiError
      ? generate.error.message
      : generate.error
        ? 'Something went wrong. Try again.'
        : null

  const favorites = meals.filter((m) => m.favorite)
  const recents = meals.filter((m) => !m.favorite).slice(0, 6)

  return (
    <Screen>
      {/* header */}
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-1">
        <span className="citrus-fill grid h-8 w-8 place-items-center rounded-xl text-paper">
          <LogoMark size={18} />
        </span>
        <span className="display text-[18px] text-ink">CookCart</span>
        <div className="ml-auto">
          <IconButton onClick={onOpenSettings} aria-label="Settings">
            <GearIcon size={16} />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {/* hero */}
        <div className="pt-6 pb-5">
          <h1 className="display text-[40px] text-ink">
            Type a dish.
            <br />
            <span className="citrus-text">Get a cart.</span>
          </h1>
          <p className="mt-3 text-[12.5px] leading-relaxed text-mute">
            Every ingredient, in real quantities — filled into your grocery cart in about a second.
          </p>
        </div>

        {/* input */}
        <div
          className={`flex items-stretch overflow-hidden rounded-2xl border bg-surface2 transition-colors ${
            focused ? 'border-lime' : 'border-line'
          }`}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => e.key === 'Enter' && submit(query)}
            placeholder="Chicken biryani for 4…"
            disabled={generate.isPending}
            className="h-13 flex-1 bg-transparent px-4 py-3.5 text-[14px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-mute-soft"
            autoFocus
          />
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => submit(query)}
            disabled={!query.trim() || generate.isPending}
            aria-label="Generate"
            className="citrus-fill m-1.5 grid w-11 flex-none place-items-center rounded-xl text-paper disabled:opacity-30 disabled:grayscale"
          >
            {generate.isPending ? (
              <span className="animate-spin-slow h-4 w-4 rounded-full border-2 border-paper/40 border-t-paper" />
            ) : (
              <ArrowUpIcon size={17} />
            )}
          </motion.button>
        </div>

        <OnboardingTip />

        <AnimatePresence mode="wait">
          {generate.isPending ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-5"
            >
              <div className="card px-4 pt-3 pb-5">
                <CookingLoader />
                <div className="label text-center text-[12px] text-ink">Cooking up your list…</div>
                <div className="mt-1 text-center text-[10.5px] text-mute">
                  working out ingredients &amp; quantities
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {errorMessage && (
                <div className="mt-4 rounded-2xl border border-coral/40 bg-coral-soft px-4 py-3 text-[12px] leading-relaxed text-coral">
                  {errorMessage}
                </div>
              )}

              {!hasKey && (
                <button
                  onClick={onOpenSettings}
                  className="card mt-4 flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:border-lime"
                >
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-lime-soft text-lime">
                    <KeyIcon size={16} />
                  </span>
                  <span>
                    <span className="label block text-[12.5px] text-ink">Connect an AI provider</span>
                    <span className="mt-0.5 block text-[11px] text-mute">
                      A free Gemini API key is enough to start
                    </span>
                  </span>
                </button>
              )}

              {/* suggestions */}
              <div className="mt-5 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s, i) => {
                  const n = NEON[i % NEON.length]
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        setQuery(s)
                        if (hasKey) submit(s)
                      }}
                      className={`label rounded-full border border-line px-3 py-1.5 text-[11px] transition-colors hover:border-transparent ${n.bg} ${n.text}`}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>

              {/* saved + recent */}
              {(favorites.length > 0 || recents.length > 0) && (
                <div className="mt-6">
                  <div className="kicker mb-2.5 text-[10px] text-mute">
                    {favorites.length > 0 ? 'Saved & Recent' : 'Recent'}
                  </div>
                  <div className="space-y-2">
                    {[...favorites, ...recents].map((meal, i) => {
                      const n = NEON[i % NEON.length]
                      return (
                        <motion.div
                          key={meal.list.id}
                          layout
                          className="group card flex items-stretch overflow-hidden transition-colors hover:border-mute-soft"
                        >
                          <span className={`w-1 flex-none ${n.dot}`} />
                          <button
                            onClick={() => onOpenMeal(meal.list)}
                            className="flex-1 py-2.5 pl-3 text-left"
                          >
                            <span className="label block truncate text-[12.5px] text-ink">
                              {meal.list.dish}
                            </span>
                            <span className="block text-[10.5px] text-mute">
                              {meal.list.ingredients.length} items · {meal.list.servings} servings
                              {meal.list.estimatedCostInr > 0 && ` · ~₹${meal.list.estimatedCostInr}`}
                            </span>
                          </button>
                          <button
                            onClick={() => onToggleFavorite(meal.list.id)}
                            aria-label="Favorite"
                            className={`grid w-9 place-items-center transition-colors ${
                              meal.favorite ? 'text-amber' : 'text-mute-soft hover:text-amber'
                            }`}
                          >
                            <StarIcon size={14} filled={meal.favorite} />
                          </button>
                          <button
                            onClick={() => onDeleteMeal(meal.list.id)}
                            aria-label="Delete"
                            className="grid w-9 place-items-center text-mute-soft transition-colors hover:text-coral"
                          >
                            <TrashIcon size={14} />
                          </button>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Screen>
  )
}
