import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Settings } from '@/shared/types'
import { AI_PROVIDER_LIST, AI_PROVIDERS, defaultModelFor } from '@/shared/aiProviders'
import { Field, IconButton, PrimaryButton, Screen, inputClass } from '../components/ui'
import { ChevronLeftIcon, EyeIcon } from '../components/icons'
import { AI_LOGO } from '../assets/brands'

/** Plain-language steps for a first-timer to get a free Gemini key. */
function GeminiKeyHelp() {
  const [open, setOpen] = useState(false)
  return (
    <div className="-mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="mono-label flex items-center gap-1.5 text-[11px] text-ink underline"
      >
        <span className="grid h-4 w-4 place-items-center border-2 border-ink text-[9px]">?</span>
        How do I get a free key?
      </button>
      <AnimatePresence>
        {open && (
          <motion.ol
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 space-y-1.5 overflow-hidden border-2 border-ink px-3.5 py-3 text-[11px] leading-relaxed text-mute"
          >
            <li>
              1. Open{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-ink underline"
              >
                aistudio.google.com/apikey
              </a>{' '}
              and sign in with any Google account.
            </li>
            <li>2. Click <span className="text-ink">“Create API key”</span>.</li>
            <li>3. Copy the key it shows (starts with <span className="text-ink">AIza…</span>).</li>
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
      <div className="flex items-center gap-2.5 border-b-2 border-ink px-4 py-3.5">
        <IconButton onClick={onBack} aria-label="Back">
          <ChevronLeftIcon size={16} />
        </IconButton>
        <h2 className="mono-label text-[15px]">Settings</h2>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* provider */}
        <div>
          <span className="mono-label mb-2 block text-[11px] text-ink">AI Provider</span>
          <div className="grid grid-cols-3 gap-2">
            {AI_PROVIDER_LIST.map((p) => {
              const active = draft.ai.provider === p.key
              const hasKey = (draft.ai.keys[p.key] ?? '').trim() !== ''
              return (
                <button
                  key={p.key}
                  onClick={() => selectProvider(p.key)}
                  className={`brutal-sm relative flex items-center gap-1.5 px-2 py-2 text-[10.5px] transition-colors ${
                    active ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-wash'
                  }`}
                >
                  <img
                    src={AI_LOGO[p.key]}
                    alt=""
                    className={`h-4 w-4 flex-none object-contain ${active ? 'invert' : ''}`}
                    style={{ filter: active ? 'grayscale(1) brightness(0) invert(1)' : 'grayscale(1) brightness(0)' }}
                  />
                  <span className="mono-label truncate">{p.label}</span>
                  {hasKey && (
                    <span className={`absolute top-1.5 right-1.5 h-1.5 w-1.5 ${active ? 'bg-paper' : 'bg-ink'}`} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* model */}
        <Field label="Model">
          <div className="relative">
            <select
              value={draft.ai.model}
              onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, model: e.target.value } })}
              className={`${inputClass} appearance-none pr-9`}
            >
              {provider.models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <ChevronLeftIcon
              size={14}
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 -rotate-90"
            />
          </div>
        </Field>

        {/* per-provider key */}
        <Field
          label={`${provider.label} API key`}
          hint={`Kept per provider, stored only in this browser and sent nowhere except ${provider.label}.`}
        >
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={currentKey}
              onChange={(e) => setKey(e.target.value)}
              placeholder={provider.keyPlaceholder}
              className={`${inputClass} pr-12`}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? 'Hide key' : 'Show key'}
              className="absolute top-0 right-0 grid h-11 w-11 place-items-center border-l-2 border-ink hover:bg-wash"
            >
              <EyeIcon size={15} open={showKey} />
            </button>
          </div>
        </Field>

        {draft.ai.provider === 'gemini' && <GeminiKeyHelp />}

        {/* budget */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="mono-label text-[11px] text-ink">Default budget</span>
            <span className="mono-label text-[14px] tabular-nums">
              {draft.budgetInr ? `₹${draft.budgetInr}` : 'Off'}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={3000}
            step={100}
            value={draft.budgetInr ?? 0}
            onChange={(e) => setDraft({ ...draft, budgetInr: Number(e.target.value) || null })}
            className="w-full"
          />
          <span className="mt-2 block text-[11px] leading-relaxed text-mute">
            Applied to every dish unless the request names its own budget. Slide to ₹0 to turn off.
          </span>
        </div>
      </div>

      <div className="border-t-2 border-ink px-5 pt-3.5 pb-4">
        <PrimaryButton onClick={save}>{saved ? 'Saved ✓' : 'Save Settings'}</PrimaryButton>
      </div>
    </Screen>
  )
}
