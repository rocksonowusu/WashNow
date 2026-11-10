import { useLiveQuery } from 'dexie-react-hooks'
import { CircleCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { db } from '../db/db.ts'
import { createSale, LocalValidationError } from '../db/repositories.ts'
import type { PaymentMethod } from '../db/types.ts'
import { formatMoney, parseMoney } from '../lib/format.ts'
import CrewPicker from './CrewPicker.tsx'
import { ICON } from './icon.ts'
import { Button, Card, Choice, Field } from './ui.tsx'

/**
 * A plain sale form so the app can be used end to end: it saves to the device
 * first and the sale then syncs by itself. Stage 5 replaces it with the full
 * New Sale screen.
 */
export default function QuickSaleForm() {
  const { account } = useAuth()

  const categories = useLiveQuery(
    async () => (await db.vehicle_categories.orderBy('sort_order').toArray()).filter((category) => category.active),
    [],
  )

  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [amountText, setAmountText] = useState('')
  const [washerIds, setWasherIds] = useState<string[]>([])
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [plate, setPlate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<string | null>(null)

  if (!account || !categories) return null

  const category = categories.find((candidate) => candidate.id === categoryId) ?? null
  const amount = parseMoney(amountText)
  const outOfRange = category !== null && amount !== null && (amount < category.min_price || amount > category.max_price)
  const isOwner = account.role === 'owner'

  function edited() {
    setSaved(null)
    setErrors({})
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!account) return

    if (!categoryId) return setErrors({ categoryId: 'Choose a vehicle.' })
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

  if (categories.length === 0) {
    return (
      <Card title="Record a sale">
        <p className="px-4 py-4 text-text-muted">
          Vehicle types have not reached this device yet. They arrive with the first sync.
        </p>
      </Card>
    )
  }

  return (
    <Card title="Record a sale">
      <form onSubmit={submit} noValidate className="space-y-5 px-4 py-4">
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-text">Vehicle</legend>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {categories.map((candidate) => {
              const picked = candidate.id === categoryId
              return (
                <Choice
                  key={candidate.id}
                  chosen={picked}
                  onClick={() => {
                    edited()
                    setCategoryId(candidate.id)
                  }}
                >
                  <span className="block">{candidate.name}</span>
                  <span className={`money block text-sm font-normal ${picked ? 'text-surface/85' : 'text-text-muted'}`}>
                    {formatMoney(candidate.min_price)} to {formatMoney(candidate.max_price)}
                  </span>
                </Choice>
              )
            })}
          </div>
          {errors.categoryId && <p className="mt-1 text-sm text-danger">{errors.categoryId}</p>}
        </fieldset>

        <Field
          id="sale-amount"
          label="Amount paid (GH₵)"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          className="money text-xl font-semibold"
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

        <CrewPicker
          account={account}
          selectedIds={washerIds}
          onChange={(ids) => {
            edited()
            setWasherIds(ids)
          }}
          error={errors.washerIds}
        />

        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-text">Paid with</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['cash', 'momo'] as const).map((option) => (
              <Choice
                key={option}
                chosen={method === option}
                className="text-center"
                onClick={() => {
                  edited()
                  setMethod(option)
                }}
              >
                {option === 'cash' ? 'Cash' : 'MoMo'}
              </Choice>
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

        <Button type="submit" busy={busy} disabled={outOfRange && !isOwner} className="min-h-14 w-full text-lg">
          Save sale
        </Button>

        {saved && (
          <p role="status" className="flex items-center gap-2 rounded-control bg-success px-3 py-2 font-semibold text-surface">
            <CircleCheck {...ICON} className="shrink-0" />
            {saved}
          </p>
        )}
      </form>
    </Card>
  )
}
