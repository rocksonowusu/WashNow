import { useLiveQuery } from 'dexie-react-hooks'
import { CircleCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { db } from '../db/db.ts'
import { createCustomer, createSale, LocalValidationError } from '../db/repositories.ts'
import type { PaymentMethod } from '../db/types.ts'
import { formatMoney, normalisePlate, parseMoney } from '../lib/format.ts'
import CrewPicker from './CrewPicker.tsx'
import { ICON } from './icon.ts'
import PlateField from './PlateField.tsx'
import { Button, Card, Choice, Field } from './ui.tsx'

/**
 * Recording a sale, built to take under fifteen seconds with one hand:
 * vehicle, amount, who washed it, Cash or MoMo, Save. Plate and note are
 * there when wanted and never in the way. The sale is saved on the device
 * first and syncs by itself.
 */
export default function SaleForm() {
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
  const [saveAsCustomer, setSaveAsCustomer] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [note, setNote] = useState('')
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
    if (washerIds.length === 0) return setErrors({ washerIds: 'Choose who washed it.' })

    setBusy(true)
    try {
      // A new customer is saved first, so the sale links to them by plate.
      const cleanPlate = normalisePlate(plate)
      if (saveAsCustomer && cleanPlate && !(await db.customers.where('plate_number').equals(cleanPlate).first())) {
        await createCustomer(account, { plateNumber: cleanPlate, name: customerName })
      }

      const sale = await createSale(account, {
        categoryId,
        amount,
        paymentMethod: method,
        washerIds,
        plateNumber: plate,
        serviceNote: note,
        overrideReason: reason,
      })

      setSaved(`Saved ${formatMoney(sale.amount)} for ${category?.name ?? 'the vehicle'}.`)
      setCategoryId(null)
      setAmountText('')
      setWasherIds([])
      setPlate('')
      setSaveAsCustomer(false)
      setCustomerName('')
      setNote('')
      setReason('')
      setErrors({})
      window.scrollTo({ top: 0 })
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

  const firstError = errors.form ?? errors.categoryId ?? errors.washerIds ?? errors.amount ?? errors.overrideReason

  return (
    <Card title="Record a sale">
      <form onSubmit={submit} noValidate>
        <div className="space-y-5 px-4 py-4">
          {saved && (
            <p role="status" className="flex items-center gap-2 rounded-control bg-success px-3 py-3 font-semibold text-surface">
              <CircleCheck {...ICON} className="shrink-0" />
              {saved}
            </p>
          )}

          <fieldset>
            <legend className="mb-1 text-sm font-semibold text-text">Vehicle</legend>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              {categories.map((candidate) => {
                const picked = candidate.id === categoryId
                return (
                  <Choice
                    key={candidate.id}
                    chosen={picked}
                    className="min-h-16"
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
            className="money min-h-14 text-2xl font-semibold"
            value={amountText}
            onChange={(event) => {
              edited()
              setAmountText(event.target.value)
            }}
            error={
              errors.amount ??
              (outOfRange && !isOwner && category
                ? `Outside the ${category.name} range (${formatMoney(category.min_price)} to ${formatMoney(category.max_price)}). Only the owner can approve this price.`
                : null)
            }
            hint={
              category && !outOfRange
                ? `${category.name}: ${formatMoney(category.min_price)} to ${formatMoney(category.max_price)}`
                : undefined
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
                  className="min-h-14 text-center text-lg"
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

          <PlateField
            value={plate}
            onChange={(next) => {
              edited()
              setPlate(next)
            }}
            saveAsCustomer={saveAsCustomer}
            onSaveAsCustomerChange={setSaveAsCustomer}
            customerName={customerName}
            onCustomerNameChange={setCustomerName}
          />

          <Field
            id="sale-note"
            label="What was washed (optional)"
            autoComplete="off"
            placeholder="Body and engine, 10 tyres…"
            value={note}
            onChange={(event) => {
              edited()
              setNote(event.target.value)
            }}
          />
        </div>

        {/* On phones Save stays in reach above the tab bar, however far the form is scrolled. */}
        <div className="sticky bottom-16 border-t border-border bg-surface px-4 py-3 lg:static">
          {firstError && <p className="mb-2 text-sm font-semibold text-danger">{firstError}</p>}
          <Button type="submit" busy={busy} disabled={outOfRange && !isOwner} className="min-h-14 w-full text-lg">
            {amount !== null && category ? `Save ${formatMoney(amount)} sale` : 'Save sale'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
