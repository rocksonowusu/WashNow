import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db } from '../db/db.ts'
import type { Account } from '../db/types.ts'
import { syncService } from '../sync/SyncService.ts'
import { checkPin, removeFromDevice, signInOnline } from './accounts.ts'

/**
 * Who is using the app right now. Being "unlocked" lasts for the browser tab:
 * a refresh keeps you in, closing the app asks for the PIN again.
 */
const ACTIVE_KEY = 'washnow.activeUser'

type AuthValue = {
  /** False for a moment at start-up while the device database is read. */
  ready: boolean
  account: Account | null
  /** Everyone who has signed in on this device. */
  accounts: Account[]
  signIn: (phone: string, pin: string) => Promise<void>
  /** Offline-capable. Resolves false when the PIN is wrong. */
  unlock: (userId: string, pin: string) => Promise<boolean>
  /** Back to the PIN screen so someone else can use the device. */
  lock: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(() => sessionStorage.getItem(ACTIVE_KEY))
  const accounts = useLiveQuery(() => db.accounts.orderBy('user_id').toArray(), [])

  const ready = accounts !== undefined
  const account = useMemo(
    () => accounts?.find((candidate) => candidate.user_id === activeId) ?? null,
    [accounts, activeId],
  )

  const activate = useCallback((userId: string | null) => {
    if (userId) sessionStorage.setItem(ACTIVE_KEY, userId)
    else sessionStorage.removeItem(ACTIVE_KEY)
    setActiveId(userId)
  }, [])

  // Sync runs for whoever is unlocked and holds a working token.
  const syncUserId = account?.token ? account.user_id : null
  useEffect(() => {
    if (!syncUserId) return
    syncService.start(syncUserId)
    return () => syncService.stop()
  }, [syncUserId])

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      account,
      accounts: accounts ?? [],
      signIn: async (phone, pin) => {
        const signedIn = await signInOnline(phone, pin)
        activate(signedIn.user_id)
      },
      unlock: async (userId, pin) => {
        const candidate = await db.accounts.get(userId)
        if (!candidate || !(await checkPin(candidate, pin))) return false
        activate(userId)
        return true
      },
      lock: () => activate(null),
      signOut: async () => {
        if (!account) return
        await removeFromDevice(account)
        activate(null)
      },
    }),
    [ready, account, accounts, activate],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.')
  return value
}
