// Shapes of the records kept on the device. They mirror the server tables;
// all money is whole pesewas and all times are ISO strings.

export type Role = 'owner' | 'cashier'
export type PaymentMethod = 'cash' | 'momo'
export type SaleStatus = 'active' | 'voided'
export type ExpenseCategory = 'soap' | 'water' | 'fuel' | 'electricity' | 'other'

type Synced = {
  id: string
  version: number
  created_at: string | null
  updated_at: string | null
  deleted_at: string | null
}

type InBranch = Synced & { branch_id: string }

export type Branch = Synced & {
  name: string
  location: string | null
  phone: string | null
  /** The rate new crew start on, e.g. "30.00". Null until the owner sets it. */
  default_commission_percent: string | null
}

export type User = InBranch & { name: string; phone: string; role: Role; active: boolean }

export type VehicleCategory = InBranch & {
  name: string
  min_price: number
  max_price: number
  pricing_note: string | null
  sort_order: number
  active: boolean
}

export type Washer = InBranch & {
  name: string
  phone: string | null
  /** A decimal string from the server, e.g. "30.00". */
  commission_percent: string
  active: boolean
}

export type Customer = InBranch & {
  plate_number: string
  name: string | null
  phone: string | null
  visit_count: number
  total_spent: number
  notes: string | null
}

export type Sale = InBranch & {
  category_id: string
  customer_id: string | null
  plate_number: string | null
  service_note: string | null
  amount: number
  payment_method: PaymentMethod
  recorded_by: string
  sold_at: string
  status: SaleStatus
  void_reason: string | null
  override_reason: string | null
  /** A cashier's request for the owner to void this sale. Cleared if declined. */
  void_requested_by?: string | null
  void_request_reason?: string | null
  void_requested_at?: string | null
  /** Only on sales made on this device that the server has not sent back yet. */
  washer_ids?: string[]
  /** Set when the server refused this record; it needs the owner's attention. */
  sync_state?: 'rejected'
}

export type SaleWasher = InBranch & {
  sale_id: string
  washer_id: string
  commission_percent: string
  commission_amount: number
}

export type Expense = InBranch & {
  category: ExpenseCategory
  amount: number
  payment_method: PaymentMethod
  note: string | null
  spent_at: string
  recorded_by: string
  sync_state?: 'rejected'
}

export type DayClosing = InBranch & {
  date: string
  totals: Record<string, unknown>
  closed_by: string
  closed_at: string
}

/** Tables the server sends on a pull. */
export const MIRROR_TABLES = [
  'branches',
  'users',
  'vehicle_categories',
  'washers',
  'customers',
  'sales',
  'sale_washers',
  'expenses',
  'day_closings',
] as const

export type MirrorTable = (typeof MIRROR_TABLES)[number]

/** Tables a device is allowed to push. */
export type PushTable = 'customers' | 'sales' | 'expenses' | 'vehicle_categories' | 'washers'

/** A change made on this device that the server has not confirmed yet. */
export type OutboxItem = {
  seq?: number
  op: 'upsert' | 'delete'
  table: PushTable
  record: { id: string } & Record<string, unknown>
  record_id: string
  /** Whoever made the change; it is pushed with their token. */
  user_id: string
  attempts: number
  created_at: string
  last_error?: string
}

/** A pushed record the server refused. Listed for the owner to review. */
export type SyncIssue = {
  seq?: number
  table: PushTable
  record_id: string
  op: 'upsert' | 'delete'
  reason: string
  message: string
  record: Record<string, unknown>
  server_record: Record<string, unknown> | null
  user_id: string
  at: string
}

/** Someone who has signed in on this device. */
export type Account = {
  user_id: string
  name: string
  phone: string
  role: Role
  branch_id: string
  branch_name: string
  /** Cleared when the server stops accepting it; the person signs in online again. */
  token: string | null
  pin_salt: string
  pin_hash: string
  last_login_at: string
}

export type Meta = { key: string; value: unknown }
