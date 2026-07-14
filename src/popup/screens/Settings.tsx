import { useState } from 'react'
import type { Settings } from '@/shared/types'
import { Field, IconButton, PrimaryButton, Screen, inputClass } from '../components/ui'
import { ChevronLeftIcon } from '../components/icons'

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

  const save = () => {
    onSave({
      ...draft,
      ai: {
        apiKey: draft.ai.apiKey.trim(),
        baseUrl: draft.ai.baseUrl.trim().replace(/\/+$/, '') || settings.ai.baseUrl,
        model: draft.ai.model.trim() || settings.ai.model,
      },
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
        <Field
          label="API key"
          hint="Any OpenAI-compatible key works (OpenAI, Groq, OpenRouter). Stored only in this browser's extension storage — never sent anywhere except your chosen provider."
        >
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={draft.ai.apiKey}
              onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, apiKey: e.target.value } })}
              placeholder="sk-…"
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

        <Field label="Base URL" hint="e.g. https://api.groq.com/openai/v1 or https://openrouter.ai/api/v1">
          <input
            value={draft.ai.baseUrl}
            onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, baseUrl: e.target.value } })}
            placeholder="https://api.openai.com/v1"
            className={inputClass}
          />
        </Field>

        <Field label="Model">
          <input
            value={draft.ai.model}
            onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, model: e.target.value } })}
            placeholder="gpt-4o-mini"
            className={inputClass}
          />
        </Field>

        <Field label="Default budget (₹)" hint="Applied to every dish unless you specify one in the request. Leave empty for none.">
          <input
            type="number"
            min={0}
            value={draft.budgetInr ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, budgetInr: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="No budget"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="border-t border-line px-5 pt-3 pb-4">
        <PrimaryButton onClick={save}>{saved ? 'Saved ✓' : 'Save'}</PrimaryButton>
      </div>
    </Screen>
  )
}
