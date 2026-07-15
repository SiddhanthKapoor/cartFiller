import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Ingredient, ProviderId, Settings, ShoppingList } from '@/shared/types'
import { PROVIDERS } from '@/shared/types'
import { formatQuantity, quantityStep, scaleQuantity } from '@/shared/units'
import { normalizeIngredient } from '@/shared/normalize'
import { IconButton, Screen, Toggle } from '../components/ui'
import {
  CartIcon,
  CheckIcon,
  ChevronLeftIcon,
  CopyIcon,
  MinusIcon,
  PlusIcon,
  XIcon,
} from '../components/icons'

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
      className="group mb-1.5 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && commitName()}
            className="w-full bg-transparent text-[12.5px] text-white outline-none"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            title="Tap to rename / substitute"
            className="block max-w-full truncate text-left text-[12.5px] text-white/90 hover:text-white"
          >
            {ingredient.name}
            {ingredient.optional && (
              <span className="ml-1.5 text-[10px] text-mist-dim">optional</span>
            )}
          </button>
        )}
        <span className="block text-[11px] text-mist-dim">
          {formatQuantity(ingredient.quantity, ingredient.unit)}
        </span>
      </div>

      <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5">
        <IconButton onClick={() => bump(-1)} aria-label="Less" className="h-6 w-6">
          <MinusIcon size={12} />
        </IconButton>
        <IconButton onClick={() => bump(1)} aria-label="More" className="h-6 w-6">
          <PlusIcon size={12} />
        </IconButton>
      </div>

      <IconButton
        onClick={onRemove}
        aria-label="Remove"
        className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <XIcon size={12} />
      </IconButton>
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

  return (
    <Screen>
      {/* header */}
      <div className="flex items-center gap-1 px-3 pt-4 pb-2">
        <IconButton onClick={onBack} aria-label="Back">
          <ChevronLeftIcon size={18} />
        </IconButton>
        <div className="min-w-0 flex-1 px-1">
          <h2 className="truncate text-[15px] font-semibold tracking-tight">{list.dish}</h2>
          <p className="text-[11px] text-mist">
            {activeCount} items
            {list.estimatedCostInr > 0 && <> · est. ₹{list.estimatedCostInr}</>}
            {list.nutrition && <> · ~{Math.round(list.nutrition.caloriesPerServing)} kcal/serving</>}
          </p>
        </div>
        <IconButton onClick={copyList} aria-label="Copy list">
          {copied ? <CheckIcon size={15} className="text-accent" /> : <CopyIcon size={15} />}
        </IconButton>
      </div>

      {/* servings */}
      <div className="mx-5 mb-3 flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-2.5">
        <span className="text-[12.5px] text-white/85">Servings</span>
        <div className="flex items-center gap-3">
          <IconButton onClick={() => setServings(list.servings - 1)} aria-label="Fewer servings">
            <MinusIcon size={13} />
          </IconButton>
          <motion.span
            key={list.servings}
            initial={{ scale: 1.25, color: '#30d158' }}
            animate={{ scale: 1, color: '#ffffff' }}
            className="w-5 text-center text-[14px] font-semibold tabular-nums"
          >
            {list.servings}
          </motion.span>
          <IconButton onClick={() => setServings(list.servings + 1)} aria-label="More servings">
            <PlusIcon size={13} />
          </IconButton>
        </div>
      </div>

      <p className="mx-5 mb-2 text-[11px] leading-relaxed text-mist-dim">
        Quantities are what the recipe consumes — the smallest store pack that covers each one is
        picked automatically.
      </p>

      {/* ingredients */}
      <div className="flex-1 overflow-y-auto px-5">
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
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-1">
          <PlusIcon size={13} className="flex-none text-mist-dim" />
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder="Add an ingredient…"
            className="h-8 flex-1 bg-transparent text-[12.5px] text-white outline-none placeholder:text-mist-dim"
          />
        </div>
      </div>

      {/* footer */}
      <div className="border-t border-line px-5 pt-3 pb-4">
        <Toggle
          checked={settings.skipPantryStaples}
          onChange={(next) => onUpdateSettings({ ...settings, skipPantryStaples: next })}
          label="I have the basics"
          hint="Skip salt, oil and everyday spices"
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {Object.values(PROVIDERS).map((provider) => (
            <motion.button
              key={provider.id}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              disabled={fillBusy || activeCount === 0}
              onClick={() => onFill(provider.id)}
              className="flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface-2 transition-colors hover:border-line-strong disabled:opacity-40"
            >
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-white">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: provider.accent }}
                />
                {provider.label}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-mist-dim">
                <CartIcon size={10} /> Fill cart
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </Screen>
  )
}
