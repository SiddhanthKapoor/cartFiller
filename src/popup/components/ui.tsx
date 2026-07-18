import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'

type MotionButtonProps = HTMLMotionProps<'button'>

const press = {
  whileHover: { x: -1, y: -1, boxShadow: '5px 5px 0 #000000' },
  whileTap: { x: 2, y: 2, boxShadow: '0px 0px 0 #000000' },
  transition: { type: 'spring' as const, stiffness: 600, damping: 30 },
}

// ---------- buttons ----------

export function PrimaryButton({
  children,
  className = '',
  ...props
}: MotionButtonProps & { children: ReactNode }) {
  return (
    <motion.button
      {...press}
      style={{ boxShadow: '4px 4px 0 #000000' }}
      className={`mono-label flex h-12 w-full items-center justify-center gap-2 border-2 border-line bg-accent text-[13px] text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  )
}

export function GhostButton({
  children,
  className = '',
  ...props
}: MotionButtonProps & { children: ReactNode }) {
  return (
    <motion.button
      {...press}
      style={{ boxShadow: '4px 4px 0 #000000' }}
      className={`mono-label flex h-12 w-full items-center justify-center gap-2 border-2 border-line bg-paper text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 ${className}`}
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
      className={`grid h-9 w-9 flex-none place-items-center border-2 border-line bg-paper text-ink transition-colors hover:bg-ink hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${className}`}
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
        <span className="mono-label block text-[12px] text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-mute">{hint}</span>}
      </span>
      <span
        className={`relative h-7 w-12 flex-none border-2 border-line transition-colors ${
          checked ? 'bg-ink' : 'bg-paper'
        }`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 700, damping: 34 }}
          className={`absolute top-[2px] h-[20px] w-[20px] ${checked ? 'bg-paper' : 'bg-ink'}`}
          style={{ left: checked ? 22 : 2 }}
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
      <span className="mono-label mb-1.5 block text-[11px] text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] leading-relaxed text-mute">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'h-11 w-full border-2 border-line bg-paper px-3 text-[13px] text-ink placeholder:text-mute-soft outline-none focus:shadow-[3px_3px_0_#000000]'

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
