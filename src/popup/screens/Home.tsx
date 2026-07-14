import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useMutation } from '@tanstack/react-query'
import type { SavedMeal, Settings, ShoppingList } from '@/shared/types'
import { generateShoppingList, AiError } from '@/ai/client'
import { Screen, IconButton } from '../components/ui'
import {
  ArrowUpIcon,
  ClockIcon,
  GearIcon,
  KeyIcon,
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
  const hasKey = settings.ai.apiKey.trim().length > 0

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
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-1">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-b from-[#34db66] to-[#22b14c] text-[13px]">
          🛒
        </div>
        <span className="text-[15px] font-semibold tracking-tight">CookCart</span>
        <div className="ml-auto">
          <IconButton onClick={onOpenSettings} aria-label="Settings">
            <GearIcon size={17} />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {/* hero */}
        <div className="pt-7 pb-5">
          <h1 className="text-[22px] leading-snug font-semibold tracking-tight text-white">
            What do you want
            <br />
            to cook?
          </h1>
          <p className="mt-1.5 text-[12.5px] text-mist">
            Ingredients, quantities, and a filled cart — automatically.
          </p>
        </div>

        {/* input */}
        <div className="glass flex items-center gap-2 rounded-2xl p-1.5 pl-4 transition-colors focus-within:border-accent/50">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit(query)}
            placeholder="Chicken biryani for 4…"
            disabled={generate.isPending}
            className="h-9 flex-1 bg-transparent text-[13.5px] text-white outline-none placeholder:text-mist-dim"
            autoFocus
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => submit(query)}
            disabled={!query.trim() || generate.isPending}
            aria-label="Generate"
            className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-accent text-black transition-opacity disabled:opacity-30"
          >
            {generate.isPending ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
                className="h-4 w-4 rounded-full border-2 border-black/25 border-t-black"
              />
            ) : (
              <ArrowUpIcon size={16} />
            )}
          </motion.button>
        </div>

        <AnimatePresence mode="wait">
          {generate.isPending ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-6"
            >
              <div className="flex items-center gap-2 text-[12.5px] text-mist">
                <SparkleIcon size={14} className="text-accent" />
                Working out ingredients & quantities…
              </div>
              <div className="mt-4 space-y-2.5">
                {[0.9, 0.75, 0.85, 0.6, 0.7].map((w, i) => (
                  <div
                    key={i}
                    className="shimmer h-9 rounded-xl"
                    style={{ width: `${w * 100}%` }}
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* error */}
              {errorMessage && (
                <div className="mt-4 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#ff9b94]">
                  {errorMessage}
                </div>
              )}

              {/* missing key notice */}
              {!hasKey && (
                <button
                  onClick={onOpenSettings}
                  className="glass mt-4 flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors hover:border-line-strong"
                >
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-accent-dim text-accent">
                    <KeyIcon size={15} />
                  </span>
                  <span>
                    <span className="block text-[12.5px] font-medium text-white">
                      Connect an AI provider
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-mist">
                      Add an OpenAI-compatible API key to start
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
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-[11.5px] text-white/70 transition-colors hover:border-line-strong hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* saved + recent */}
              {(favorites.length > 0 || recents.length > 0) && (
                <div className="mt-7">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-mist uppercase">
                    <ClockIcon size={12} />
                    {favorites.length > 0 ? 'Saved & recent' : 'Recent'}
                  </div>
                  <div className="space-y-1.5">
                    {[...favorites, ...recents].map((meal) => (
                      <motion.div
                        key={meal.list.id}
                        layout
                        className="group glass flex items-center gap-2 rounded-xl py-1 pr-1 pl-3.5"
                      >
                        <button
                          onClick={() => onOpenMeal(meal.list)}
                          className="flex-1 py-2 text-left"
                        >
                          <span className="block truncate text-[12.5px] text-white/90">
                            {meal.list.dish}
                          </span>
                          <span className="block text-[11px] text-mist-dim">
                            {meal.list.ingredients.length} items · {meal.list.servings} servings
                            {meal.list.estimatedCostInr > 0 &&
                              ` · ~₹${meal.list.estimatedCostInr}`}
                          </span>
                        </button>
                        <IconButton
                          onClick={() => onToggleFavorite(meal.list.id)}
                          aria-label="Favorite"
                          className={meal.favorite ? 'text-warn hover:text-warn' : ''}
                        >
                          <StarIcon size={14} filled={meal.favorite} />
                        </IconButton>
                        <IconButton
                          onClick={() => onDeleteMeal(meal.list.id)}
                          aria-label="Delete"
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <TrashIcon size={14} />
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
