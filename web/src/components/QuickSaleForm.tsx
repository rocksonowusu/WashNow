import { useLiveQuery } from 'dexie-react-hooks'
import { Check, CircleCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { db } from '../db/db.ts'
import { createSale, LocalValidationError } from '../db/repositories.ts'
import type { PaymentMethod } from '../db/types.ts'
import { formatMoney, parseMoney } from '../lib/format.ts'
import { ICON } from './icon.ts'
import { Button, Card, Field } from './ui.tsx'

const choice =
  'min-h-12 rounded-control border px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
const chosen = 'border-accent bg-accent-tint text-text'
const notChosen = 'border-border bg-surface text-text hover:bg-surface-alt'

/**
 * A plain sale form so Stage 4 can be checked end to end: it saves to the
 * device first and the sale then syncs by itself. Stage 5 replaces it with
 * the full New Sale screen.
 */
export default function QuickSaleForm() {
  const { account } = useAuth()

  const categories = useLiveQuery(
    async () => (await db.vehicle_categories.orderBy('sort_order').toArray()).filter((category) => category.active),
    [],
  )
  const washers = useLiveQuery(async () => (await db.washers.orderBy('name').toArray()).filter((washer) => washer.active), [])

  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [amountText, setAmountText] = useState('')
  const [washerIds, setWasherIds] = useState<string[]>([])
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [plate, setPlate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<string | null>(null)

  if (!account || !categories || !washers) return null

  const category = categories.find((candidate) => candidate.id === categoryId) ?? null
  const amount = parseMoney(amountText)
  const outOfRange = category !== null && amount !== null && (amount < category.min_price || amount > category.max_price)
  const isOwner = account.role === 'owner'

  function edited() {
    setSaved(null)
    setErrors({})
  }

  function toggleWasher(id: string) {
    edited()
    setWasherIds((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!account) return

    if (!categoryId) return setErrors({ categoryId: 'Choose a vehicle category.' })
    if (amount === null) return setErrors({ amount: 'Enter the amount paid, for example 35 or 35.50.' })

    setBusy(true)
    try {
      const sale = await createSale(account, {
        categoryId,
        amount,
        paymentMethod: method,
        washerIds,
        plateNumber: plate,
        overrideReason: reason,
      })

      setSaved(`Saved ${formatMoney(sale.amount)} for ${category?.name ?? 'the vehicle'}.`)
      setCategoryId(null)
      setAmountText('')
      setWasherIds([])
      setPlate('')
      setReason('')
      setErrors({})
    } catch (caught) {
      if (caught instanceof LocalValidationError) setErrors({ [caught.field]: caught.message })
      else setErrors({ form: 'The sale could not be saved on this device. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  if (categories.length === 0 || washers.length === 0) {
    return (
      <Card className="px-4 py-4">
        <h2 className="text-lg text-text">Record a sale</h2>
        <p className="mt-1 text-text-muted">
          {categories.length === 0
            ? 'Vehicle categories have not reached this device yet. They arrive with the first sync.'
            : 'There are no washers yet. The owner needs to add washers before a sale can be recorded.'}
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate className="space-y-5 px-4 py-4">
        <h2 className="text-lg text-text">Record a sale</h2>

        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-text-muted">Vehicle</legend>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {categories.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={candidate.id === categoryId}
                onClick={() => {
                  edited()
                  setCategoryId(candidate.id)
                }}
                className={`${choice} ${candidate.id === categoryId ? chosen : notChosen}`}
              >
                <span className="block font-semibold">{candidate.name}</span>
                <span className="money block text-sm text-text-muted">
                  {formatMoney(candidate.min_price)} to {formatMoney(candidate.max_price)}
                </span>
              </button>
            ))}
          </div>
          {errors.categoryId && <p className="mt-1 text-sm text-danger">{errors.categoryId}</p>}
        </fieldset>

        <Field
          id="sale-amount"
          label="Amount paid (GH₵)"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          className="money text-lg"
          value={amountText}
          onChange={(event) => {
            edited()
            setAmountText(event.target.value)
          }}
          error={
            errors.amount ??
            (outOfRange && !isOwner && category
              ? `Outside the ${category.name} range. Only the owner can approve this price.`
              : null)
          }
        />

        {outOfRange && isOwner && category && (
          <Field
            id="sale-reason"
            label={`Reason for a price outside the ${category.name} range`}
            autoComplete="off"
            value={reason}
            onChange={(event) => {
              edited()
              setReason(event.target.value)
            }}
            error={errors.overrideReason}
          />
        )}

        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-text-muted">Washed by</legend>
          <div className="grid grid-cols-2 gap-2">
            {washers.map((washer) => {
              const picked = washerIds.includes(washer.id)
              return (
                <button
                  key={washer.id}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => toggleWasher(washer.id)}
                  className={`${choice} flex items-center justify-between gap-2 font-semibold ${picked ? chosen : notChosen}`}
                >
                  {washer.name}
                  {picked && <Check {...ICON} className="shrink-0 text-accent" />}
                </button>
              )
            })}
          </div>
          {errors.washerIds && <p className="mt-1 text-sm text-danger">{errors.washerIds}</p>}
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-text-muted">Paid with</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['cash', 'momo'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={method === option}
                onClick={() => {
                  edited()
                  setMethod(option)
                }}
                className={`${choice} text-center font-semibold ${method === option ? chosen : notChosen}`}
              >
                {option === 'cash' ? 'Cash' : 'MoMo'}
              </button>
            ))}
          </div>
        </fieldset>

        <Field
          id="sale-plate"
          label="Plate number (optional)"
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="GR 1234-21"
          value={plate}
          onChange={(event) => {
            edited()
            setPlate(event.target.value)
          }}
        />

        {errors.form && <p className="text-danger">{errors.form}</p>}

        <Button type="submit" busy={busy} disabled={outOfRange && !isOwner} className="w-full text-lg">
          Save sale
        </Button>

        {saved && (
          <p role="status" className="flex items-center gap-2 font-semibold text-success">
            <CircleCheck {...ICON} className="shrink-0" />
            {saved}
          </p>
        )}
      </form>
    </Card>
  )
}
