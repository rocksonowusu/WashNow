import { Lock, LogOut, Store } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext.tsx'
import CornerArt from './CornerArt.tsx'
import { ICON } from './icon.ts'
import { ConfirmDialog } from './Modal.tsx'
import { ToastProvider } from './Toast.tsx'

const onBlueFocus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface'

/**
 * The frame for the WashNow admin, who manages every washing bay and belongs
 * to none: the same blue side navigation as a bay (header on phones), but no
 * New sale, no sync and none of a bay's screens.
 */
export default function AdminShell() {
  const { account, lock, signOut } = useAuth()
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  async function doSignOut() {
    try {
      await signOut()
    } catch (caught) {
      setSignOutError(caught instanceof Error ? caught.message : 'Could not sign out. Try again.')
    }
  }

  return (
    <ToastProvider>
      <div className="min-h-screen lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden overflow-hidden bg-accent text-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
          <CornerArt kind="rings" corner="top-right" size={260} tone="text-surface/10" />
          <CornerArt kind="lines" corner="bottom-left" size={340} tone="text-surface/10" />

          <div className="relative px-5 py-5">
            <img src="/brand/washnow-logo-white.svg" alt="WashNow" className="h-10 w-auto" />
          </div>

          <nav aria-label="Main" className="relative flex-1 space-y-1 overflow-y-auto px-3 py-2">
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-pill px-4 font-semibold ${onBlueFocus} ${
                  isActive ? 'bg-surface text-accent' : 'text-surface hover:bg-accent-pressed'
                }`
              }
            >
              <Store {...ICON} className="shrink-0" />
              <span className="flex-1">Washing bays</span>
            </NavLink>
          </nav>

          <div className="relative bg-accent-pressed px-5 py-4">
            <p className="truncate font-semibold">{account?.name}</p>
            <p className="truncate text-sm text-surface/85">WashNow admin</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={lock}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-pill border border-surface/60 font-semibold hover:bg-accent ${onBlueFocus}`}
              >
                <Lock {...ICON} />
                Lock
              </button>
              <button
                type="button"
                onClick={() => setConfirmSignOut(true)}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-pill border border-surface/60 font-semibold hover:bg-accent ${onBlueFocus}`}
              >
                <LogOut {...ICON} />
                Sign out
              </button>
            </div>
          </div>
        </aside>

        {/* overflow-clip (not hidden) trims the corner art without stopping the header from sticking. */}
        <div className="relative min-w-0 overflow-clip">
          <CornerArt kind="rings" corner="top-right" size={480} tone="text-accent/5" />
          <CornerArt kind="lines" corner="bottom-left" size={360} tone="text-accent/5" />

          <header className="sticky top-0 z-10 bg-accent lg:border-b lg:border-border lg:bg-surface">
            <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 lg:min-h-16 lg:px-8">
              <img src="/brand/washnow-logo-white.svg" alt="WashNow" className="h-8 w-auto lg:hidden" />
              <p className="hidden text-sm font-semibold text-text-muted lg:block">WashNow admin</p>

              <div className="flex items-center gap-1 lg:hidden">
                <button
                  type="button"
                  onClick={lock}
                  aria-label={`Lock. Signed in as ${account?.name ?? ''}`}
                  className={`inline-flex size-12 items-center justify-center rounded-pill text-surface hover:bg-accent-pressed ${onBlueFocus}`}
                >
                  <Lock {...ICON} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmSignOut(true)}
                  aria-label="Sign out"
                  className={`inline-flex size-12 items-center justify-center rounded-pill text-surface hover:bg-accent-pressed ${onBlueFocus}`}
                >
                  <LogOut {...ICON} />
                </button>
              </div>
            </div>
          </header>

          <main className="relative px-4 pt-5 pb-10 lg:px-8 lg:py-6">
            <Outlet />
          </main>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSignOut}
        onClose={() => {
          setConfirmSignOut(false)
          setSignOutError(null)
        }}
        title="Sign out of WashNow?"
        confirmLabel="Sign out"
        icon={<LogOut {...ICON} />}
        error={signOutError}
        onConfirm={() => void doSignOut()}
      >
        <p>You will need your phone number, PIN and internet to sign in again on this device.</p>
      </ConfirmDialog>
    </ToastProvider>
  )
}
