import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useMutation } from '@tanstack/react-query'
import type { SavedMeal, Settings, ShoppingList } from '@/shared/types'
import { activeApiKey } from '@/shared/types'
import { generateShoppingList, AiError } from '@/ai/client'
import { Screen, IconButton } from '../components/ui'
import {
  ArrowUpIcon,
  GearIcon,
  KeyIcon,
  LogoMark,
  SparkleIcon,
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
      className="mb-4 overflow-hidden"
    >
      <div className="brutal-flat px-3.5 py-3">
        <div className="flex items-start gap-3">
          <span className="tile mt-0.5 h-6 w-6 flex-none text-[12px]">🛒</span>
          <div className="flex-1">
            <p className="text-[11.5px] leading-relaxed text-ink">
              Open your store (Blinkit / Zepto / Instamart), be{' '}
              <span className="mono-label">logged in</span> with a{' '}
              <span className="mono-label">delivery location</span> set. CookCart fills the cart on
              your own session — it never sees your login.
            </p>
            <button
              onClick={() => {
                setShow(false)
                void chrome.storage.local.set({ [TIP_KEY]: true })
              }}
              className="mono-label mt-2 text-[11px] underline"
            >
              Got it
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
      <div className="flex items-center gap-2.5 border-b-2 border-ink px-5 py-3.5">
        <span className="tile h-8 w-8">
          <LogoMark size={19} />
        </span>
        <span className="mono-label text-[16px]">CookCart</span>
        <div className="ml-auto">
          <IconButton onClick={onOpenSettings} aria-label="Settings">
            <GearIcon size={16} />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {/* hero */}
        <div className="pt-6 pb-4">
          <h1 className="mono-label text-[26px] leading-[1.05] text-ink">
            What do you
            <br />
            want to cook?
          </h1>
          <p className="mt-2.5 text-[12px] text-mute">
            Ingredients, quantities, and a filled cart — automatically.
          </p>
        </div>

        {/* input */}
        <div className="brutal flex items-stretch">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit(query)}
            placeholder="Chicken Biryani"
            disabled={generate.isPending}
            className="h-12 flex-1 bg-transparent px-3.5 text-[14px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-mute-soft"
            autoFocus
          />
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => submit(query)}
            disabled={!query.trim() || generate.isPending}
            aria-label="Generate"
            className="tile grid w-12 flex-none place-items-center border-l-2 border-ink disabled:opacity-30"
          >
            {generate.isPending ? (
              <span className="animate-spin-slow h-4 w-4 rounded-full border-2 border-paper/30 border-t-paper" />
            ) : (
              <ArrowUpIcon size={16} className="rotate-90" />
            )}
          </motion.button>
        </div>

        <div className="mt-4">
          <OnboardingTip />
        </div>

        <AnimatePresence mode="wait">
          {generate.isPending ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-5"
            >
              <div className="brutal-flat px-4 py-4">
                <div className="mono-label flex items-center gap-2 text-[11px] text-ink">
                  <SparkleIcon size={13} />
                  Working out ingredients & quantities…
                </div>
                <div className="mt-4 space-y-2">
                  {[0.9, 0.75, 0.85, 0.6].map((w, i) => (
                    <div key={i} className="shimmer h-8 border-2 border-ink" style={{ width: `${w * 100}%` }} />
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {errorMessage && (
                <div className="mt-4 border-2 border-danger px-3.5 py-2.5 text-[12px] leading-relaxed text-danger">
                  {errorMessage}
                </div>
              )}

              {!hasKey && (
                <button
                  onClick={onOpenSettings}
                  className="brutal-sm mt-4 flex w-full items-center gap-3 px-3.5 py-3 text-left"
                >
                  <span className="tile h-8 w-8 flex-none">
                    <KeyIcon size={15} />
                  </span>
                  <span>
                    <span className="mono-label block text-[12px] text-ink">Connect an AI provider</span>
                    <span className="mt-0.5 block text-[11px] text-mute">
                      A free Gemini API key is enough to start
                    </span>
                  </span>
                </button>
              )}

              {/* suggestions */}
              <div className="mt-5 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setQuery(s)
                      if (hasKey) submit(s)
                    }}
                    className="border-2 border-ink px-2.5 py-1 text-[11px] text-ink transition-colors hover:bg-ink hover:text-paper"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* saved + recent */}
              {(favorites.length > 0 || recents.length > 0) && (
                <div className="mt-6">
                  <div className="mono-label mb-2 text-[11px] text-mute">
                    {favorites.length > 0 ? 'Saved & Recent' : 'Recent'}
                  </div>
                  <div className="space-y-2">
                    {[...favorites, ...recents].map((meal) => (
                      <motion.div
                        key={meal.list.id}
                        layout
                        className="brutal-sm group flex items-center gap-1 py-1 pr-1 pl-3"
                      >
                        <button onClick={() => onOpenMeal(meal.list)} className="flex-1 py-1.5 text-left">
                          <span className="block truncate text-[12.5px] font-semibold text-ink">
                            {meal.list.dish}
                          </span>
                          <span className="block text-[10.5px] text-mute">
                            {meal.list.ingredients.length} items · {meal.list.servings} servings
                            {meal.list.estimatedCostInr > 0 && ` · ~₹${meal.list.estimatedCostInr}`}
                          </span>
                        </button>
                        <IconButton
                          onClick={() => onToggleFavorite(meal.list.id)}
                          aria-label="Favorite"
                          className={`h-7 w-7 ${meal.favorite ? 'bg-ink text-paper' : ''}`}
                        >
                          <StarIcon size={13} filled={meal.favorite} />
                        </IconButton>
                        <IconButton
                          onClick={() => onDeleteMeal(meal.list.id)}
                          aria-label="Delete"
                          className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <TrashIcon size={13} />
                        </IconButton>
                      </motion.div>
                    ))}
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
