import { X } from 'lucide-react'
import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import CornerArt from './CornerArt.tsx'
import { ICON } from './icon.ts'
import { hitArea } from './styles.ts'
import { Button } from './ui.tsx'

/** Drawer widths. `lg` is wide enough for two columns, so New sale fits without scrolling. */
const widths = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-[46rem]',
} as const

// Glides in fast and settles softly.
const ease = 'ease-[cubic-bezier(0.22,1,0.36,1)]'

const shapes = {
  // Slides in from the right, full height and square against the right edge,
  // with a light backdrop so the screen behind stays readable. Full screen on phones.
  drawer: `m-0 ml-auto h-dvh max-h-none w-full max-w-none rounded-none backdrop:bg-text/35 transition-[translate] duration-[480ms] ${ease} starting:open:translate-x-full`,
  // Small and centred, for "are you sure?".
  dialog: `m-auto max-h-[88dvh] w-[calc(100%-2rem)] max-w-md rounded-panel backdrop:bg-text/45 transition-[scale,opacity] duration-200 ${ease} starting:open:scale-95 starting:open:opacity-0`,
} as const

const onBlueFocus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface'

// The page behind stops scrolling while any modal is open.
let openModals = 0

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  /** One short line under the title. */
  description?: string
  size?: keyof typeof widths
  /** `drawer` (forms) slides in from the right; `dialog` (confirmations) opens in the middle. */
  variant?: keyof typeof shapes
  /**
   * Given: the body and footer become one form, so a submit button in the
   * footer saves and Enter in a field submits.
   */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  /** Stays in view however far the body is scrolled. Put Save here. */
  footer?: ReactNode
  children: ReactNode
}

/**
 * A panel over the current screen, built on the browser's own <dialog>, so
 * focus stays inside it, Esc closes it and the page behind cannot be used
 * until it is closed.
 *
 * Forms open as a drawer from the right (full screen on phones); the body
 * scrolls while the header and footer stay put, and the form's parts rise
 * in one after another. Confirmations open as a small dialog in the middle.
 *
 * Put `data-autofocus` on the field that should have the cursor when it opens.
 */
export default function Modal({ open, onClose, title, description, size = 'md', variant = 'drawer', onSubmit, footer, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const openRef = useRef(open)
  const pressedOnBackdrop = useRef(false)
  const titleId = useId()

  useEffect(() => {
    openRef.current = open
    const dialog = ref.current
    if (!open || !dialog) return

    if (!dialog.open) dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()

    openModals += 1
    document.documentElement.style.overflow = 'hidden'

    return () => {
      if (dialog.open) dialog.close()
      openModals -= 1
      if (openModals === 0) document.documentElement.style.overflow = ''
    }
  }, [open])

  // Nothing in the page while closed, so a list with a modal per row stays light.
  if (!open) return null

  const content = (
    <>
      <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 ${variant === 'drawer' ? 'drawer-body' : ''}`}>{children}</div>
      {footer && (
        <div
          className={`shrink-0 border-t border-border bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 ${variant === 'drawer' ? 'drawer-foot' : ''}`}
        >
          {footer}
        </div>
      )}
    </>
  )

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Esc, or the browser closing it for any other reason: keep React in step.
      // The event arrives a moment after the close, so skip it if the dialog
      // has been shown again since (React re-runs effects on mount in dev).
      onClose={(event) => {
        if (openRef.current && !event.currentTarget.open) onClose()
      }}
      // A tap on the dimmed area closes it. Only when the press also started
      // there, so dragging out of a field while selecting text does not.
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (pressedOnBackdrop.current && event.target === event.currentTarget) onClose()
      }}
      className={`flex-col overflow-hidden border-0 bg-surface p-0 text-text shadow-sheet open:flex backdrop:transition-opacity backdrop:duration-300 starting:open:backdrop:opacity-0 motion-reduce:transition-none ${shapes[variant]} ${variant === 'drawer' ? widths[size] : ''}`}
    >
      <header className="relative flex min-h-14 shrink-0 items-center justify-between gap-3 overflow-hidden bg-accent py-2 pr-3 pl-4 text-surface sm:pl-5">
        <CornerArt kind="rings" corner="top-right" size={180} tone="text-surface/15" />
        <div className="relative min-w-0">
          <h2 id={titleId} className="text-lg leading-tight">
            {title}
          </h2>
          {description && <p className="text-sm text-surface/85">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={`inline-flex size-10 shrink-0 items-center justify-center rounded-pill hover:bg-accent-pressed ${hitArea} ${onBlueFocus}`}
        >
          <X {...ICON} />
        </button>
      </header>

      {onSubmit ? (
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            // The modal is portalled; do not let the submit reach a form
            // further up the React tree.
            event.stopPropagation()
            onSubmit(event)
          }}
        >
          {content}
        </form>
      ) : (
        content
      )}
    </dialog>,
    document.body,
  )
}

/** Footer buttons laid out the same everywhere: side by side (Save on the right), sharing the width on phones. */
export function ModalActions({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      {note && <div className="text-sm sm:mr-auto">{note}</div>}
      <div className="flex gap-2 *:flex-1 sm:*:flex-none">{children}</div>
    </div>
  )
}

type ConfirmProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** `danger` for anything that removes, voids or turns someone off. */
  tone?: 'primary' | 'danger'
  icon?: ReactNode
  busy?: boolean
  error?: string | null
  onConfirm: () => void
}

/** "Are you sure?" for actions that are hard to take back. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  icon,
  busy = false,
  error,
  onConfirm,
}: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      variant="dialog"
      footer={
        <ModalActions note={error && <p className="font-semibold text-danger">{error}</p>}>
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} busy={busy} icon={icon} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-3 text-text">{children}</div>
    </Modal>
  )
}
