import { CircleAlert, CircleCheck, CloudUpload, RefreshCw, WifiOff } from 'lucide-react'
import { useSync } from '../sync/useSync.ts'
import { ICON } from './icon.ts'

/**
 * Always visible in the header: is the device online, and how many records
 * are still waiting to reach the server.
 */
export default function SyncBadge() {
  const { online, phase, waiting } = useSync()

  const waitingText = waiting === 1 ? '1 waiting' : `${waiting} waiting`

  let tone = 'text-success'
  let icon = <CircleCheck {...ICON} />
  let label = 'Synced'

  if (!online) {
    tone = 'text-warning'
    icon = <WifiOff {...ICON} />
    label = waiting > 0 ? `Offline · ${waitingText}` : 'Offline'
  } else if (phase === 'syncing') {
    tone = 'text-text-muted'
    icon = <RefreshCw {...ICON} className="animate-spin" />
    label = 'Syncing'
  } else if (phase === 'error') {
    tone = 'text-danger'
    icon = <CircleAlert {...ICON} />
    label = waiting > 0 ? `Sync problem · ${waitingText}` : 'Sync problem'
  } else if (waiting > 0) {
    tone = 'text-warning'
    icon = <CloudUpload {...ICON} />
    label = waitingText
  }

  return (
    <span role="status" data-testid="sync-badge" className={`inline-flex items-center gap-1.5 text-sm font-semibold ${tone}`}>
      {icon}
      {label}
    </span>
  )
}
