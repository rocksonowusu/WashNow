import { formatMoney, normalisePlate } from '../lib/format.ts'
import { uuidv7 } from '../lib/uuid.ts'
import { syncService } from '../sync/SyncService.ts'
import { db } from './db.ts'
import type { Account, Customer, Expense, ExpenseCategory, OutboxItem, PaymentMethod, PushTable, Sale } from './types.ts'

/**
 * Every write in the app goes through this file. Each one saves the record on
 * the device and adds it to the outbox in a single transaction, so a change
 * is never shown without also being queued for the server.
 */

/** A rule was broken; `field` says which input to show the message under. */
export class LocalValidationError extends Error {
  readonly field: string

  constructor(field: string, message: string) {
    super(message)
    this.name = 'LocalValidationError'
    this.field = field
  }
}

function outboxItem(account: Account, table: PushTable, record: OutboxItem['record']): OutboxItem {
  return {
    op: 'upsert',
    table,
    record,
    record_id: record.id,
    user_id: account.user_id,
    attempts: 0,
    created_at: new Date().toISOString(),
  }
}

/** Shared fields for a record made on this device just now. */
function fresh(account: Account) {
  const now = new Date().toISOString()
  return { id: uuidv7(), branch_id: account.branch_id, version: 1, created_at: now, updated_at: now, deleted_at: null }
}

export type NewSale = {
  categoryId: string
  /** Whole pesewas. */
  amount: number
  paymentMethod: PaymentMethod
  washerIds: string[]
  plateNumber?: string | null
  serviceNote?: string | null
  /** Owner only: why a price outside the range was allowed. */
  overrideReason?: string | null
}

/**
 * The same checks the server makes, done on the device first so the cashier
 * hears about a problem straight away instead of after the next sync.
 */
export async function createSale(account: Account, input: NewSale): Promise<Sale> {
  const category = await db.vehicle_categories.get(input.categoryId)
  if (!category || !category.active) {
    throw new LocalValidationError('categoryId', 'Choose a vehicle category.')
  }

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new LocalValidationError('amount', 'Enter the amount paid.')
  }

  let overrideReason: string | null = null
  if (input.amount < category.min_price || input.amount > category.max_price) {
    const problem = `${formatMoney(input.amount)} is outside the ${category.name} range (${formatMoney(category.min_price)} to ${formatMoney(category.max_price)}).`

    if (account.role !== 'owner') {
      throw new LocalValidationError('amount', `${problem} Only the owner can approve this price.`)
    }

    overrideReason = input.overrideReason?.trim() || null
    if (!overrideReason) {
      throw new LocalValidationError('overrideReason', `${problem} Give a reason to approve it.`)
    }
  }

  const washerIds = [...new Set(input.washerIds)]
  const washers = (await db.washers.bulkGet(washerIds)).filter((washer) => washer?.active)
  if (washerIds.length === 0 || washers.length !== washerIds.length) {
    throw new LocalValidationError('washerIds', 'Choose at least one washer.')
  }

  const plate = normalisePlate(input.plateNumber)
  const customer = plate ? await db.customers.where('plate_number').equals(plate).first() : undefined

  const sale: Sale = {
    ...fresh(account),
    category_id: category.id,
    customer_id: customer?.id ?? null,
    plate_number: plate,
    service_note: input.serviceNote?.trim() || null,
    amount: input.amount,
    payment_method: input.paymentMethod,
    recorded_by: account.user_id,
    sold_at: new Date().toISOString(),
    status: 'active',
    void_reason: null,
    override_reason: overrideReason,
    washer_ids: washerIds,
  }

  await db.transaction('rw', db.sales, db.outbox, async () => {
    await db.sales.add(sale)
    await db.outbox.add(
      outboxItem(account, 'sales', {
        id: sale.id,
        category_id: sale.category_id,
        customer_id: sale.customer_id,
        plate_number: sale.plate_number,
        service_note: sale.service_note,
        amount: sale.amount,
        payment_method: sale.payment_method,
        washer_ids: washerIds,
        sold_at: sale.sold_at,
        override_reason: sale.override_reason,
        status: sale.status,
        version: sale.version,
      }),
    )
  })

  syncService.requestSoon()
  return sale
}

export type NewExpense = {
  category: ExpenseCategory
  /** Whole pesewas. */
  amount: number
  paymentMethod: PaymentMethod
  note?: string | null
}

export async function createExpense(account: Account, input: NewExpense): Promise<Expense> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new LocalValidationError('amount', 'Enter the amount spent.')
  }

  const expense: Expense = {
    ...fresh(account),
    category: input.category,
    amount: input.amount,
    payment_method: input.paymentMethod,
    note: input.note?.trim() || null,
    spent_at: new Date().toISOString(),
    recorded_by: account.user_id,
  }

  await db.transaction('rw', db.expenses, db.outbox, async () => {
    await db.expenses.add(expense)
    await db.outbox.add(
      outboxItem(account, 'expenses', {
        id: expense.id,
        category: expense.category,
        amount: expense.amount,
        payment_method: expense.payment_method,
        note: expense.note,
        spent_at: expense.spent_at,
        version: expense.version,
      }),
    )
  })

  syncService.requestSoon()
  return expense
}

export type NewCustomer = { plateNumber: string; name?: string | null; phone?: string | null; notes?: string | null }

export async function createCustomer(account: Account, input: NewCustomer): Promise<Customer> {
  const plate = normalisePlate(input.plateNumber)
  if (!plate) {
    throw new LocalValidationError('plateNumber', 'Enter the plate number.')
  }

  if (await db.customers.where('plate_number').equals(plate).first()) {
    throw new LocalValidationError('plateNumber', 'A customer with this plate number is already saved.')
  }

  const customer: Customer = {
    ...fresh(account),
    plate_number: plate,
    name: input.name?.trim() || null,
    phone: input.phone?.trim() || null,
    notes: input.notes?.trim() || null,
    // Shown as zero until the server counts them from sales.
    visit_count: 0,
    total_spent: 0,
  }

  await db.transaction('rw', db.customers, db.outbox, async () => {
    await db.customers.add(customer)
    await db.outbox.add(
      outboxItem(account, 'customers', {
        id: customer.id,
        plate_number: customer.plate_number,
        name: customer.name,
        phone: customer.phone,
        notes: customer.notes,
        version: customer.version,
      }),
    )
  })

  syncService.requestSoon()
  return customer
}
