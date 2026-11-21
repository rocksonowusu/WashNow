import { CircleCheck } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { ICON } from './icon.ts'
import { focusRing } from './styles.ts'

type ToastAction = { label: string; onClick: () => void }
type Toast = { id: number; message: string; action?: ToastAction }
type ShowToast = (message: string, action?: ToastAction) => void

const ToastContext = createContext<ShowToast>(() => {})

/**
 * A short "Saved" message at the bottom of the screen, above the phone tab
 * bar, after a modal closes. It goes away by itself.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)

  const show = useCallback<ShowToast>((message, action) => {
    setToast({ id: Date.now(), message, action })
  }, [])

  useEffect(() => {
    if (!toast) return
    // Longer when there is a button to press.
    const timer = window.setTimeout(() => setToast(null), toast.action ? 7000 : 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  return (
    <ToastContext value={show}>
      {children}

      {/* Always in the page, so screen readers announce what is put in it. */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 lg:bottom-6">
        {toast && (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-pill border border-success bg-success py-2 pr-2 pl-4 font-semibold text-surface transition-[translate,opacity] duration-150 motion-reduce:transition-none starting:translate-y-3 starting:opacity-0"
          >
            <CircleCheck {...ICON} className="shrink-0" />
            <span className="min-w-0 flex-1 py-1">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick()
                  setToast(null)
                }}
                className={`min-h-10 shrink-0 rounded-pill bg-surface px-4 text-success hover:bg-success-tint ${focusRing}`}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ShowToast {
  return useContext(ToastContext)
}
