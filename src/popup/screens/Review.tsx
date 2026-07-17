import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Ingredient, ProviderId, Settings, ShoppingList } from '@/shared/types'
import { PROVIDERS } from '@/shared/types'
import { formatQuantity, quantityStep, scaleQuantity } from '@/shared/units'
import { normalizeIngredient } from '@/shared/normalize'
import { IconButton, Screen, Toggle } from '../components/ui'
import { STORE_LOGO } from '../assets/brands'
import {
  CartIcon,
  CheckIcon,
  ChevronLeftIcon,
  CopyIcon,
  MinusIcon,
  PlusIcon,
  XIcon,
} from '../components/icons'

// Blinkit is the fast, reliable path; Zepto second. (Instamart omitted for now.)
const FILL_STORES = [PROVIDERS.blinkit, PROVIDERS.zepto]

function IngredientRow({
  ingredient,
  dimmed,
  onChange,
  onRemove,
}: {
  ingredient: Ingredient
  dimmed: boolean
  onChange: (next: Ingredient) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(ingredient.name)
  const step = quantityStep(ingredient.unit)

  const commitName = () => {
    setEditing(false)
    const name = draft.trim()
    if (!name || name === ingredient.name) return setDraft(ingredient.name)
    const normalized = normalizeIngredient(name)
    onChange({
      ...ingredient,
      name,
      pantryStaple: normalized.pantryStaple,
      category: normalized.category,
    })
  }

  const bump = (dir: 1 | -1) => {
    const next = Number((ingredient.quantity + dir * step).toFixed(2))
    if (next <= 0) return
    onChange({ ...ingredient, quantity: next })
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: dimmed ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
      className="group flex items-stretch overflow-hidden rounded-2xl border border-line bg-surface"
    >
      <div className="min-w-0 flex-1 px-3.5 py-2.5">
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && commitName()}
            className="w-full bg-transparent text-[12.5px] font-semibold text-ink outline-none"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            title="Tap to rename / substitute"
            className="label block max-w-full truncate text-left text-[12.5px] text-ink"
          >
            {ingredient.name}
            {ingredient.optional && (
              <span className="ml-1.5 rounded-full bg-grape-soft px-1.5 py-0.5 text-[9px] font-medium text-grape">
                opt
              </span>
            )}
          </button>
        )}
        <span className="mt-0.5 block text-[10.5px] text-mute">
          {formatQuantity(ingredient.quantity, ingredient.unit)}
        </span>
      </div>

      <div className="flex items-center gap-1 pr-2">
        <button
          onClick={() => bump(-1)}
          aria-label="Less"
          className="grid h-7 w-7 flex-none place-items-center rounded-full text-mute transition-colors hover:bg-surface2 hover:text-ink"
        >
          <MinusIcon size={13} />
        </button>
        <button
          onClick={() => bump(1)}
          aria-label="More"
          className="grid h-7 w-7 flex-none place-items-center rounded-full text-mute transition-colors hover:bg-surface2 hover:text-ink"
        >
          <PlusIcon size={13} />
        </button>
        <button
          onClick={onRemove}
          aria-label="Remove"
          className="grid h-7 w-7 flex-none place-items-center rounded-full text-mute-soft transition-colors hover:bg-coral-soft hover:text-coral"
        >
          <XIcon size={13} />
        </button>
      </div>
    </motion.div>
  )
}

