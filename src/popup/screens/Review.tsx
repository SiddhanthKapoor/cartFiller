import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Ingredient, ProviderId, Settings, ShoppingList } from '@/shared/types'
import { PROVIDERS } from '@/shared/types'
import { formatQuantity, quantityStep, scaleQuantity } from '@/shared/units'
import { normalizeIngredient } from '@/shared/normalize'
import { IconButton, Screen, Toggle } from '../components/ui'
import { STORE_LOGO } from '../assets/brands'

// Blinkit is the fast, reliable path; Zepto second. (Instamart omitted for now.)
const FILL_STORES = [PROVIDERS.blinkit, PROVIDERS.zepto]
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
      className="group -mt-[2px] flex items-stretch border-2 border-line"
    >
      <span className="tile w-9 flex-none border-r-2 border-line">
        <CartIcon size={14} />
      </span>
      <div className="min-w-0 flex-1 px-2.5 py-1.5">
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && commitName()}
            className="w-full bg-transparent text-[12px] font-semibold text-ink outline-none"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            title="Tap to rename / substitute"
            className="mono-label block max-w-full truncate text-left text-[12px] text-ink"
          >
            {ingredient.name}
            {ingredient.optional && <span className="ml-1.5 lowercase text-[10px] text-mute">opt</span>}
          </button>
        )}
        <span className="block text-[10.5px] text-mute">
          {formatQuantity(ingredient.quantity, ingredient.unit)}
        </span>
      </div>

      <button
        onClick={() => bump(-1)}
        aria-label="Less"
        className="grid w-8 flex-none place-items-center border-l-2 border-line hover:bg-wash"
      >
        <MinusIcon size={13} />
      </button>
      <button
        onClick={() => bump(1)}
        aria-label="More"
        className="grid w-8 flex-none place-items-center border-l-2 border-line hover:bg-wash"
      >
        <PlusIcon size={13} />
      </button>
      <button
        onClick={onRemove}
        aria-label="Remove"
        className="grid w-8 flex-none place-items-center border-l-2 border-line hover:bg-ink hover:text-paper"
      >
        <XIcon size={13} />
      </button>
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
      <div className="flex items-center gap-2.5 border-b-2 border-line px-4 py-3">
        <IconButton onClick={onBack} aria-label="Back">
          <ChevronLeftIcon size={16} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h2 className="mono-label truncate text-[14px]">{list.dish}</h2>
          {list.cuisine && <p className="text-[10px] text-mute uppercase">{list.cuisine}</p>}
        </div>
        <IconButton onClick={copyList} aria-label="Copy list">
          {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
        </IconButton>
      </div>

      {/* summary bar */}
      <div className="mx-5 mt-3 flex divide-x-2 divide-line border-2 border-line">
        <div className="flex-1 bg-sky-soft px-3 py-2">
          <div className="mono-label text-[14px] tabular-nums">{activeCount}</div>
          <div className="text-[9px] text-mute uppercase">Items</div>
        </div>
        {list.estimatedCostInr > 0 && (
          <div className="flex-1 bg-lime-soft px-3 py-2">
            <div className="mono-label text-[14px] tabular-nums">₹{list.estimatedCostInr}</div>
            <div className="text-[9px] text-mute uppercase">Est. Cost</div>
          </div>
        )}
        {list.nutrition && (
          <div className="flex-1 bg-sun-soft px-3 py-2">
            <div className="mono-label text-[14px] tabular-nums">
              ~{Math.round(list.nutrition.caloriesPerServing)}
            </div>
            <div className="text-[9px] text-mute uppercase">Kcal/Serving</div>
          </div>
        )}
      </div>

      {/* servings */}
      <div className="mx-5 mt-3 flex items-stretch border-2 border-line">
        <span className="mono-label flex-1 px-3 py-2 text-[12px]">Servings</span>
        <button
          onClick={() => setServings(list.servings - 1)}
          aria-label="Fewer servings"
          className="grid w-10 place-items-center border-l-2 border-line hover:bg-wash"
        >
          <MinusIcon size={13} />
        </button>
        <motion.span
          key={list.servings}
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          className="mono-label grid w-12 place-items-center border-x-2 border-line text-[15px] tabular-nums"
        >
          {list.servings}
        </motion.span>
        <button
          onClick={() => setServings(list.servings + 1)}
          aria-label="More servings"
          className="grid w-10 place-items-center hover:bg-wash"
        >
          <PlusIcon size={13} />
        </button>
      </div>

      <p className="mx-5 mt-3 mb-2 text-[10.5px] leading-relaxed text-mute">
        Quantities are what the recipe consumes — the smallest store pack that covers each one is
        picked automatically.
      </p>

      {/* ingredients */}
      <div className="flex-1 overflow-y-auto px-5 pt-[2px]">
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
        <div className="mt-[2px] mb-3 flex items-center gap-2 border-2 border-dashed border-line px-3 py-1">
          <PlusIcon size={13} className="flex-none text-mute" />
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder="Add an ingredient…"
            className="h-8 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-mute-soft"
          />
        </div>
      </div>

      {/* footer */}
      <div className="border-t-2 border-line px-5 pt-3 pb-4">
        <div className="brutal-flat px-3.5 py-2.5">
          <Toggle
            checked={settings.skipPantryStaples}
            onChange={(next) => onUpdateSettings({ ...settings, skipPantryStaples: next })}
            label="I have the basics"
            hint="Skip salt, oil and everyday spices"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {FILL_STORES.map((provider) => (
            <motion.button
              key={provider.id}
              initial={false}
              whileHover={{ x: -2, y: -2, boxShadow: `6px 6px 0 ${provider.accent}` }}
              whileTap={{ x: 1, y: 1, boxShadow: '0 0 0 #000000' }}
              transition={{ duration: 0.12 }}
              style={{ boxShadow: '3px 3px 0 #000000' }}
              disabled={fillBusy || activeCount === 0}
              onClick={() => onFill(provider.id)}
              className="relative flex flex-col items-center gap-1.5 border-2 border-line bg-paper px-1.5 py-3 text-center disabled:opacity-40"
            >
              {provider.id === 'blinkit' && (
                <span className="tile absolute top-0 right-0 px-1.5 py-0.5 text-[8px] font-bold tracking-wider">
                  QUICKEST
                </span>
              )}
              <img src={STORE_LOGO[provider.id]} alt={provider.label} className="h-5 max-w-full object-contain" />
              <span className="flex items-center gap-1 text-[9px] font-bold text-ink uppercase">
                Fill Cart <CartIcon size={9} />
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </Screen>
  )
}
