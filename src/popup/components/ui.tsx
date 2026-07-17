import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'

type MotionButtonProps = HTMLMotionProps<'button'>

const springy = {
  whileHover: { scale: 1.02, y: -1 },
  whileTap: { scale: 0.96 },
  transition: { type: 'spring' as const, stiffness: 500, damping: 24 },
}

// ---------- buttons ----------

/** Primary action — a lime pill with a soft glow and dark ink text. */
export function PrimaryButton({
  children,
  className = '',
  ...props
}: MotionButtonProps & { children: ReactNode }) {
  return (
    <motion.button
      {...springy}
      className={`glow-lime label flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[14px] text-paper disabled:opacity-40 disabled:saturate-50 ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  )
}

/** Secondary — a hollow pill on the dark canvas. */
export function GhostButton({
  children,
  className = '',
  ...props
}: MotionButtonProps & { children: ReactNode }) {
  return (
    <motion.button
      {...springy}
      className={`label flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line bg-surface text-[14px] text-ink hover:border-mute-soft disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  )
}

export function IconButton({
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={`grid h-10 w-10 flex-none place-items-center rounded-full border border-line bg-surface text-ink transition-colors hover:border-mute-soft hover:text-lime ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

// ---------- toggle ----------

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 text-left"
    >
      <span>
        <span className="label block text-[13px] text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-mute">{hint}</span>}
      </span>
      <span
        className={`relative h-7 w-12 flex-none rounded-full border transition-colors ${
          checked ? 'border-lime bg-accent glow-lime' : 'border-line bg-surface2'
        }`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 700, damping: 34 }}
          className={`absolute top-[3px] h-[18px] w-[18px] rounded-full ${
            checked ? 'bg-paper' : 'bg-mute'
          }`}
          style={{ left: checked ? 23 : 3 }}
        />
      </span>
    </button>
  )
}

// ---------- form field ----------

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="kicker mb-2 block text-[10px] text-mute">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] leading-relaxed text-mute">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'h-11 w-full rounded-2xl border border-line bg-surface2 px-3.5 text-[13px] text-ink placeholder:text-mute-soft outline-none transition-colors focus:border-lime'

// ---------- screen shell ----------

export function Screen({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ type: 'spring', stiffness: 360, damping: 32 }}
      className="absolute inset-0 flex flex-col"
    >
      {children}
    </motion.div>
  )
}
