import { db, getMeta } from '../db/db.ts'
import { MIRROR_TABLES, type MirrorTable, type OutboxItem } from '../db/types.ts'
import { api, ApiError } from '../lib/api.ts'

/** The server takes at most this many outbox records per request. */
export const BATCH_SIZE = 50

type ServerRecord = { id: string; deleted_at: string | null } & Record<string, unknown>

type Rejection = {
  /** Position of the refused item in the batch that was sent. */
  index: number
  id: string
  table: string
  op: string
  reason: string
  message: string
  server_record?: ServerRecord | null
}

export type PushReply = { accepted: string[]; rejected: Rejection[] }
export type PullReply = { cursor: string; tables: Partial<Record<MirrorTable, ServerRecord[]>> }

/** Called when the server no longer accepts someone's token. */
export type AuthExpiredHandler = (userId: string) => void

const cursorKey = (userId: string) => `cursor:${userId}`

async function expireToken(userId: string, onAuthExpired?: AuthExpiredHandler): Promise<void> {
  await db.accounts.update(userId, { token: null })
  onAuthExpired?.(userId)
}

/**
 * Send every waiting change to the server, oldest first, 50 at a time. Each
 * person's changes go up with their own token so the server records the right
 * name against them.
 */
export async function pushOutbox(onAuthExpired?: AuthExpiredHandler): Promise<void> {
  for (const account of await db.accounts.toArray()) {
    if (!account.token) continue

    for (;;) {
      const items = await db.outbox.where('user_id').equals(account.user_id).limit(BATCH_SIZE).toArray()
      if (items.length === 0) break

      let reply: PushReply
      try {
        reply = await api<PushReply>('/sync/push', {
          method: 'POST',
          token: account.token,
          body: { items: items.map(({ op, table, record }) => ({ op, table, record })) },
        })
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await expireToken(account.user_id, onAuthExpired)
          break
        }

        const message = error instanceof Error ? error.message : 'Unknown error'
        await db.outbox
          .where('seq')
          .anyOf(items.map((item) => item.seq!))
          .modify((item) => {
            item.attempts += 1
            item.last_error = message
          })
        throw error
      }

      await applyPushReply(items, reply)
    }
  }
}

/**
 * Accepted items simply leave the outbox. A refused item also leaves it (the
 * server will never take it as it is), is listed for the owner to review, and
 * the local copy is replaced by the server's or marked as not accepted.
 */
export async function applyPushReply(items: OutboxItem[], reply: PushReply): Promise<void> {
  const rejectedAt = new Map(reply.rejected.map((rejection) => [rejection.index, rejection]))

  await db.transaction(
    'rw',
    [db.outbox, db.sync_issues, db.customers, db.sales, db.expenses, db.vehicle_categories, db.washers],
    async () => {
      for (const [index, item] of items.entries()) {
        await db.outbox.delete(item.seq!)

        const rejection = rejectedAt.get(index)
        if (!rejection) continue

        const serverRecord = rejection.server_record ?? null

        await db.sync_issues.add({
          table: item.table,
          record_id: item.record_id,
          op: item.op,
          reason: rejection.reason,
          message: rejection.message,
          record: item.record,
          server_record: serverRecord,
          user_id: item.user_id,
          at: new Date().toISOString(),
        })

        const table = db.table(item.table)

        if (rejection.reason === 'duplicate_plate' && serverRecord) {
          await adoptExistingCustomer(item.record_id, serverRecord)
        } else if (rejection.reason === 'duplicate_name' && serverRecord) {
          await adoptExistingCrewMember(item.record_id, serverRecord)
        } else if (serverRecord) {
          if (serverRecord.deleted_at) await table.delete(serverRecord.id)
          else await table.put(serverRecord)
        } else if (item.op === 'upsert') {
          await table.update(item.record_id, { sync_state: 'rejected' })
        }
      }
    },
  )
}

/**
 * Another device saved this car first. Swap our local customer for theirs and
 * point our sales, saved or still waiting, at the surviving customer.
 */
async function adoptExistingCustomer(localId: string, existing: ServerRecord): Promise<void> {
  await db.customers.delete(localId)
  await db.table('customers').put(existing)

  await db.sales.where('customer_id').equals(localId).modify({ customer_id: existing.id })

  await db.outbox
    .filter((item) => item.table === 'sales' && item.record.customer_id === localId)
    .modify((item) => {
      item.record.customer_id = existing.id
    })
}

/**
 * Someone with this name was already on the crew list. Swap our local crew
 * member for the existing one, in sales saved here and in sales still waiting.
 */
async function adoptExistingCrewMember(localId: string, existing: ServerRecord): Promise<void> {
  const swap = (ids: unknown): string[] => [
    ...new Set((Array.isArray(ids) ? (ids as string[]) : []).map((id) => (id === localId ? existing.id : id))),
  ]

  await db.washers.delete(localId)
  await db.table('washers').put(existing)

  await db.sales
    .filter((sale) => sale.washer_ids?.includes(localId) ?? false)
    .modify((sale) => {
      sale.washer_ids = swap(sale.washer_ids)
    })

  await db.outbox
    .filter((item) => item.table === 'sales' && Array.isArray(item.record.washer_ids) && item.record.washer_ids.includes(localId))
    .modify((item) => {
      item.record.washer_ids = swap(item.record.washer_ids)
    })
}

/**
 * Fetch what changed on the server since this person's last pull and store it
 * on the device. Records with a change still waiting in the outbox are left
 * alone, so a local edit is never overwritten before it has been sent.
 */
export async function pullChanges(userId: string, onAuthExpired?: AuthExpiredHandler): Promise<void> {
  const account = await db.accounts.get(userId)
  if (!account?.token) return

  const since = await getMeta<string>(cursorKey(userId))

  let reply: PullReply
  try {
    reply = await api<PullReply>(`/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ''}`, {
      token: account.token,
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await expireToken(userId, onAuthExpired)
      return
    }
    throw error
  }

  await applyPullReply(userId, reply)
}

export async function applyPullReply(userId: string, reply: PullReply): Promise<void> {
  const waiting = new Set((await db.outbox.toArray()).map((item) => item.record_id))

  await db.transaction('rw', [...MIRROR_TABLES.map((name) => db.table(name)), db.meta], async () => {
    for (const name of MIRROR_TABLES) {
      const keep: ServerRecord[] = []
      const remove: string[] = []

      for (const row of reply.tables[name] ?? []) {
        if (waiting.has(row.id)) continue
        if (row.deleted_at) remove.push(row.id)
        else keep.push(row)
      }

      if (keep.length > 0) await db.table(name).bulkPut(keep)
      if (remove.length > 0) await db.table(name).bulkDelete(remove)
    }

    await db.meta.put({ key: cursorKey(userId), value: reply.cursor })
  })
}
