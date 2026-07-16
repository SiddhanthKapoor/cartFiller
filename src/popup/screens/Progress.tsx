import { motion } from 'motion/react'
import type { FillJob } from '@/shared/types'
import { PROVIDERS } from '@/shared/types'
import { GhostButton, PrimaryButton, Screen } from '../components/ui'
import { CheckIcon, MinusIcon, XIcon } from '../components/icons'

const FINISHED = new Set(['added', 'skipped', 'failed'])

function StatusIcon({ status }: { status: string }) {
  if (status === 'running')
    return (
      <span className="animate-spin-slow h-3.5 w-3.5 rounded-full border-2 border-ink/25 border-t-ink" />
    )
  if (status === 'added') return <CheckIcon size={14} className="text-ink" />
  if (status === 'skipped') return <MinusIcon size={14} className="text-mute-soft" />
  if (status === 'failed') return <XIcon size={14} className="text-danger" />
  return <span className="h-1.5 w-1.5 bg-ink/25" />
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

  return (
    <Screen>
      <div className="border-b-2 border-ink px-5 pt-5 pb-4">
        <p className="mono-label flex items-center gap-1.5 text-[11px] text-ink">
          <span className="tile grid h-4 w-4 place-items-center text-[8px] font-bold">
            {provider.label[0]}
          </span>
          {finished ? (job.status === 'done' ? `${provider.label} · Cart Filled` : 'Stopped') : `Filling ${provider.label}`}
        </p>
        <h2 className="mono-label mt-1.5 text-[20px]">{job.dish}</h2>

        {/* progress bar */}
        <div className="mt-4 h-3 border-2 border-ink">
          <motion.div
            className="h-full"
            style={{ background: provider.accent }}
            animate={{ width: `${total === 0 ? 0 : (doneCount / total) * 100}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 24 }}
          />
        </div>
        <p className="mono-label mt-2 text-[11px] tabular-nums text-mute">
          {finished ? (
            <>
              {addedCount} Added
              {doneCount - addedCount > 0 && ` · ${doneCount - addedCount} Skipped`}
            </>
          ) : (
            `${doneCount} / ${total}`
          )}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-3">
        {job.items.map((item, index) => (
          <motion.div
            key={index}
            layout
            className={`flex items-center gap-2.5 border-2 px-3 py-2 ${
              item.status === 'running' ? 'border-ink bg-wash' : 'border-transparent'
            } ${index > 0 ? '-mt-[2px]' : ''}`}
          >
            <span className="grid w-4 flex-none place-items-center">
              <StatusIcon status={item.status} />
            </span>
            <div className="min-w-0 flex-1">
              <span className="mono-label block truncate text-[12px] text-ink">
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
                <span className="block truncate text-[10.5px] text-mute">{item.error}</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="border-t-2 border-ink px-5 pt-3.5 pb-4">
        {finished ? (
          <>
            {job.status === 'done' && (
              <p className="mb-3 text-center text-[11px] leading-relaxed text-mute">
                Review the cart in the {provider.label} tab before checkout.
              </p>
            )}
            <PrimaryButton onClick={onDone}>Plan Another Dish</PrimaryButton>
          </>
        ) : (
          <GhostButton onClick={onCancel}>Stop Filling</GhostButton>
        )}
      </div>
    </Screen>
  )
}
