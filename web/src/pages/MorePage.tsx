import { ChevronRight, Lock } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext.tsx'
import { UNDER_MORE } from '../components/destinations.ts'
import { ICON } from '../components/icon.ts'
import { focusRing } from '../components/styles.ts'
import { Button, Card } from '../components/ui.tsx'

/**
 * Phones only: the screens that do not have their own tab at the bottom.
 * On a laptop everything is in the side navigation instead.
 */
export default function MorePage() {
  const { account, lock } = useAuth()

  return (
    <div className="space-y-5">
      <Card>
        <ul>
          {UNDER_MORE.map(({ to, label, about, icon: Icon }) => (
            <li key={to} className="border-b border-border last:border-b-0">
              <Link to={to} className={`flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-alt ${focusRing}`}>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-accent-tint text-accent">
                  <Icon size={22} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-text">{label}</span>
                  {about && <span className="block text-sm text-text-muted">{about}</span>}
                </span>
                <ChevronRight {...ICON} className="shrink-0 text-text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="px-4 py-4">
          <p className="text-text-muted">
            Signed in as <span className="font-semibold text-text">{account?.name}</span> ({account?.role})
            {account?.branch_name && <> at {account.branch_name}</>}.
          </p>
          <Button variant="secondary" className="mt-3 w-full" icon={<Lock {...ICON} />} onClick={lock}>
            Lock
          </Button>
        </div>
      </Card>
    </div>
  )
}
