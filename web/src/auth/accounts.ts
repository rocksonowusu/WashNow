import { db, getMeta, setMeta } from '../db/db.ts'
import { MIRROR_TABLES, type Account, type Role } from '../db/types.ts'
import { api } from '../lib/api.ts'
import { hashPin, verifyPin } from '../lib/pin.ts'

type LoginReply = {
  token: string
  user: {
    id: string
    name: string
    phone: string
    role: Role
    branch_id: string
    branch?: { id: string; name: string }
  }
}

function deviceName(): string {
  const agent = navigator.userAgent
  const kind = /Android/i.test(agent) ? 'Android phone' : /iPhone|iPad/i.test(agent) ? 'iPhone or iPad' : 'Computer'
  return `${kind} browser`
}

/**
 * First sign-in on this device, or a fresh one after the server stopped
 * accepting the old token. Needs internet. On success the token and a hash of
 * the PIN are kept so the same person can unlock offline afterwards.
 */
export async function signInOnline(phone: string, pin: string): Promise<Account> {
  const reply = await api<LoginReply>('/auth/login', {
    method: 'POST',
    body: { phone, pin, device_name: deviceName() },
  })

  // One device serves one bay. Signing in to a different bay starts clean.
  const savedBranch = await getMeta<string>('branchId')
  if (savedBranch && savedBranch !== reply.user.branch_id) {
    if ((await db.outbox.count()) > 0) {
      await api('/auth/logout', { method: 'POST', token: reply.token }).catch(() => undefined)
      throw new Error('This device still has records waiting to sync for another bay. Sync them before switching.')
    }

    await db.transaction('rw', db.tables, async () => {
      for (const name of MIRROR_TABLES) await db.table(name).clear()
      await db.sync_issues.clear()
      await db.accounts.clear()
      await db.meta.clear()
    })
  }

  const previous = await db.accounts.get(reply.user.id)
  const { salt, hash } = await hashPin(pin)

  const account: Account = {
    user_id: reply.user.id,
    name: reply.user.name,
    phone: reply.user.phone,
    role: reply.user.role,
    branch_id: reply.user.branch_id,
    branch_name: reply.user.branch?.name ?? '',
    token: reply.token,
    pin_salt: salt,
    pin_hash: hash,
    last_login_at: new Date().toISOString(),
  }

  await db.accounts.put(account)
  await setMeta('branchId', account.branch_id)

  // Retire the token this device held before, if it still works.
  if (previous?.token) {
    void api('/auth/logout', { method: 'POST', token: previous.token }).catch(() => undefined)
  }

  return account
}

/** Check a PIN against the hash saved on this device. Works with no internet. */
export async function checkPin(account: Account, pin: string): Promise<boolean> {
  return verifyPin(pin, account.pin_salt, account.pin_hash)
}

/**
 * Remove someone from this device. Their unsent records could no longer be
 * pushed without their token, so that is refused until they have synced.
 */
export async function removeFromDevice(account: Account): Promise<void> {
  const waiting = await db.outbox.where('user_id').equals(account.user_id).count()
  if (waiting > 0) {
    throw new Error(`${account.name} still has ${waiting} record(s) waiting to sync. Sync first, then sign out.`)
  }

  if (account.token) {
    await api('/auth/logout', { method: 'POST', token: account.token }).catch(() => undefined)
  }

  await db.accounts.delete(account.user_id)
}
