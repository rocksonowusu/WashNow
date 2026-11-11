import Dexie, { type EntityTable, type Table } from 'dexie'
import type {
  Account,
  Branch,
  Customer,
  DayClosing,
  Expense,
  Meta,
  OutboxItem,
  Sale,
  SaleWasher,
  SyncIssue,
  User,
  VehicleCategory,
  Washer,
} from './types.ts'

/**
 * The on-device database (IndexedDB). Every screen reads from here, never
 * straight from the server, which is what lets the app work offline.
 */
export class WashNowDB extends Dexie {
  branches!: EntityTable<Branch, 'id'>
  users!: EntityTable<User, 'id'>
  vehicle_categories!: EntityTable<VehicleCategory, 'id'>
  washers!: EntityTable<Washer, 'id'>
  customers!: EntityTable<Customer, 'id'>
  sales!: EntityTable<Sale, 'id'>
  sale_washers!: EntityTable<SaleWasher, 'id'>
  expenses!: EntityTable<Expense, 'id'>
  day_closings!: EntityTable<DayClosing, 'id'>

  outbox!: Table<OutboxItem, number>
  sync_issues!: Table<SyncIssue, number>
  accounts!: EntityTable<Account, 'user_id'>
  meta!: EntityTable<Meta, 'key'>

  constructor(name = 'washnow') {
    super(name)

    // Only indexed fields are listed; records keep all their other fields too.
    this.version(1).stores({
      branches: 'id',
      users: 'id',
      vehicle_categories: 'id, sort_order',
      washers: 'id, name',
      customers: 'id, plate_number, name',
      sales: 'id, sold_at, customer_id, plate_number',
      sale_washers: 'id, sale_id, washer_id',
      expenses: 'id, spent_at',
      day_closings: 'id, date',

      outbox: '++seq, record_id, user_id',
      sync_issues: '++seq, record_id',
      accounts: 'user_id, phone',
      meta: 'key',
    })

    // Version 2: lets the owner's screens find sales with a void request
    // waiting without reading every sale.
    this.version(2).stores({
      sales: 'id, sold_at, customer_id, plate_number, void_requested_at',
    })
  }
}

export const db = new WashNowDB()

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}
