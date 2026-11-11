import { useLiveQuery } from 'dexie-react-hooks'
import { CircleCheck, UserRoundPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { ICON } from '../components/icon.ts'
import { inputClass, tableHead } from '../components/styles.ts'
import { Button, Card, Field, Tag } from '../components/ui.tsx'
import { db } from '../db/db.ts'
import { createCustomer, LocalValidationError } from '../db/repositories.ts'
import { formatMoney, normalisePlate } from '../lib/format.ts'
import { useLookups } from '../lib/useLookups.ts'

/** How many customers to list at once; searching narrows it down. */
const SHOWN = 50

/**
 * Regular customers, found by plate, name or phone. Visits and total spent
 * are counted by the server from sales, so they update after a sync.
 */
export default function CustomersPage() {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <AddCustomerCard />
      <CustomerList />
    </div>
  )
}

function AddCustomerCard() {
  const { account } = useAuth()

  const [plate, setPlate] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<string | null>(null)

  if (!account) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!account) return

    setBusy(true)
    try {
      const customer = await createCustomer(account, { plateNumber: plate, name, phone })
      setSaved(`${customer.name ?? customer.plate_number} is saved.`)
      setPlate('')
      setName('')
      setPhone('')
      setErrors({})
    } catch (caught) {
      if (caught instanceof LocalValidationError) setErrors({ [caught.field]: caught.message })
      else setErrors({ plateNumber: 'The customer could not be saved on this device. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  function edited() {
    setSaved(null)
    setErrors({})
  }

  return (
    <Card title="Add a customer">
      <form onSubmit={submit} noValidate className="space-y-4 px-4 py-4">
        {saved && (
          <p role="status" className="flex items-center gap-2 rounded-control bg-success px-3 py-3 font-semibold text-surface">
            <CircleCheck {...ICON} className="shrink-0" />
            {saved}
          </p>
        )}

        <Field
          id="customer-plate"
          label="Plate number"
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="GR 1234-21"
          value={plate}
          onChange={(event) => {
            edited()
            setPlate(event.target.value)
          }}
          error={errors.plateNumber}
        />
        <Field
          id="customer-name"
          label="Name (optional)"
          autoComplete="off"
          autoCapitalize="words"
          value={name}
          onChange={(event) => {
            edited()
            setName(event.target.value)
          }}
        />
        <Field
          id="customer-phone"
          label="Phone (optional)"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="024 000 0000"
          value={phone}
          onChange={(event) => {
            edited()
            setPhone(event.target.value)
          }}
        />

        <Button type="submit" busy={busy} disabled={plate.trim() === ''} icon={<UserRoundPlus {...ICON} />} className="w-full">
          Save customer
        </Button>
      </form>
    </Card>
  )
}

function CustomerList() {
  const lookups = useLookups()
  const [search, setSearch] = useState('')

  const customers = useLiveQuery(() => db.customers.toArray(), [])

  if (!customers || !lookups) return null

  const typed = search.trim().toLowerCase()
  const plate = normalisePlate(search)

  const matching = customers
    .filter(
      (customer) =>
        typed === '' ||
        (plate !== null && customer.plate_number.includes(plate)) ||
        (customer.name ?? '').toLowerCase().includes(typed) ||
        (customer.phone ?? '').includes(typed),
    )
    // Regulars first, then by plate.
    .sort((a, b) => b.visit_count - a.visit_count || a.plate_number.localeCompare(b.plate_number))

  const shown = matching.slice(0, SHOWN)

  return (
    <Card title={customers.length === 1 ? '1 customer' : `${customers.length} customers`}>
      <div className="border-b border-border px-4 py-3">
        <label htmlFor="customer-search" className="sr-only">
          Find a customer by plate, name or phone
        </label>
        <input
          id="customer-search"
          type="search"
          autoComplete="off"
          placeholder="Find by plate, name or phone"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={`${inputClass} border-border`}
        />
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-4 text-text-muted">
          {customers.length === 0 ? 'No customers saved yet.' : 'No customer matches that.'}
        </p>
      ) : (
        <>
          <table className="w-full">
            <thead>
              <tr className={tableHead}>
                <th scope="col" className="px-4 py-2 font-semibold">Customer</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">Visits</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">Spent</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((customer) => (
                <tr key={customer.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <span className="money block font-semibold text-text">{customer.plate_number}</span>
                    <span className="block text-sm text-text-muted">
                      {[customer.name, customer.phone].filter(Boolean).join(' · ') || 'No name'}
                    </span>
                    {lookups.waiting.has(customer.id) && (
                      <span className="mt-1 block">
                        <Tag tone="warning">Waiting to sync</Tag>
                      </span>
                    )}
                  </td>
                  <td className="money px-4 py-3 text-right text-text">{customer.visit_count}</td>
                  <td className="money px-4 py-3 text-right font-semibold text-text">{formatMoney(customer.total_spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {matching.length > SHOWN && (
            <p className="border-t border-border px-4 py-3 text-sm text-text-muted">
              Showing the first {SHOWN} of {matching.length}. Search to narrow it down.
            </p>
          )}
        </>
      )}
    </Card>
  )
}
