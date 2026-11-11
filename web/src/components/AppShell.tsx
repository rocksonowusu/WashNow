import { Ellipsis, Lock } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthContext.tsx'
import { usePendingVoidRequests } from '../lib/usePendingVoidRequests.ts'
import CornerArt from './CornerArt.tsx'
import SyncBadge from './SyncBadge.tsx'
import { DESTINATIONS, MORE, PHONE_TABS } from './destinations.ts'
import { ICON } from './icon.ts'

const onBlueFocus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface'

/**
 * The frame around every signed-in screen.
 *
 * Laptop and wider: a solid blue side navigation on the left and the page
 * using the full remaining width. Phone: a blue header and a tab bar along
 * the bottom, where a thumb can reach it.
 */
export default function AppShell() {
  const { account, lock } = useAuth()
  const { pathname } = useLocation()

  const current = [...DESTINATIONS, MORE].find((destination) => destination.to === pathname) ?? DESTINATIONS[0]

  // On phones, screens without their own tab live under "More".
  const underMore = pathname === MORE.to || !PHONE_TABS.some((tab) => tab.to === pathname)

  // The owner sees a count on Today when cashiers are waiting for an answer.
  const pendingRequests = usePendingVoidRequests()
  const toAnswer = account?.role === 'owner' ? (pendingRequests?.length ?? 0) : 0

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden overflow-hidden bg-accent text-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <CornerArt kind="rings" corner="top-right" size={260} tone="text-surface/10" />
        <CornerArt kind="lines" corner="bottom-left" size={340} tone="text-surface/10" />

        <div className="relative px-5 py-5">
          <img src="/brand/washnow-logo-white.svg" alt="WashNow" className="h-10 w-auto" />        </div>

        <nav aria-label="Main" className="relative flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {DESTINATIONS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `flex min-h-12 items-center gap-3 rounded-control px-3 font-semibold ${onBlueFocus} ${
                  isActive ? 'bg-surface text-accent' : 'text-surface hover:bg-accent-pressed'
                }`
              }
            >
              <Icon {...ICON} className="shrink-0" />
              <span className="flex-1">{label}</span>
              {to === '/today' && toAnswer > 0 && (
                <span className="money rounded-control bg-danger px-2 text-sm text-surface" aria-label={`${toAnswer} void requests to answer`}>
                  {toAnswer}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="relative bg-accent-pressed px-5 py-4">
          <p className="truncate font-semibold">{account?.name}</p>
          <p className="truncate text-sm text-surface/85">
            <span className="capitalize">{account?.role}</span>
            {account?.branch_name && <> · {account.branch_name}</>}
          </p>
          <button
            type="button"
            onClick={lock}
            className={`mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control border border-surface/60 font-semibold hover:bg-accent ${onBlueFocus}`}
          >
            <Lock {...ICON} />
            Lock
          </button>
        </div>
      </aside>

      {/* overflow-clip (not hidden) trims the corner art without stopping the header from sticking. */}
      <div className="relative min-w-0 overflow-clip">
        <CornerArt kind="rings" corner="top-right" size={480} tone="text-accent/5" />
        <CornerArt kind="lines" corner="bottom-left" size={360} tone="text-accent/5" />

        <header className="sticky top-0 z-10 bg-accent lg:border-b lg:border-border lg:bg-surface">
          <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 lg:min-h-16 lg:px-8">
            <img src="/brand/washnow-logo-white.svg" alt="WashNow" className="h-8 w-auto lg:hidden" />
            <h1 className="hidden text-2xl text-text lg:block">{current.label}</h1>

            <div className="flex items-center gap-2">
              <SyncBadge />
              <button
                type="button"
                onClick={lock}
                aria-label={`Lock. Signed in as ${account?.name ?? ''}`}
                className={`inline-flex size-12 items-center justify-center rounded-control text-surface hover:bg-accent-pressed lg:hidden ${onBlueFocus}`}
              >
                <Lock {...ICON} />
              </button>
            </div>
          </div>
        </header>

        {/* Bottom padding on phones keeps the last control clear of the tab bar. */}
        <main className="relative px-4 pt-5 pb-24 lg:px-8 lg:py-6">
          <h1 className="mb-4 text-2xl text-text lg:hidden">{current.label}</h1>
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 grid border-t border-border bg-surface lg:hidden"
        style={{ gridTemplateColumns: `repeat(${PHONE_TABS.length + 1}, minmax(0, 1fr))` }}
      >
        {[...PHONE_TABS, { ...MORE, icon: Ellipsis }].map(({ to, label, tabLabel, icon: Icon }) => {
          const isMore = to === MORE.to
          return (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                  (isMore ? underMore : isActive) ? 'text-accent' : 'text-text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`relative flex h-8 w-14 items-center justify-center rounded-control ${
                      (isMore ? underMore : isActive) ? 'bg-accent text-surface' : ''
                    }`}
                  >
                    <Icon {...ICON} />
                    {to === '/today' && toAnswer > 0 && (
                      <span className="money absolute -top-1 right-0 rounded-control bg-danger px-1.5 text-xs text-surface" aria-label={`${toAnswer} void requests to answer`}>
                        {toAnswer}
                      </span>
                    )}
                  </span>
                  {tabLabel ?? label}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
