import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Settings } from '@/shared/types'
import { AI_PROVIDER_LIST, AI_PROVIDERS, defaultModelFor } from '@/shared/aiProviders'
import { clearCaptures, getCaptures } from '@/shared/storage'
import { Field, IconButton, PrimaryButton, Screen, inputClass } from '../components/ui'
import { ChevronLeftIcon, EyeIcon } from '../components/icons'
import { AI_LOGO } from '../assets/brands'

/** Plain-language steps for a first-timer to get a free Gemini key. */
function GeminiKeyHelp() {
  const [open, setOpen] = useState(false)
  return (
    <div className="-mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="label flex items-center gap-1.5 text-[11px] text-lime"
      >
        <span className="grid h-4 w-4 place-items-center rounded-full border border-lime text-[9px]">
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
            className="mt-2 space-y-1.5 overflow-hidden rounded-2xl border border-line bg-surface px-4 py-3 text-[11px] leading-relaxed text-mute"
          >
            <li>
              1. Open{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-lime underline"
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

/** Developer tap: mirror store API calls to the page console + a copy buffer. */
function DeveloperSection({
  on,
  onToggle,
}: {
  on: boolean
  onToggle: (next: boolean) => void
}) {
  const [count, setCount] = useState(0)
  const [copied, setCopied] = useState(false)

  const refresh = () => getCaptures().then((c) => setCount(c.length)).catch(() => undefined)
  useEffect(() => {
    void refresh()
    const t = setInterval(refresh, 1500)
    return () => clearInterval(t)
  }, [])

  const copy = async () => {
    const captures = await getCaptures()
    await navigator.clipboard.writeText(JSON.stringify(captures, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  const clear = async () => {
    await clearCaptures()
    void refresh()
  }

  return (
    <div className="card px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="label text-[12.5px] text-ink">Observe store API</span>
        <button
          role="switch"
          aria-checked={on}
          onClick={() => onToggle(!on)}
          className={`relative h-6 w-11 rounded-full border transition-colors ${
            on ? 'border-lime bg-accent glow-lime' : 'border-line bg-surface2'
          }`}
        >
          <span
            className={`absolute top-[2px] h-4 w-4 rounded-full transition-all ${
              on ? 'bg-paper' : 'bg-mute'
            }`}
            style={{ left: on ? '22px' : '2px' }}
          />
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-mute">
        Logs each store's real API calls (headers, body, response) to that page's DevTools console
        and a copy buffer. Turn on, reload the store tab, then use the site.
      </p>
      {on && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={copy}
            disabled={count === 0}
            className="label rounded-full border border-line bg-surface2 px-3 py-1.5 text-[10.5px] text-ink transition-colors hover:border-lime disabled:opacity-40"
          >
            {copied ? 'Copied ✓' : `Copy ${count} call${count === 1 ? '' : 's'}`}
          </button>
          <button
            onClick={clear}
            disabled={count === 0}
            className="label rounded-full border border-line bg-surface2 px-3 py-1.5 text-[10.5px] text-mute transition-colors hover:text-coral disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      )}
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
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
        <IconButton onClick={onBack} aria-label="Back">
          <ChevronLeftIcon size={16} />
        </IconButton>
        <h2 className="display text-[17px] text-ink">Settings</h2>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-3">
        {/* provider */}
        <div>
          <span className="kicker mb-2.5 block text-[10px] text-mute">AI Provider</span>
          <div className="grid grid-cols-3 gap-2">
            {AI_PROVIDER_LIST.map((p) => {
              const active = draft.ai.provider === p.key
              const hasKey = (draft.ai.keys[p.key] ?? '').trim() !== ''
              return (
                <button
                  key={p.key}
                  onClick={() => selectProvider(p.key)}
                  className={`relative flex items-center gap-1.5 rounded-2xl border px-2.5 py-2.5 text-[10.5px] transition-colors ${
                    active
                      ? 'border-lime bg-lime-soft text-ink'
                      : 'border-line bg-surface text-mute hover:border-mute-soft'
                  }`}
                >
                  <img src={AI_LOGO[p.key]} alt="" className="h-4 w-4 flex-none object-contain" />
                  <span className="label truncate">{p.label}</span>
                  {hasKey && (
                    <span
                      className={`absolute top-2 right-2 h-1.5 w-1.5 rounded-full ${
                        active ? 'bg-lime' : 'bg-mute-soft'
                      }`}
                    />
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
              className={`${inputClass} cursor-pointer appearance-none pr-9`}
            >
              {provider.models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <ChevronLeftIcon
              size={14}
              className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 -rotate-90 text-mute"
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
              className="absolute top-0 right-0 grid h-11 w-11 place-items-center rounded-r-2xl text-mute hover:text-ink"
            >
              <EyeIcon size={15} open={showKey} />
            </button>
          </div>
        </Field>

        {draft.ai.provider === 'gemini' && <GeminiKeyHelp />}

        {/* budget */}
        <div>
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="kicker text-[10px] text-mute">Default budget</span>
            <span className="display text-[15px] tabular-nums text-lime">
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

        {/* developer */}
        <div>
          <span className="kicker mb-2.5 block text-[10px] text-mute">Developer</span>
          <DeveloperSection
            on={draft.observeApi}
            onToggle={(next) => setDraft({ ...draft, observeApi: next })}
          />
        </div>
      </div>

      <div className="px-5 pt-3 pb-4">
        <PrimaryButton onClick={save}>{saved ? 'Saved ✓' : 'Save settings'}</PrimaryButton>
      </div>
    </Screen>
  )
}
