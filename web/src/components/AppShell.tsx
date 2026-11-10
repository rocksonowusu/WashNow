import { CirclePlus, ClipboardList, LayoutDashboard, Lock, RefreshCw, type LucideIcon } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthContext.tsx'
import SyncBadge from './SyncBadge.tsx'
import { ICON } from './icon.ts'
import { Button } from './ui.tsx'

type Destination = { to: string; label: string; icon: LucideIcon }

/** Every screen in the app. Later stages add to this list. */
const DESTINATIONS: Destination[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/new-sale', label: 'New sale', icon: CirclePlus },
  { to: '/today', label: 'Today', icon: ClipboardList },
  { to: '/sync', label: 'Sync', icon: RefreshCw },
]

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/**
 * The frame around every signed-in screen.
 *
 * Laptop and wider: a fixed side navigation on the left and the page using
 * the full remaining width. Phone: a slim header and a tab bar along the
 * bottom, where a thumb can reach it.
 */
export default function AppShell() {
  const { account, lock } = useAuth()
  const { pathname } = useLocation()

  const current = DESTINATIONS.find((destination) => destination.to === pathname) ?? DESTINATIONS[0]

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="px-5 py-4">
          <img src="/brand/washnow-logo.svg" alt="WashNow" className="h-9 w-auto" />
        </div>

        <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {DESTINATIONS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `flex min-h-12 items-center gap-3 rounded-control px-3 font-semibold ${focusRing} ${
                  isActive ? 'bg-accent-tint text-accent' : 'text-text hover:bg-surface-alt'
                }`
              }
            >
              <Icon {...ICON} className="shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border px-5 py-4">
          <p className="truncate font-semibold text-text">{account?.name}</p>
          <p className="truncate text-sm text-text-muted">
            <span className="capitalize">{account?.role}</span>
            {account?.branch_name && <> · {account.branch_name}</>}
          </p>
          <Button variant="secondary" className="mt-3 w-full" onClick={lock} icon={<Lock {...ICON} />}>
            Lock
          </Button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-10 border-b border-border bg-surface">
          <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 lg:min-h-16 lg:px-8">
            <img src="/brand/washnow-logo.svg" alt="WashNow" className="h-8 w-auto lg:hidden" />
            <h1 className="hidden text-xl text-text lg:block">{current.label}</h1>

            <div className="flex items-center gap-3">
              <SyncBadge />
              <Button
                variant="secondary"
                className="lg:hidden"
                onClick={lock}
                icon={<Lock {...ICON} />}
                aria-label={`Lock. Signed in as ${account?.name ?? ''}`}
              />
            </div>
          </div>
        </header>

        {/* Bottom padding on phones keeps the last control clear of the tab bar. */}
        <main className="px-4 pt-5 pb-24 lg:px-8 lg:py-6">
          <h1 className="mb-4 text-xl text-text lg:hidden">{current.label}</h1>
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 grid border-t border-border bg-surface lg:hidden"
        style={{ gridTemplateColumns: `repeat(${DESTINATIONS.length}, minmax(0, 1fr))` }}
      >
        {DESTINATIONS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-0.5 text-sm font-semibold ${focusRing} ${
                isActive ? 'text-accent' : 'text-text-muted'
              }`
            }
          >
            <Icon {...ICON} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
