import { useLiveQuery } from 'dexie-react-hooks'
import { LogOut, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { db } from '../db/db.ts'
import { formatDateTime } from '../lib/format.ts'
import { syncService } from '../sync/SyncService.ts'
import { useSync } from '../sync/useSync.ts'
import { ICON } from './icon.ts'
import { Button, Card } from './ui.tsx'

/**
 * The detail behind the header badge: when the device last synced, what is
 * still waiting, anything the server refused, and the "Sync now" button.
 */
export default function SyncPanel() {
  const { account, signOut } = useAuth()
  const sync = useSync()
  const issues = useLiveQuery(() => db.sync_issues.orderBy('seq').reverse().limit(5).toArray(), [])

  const [signOutError, setSignOutError] = useState<string | null>(null)

  let status = 'Everything on this device has been sent to the server.'
  if (!sync.online) {
    status = 'No internet. Keep working: records are saved on this device and sent when the connection returns.'
  } else if (sync.phase === 'syncing') {
    status = 'Syncing now.'
  } else if (sync.phase === 'error') {
    status = sync.lastError ?? 'The last sync failed. Trying again shortly.'
  } else if (sync.waiting > 0) {
    status = 'Some records are waiting to be sent.'
  }

  return (
    <Card title="This device and the server">
      <div className="px-4 py-4">
        <p className={sync.phase === 'error' && sync.online ? 'text-danger' : 'text-text-muted'}>{status}</p>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <dt className="text-sm text-text-muted">Waiting to send</dt>
            <dd className="money font-semibold text-text" data-testid="waiting-count">
              {sync.waiting}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Last synced</dt>
            <dd className="font-semibold text-text">{sync.lastSyncedAt ? formatDateTime(sync.lastSyncedAt) : 'Not yet'}</dd>
          </div>
        </dl>

        <Button
          variant="secondary"
          className="mt-4"
          busy={sync.phase === 'syncing'}
          disabled={!sync.online}
          icon={<RefreshCw {...ICON} />}
          onClick={() => void syncService.syncNow()}
        >
          Sync now
        </Button>
      </div>

      {issues && issues.length > 0 && (
        <div className="border-t border-border px-4 py-4">
          <h3 className="font-heading font-semibold text-danger">
            {sync.issues === 1 ? '1 record needs the owner’s review' : `${sync.issues} records need the owner’s review`}
          </h3>
          <ul className="mt-2 space-y-2">
            {issues.map((issue) => (
              <li key={issue.seq} className="text-sm">
                <p className="text-text">{issue.message}</p>
                <p className="text-text-muted">{formatDateTime(issue.at)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {account && (
        <div className="border-t border-border px-4 py-4">
          <p className="text-text-muted">
            Signed in as <span className="font-semibold text-text">{account.name}</span> ({account.role})
            {account.branch_name && <> at {account.branch_name}</>}.
          </p>
          <Button
            variant="quiet"
            className="mt-2 -ml-4"
            icon={<LogOut {...ICON} />}
            onClick={() => {
              setSignOutError(null)
              signOut().catch((caught: unknown) => {
                setSignOutError(caught instanceof Error ? caught.message : 'Could not sign out.')
              })
            }}
          >
            Sign out of this device
          </Button>
          {signOutError && <p className="mt-1 text-sm text-danger">{signOutError}</p>}
        </div>
      )}
    </Card>
  )
}
