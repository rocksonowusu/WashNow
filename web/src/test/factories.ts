import { db } from '../db/db.ts'
import type { Account, Customer, VehicleCategory, Washer } from '../db/types.ts'
import { uuidv7 } from '../lib/uuid.ts'

const BRANCH = 'branch-1'
const stamps = { version: 1, created_at: null, updated_at: null, deleted_at: null }

export function account(overrides: Partial<Account> = {}): Account {
  return {
    user_id: uuidv7(),
    name: 'Esi',
    phone: '0244000001',
    role: 'cashier',
    branch_id: BRANCH,
    branch_name: 'Test Bay',
    token: 'token-esi',
    pin_salt: '',
    pin_hash: '',
    last_login_at: new Date().toISOString(),
    ...overrides,
  }
}

/** Sedan, GH₵15 to GH₵100, with washers Kofi and Ama, saved on the device. */
export async function seedBay() {
  const sedan: VehicleCategory = {
    ...stamps,
    id: uuidv7(),
    branch_id: BRANCH,
    name: 'Sedan',
    min_price: 1500,
    max_price: 10000,
    pricing_note: null,
    sort_order: 1,
    active: true,
  }
  const kofi: Washer = { ...stamps, id: uuidv7(), branch_id: BRANCH, name: 'Kofi', phone: null, commission_percent: '30.00', active: true }
  const ama: Washer = { ...stamps, id: uuidv7(), branch_id: BRANCH, name: 'Ama', phone: null, commission_percent: '40.00', active: true }

  await db.vehicle_categories.add(sedan)
  await db.washers.bulkAdd([kofi, ama])

  return { sedan, kofi, ama }
}

export function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    ...stamps,
    id: uuidv7(),
    branch_id: BRANCH,
    plate_number: 'GR123421',
    name: 'Mr Mensah',
    phone: null,
    visit_count: 0,
    total_spent: 0,
    notes: null,
    ...overrides,
  }
}
