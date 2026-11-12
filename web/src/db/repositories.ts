import { formatMoney, normalisePlate } from '../lib/format.ts'
import { uuidv7 } from '../lib/uuid.ts'
import { syncService } from '../sync/SyncService.ts'
import { db } from './db.ts'
import type {
  Account,
  Customer,
  Expense,
  ExpenseCategory,
  OutboxItem,
  PaymentMethod,
  PushTable,
  Sale,
  VehicleCategory,
  Washer,
} from './types.ts'

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

function outboxItem(
  account: Account,
  table: PushTable,
  record: OutboxItem['record'],
  op: OutboxItem['op'] = 'upsert',
): OutboxItem {
  return {
    op,
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

// ---------------------------------------------------------------------------
// Crew: the people who wash the vehicles (the `washers` table).
// ---------------------------------------------------------------------------

/** "  yaw   mensah " and "Yaw Mensah" are the same person. */
function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

async function findCrewByName(name: string, exceptId?: string): Promise<Washer | undefined> {
  const wanted = cleanName(name).toLowerCase()
  return (await db.washers.toArray()).find((washer) => washer.id !== exceptId && washer.name.toLowerCase() === wanted)
}

function checkPercent(percent: number): void {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new LocalValidationError('commissionPercent', 'Commission must be between 0 and 100.')
  }
}

export type NewCrewMember = {
  name: string
  /** Owner only. Left out, the bay's standard commission is used. */
  commissionPercent?: number | null
}

/**
 * Anyone can add a crew member, so a new person can be added while a sale is
 * being recorded. Their pay is the owner's decision: a cashier's addition
 * always starts on the bay's standard commission.
 */
export async function createCrewMember(account: Account, input: NewCrewMember): Promise<Washer> {
  const name = cleanName(input.name)
  if (name === '') {
    throw new LocalValidationError('name', 'Enter the person’s name.')
  }

  const existing = await findCrewByName(name)
  if (existing) {
    throw new LocalValidationError('name', `${existing.name} is already on the crew list.`)
  }

  const branch = await db.branches.get(account.branch_id)
  const standard = branch?.default_commission_percent != null ? Number(branch.default_commission_percent) : null
  const percent = account.role === 'owner' ? (input.commissionPercent ?? standard) : standard

  if (percent === null) {
    throw new LocalValidationError(
      'commissionPercent',
      account.role === 'owner'
        ? 'Set the standard commission on the Crew screen first, or add this person there with their own rate.'
        : 'The owner needs to set the standard commission before new crew can be added.',
    )
  }
  checkPercent(percent)

  const washer: Washer = {
    ...fresh(account),
    name,
    phone: null,
    commission_percent: percent.toFixed(2),
    active: true,
  }

  await db.transaction('rw', db.washers, db.outbox, async () => {
    await db.washers.add(washer)
    await db.outbox.add(
      outboxItem(account, 'washers', {
        id: washer.id,
        name: washer.name,
        commission_percent: washer.commission_percent,
        active: true,
        version: washer.version,
      }),
    )
  })

  syncService.requestSoon()
  return washer
}

export type CrewChanges = { name?: string; commissionPercent?: number }

/** Owner only: rename someone or change what they are paid from now on. */
export async function updateCrewMember(account: Account, id: string, changes: CrewChanges): Promise<Washer> {
  if (account.role !== 'owner') {
    throw new LocalValidationError('form', 'Only the owner can change a crew member.')
  }

  const washer = await db.washers.get(id)
  if (!washer) {
    throw new LocalValidationError('form', 'This crew member is no longer on the list.')
  }

  const patch: Partial<Pick<Washer, 'name' | 'commission_percent'>> = {}

  if (changes.name !== undefined) {
    const name = cleanName(changes.name)
    if (name === '') throw new LocalValidationError('name', 'Enter the person’s name.')

    const clash = await findCrewByName(name, id)
    if (clash) throw new LocalValidationError('name', `${clash.name} is already on the crew list.`)

    patch.name = name
  }

  if (changes.commissionPercent !== undefined) {
    checkPercent(changes.commissionPercent)
    patch.commission_percent = changes.commissionPercent.toFixed(2)
  }

  const updated: Washer = { ...washer, ...patch, version: washer.version + 1, updated_at: new Date().toISOString() }

  await db.transaction('rw', db.washers, db.outbox, async () => {
    await db.washers.put(updated)
    await db.outbox.add(outboxItem(account, 'washers', { id, ...patch, version: updated.version }))
  })

  syncService.requestSoon()
  return updated
}

/** Owner only. Past sales keep the person's name and pay; they just leave the list. */
export async function removeCrewMember(account: Account, id: string): Promise<void> {
  if (account.role !== 'owner') {
    throw new LocalValidationError('form', 'Only the owner can remove a crew member.')
  }

  await db.transaction('rw', db.washers, db.outbox, async () => {
    await db.washers.delete(id)
    await db.outbox.add(outboxItem(account, 'washers', { id }, 'delete'))
  })

  syncService.requestSoon()
}

// ---------------------------------------------------------------------------
// Voids. A cashier can only ask; the owner voids (approves) or declines.
// ---------------------------------------------------------------------------

function cleanReason(reason: string): string {
  const clean = reason.trim()
  if (clean.length < 3) {
    throw new LocalValidationError('reason', 'Say why, in a few words.')
  }
  return clean
}

async function activeSale(saleId: string): Promise<Sale> {
  const sale = await db.sales.get(saleId)
  if (!sale) throw new LocalValidationError('form', 'This sale is no longer on this device.')
  if (sale.status === 'voided') throw new LocalValidationError('form', 'This sale has already been voided.')
  return sale
}

async function saveSaleChange(account: Account, sale: Sale, record: OutboxItem['record']): Promise<void> {
  await db.transaction('rw', db.sales, db.outbox, async () => {
    await db.sales.put(sale)
    await db.outbox.add(outboxItem(account, 'sales', record))
  })

  syncService.requestSoon()
}

/** Ask the owner to void a sale. Nothing about its money changes yet. */
export async function requestVoid(account: Account, saleId: string, reason: string): Promise<Sale> {
  const cleanedReason = cleanReason(reason)
  const sale = await activeSale(saleId)

  // Someone already asked: keep the first request.
  if (sale.void_requested_at) return sale

  const now = new Date().toISOString()
  const updated: Sale = {
    ...sale,
    void_requested_by: account.user_id,
    void_request_reason: cleanedReason,
    void_requested_at: now,
    version: sale.version + 1,
    updated_at: now,
  }

  await saveSaleChange(account, updated, { id: sale.id, void_request_reason: cleanedReason, version: updated.version })
  return updated
}

/** Owner only: void a sale, whether or not a cashier asked. */
export async function voidSale(account: Account, saleId: string, reason: string): Promise<Sale> {
  if (account.role !== 'owner') {
    throw new LocalValidationError('form', 'Only the owner can void a sale.')
  }

  const cleanedReason = cleanReason(reason)
  const sale = await activeSale(saleId)

  const updated: Sale = {
    ...sale,
    status: 'voided',
    void_reason: cleanedReason,
    version: sale.version + 1,
    updated_at: new Date().toISOString(),
  }

  await saveSaleChange(account, updated, {
    id: sale.id,
    status: 'voided',
    void_reason: cleanedReason,
    version: updated.version,
  })
  return updated
}

/** Owner only: say no to a void request. The sale stays as it is. */
export async function declineVoidRequest(account: Account, saleId: string): Promise<Sale> {
  if (account.role !== 'owner') {
    throw new LocalValidationError('form', 'Only the owner can answer a void request.')
  }

  const sale = await activeSale(saleId)
  if (!sale.void_requested_at) return sale

  const updated: Sale = {
    ...sale,
    void_requested_by: null,
    void_request_reason: null,
    void_requested_at: null,
    version: sale.version + 1,
    updated_at: new Date().toISOString(),
  }

  await saveSaleChange(account, updated, { id: sale.id, void_request_declined: true, version: updated.version })
  return updated
}

// ---------------------------------------------------------------------------
// Vehicle types and their price ranges. Owner only; the server wins if the
// owner's device was out of date.
// ---------------------------------------------------------------------------

export type VehicleTypeInput = {
  name: string
  /** Whole pesewas. */
  minPrice: number
  maxPrice: number
  pricingNote?: string | null
}

function ownerOnly(account: Account, what: string): void {
  if (account.role !== 'owner') {
    throw new LocalValidationError('form', `Only the owner can ${what}.`)
  }
}

async function checkVehicleType(input: VehicleTypeInput, exceptId?: string): Promise<string> {
  const name = cleanName(input.name)
  if (name === '') throw new LocalValidationError('name', 'Enter a name, for example Sedan.')

  const clash = (await db.vehicle_categories.toArray()).find(
    (category) => category.id !== exceptId && category.name.toLowerCase() === name.toLowerCase(),
  )
  if (clash) throw new LocalValidationError('name', `${clash.name} is already on the list.`)

  if (!Number.isInteger(input.minPrice) || input.minPrice < 0) {
    throw new LocalValidationError('minPrice', 'Enter the lowest price.')
  }
  if (!Number.isInteger(input.maxPrice) || input.maxPrice < input.minPrice) {
    throw new LocalValidationError('maxPrice', 'The highest price cannot be lower than the lowest price.')
  }

  return name
}

export async function createVehicleType(account: Account, input: VehicleTypeInput): Promise<VehicleCategory> {
  ownerOnly(account, 'add a vehicle type')
  const name = await checkVehicleType(input)

  const last = (await db.vehicle_categories.toArray()).reduce((highest, category) => Math.max(highest, category.sort_order), 0)

  const category: VehicleCategory = {
    ...fresh(account),
    name,
    min_price: input.minPrice,
    max_price: input.maxPrice,
    pricing_note: input.pricingNote?.trim() || null,
    sort_order: last + 1,
    active: true,
  }

  await db.transaction('rw', db.vehicle_categories, db.outbox, async () => {
    await db.vehicle_categories.add(category)
    await db.outbox.add(
      outboxItem(account, 'vehicle_categories', {
        id: category.id,
        name: category.name,
        min_price: category.min_price,
        max_price: category.max_price,
        pricing_note: category.pricing_note,
        sort_order: category.sort_order,
        active: true,
        version: category.version,
      }),
    )
  })

  syncService.requestSoon()
  return category
}

export async function updateVehicleType(account: Account, id: string, input: VehicleTypeInput): Promise<VehicleCategory> {
  ownerOnly(account, 'change a vehicle type')

  const category = await db.vehicle_categories.get(id)
  if (!category) throw new LocalValidationError('form', 'This vehicle type is no longer on the list.')

  const name = await checkVehicleType(input, id)

  const updated: VehicleCategory = {
    ...category,
    name,
    min_price: input.minPrice,
    max_price: input.maxPrice,
    pricing_note: input.pricingNote?.trim() || null,
    version: category.version + 1,
    updated_at: new Date().toISOString(),
  }

  await db.transaction('rw', db.vehicle_categories, db.outbox, async () => {
    await db.vehicle_categories.put(updated)
    await db.outbox.add(
      outboxItem(account, 'vehicle_categories', {
        id,
        name: updated.name,
        min_price: updated.min_price,
        max_price: updated.max_price,
        pricing_note: updated.pricing_note,
        version: updated.version,
      }),
    )
  })

  syncService.requestSoon()
  return updated
}

/** Past sales keep the vehicle type's name; it just leaves the list. */
export async function removeVehicleType(account: Account, id: string): Promise<void> {
  ownerOnly(account, 'remove a vehicle type')

  await db.transaction('rw', db.vehicle_categories, db.outbox, async () => {
    await db.vehicle_categories.delete(id)
    await db.outbox.add(outboxItem(account, 'vehicle_categories', { id }, 'delete'))
  })

  syncService.requestSoon()
}
