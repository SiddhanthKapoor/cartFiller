import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Settings } from '@/shared/types'
import { AI_PROVIDER_LIST, AI_PROVIDERS, defaultModelFor } from '@/shared/aiProviders'
import { Field, IconButton, PrimaryButton, Screen, inputClass } from '../components/ui'
import { ChevronLeftIcon } from '../components/icons'

/** Plain-language steps for a first-timer to get a free Gemini key. */
function GeminiKeyHelp() {
  const [open, setOpen] = useState(false)
  return (
    <div className="-mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11.5px] font-medium text-accent"
      >
        <span className="grid h-4 w-4 place-items-center rounded-full border border-accent/50 text-[10px]">
          ?
        </span>
        How do I get a free key?
      </button>
      <AnimatePresence>
        {open && (
          <motion.ol
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 space-y-1.5 overflow-hidden rounded-xl border border-line bg-surface px-3.5 py-3 text-[11.5px] leading-relaxed text-mist"
          >
            <li>
              1. Open{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-accent underline"
              >
                aistudio.google.com/apikey
              </a>{' '}
              and sign in with any Google account.
            </li>
            <li>2. Click <span className="text-white/80">“Create API key”</span>.</li>
            <li>3. Copy the key it shows (starts with <span className="text-white/80">AIza…</span>).</li>
            <li>4. Paste it above and hit Save. It's free for everyday use.</li>
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  )
}

export function SettingsScreen({
  settings,
  onSave,
  onBack,
}: {
  settings: Settings
  onSave: (next: Settings) => void
  onBack: () => void
}) {
  const [draft, setDraft] = useState(settings)
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)

  const provider = AI_PROVIDERS[draft.ai.provider]
  const currentKey = draft.ai.keys[draft.ai.provider] ?? ''

  const selectProvider = (key: typeof draft.ai.provider) => {
    setDraft({
      ...draft,
      ai: { ...draft.ai, provider: key, model: defaultModelFor(key) },
    })
    setShowKey(false)
  }

  const setKey = (value: string) => {
    setDraft({
      ...draft,
      ai: { ...draft.ai, keys: { ...draft.ai.keys, [draft.ai.provider]: value } },
    })
  }

  const save = () => {
    const keys = Object.fromEntries(
      Object.entries(draft.ai.keys)
        .map(([k, v]) => [k, v?.trim() ?? ''])
        .filter(([, v]) => v !== ''),
    )
    onSave({
      ...draft,
      ai: { ...draft.ai, keys },
      budgetInr: draft.budgetInr && draft.budgetInr > 0 ? draft.budgetInr : null,
    })
    setSaved(true)
    setTimeout(onBack, 500)
  }

  return (
    <Screen>
      <div className="flex items-center gap-1 px-3 pt-4 pb-2">
        <IconButton onClick={onBack} aria-label="Back">
          <ChevronLeftIcon size={18} />
        </IconButton>
        <h2 className="px-1 text-[15px] font-semibold tracking-tight">Settings</h2>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-3">
        {/* provider */}
        <div>
          <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-mist uppercase">
            Provider
          </span>
          <div className="flex flex-wrap gap-1.5">
            {AI_PROVIDER_LIST.map((p) => {
              const active = draft.ai.provider === p.key
              const hasKey = (draft.ai.keys[p.key] ?? '').trim() !== ''
              return (
                <button
                  key={p.key}
                  onClick={() => selectProvider(p.key)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] transition-colors ${
                    active
                      ? 'border-accent/60 bg-accent-dim text-accent'
                      : 'border-line bg-surface text-white/70 hover:border-line-strong hover:text-white'
                  }`}
                >
                  {p.label}
                  {hasKey && <span className="h-1 w-1 rounded-full bg-accent" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* model */}
        <Field label="Model">
          <select
            value={draft.ai.model}
            onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, model: e.target.value } })}
            className={`${inputClass} appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2212%22%20height=%2212%22%20viewBox=%220%200%2024%2024%22%20fill=%22none%22%20stroke=%22%23888%22%20stroke-width=%222%22%3E%3Cpath%20d=%22M6%209l6%206%206-6%22/%3E%3C/svg%3E')] bg-[position:right_12px_center] bg-no-repeat pr-8`}
          >
            {provider.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </Field>

        {/* per-provider key */}
        <Field
          label={`${provider.label} API key`}
          hint={`${provider.keyHint}. Each provider keeps its own key, stored only in this browser's extension storage and sent nowhere except ${provider.label}.`}
        >
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={currentKey}
              onChange={(e) => setKey(e.target.value)}
              placeholder={provider.keyPlaceholder}
              className={`${inputClass} pr-16`}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-[11px] text-mist hover:text-white"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </Field>

        {draft.ai.provider === 'gemini' && <GeminiKeyHelp />}

        {/* budget */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[11px] font-medium tracking-wide text-mist uppercase">
              Default budget
            </span>
            <span className="text-[13px] font-semibold text-white tabular-nums">
              {draft.budgetInr ? `₹${draft.budgetInr}` : 'Off'}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={3000}
            step={100}
            value={draft.budgetInr ?? 0}
            onChange={(e) =>
              setDraft({ ...draft, budgetInr: Number(e.target.value) || null })
            }
            className="w-full accent-accent"
          />
          <span className="mt-1 block text-[11px] leading-relaxed text-mist-dim">
            Applied to every dish unless the request names its own budget. Slide to ₹0 to turn off.
          </span>
        </div>
      </div>

      <div className="border-t border-line px-5 pt-3 pb-4">
        <PrimaryButton onClick={save}>{saved ? 'Saved ✓' : 'Save'}</PrimaryButton>
      </div>
    </Screen>
  )
}
