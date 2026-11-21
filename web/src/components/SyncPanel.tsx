import { LogOut, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { formatDateTime } from '../lib/format.ts'
import { syncService } from '../sync/SyncService.ts'
import { useSync } from '../sync/useSync.ts'
import { ICON } from './icon.ts'
import { ConfirmDialog } from './Modal.tsx'
import { Button, Card } from './ui.tsx'

/**
 * The detail behind the header badge: when the device last synced, what is
 * still waiting, anything the server refused, and the "Sync now" button.
 */
export default function SyncPanel() {
  const { account, signOut } = useAuth()
  const sync = useSync()

  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
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
              setConfirmingSignOut(true)
            }}
          >
            Sign out of this device
          </Button>

          <ConfirmDialog
            open={confirmingSignOut}
            onClose={() => setConfirmingSignOut(false)}
            title="Sign out of this device?"
            tone="danger"
            icon={<LogOut {...ICON} />}
            confirmLabel="Sign out"
            busy={signingOut}
            error={signOutError}
            onConfirm={() => {
              setSignOutError(null)
              setSigningOut(true)
              signOut()
                .catch((caught: unknown) => {
                  setSignOutError(caught instanceof Error ? caught.message : 'Could not sign out.')
                })
                .finally(() => setSigningOut(false))
            }}
          >
            <p>
              Next time, {account.name} signs in with their phone number and PIN, which needs internet. To step away for a while, use Lock instead.
            </p>
            {sync.waiting > 0 && (
              <p className="rounded-control bg-warning px-3 py-2 font-semibold text-text">
                {sync.waiting} record(s) on this device have not reached the server yet. Sync first.
              </p>
            )}
          </ConfirmDialog>
        </div>
      )}
    </Card>
  )
}
