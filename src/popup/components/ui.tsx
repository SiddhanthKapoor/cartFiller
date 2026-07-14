import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'

// ---------- buttons ----------

type MotionButtonProps = HTMLMotionProps<'button'>

export function PrimaryButton({
  children,
  className = '',
  ...props
}: MotionButtonProps & { children: ReactNode }) {
  return (
    <motion.button
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-medium text-[13px] text-black transition-opacity disabled:opacity-40 ${className}`}
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
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 font-medium text-[13px] text-white/85 transition-colors hover:border-line-strong disabled:opacity-40 ${className}`}
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
      className={`grid h-8 w-8 flex-none place-items-center rounded-full text-mist transition-colors hover:bg-white/8 hover:text-white ${className}`}
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
        <span className="block text-[13px] text-white/90">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-mist-dim">{hint}</span>}
      </span>
      <span
        className={`relative h-[26px] w-[44px] flex-none rounded-full transition-colors duration-300 ${
          checked ? 'bg-accent' : 'bg-white/12'
        }`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 600, damping: 35 }}
          className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-md"
          style={{ left: checked ? 21 : 3 }}
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
      <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-mist uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] leading-relaxed text-mist-dim">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-[13px] text-white placeholder:text-mist-dim outline-none transition-colors focus:border-accent/60'

// ---------- screen shell ----------

export function Screen({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ type: 'spring', stiffness: 350, damping: 32 }}
      className="absolute inset-0 flex flex-col"
    >
      {children}
    </motion.div>
  )
}
