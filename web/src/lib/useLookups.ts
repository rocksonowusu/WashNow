import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db.ts'

export type Lookups = {
  categoryNames: Map<string, string>
  crewNames: Map<string, string>
  userNames: Map<string, string>
  /** Ids of records with a change still waiting to reach the server. */
  waiting: Set<string>
}

/**
 * Names for the ids that sales, expenses and requests carry, kept live from
 * the device database. Undefined for a moment while it first loads.
 */
export function useLookups(): Lookups | undefined {
  return useLiveQuery(async () => {
    const [categories, crew, users, accounts, outbox] = await Promise.all([
      db.vehicle_categories.toArray(),
      db.washers.toArray(),
      db.users.toArray(),
      db.accounts.toArray(),
      db.outbox.toArray(),
    ])

    const userNames = new Map(users.map((user) => [user.id, user.name]))
    // People signed in on this device are known even before the first pull.
    for (const account of accounts) {
      if (!userNames.has(account.user_id)) userNames.set(account.user_id, account.name)
    }

    return {
      categoryNames: new Map(categories.map((category) => [category.id, category.name])),
      crewNames: new Map(crew.map((member) => [member.id, member.name])),
      userNames,
      waiting: new Set(outbox.map((item) => item.record_id)),
    }
  }, [])
}
