import { useLiveQuery } from 'dexie-react-hooks'
import { Gift, UserRoundCheck } from 'lucide-react'
import { db } from '../db/db.ts'
import { normalisePlate } from '../lib/format.ts'
import { ICON } from './icon.ts'
import { focusRing } from './styles.ts'
import { Field } from './ui.tsx'

type Props = {
  value: string
  onChange: (plate: string) => void
  /** Whether a plate that is not saved yet should become a customer with this sale. */
  saveAsCustomer: boolean
  onSaveAsCustomerChange: (save: boolean) => void
  customerName: string
  onCustomerNameChange: (name: string) => void
}

/**
 * Plate number with customer lookup. Typing shows saved customers whose plate
 * or name matches; tapping one fills the plate in. A plate that is not saved
 * yet can be kept as a new customer in the same step.
 */
export default function PlateField({ value, onChange, saveAsCustomer, onSaveAsCustomerChange, customerName, onCustomerNameChange }: Props) {
  const plate = normalisePlate(value)
  const typed = value.trim().toLowerCase()

  const matches = useLiveQuery(async () => {
    if (!plate || plate.length < 2) return []

    const byPlate = await db.customers.where('plate_number').startsWith(plate).limit(5).toArray()
    if (byPlate.length >= 5) return byPlate

    // Also match on the customer's name, for "the Mensah car".
    const found = new Set(byPlate.map((customer) => customer.id))
    const byName = (await db.customers.toArray())
      .filter((customer) => !found.has(customer.id) && (customer.name ?? '').toLowerCase().includes(typed))
      .slice(0, 5 - byPlate.length)

    return [...byPlate, ...byName]
  }, [plate, typed])

  const known = matches?.find((customer) => customer.plate_number === plate) ?? null
  const suggestions = (matches ?? []).filter((customer) => customer.id !== known?.id)

  // The owner's loyalty rule: every Nth wash by a saved customer is flagged.
  const every = useLiveQuery(async () => (await db.branches.toCollection().first())?.loyalty_every_visits ?? null, [])
  const thisVisit = known ? known.visit_count + 1 : 0
  const loyaltyDue = Boolean(every) && known !== null && thisVisit % (every as number) === 0

  return (
    <div>
      <Field
        id="sale-plate"
        label="Plate number (optional)"
        autoComplete="off"
        autoCapitalize="characters"
        placeholder="GR 1234-21"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />

      {known && (
        <p className="mt-2 flex items-center gap-2 rounded-control bg-success-tint px-3 py-2 text-text">
          <UserRoundCheck {...ICON} className="shrink-0 text-success" />
          <span>
            <span className="font-semibold">{known.name ?? 'Saved customer'}</span>
            <span className="text-text-muted">
              {' '}· {known.visit_count === 1 ? '1 visit' : `${known.visit_count} visits`}
            </span>
          </span>
        </p>
      )}

      {loyaltyDue && (
        <p className="mt-2 flex items-center gap-2 rounded-control bg-accent px-3 py-2 font-semibold text-surface">
          <Gift {...ICON} className="shrink-0" />
          Loyalty wash: this is visit {thisVisit}. Give the reward the owner has set.
        </p>
      )}

      {suggestions.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Matching customers">
          {suggestions.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => onChange(customer.plate_number)}
                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 text-left hover:border-accent hover:bg-accent-tint ${focusRing}`}
              >
                <span className="money font-semibold text-text">{customer.plate_number}</span>
                <span className="truncate text-sm text-text-muted">{customer.name ?? 'No name'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {plate && !known && (
        <div className="mt-2">
          <label className="flex min-h-12 cursor-pointer items-center gap-3 text-text">
            <input
              type="checkbox"
              checked={saveAsCustomer}
              onChange={(event) => onSaveAsCustomerChange(event.target.checked)}
              className="size-5 accent-accent"
            />
            Save {plate} as a customer
          </label>

          {saveAsCustomer && (
            <Field
              id="sale-customer-name"
              label="Customer name (optional)"
              autoComplete="off"
              autoCapitalize="words"
              value={customerName}
              onChange={(event) => onCustomerNameChange(event.target.value)}
            />
          )}
        </div>
      )}
    </div>
  )
}