export function ReviewScreen({
  list,
  settings,
  onUpdateSettings,
  onChangeList,
  onBack,
  onFill,
  fillBusy,
}: {
  list: ShoppingList
  settings: Settings
  onUpdateSettings: (next: Settings) => void
  onChangeList: (next: ShoppingList) => void
  onBack: () => void
  onFill: (provider: ProviderId) => void
  fillBusy: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [newItem, setNewItem] = useState('')

  const activeCount = useMemo(
    () =>
      list.ingredients.filter((i) => !(settings.skipPantryStaples && i.pantryStaple)).length,
    [list.ingredients, settings.skipPantryStaples],
  )

  const setServings = (servings: number) => {
    if (servings < 1 || servings > 50) return
    const factor = servings / list.servings
    onChangeList({
      ...list,
      servings,
      estimatedCostInr: Math.round(list.estimatedCostInr * factor),
      ingredients: list.ingredients.map((i) => ({
        ...i,
        quantity: scaleQuantity(i.quantity, i.unit, factor),
      })),
    })
  }

  const addItem = () => {
    const name = newItem.trim()
    if (!name) return
    const normalized = normalizeIngredient(name)
    onChangeList({
      ...list,
      ingredients: [
        ...list.ingredients,
        {
          id: crypto.randomUUID(),
          name,
          quantity: 1,
          unit: 'piece',
          optional: false,
          pantryStaple: normalized.pantryStaple,
          category: normalized.category,
        },
      ],
    })
    setNewItem('')
  }

  const copyList = async () => {
    // Copy only what would actually be shopped — skip pantry staples the user
    // said they already have, matching what "Fill cart" would add.
    const shopped = list.ingredients.filter(
      (i) => !(settings.skipPantryStaples && i.pantryStaple),
    )
    const text = [
      `${list.dish} — ${list.servings} servings`,
      ...shopped.map(
        (i) => `• ${i.name}: ${formatQuantity(i.quantity, i.unit)}${i.optional ? ' (optional)' : ''}`,
      ),
    ].join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const stats: { value: string; label: string; text: string; bg: string }[] = [
    { value: String(activeCount), label: 'Items', text: 'text-lime', bg: 'bg-lime-soft' },
  ]
  if (list.estimatedCostInr > 0)
    stats.push({
      value: `₹${list.estimatedCostInr}`,
      label: 'Est. cost',
      text: 'text-amber',
      bg: 'bg-amber-soft',
    })
  if (list.nutrition)
    stats.push({
      value: `~${Math.round(list.nutrition.caloriesPerServing)}`,
      label: 'Kcal/serving',
      text: 'text-grape',
      bg: 'bg-grape-soft',
    })

  return (
    <Screen>
      {/* header */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
        <IconButton onClick={onBack} aria-label="Back">
          <ChevronLeftIcon size={16} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h2 className="display truncate text-[17px] text-ink">{list.dish}</h2>
          {list.cuisine && <p className="kicker text-[9px] text-mute">{list.cuisine}</p>}
        </div>
        <IconButton onClick={copyList} aria-label="Copy list">
          {copied ? <CheckIcon size={15} className="text-lime" /> : <CopyIcon size={15} />}
        </IconButton>
      </div>

      {/* summary + servings */}
      <div className="px-5 pt-2">
        <div className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className={`rounded-2xl px-3 py-2.5 ${s.bg}`}>
              <div className={`display text-[17px] tabular-nums ${s.text}`}>{s.value}</div>
              <div className="kicker mt-0.5 text-[8.5px] text-mute">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-2.5 flex items-center rounded-2xl border border-line bg-surface px-1.5 py-1.5">
          <span className="label flex-1 pl-2.5 text-[12px] text-ink">Servings</span>
          <button
            onClick={() => setServings(list.servings - 1)}
            aria-label="Fewer servings"
            className="grid h-8 w-8 place-items-center rounded-full text-mute transition-colors hover:bg-surface2 hover:text-ink"
          >
            <MinusIcon size={13} />
          </button>
          <motion.span
            key={list.servings}
            initial={{ scale: 1.25 }}
            animate={{ scale: 1 }}
            className="display grid w-10 place-items-center text-[16px] tabular-nums text-ink"
          >
            {list.servings}
          </motion.span>
          <button
            onClick={() => setServings(list.servings + 1)}
            aria-label="More servings"
            className="grid h-8 w-8 place-items-center rounded-full text-mute transition-colors hover:bg-surface2 hover:text-ink"
          >
            <PlusIcon size={13} />
          </button>
        </div>
      </div>

      <p className="mx-5 mt-3 mb-2 text-[10.5px] leading-relaxed text-mute">
        Quantities are what the recipe consumes — the smallest store pack that covers each one is
        picked automatically.
      </p>

      {/* ingredients */}
      <div className="flex-1 space-y-2 overflow-y-auto px-5 pt-1">
        <AnimatePresence initial={false}>
          {list.ingredients.map((ingredient) => (
            <IngredientRow
              key={ingredient.id}
              ingredient={ingredient}
              dimmed={settings.skipPantryStaples && ingredient.pantryStaple}
              onChange={(next) =>
                onChangeList({
                  ...list,
                  ingredients: list.ingredients.map((i) => (i.id === next.id ? next : i)),
                })
              }
              onRemove={() =>
                onChangeList({
                  ...list,
                  ingredients: list.ingredients.filter((i) => i.id !== ingredient.id),
                })
              }
            />
          ))}
        </AnimatePresence>

        {/* add item */}
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-dashed border-line px-3.5 py-1">
          <PlusIcon size={13} className="flex-none text-mute-soft" />
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder="Add an ingredient…"
            className="h-9 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-mute-soft"
          />
        </div>
      </div>

      {/* footer */}
      <div className="px-5 pt-3 pb-4">
        <div className="card px-4 py-3">
          <Toggle
            checked={settings.skipPantryStaples}
            onChange={(next) => onUpdateSettings({ ...settings, skipPantryStaples: next })}
            label="I have the basics"
            hint="Skip salt, oil and everyday spices"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {FILL_STORES.map((provider) => (
            <motion.button
              key={provider.id}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
              disabled={fillBusy || activeCount === 0}
              onClick={() => onFill(provider.id)}
              style={{ ['--tw-ring-color' as string]: provider.accent }}
              className="group relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl border border-line bg-surface px-2 py-3.5 text-center transition-colors hover:border-mute-soft disabled:opacity-40"
            >
              <span
                className="pointer-events-none absolute -top-8 left-1/2 h-16 w-16 -translate-x-1/2 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-60"
                style={{ background: provider.accent }}
              />
              {provider.id === 'blinkit' && (
                <span className="citrus-fill absolute top-0 right-0 rounded-bl-xl px-2 py-0.5 text-[8px] font-bold tracking-wider text-paper">
                  QUICKEST
                </span>
              )}
              <img
                src={STORE_LOGO[provider.id]}
                alt={provider.label}
                className="relative h-5 max-w-full object-contain"
              />
              <span className="label relative flex items-center gap-1 text-[9.5px] text-ink">
                Fill cart <CartIcon size={10} />
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </Screen>
  )
}
