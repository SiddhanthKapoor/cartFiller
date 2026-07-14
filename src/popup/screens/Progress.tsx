import { motion } from 'motion/react'
import type { FillJob } from '@/shared/types'
import { PROVIDERS } from '@/shared/types'
import { GhostButton, PrimaryButton, Screen } from '../components/ui'
import { CheckIcon, MinusIcon, XIcon } from '../components/icons'

const FINISHED = new Set(['added', 'skipped', 'failed'])

function StatusIcon({ status }: { status: string }) {
  if (status === 'running')
    return (
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
        className="h-3.5 w-3.5 rounded-full border-2 border-accent/25 border-t-accent"
      />
    )
  if (status === 'added') return <CheckIcon size={13} className="text-accent" />
  if (status === 'skipped') return <MinusIcon size={13} className="text-warn" />
  if (status === 'failed') return <XIcon size={13} className="text-danger" />
  return <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
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
      <div className="px-5 pt-6 pb-4">
        <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-mist uppercase">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: provider.accent }} />
          {finished
            ? job.status === 'done'
              ? `${provider.label} cart filled`
              : 'Stopped'
            : `Filling ${provider.label} cart`}
        </p>
        <h2 className="mt-1 text-[19px] font-semibold tracking-tight">{job.dish}</h2>

        {/* progress bar */}
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/8">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[#34db66] to-[#22b14c]"
            animate={{ width: `${total === 0 ? 0 : (doneCount / total) * 100}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 24 }}
          />
        </div>
        <p className="mt-2 text-[12px] text-mist tabular-nums">
          {finished ? (
            <>
              {addedCount} added
              {doneCount - addedCount > 0 && <> · {doneCount - addedCount} skipped</>}
            </>
          ) : (
            <>
              {doneCount} / {total}
            </>
          )}
        </p>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-5">
        {job.items.map((item, index) => (
          <motion.div
            key={index}
            layout
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${
              item.status === 'running' ? 'bg-accent-dim' : ''
            }`}
          >
            <span className="grid w-4 flex-none place-items-center">
              <StatusIcon status={item.status} />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] text-white/90">
                {item.ingredient.name}
              </span>
              {item.matched && item.status === 'added' && (
                <span className="block truncate text-[11px] text-mist-dim">
                  {item.matched.name}
                  {item.matched.unitsAdded > 1 && ` ×${item.matched.unitsAdded}`}
                  {item.matched.priceInr !== null &&
                    ` · ₹${item.matched.priceInr * item.matched.unitsAdded}`}
                </span>
              )}
              {item.error && item.status !== 'added' && (
                <span className="block truncate text-[11px] text-mist-dim">{item.error}</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="border-t border-line px-5 pt-3 pb-4">
        {finished ? (
          <>
            {job.status === 'done' && (
              <p className="mb-3 text-center text-[11.5px] leading-relaxed text-mist">
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
