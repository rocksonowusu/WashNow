import { CircleAlert, CircleCheck, CloudUpload, RefreshCw, WifiOff } from 'lucide-react'
import { useSync } from '../sync/useSync.ts'
import { ICON } from './icon.ts'

/**
 * Always visible in the header: is the device online, and how many records
 * are still waiting to reach the server. A solid chip, so it reads on both
 * the white desktop bar and the blue phone header.
 */
export default function SyncBadge() {
  const { online, phase, waiting } = useSync()

  const waitingText = waiting === 1 ? '1 waiting' : `${waiting} waiting`

  let tone = 'bg-success text-surface'
  let icon = <CircleCheck {...ICON} />
  let label = 'Synced'

  if (!online) {
    tone = 'bg-warning text-text'
    icon = <WifiOff {...ICON} />
    label = waiting > 0 ? `Offline · ${waitingText}` : 'Offline'
  } else if (phase === 'syncing') {
    tone = 'bg-surface-alt text-text'
    icon = <RefreshCw {...ICON} className="animate-spin" />
    label = 'Syncing'
  } else if (phase === 'error') {
    tone = 'bg-danger text-surface'
    icon = <CircleAlert {...ICON} />
    label = waiting > 0 ? `Sync problem · ${waitingText}` : 'Sync problem'
  } else if (waiting > 0) {
    tone = 'bg-warning text-text'
    icon = <CloudUpload {...ICON} />
    label = waitingText
  }

  return (
    <span
      role="status"
      data-testid="sync-badge"
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-control px-2.5 text-sm font-semibold ${tone}`}
    >
      {icon}
      {label}
    </span>
  )
}
