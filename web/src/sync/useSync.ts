import { useLiveQuery } from 'dexie-react-hooks'
import { useSyncExternalStore } from 'react'
import { db } from '../db/db.ts'
import { syncService, type SyncState } from './SyncService.ts'

export type SyncView = SyncState & {
  /** Changes saved on this device that the server has not confirmed yet. */
  waiting: number
  /** Records the server refused; they need the owner's attention. */
  issues: number
}

export function useSync(): SyncView {
  const state = useSyncExternalStore(syncService.subscribe, syncService.getState)
  const waiting = useLiveQuery(() => db.outbox.count(), [], 0)
  const issues = useLiveQuery(() => db.sync_issues.count(), [], 0)

  return { ...state, waiting, issues }
}
