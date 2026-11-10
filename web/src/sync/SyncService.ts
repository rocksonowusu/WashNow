import { getMeta, setMeta } from '../db/db.ts'
import { NetworkError } from '../lib/api.ts'
import { pullChanges, pushOutbox } from './transport.ts'

export type SyncState = {
  online: boolean
  phase: 'idle' | 'syncing' | 'error'
  lastSyncedAt: string | null
  lastError: string | null
  /** Failed attempts in a row; drives the wait before the next try. */
  failures: number
}

/** While all is well, sync this often. */
export const SYNC_INTERVAL_MS = 30_000
const FIRST_RETRY_MS = 5_000
const MAX_RETRY_MS = 5 * 60_000
/** After a local save, wait this long so a burst of saves goes up together. */
const AFTER_WRITE_MS = 1_500

/**
 * How long to wait before the next attempt. After a failure the wait doubles
 * each time (5 s, 10 s, 20 s ... up to 5 minutes) so a struggling connection
 * is not hammered and the battery is spared.
 */
export function nextDelay(failures: number): number {
  if (failures === 0) return SYNC_INTERVAL_MS
  return Math.min(FIRST_RETRY_MS * 2 ** (failures - 1), MAX_RETRY_MS)
}

function describe(error: unknown): string {
  if (error instanceof NetworkError) return 'Could not reach the server. Will try again.'
  if (error instanceof Error) return error.message
  return 'Sync failed. Will try again.'
}

/**
 * Keeps the device and the server in step: push the outbox, then pull changes.
 * Runs when signed in, when the connection returns, every 30 seconds, shortly
 * after any local save, and when someone presses "Sync now".
 */
export class SyncService {
  private state: SyncState = {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    phase: 'idle',
    lastSyncedAt: null,
    lastError: null,
    failures: 0,
  }

  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private dueAt = 0
  private running: Promise<void> | null = null
  private userId: string | null = null

  /** Set by the auth layer: the server stopped accepting this person's token. */
  onAuthExpired: ((userId: string) => void) | null = null

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = (): SyncState => this.state

  /** Begin syncing for whoever has just unlocked the app. */
  start(userId: string): void {
    this.stop()
    this.userId = userId

    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)

    this.set({ online: navigator.onLine, failures: 0, lastError: null, phase: 'idle' })
    void getMeta<string>('lastSyncedAt').then((value) => {
      if (value && !this.state.lastSyncedAt) this.set({ lastSyncedAt: value })
    })

    this.schedule(0)
  }

  stop(): void {
    this.userId = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)
  }

  /** The "Sync now" button: try immediately, forgetting any back-off. */
  syncNow(): Promise<void> {
    this.set({ failures: 0 })
    return this.run()
  }

  /** Called after a local save. Never pushes an already-sooner attempt later. */
  requestSoon(): void {
    if (!this.userId || this.state.failures > 0) return
    if (this.timer && this.dueAt - Date.now() <= AFTER_WRITE_MS) return
    this.schedule(AFTER_WRITE_MS)
  }

  private handleOnline = (): void => {
    this.set({ online: true, failures: 0 })
    this.schedule(0)
  }

  private handleOffline = (): void => {
    this.set({ online: false, phase: 'idle' })
  }

  private schedule(delay: number): void {
    if (this.timer) clearTimeout(this.timer)
    this.dueAt = Date.now() + delay
    this.timer = setTimeout(() => void this.run(), delay)
  }

  private run(): Promise<void> {
    // One sync at a time; a second request joins the one in progress.
    this.running ??= this.cycle().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async cycle(): Promise<void> {
    const userId = this.userId
    if (!userId) return

    if (!navigator.onLine) {
      this.set({ online: false, phase: 'idle' })
      this.schedule(SYNC_INTERVAL_MS)
      return
    }

    this.set({ online: true, phase: 'syncing' })

    const authExpired = (expiredUserId: string) => this.onAuthExpired?.(expiredUserId)

    try {
      await pushOutbox(authExpired)
      await pullChanges(userId, authExpired)

      const lastSyncedAt = new Date().toISOString()
      await setMeta('lastSyncedAt', lastSyncedAt)

      this.set({ phase: 'idle', failures: 0, lastError: null, lastSyncedAt })
    } catch (error) {
      this.set({ phase: 'error', failures: this.state.failures + 1, lastError: describe(error) })
    }

    // Still signed in as someone? Then book the next attempt.
    if (this.userId) this.schedule(nextDelay(this.state.failures))
  }

  private set(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
}

export const syncService = new SyncService()
