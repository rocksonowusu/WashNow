import { LoaderCircle, type LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import CornerArt from './CornerArt.tsx'
import { ICON } from './icon.ts'
import { focusRing, inputClass } from './styles.ts'

const variants = {
  primary: 'bg-accent text-surface hover:bg-accent-pressed active:bg-accent-pressed',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-alt active:bg-surface-alt',
  quiet: 'text-accent hover:bg-accent-tint active:bg-accent-tint',
  danger: 'border border-danger bg-surface text-danger hover:bg-danger hover:text-surface active:bg-danger active:text-surface',
} as const

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants
  /** Shows a spinner and stops double presses while work is in progress. */
  busy?: boolean
  icon?: ReactNode
}

export function Button({ variant = 'primary', busy = false, icon, className = '', children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-4 font-semibold ${focusRing} disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-alt disabled:text-text-muted ${variants[variant]} ${className}`}
    >
      {busy ? <LoaderCircle {...ICON} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}

/**
 * A button that is one of several choices (a vehicle, a crew member, Cash or
 * MoMo). The chosen one is filled solid blue so it is obvious at a glance.
 */
export function Choice({
  chosen,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { chosen: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      {...rest}
      className={`min-h-12 rounded-control border px-3 py-2 text-left font-semibold ${focusRing} ${
        chosen
          ? 'border-accent bg-accent text-surface'
          : 'border-border bg-surface text-text hover:border-accent hover:bg-accent-tint'
      } ${className}`}
    >
      {children}
    </button>
  )
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string | null
  hint?: string
}

export function Field({ label, error, hint, id, className = '', ...rest }: FieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-text">
        {label}
      </label>
      <input
        id={id}
        {...rest}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${inputClass} ${error ? 'border-danger' : 'border-border'} ${className}`}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A panel. Give it a title and it gets a tinted heading bar, which is what
 * separates one block of the screen from the next.
 */
export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`overflow-hidden rounded-card border border-border bg-surface ${className}`}>
      {title && (
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border bg-surface-alt px-4 py-2">
          <h2 className="text-base text-text">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** Colour of a tile's icon block. Blue unless the figure has its own meaning. */
const tileColours = {
  accent: 'bg-accent-tint text-accent',
  aqua: 'bg-aqua-tint text-aqua',
  sun: 'bg-sun text-text',
  success: 'bg-success-tint text-success',
  danger: 'bg-danger-tint text-danger',
} as const

/**
 * One headline number. `strong` fills the tile solid blue; use it for the one
 * figure on the screen that matters most.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  note,
  strong = false,
  colour = 'accent',
  valueTone = 'text-text',
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  note?: string
  strong?: boolean
  colour?: keyof typeof tileColours
  valueTone?: string
}) {
  return (
    <div
      className={`relative flex items-center gap-3 overflow-hidden rounded-card border px-4 py-4 ${
        strong ? 'border-accent bg-accent text-surface' : 'border-border bg-surface'
      }`}
    >
      {strong && <CornerArt kind="rings" corner="top-right" size={170} tone="text-surface/15" />}
      <span
        className={`relative flex size-11 shrink-0 items-center justify-center rounded-control ${
          strong ? 'bg-sun text-text' : tileColours[colour]
        }`}
      >
        <Icon size={22} strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="relative min-w-0">
        <p className={`text-sm font-semibold ${strong ? 'text-surface/85' : 'text-text-muted'}`}>{label}</p>
        <p className={`money font-heading text-2xl leading-tight font-bold ${strong ? 'text-surface' : valueTone}`}>{value}</p>
        {note && <p className={`text-sm ${strong ? 'text-surface/85' : 'text-text-muted'}`}>{note}</p>}
      </div>
    </div>
  )
}

const tones = {
  // Dark text: white on this amber is too faint to read in sunlight.
  warning: 'bg-warning text-text',
  danger: 'bg-danger text-surface',
  success: 'bg-success text-surface',
  muted: 'bg-surface-alt text-text-muted',
} as const

export function Tag({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-sm font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}
