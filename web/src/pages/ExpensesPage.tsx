import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import CornerArt from '../components/CornerArt.tsx'
import { ICON } from '../components/icon.ts'
import Modal, { ModalActions } from '../components/Modal.tsx'
import { useToast } from '../components/Toast.tsx'
import { Button, Card, Choice, Field, Tag } from '../components/ui.tsx'
import { db } from '../db/db.ts'
import { createExpense, LocalValidationError } from '../db/repositories.ts'
import type { ExpenseCategory, PaymentMethod } from '../db/types.ts'
import { formatMoney, formatTime, parseMoney, todayRange } from '../lib/format.ts'
import { useLookups } from '../lib/useLookups.ts'

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'soap', label: 'Soap' },
  { value: 'water', label: 'Water' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'other', label: 'Other' },
]

const labelFor = (category: ExpenseCategory) => CATEGORIES.find((option) => option.value === category)?.label ?? category

/**
 * Money spent by the bay today: today's list and total, and a button that
 * opens the form in a modal.
 */
export default function ExpensesPage() {
  const toast = useToast()
  const [recording, setRecording] = useState(false)

  return (
    <div className="space-y-5">
      <TodayExpenses
        action={
          <Button icon={<Plus {...ICON} />} className="shrink-0" aria-label="Record an expense" onClick={() => setRecording(true)}>
            <span className="sm:hidden">Record</span>
            <span className="hidden sm:inline">Record an expense</span>
          </Button>
        }
      />

      <ExpenseDialog
        open={recording}
        onClose={() => setRecording(false)}
        onSaved={(message) => {
          setRecording(false)
          toast(message)
        }}
      />
    </div>
  )
}

function ExpenseDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (message: string) => void }) {
  const { account } = useAuth()

  const [category, setCategory] = useState<ExpenseCategory | null>(null)
  const [amountText, setAmountText] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (!account) return null

  function edited() {
    setErrors({})
  }

  function close() {
    setErrors({})
    onClose()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!account) return

    if (!category) return setErrors({ category: 'Choose what the money was spent on.' })

    const amount = parseMoney(amountText)
    if (amount === null) return setErrors({ amount: 'Enter the amount spent, for example 20 or 20.50.' })

    if (category === 'other' && note.trim() === '') return setErrors({ note: 'Say what it was spent on.' })

    setBusy(true)
    try {
      const expense = await createExpense(account, { category, amount, paymentMethod: method, note })
      setCategory(null)
      setAmountText('')
      setMethod('cash')
      setNote('')
      setErrors({})
      onSaved(`Saved ${formatMoney(expense.amount)} for ${labelFor(expense.category).toLowerCase()}.`)
    } catch (caught) {
      if (caught instanceof LocalValidationError) setErrors({ [caught.field]: caught.message })
      else setErrors({ form: 'The expense could not be saved on this device. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const firstError = errors.form ?? errors.category
  const typedAmount = parseMoney(amountText)

  return (
    <Modal
      open={open}
      onClose={close}
      title="Record an expense"
      onSubmit={submit}
      footer={
        <ModalActions note={firstError && <p className="font-semibold text-danger">{firstError}</p>}>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} className="min-h-11 text-base sm:min-w-48">
            {typedAmount !== null ? `Save ${formatMoney(typedAmount)} expense` : 'Save expense'}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-text">Spent on</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CATEGORIES.map((option) => (
              <Choice
                key={option.value}
                chosen={category === option.value}
                onClick={() => {
                  edited()
                  setCategory(option.value)
                }}
              >
                {option.label}
              </Choice>
            ))}
          </div>
          {errors.category && <p className="mt-1 text-sm text-danger">{errors.category}</p>}
        </fieldset>

        <Field
          id="expense-amount"
          label="Amount spent (GH₵)"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          className="money min-h-14 text-2xl font-semibold"
          value={amountText}
          onChange={(event) => {
            edited()
            setAmountText(event.target.value)
          }}
          error={errors.amount}
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
          id="expense-note"
          label={category === 'other' ? 'What was it for?' : 'Note (optional)'}
          autoComplete="off"
          placeholder="2 gallons, from the corner shop…"
          value={note}
          onChange={(event) => {
            edited()
            setNote(event.target.value)
          }}
          error={errors.note}
        />
      </div>
    </Modal>
  )
}

function TodayExpenses({ action }: { action: ReactNode }) {
  const lookups = useLookups()

  const expenses = useLiveQuery(() => {
    const { start, end } = todayRange()
    return db.expenses.where('spent_at').between(start, end, true, false).reverse().sortBy('spent_at')
  }, [])

  if (!expenses || !lookups) return null

  const counted = expenses.filter((expense) => expense.sync_state !== 'rejected')
  const total = counted.reduce((sum, expense) => sum + expense.amount, 0)

  return (
    <Card title="Today’s expenses" action={action}>
      <div className="relative mx-4 mt-1 mb-3 overflow-hidden rounded-panel bg-accent px-5 py-4 text-surface">
        <CornerArt kind="rings" corner="top-right" size={220} tone="text-surface/15" />
        <p className="relative text-sm font-semibold text-surface/85">Total spent today</p>
        <p className="money relative font-heading text-2xl font-bold">{formatMoney(total)}</p>
      </div>

      {expenses.length === 0 ? (
        <p className="px-4 py-4 text-text-muted">No expenses recorded today yet.</p>
      ) : (
        <ul className="border-t border-border">
          {expenses.map((expense) => (
            <li key={expense.id} className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
              <div className="min-w-0">
                <p className="font-semibold text-text">
                  {labelFor(expense.category)}
                  {expense.note && <span className="font-normal text-text-muted"> · {expense.note}</span>}
                </p>
                <p className="text-sm text-text-muted">
                  {formatTime(expense.spent_at)} · {expense.payment_method === 'cash' ? 'Cash' : 'MoMo'} ·{' '}
                  {lookups.userNames.get(expense.recorded_by) ?? 'Someone else'}
                </p>
                <div className="mt-1 flex flex-wrap gap-1 empty:hidden">
                  {expense.sync_state === 'rejected' ? (
                    <Tag tone="danger">Not accepted</Tag>
                  ) : (
                    lookups.waiting.has(expense.id) && <Tag tone="warning">Waiting to sync</Tag>
                  )}
                </div>
              </div>
              <p className={`money shrink-0 font-semibold ${expense.sync_state === 'rejected' ? 'text-text-muted line-through' : 'text-text'}`}>
                {formatMoney(expense.amount)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
