import { motion } from 'motion/react'
import type { FillJob } from '@/shared/types'
import { PROVIDERS } from '@/shared/types'
import { GhostButton, PrimaryButton, Screen } from '../components/ui'
import { CheckIcon, MinusIcon, XIcon } from '../components/icons'

const FINISHED = new Set(['added', 'skipped', 'failed'])

function StatusIcon({ status }: { status: string }) {
  if (status === 'running')
    return (
      <span className="animate-spin-slow h-3.5 w-3.5 rounded-full border-2 border-lime/25 border-t-lime" />
    )
  if (status === 'added') return <CheckIcon size={14} className="text-lime" />
  if (status === 'skipped') return <MinusIcon size={14} className="text-mute-soft" />
  if (status === 'failed') return <XIcon size={14} className="text-coral" />
  return <span className="h-1.5 w-1.5 rounded-full bg-mute-soft" />
}

export function ProgressScreen({
  job,
  onCancel,
  onDone,
}: {
  job: FillJob
  onCancel: () => void
  onDone: () => void
}) {
  const doneCount = job.items.filter((i) => FINISHED.has(i.status)).length
  const addedCount = job.items.filter((i) => i.status === 'added').length
  const total = job.items.length
  const finished = job.status !== 'running'
  const provider = PROVIDERS[job.provider]
  const pct = total === 0 ? 0 : (doneCount / total) * 100

  return (
    <Screen>
      <div className="px-5 pt-6 pb-4">
        <p className="kicker flex items-center gap-2 text-[10px] text-mute">
          <span
            className="grid h-4 w-4 place-items-center rounded-md text-[8px] font-bold text-paper"
            style={{ background: provider.accent }}
          >
            {provider.label[0]}
          </span>
          {finished
            ? job.status === 'done'
              ? `${provider.label} · cart filled`
              : 'Stopped'
            : `Filling ${provider.label}`}
        </p>
        <h2 className="display mt-2 text-[24px] text-ink">{job.dish}</h2>

        {/* progress bar */}
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface2">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: 'linear-gradient(90deg,#c6ff3d,#ffb020,#ff5e5b)',
              boxShadow: '0 0 14px -2px rgba(198,255,61,0.6)',
            }}
            animate={{ width: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 24 }}
          />
        </div>
        <p className="label mt-2 text-[11px] tabular-nums text-mute">
          {finished ? (
            <>
              <span className="text-lime">{addedCount} added</span>
              {doneCount - addedCount > 0 && ` · ${doneCount - addedCount} skipped`}
            </>
          ) : (
            `${doneCount} / ${total}`
          )}
        </p>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-5 py-1">
        {job.items.map((item, index) => (
          <motion.div
            key={index}
            layout
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors ${
              item.status === 'running' ? 'bg-surface' : ''
            }`}
          >
            <span className="grid w-4 flex-none place-items-center">
              <StatusIcon status={item.status} />
            </span>
            <div className="min-w-0 flex-1">
              <span
                className={`label block truncate text-[12px] ${
                  item.status === 'pending' ? 'text-mute' : 'text-ink'
                }`}
              >
                {item.ingredient.name}
              </span>
              {item.matched && item.status === 'added' && (
                <span className="block truncate text-[10.5px] text-mute">
                  {item.matched.name}
                  {item.matched.unitsAdded > 1 && ` ×${item.matched.unitsAdded}`}
                  {item.matched.priceInr !== null &&
                    ` · ₹${item.matched.priceInr * item.matched.unitsAdded}`}
                </span>
              )}
              {item.error && item.status !== 'added' && (
                <span className="block truncate text-[10.5px] text-mute-soft">{item.error}</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="px-5 pt-3.5 pb-4">
        {finished ? (
          <>
            {job.status === 'done' && (
              <p className="mb-3 text-center text-[11px] leading-relaxed text-mute">
                Review the cart in the {provider.label} tab before checkout.
              </p>
            )}
            <PrimaryButton onClick={onDone}>Plan another dish</PrimaryButton>
          </>
        ) : (
          <GhostButton onClick={onCancel}>Stop filling</GhostButton>
        )}
      </div>
    </Screen>
  )
}
