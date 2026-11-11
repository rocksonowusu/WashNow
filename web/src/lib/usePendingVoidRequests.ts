import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db.ts'
import type { Sale } from '../db/types.ts'

/** Sales a cashier has asked to void and the owner has not answered, oldest first. */
export function usePendingVoidRequests(): Sale[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.sales.where('void_requested_at').above('').sortBy('void_requested_at')).filter((sale) => sale.status === 'active'),
    [],
  )
}
