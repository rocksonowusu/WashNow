import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { ICON } from './icon.ts'

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const variants = {
  primary: 'bg-accent text-surface hover:bg-accent-pressed active:bg-accent-pressed',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-alt active:bg-surface-alt',
  quiet: 'text-accent hover:bg-accent-tint active:bg-accent-tint',
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

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string | null
  hint?: string
}

export function Field({ label, error, hint, id, className = '', ...rest }: FieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-text-muted">
        {label}
      </label>
      <input
        id={id}
        {...rest}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-12 w-full rounded-control border bg-surface px-3 text-text placeholder:text-text-muted ${focusRing} ${error ? 'border-danger' : 'border-border'} ${className}`}
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

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-border bg-surface ${className}`}>{children}</section>
}

const tones = {
  warning: 'border-warning text-warning',
  danger: 'border-danger text-danger',
  success: 'border-success text-success',
  muted: 'border-border text-text-muted',
} as const

export function Tag({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-control border px-2 py-0.5 text-sm font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}
