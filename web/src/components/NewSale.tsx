import { useLiveQuery } from 'dexie-react-hooks'
import { NotebookPen } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { db } from '../db/db.ts'
import { createCustomer, createSale, LocalValidationError } from '../db/repositories.ts'
import type { PaymentMethod, Washer } from '../db/types.ts'
import { splitCommission } from '../lib/commission.ts'
import { formatMoney, normalisePlate, parseMoney } from '../lib/format.ts'
import CrewPicker from './CrewPicker.tsx'
import { ICON } from './icon.ts'
import Modal, { ModalActions } from './Modal.tsx'
import PlateField from './PlateField.tsx'
import { useToast } from './Toast.tsx'
import { Button, Choice, Field } from './ui.tsx'

const NewSaleContext = createContext<() => void>(() => {})

/**
 * Lets any screen open the New sale modal (the header button, the phone tab,
 * the dashboard button). The half-entered sale is kept if the modal is closed
 * by accident, until it is saved or cleared.
 */
export function NewSaleProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const toast = useToast()
  const openNewSale = useCallback(() => setOpen(true), [])

  return (
    <NewSaleContext value={openNewSale}>
      {children}
      <NewSaleDialog
        open={open}
        onClose={() => setOpen(false)}
        onSaved={(message) => {
          setOpen(false)
          toast(message, { label: 'Record another', onClick: openNewSale })
        }}
      />
    </NewSaleContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNewSale(): () => void {
  return useContext(NewSaleContext)
}

/**
 * Recording a sale, built to take under fifteen seconds with one hand:
 * vehicle, amount, Cash or MoMo, who washed it, Save. Plate and note are
 * there when wanted and never in the way. It opens as a drawer from the
 * right, in two columns on wider screens so everything fits without
 * scrolling. A bar under the amount shows where the price sits in the
 * vehicle's range, and the owner sees the sale split live at the bottom:
 * the full amount, the crew's pay and what the business keeps. The sale is
 * saved on the device first and syncs by itself.
 */
function NewSaleDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (message: string) => void }) {
  const { account } = useAuth()

  const categories = useLiveQuery(
    async () => (await db.vehicle_categories.orderBy('sort_order').toArray()).filter((category) => category.active),
    [],
  )
  const crew = useLiveQuery(() => db.washers.toArray(), [])

  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [amountText, setAmountText] = useState('')
  const [washerIds, setWasherIds] = useState<string[]>([])
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [plate, setPlate] = useState('')
  const [saveAsCustomer, setSaveAsCustomer] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (!account || !categories) return null

  const category = categories.find((candidate) => candidate.id === categoryId) ?? null
  const amount = parseMoney(amountText)
  const outOfRange = category !== null && amount !== null && (amount < category.min_price || amount > category.max_price)
  const isOwner = account.role === 'owner'
  const started = categoryId !== null || amountText !== '' || washerIds.length > 0 || plate !== '' || note !== ''
  // In the order they were picked, which is the order the server shares the sale in.
  const washers = washerIds.map((id) => crew?.find((member) => member.id === id)).filter((member): member is Washer => Boolean(member))

  function clear() {
    setCategoryId(null)
    setAmountText('')
    setWasherIds([])
    setMethod('cash')
    setPlate('')
    setSaveAsCustomer(false)
    setCustomerName('')
    setShowNote(false)
    setNote('')
    setReason('')
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

      clear()
      onSaved(`Saved ${formatMoney(sale.amount)} for ${category?.name ?? 'the vehicle'}.`)
    } catch (caught) {
      if (caught instanceof LocalValidationError) setErrors({ [caught.field]: caught.message })
      else setErrors({ form: 'The sale could not be saved on this device. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  if (categories.length === 0) {
    return (
      <Modal open={open} onClose={onClose} title="Record a sale" size="sm">
        <p className="text-text-muted">Vehicle types have not reached this device yet. They arrive with the first sync.</p>
      </Modal>
    )
  }

  const firstError = errors.form ?? errors.categoryId ?? errors.amount ?? errors.overrideReason ?? errors.washerIds

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a sale"
      description={started ? 'Close and come back: what you entered is kept.' : undefined}
      size="lg"
      onSubmit={submit}
      footer={
        <>
          {/* Crew pay is the owner's business, as everywhere else in the app. */}
          {isOwner && <SaleSplit amount={amount} washers={washers} />}
          <ModalActions note={firstError && <p className="font-semibold text-danger">{firstError}</p>}>
            {started && (
              <Button variant="quiet" onClick={clear}>
                Clear
              </Button>
            )}
            <Button type="submit" busy={busy} disabled={outOfRange && !isOwner} className="min-h-11 text-base sm:min-w-56">
              {amount !== null && category ? `Save ${formatMoney(amount)} sale` : 'Save sale'}
            </Button>
          </ModalActions>
        </>
      }
    >
      <div className="rise-columns grid gap-5 md:grid-cols-2 md:gap-6">
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-1 text-sm font-semibold text-text">Vehicle</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-2">
              {categories.map((candidate) => {
                const picked = candidate.id === categoryId
                return (
                  <Choice
                    key={candidate.id}
                    chosen={picked}
                    className="min-h-14"
                    onClick={() => {
                      setErrors({})
                      setCategoryId(candidate.id)
                    }}
                  >
                    <span className="block leading-tight">{candidate.name}</span>
                    <span className={`money block text-sm font-normal ${picked ? 'text-surface/85' : 'text-text-muted'}`}>
                      {priceRange(candidate.min_price, candidate.max_price)}
                    </span>
                  </Choice>
                )
              })}
            </div>
            {errors.categoryId && <p className="mt-1 text-sm text-danger">{errors.categoryId}</p>}
          </fieldset>

          <div>
            <Field
              id="sale-amount"
              label="Amount paid (GH₵)"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              className="money min-h-14 text-2xl font-semibold"
              value={amountText}
              onChange={(event) => {
                setErrors({})
                setAmountText(event.target.value)
              }}
              error={
                errors.amount ??
                (outOfRange && !isOwner && category
                  ? `Outside the ${category.name} range (${formatMoney(category.min_price)} to ${formatMoney(category.max_price)}). Only the owner can approve this price.`
                  : null)
              }
            />
            {category && <PriceRangeBar min={category.min_price} max={category.max_price} amount={amount} />}
          </div>

          {outOfRange && isOwner && category && (
            <Field
              id="sale-reason"
              label={`Reason for a price outside the ${category.name} range`}
              autoComplete="off"
              value={reason}
              onChange={(event) => {
                setErrors({})
                setReason(event.target.value)
              }}
              error={errors.overrideReason}
            />
          )}
        </div>

        <div className="space-y-5">
          <CrewPicker
            account={account}
            selectedIds={washerIds}
            onChange={(ids) => {
              setErrors({})
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
                    setErrors({})
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
              setErrors({})
              setPlate(next)
            }}
            saveAsCustomer={saveAsCustomer}
            onSaveAsCustomerChange={setSaveAsCustomer}
            customerName={customerName}
            onCustomerNameChange={setCustomerName}
          />

          {showNote || note !== '' ? (
            <Field
              id="sale-note"
              label="What was washed (optional)"
              autoComplete="off"
              autoFocus={showNote && note === ''}
              placeholder="Body and engine, 10 tyres…"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          ) : (
            <Button variant="quiet" className="-ml-2" icon={<NotebookPen {...ICON} />} onClick={() => setShowNote(true)}>
              Add what was washed
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

const ease = 'ease-[cubic-bezier(0.22,1,0.36,1)]'

/** A vehicle's range short enough for one line: "GH₵15 – 100", "GH₵12.50 – 40". */
function priceRange(min: number, max: number): string {
  const cedis = (pesewas: number) => (pesewas % 100 === 0 ? String(pesewas / 100) : (pesewas / 100).toFixed(2))
  return `GH₵${cedis(min)} – ${cedis(max)}`
}

/**
 * Where the typed price sits between the vehicle's lowest and highest
 * price: a filled track with a marker that slides as the amount changes,
 * red when the price is outside the range.
 */
function PriceRangeBar({ min, max, amount }: { min: number; max: number; amount: number | null }) {
  const position = amount === null ? null : Math.min(Math.max((amount - min) / Math.max(max - min, 1), 0), 1)
  const below = amount !== null && amount < min
  const above = amount !== null && amount > max
  const off = below || above

  let where = 'Type the amount to see where it sits'
  if (amount !== null && position !== null) {
    if (below) where = `${formatMoney(min - amount)} below the lowest price`
    else if (above) where = `${formatMoney(amount - max)} above the highest price`
    else if (position < 1 / 3) where = 'Low end of the range'
    else if (position > 2 / 3) where = 'High end of the range'
    else where = 'Middle of the range'
  }

  return (
    <div className="mt-3">
      <div className="relative mx-2.5 h-2.5 rounded-pill bg-surface-alt" aria-hidden="true">
        {position !== null && (
          <>
            <div
              className={`absolute inset-y-0 left-0 rounded-pill transition-[width,background-color] duration-300 motion-reduce:transition-none ${ease} ${off ? 'bg-danger' : 'bg-accent'}`}
              style={{ width: `${position * 100}%` }}
            />
            <span
              className={`absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-pill border-[3px] border-surface transition-[left,background-color] duration-300 motion-reduce:transition-none ${ease} ${off ? 'bg-danger' : 'bg-accent'}`}
              style={{ left: `${position * 100}%` }}
            />
          </>
        )}
      </div>
      <div className="mt-2 flex items-start justify-between gap-3 text-sm">
        <span className="money shrink-0 text-text-muted">{formatMoney(min)}</span>
        <span aria-live="polite" className={`text-center ${off ? 'font-semibold text-danger' : amount === null ? 'text-text-muted' : 'font-semibold text-text'}`}>
          {where}
        </span>
        <span className="money shrink-0 text-text-muted">{formatMoney(max)}</span>
      </div>
    </div>
  )
}

function SplitFigure({ label, value, dot, strong = false }: { label: string; value: string; dot?: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-sm text-text-muted">
        {dot && <span className={`size-2.5 shrink-0 rounded-pill ${dot}`} aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </dt>
      <dd className={`money truncate font-heading text-lg font-bold ${strong ? 'text-accent' : 'text-text'}`}>{value}</dd>
    </div>
  )
}

/**
 * The sale split live, worked out the way the server will: the full amount,
 * what the crew earn from it, and what the business keeps.
 */
function SaleSplit({ amount, washers }: { amount: number | null; washers: Washer[] }) {
  const pays = splitCommission(amount ?? 0, washers.map((member) => member.commission_percent))
  const crewPay = pays.reduce((total, pay) => total + pay, 0)
  const ready = amount !== null && washers.length > 0
  const crewShare = ready && amount ? crewPay / amount : 0

  let detail = 'Choose who washed it to see their pay.'
  if (washers.length > 0 && amount === null) detail = 'Type the amount to see the split.'
  if (ready) {
    detail = washers
      .map((member, index) => {
        const rate = member.commission_percent == null ? 'rate not set' : `${Number(member.commission_percent)}%`
        return `${member.name} ${formatMoney(pays[index])} (${rate})`
      })
      .join(' · ')
  }

  return (
    <div className="mb-3" aria-live="polite">
      <dl className="grid grid-cols-3 gap-3">
        <SplitFigure label="Sale" value={amount !== null ? formatMoney(amount) : '–'} />
        <SplitFigure label="Crew pay" dot="bg-chart-2" value={ready ? formatMoney(crewPay) : '–'} />
        <SplitFigure label="Business keeps" dot="bg-accent" value={ready ? formatMoney((amount ?? 0) - crewPay) : '–'} strong />
      </dl>
      <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-pill bg-surface-alt" aria-hidden="true">
        {ready && (
          <>
            <span className={`bg-chart-2 transition-[width] duration-300 motion-reduce:transition-none ${ease}`} style={{ width: `${crewShare * 100}%` }} />
            <span className="flex-1 bg-accent" />
          </>
        )}
      </div>
      <p className="mt-1.5 truncate text-sm text-text-muted" title={detail}>
        {detail}
      </p>
    </div>
  )
}
