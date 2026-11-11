import { useLiveQuery } from 'dexie-react-hooks'
import { CircleCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import CornerArt from '../components/CornerArt.tsx'
import { ICON } from '../components/icon.ts'
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
 * Money spent by the bay today: record it, and see today's list and total.
 */
export default function ExpensesPage() {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <ExpenseForm />
      <TodayExpenses />
    </div>
  )
}

function ExpenseForm() {
  const { account } = useAuth()

  const [category, setCategory] = useState<ExpenseCategory | null>(null)
  const [amountText, setAmountText] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<string | null>(null)

  if (!account) return null

  function edited() {
    setSaved(null)
    setErrors({})
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
      setSaved(`Saved ${formatMoney(expense.amount)} for ${labelFor(expense.category).toLowerCase()}.`)
      setCategory(null)
      setAmountText('')
      setNote('')
      setErrors({})
    } catch (caught) {
      if (caught instanceof LocalValidationError) setErrors({ [caught.field]: caught.message })
      else setErrors({ form: 'The expense could not be saved on this device. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Record an expense">
      <form onSubmit={submit} noValidate className="space-y-5 px-4 py-4">
        {saved && (
          <p role="status" className="flex items-center gap-2 rounded-control bg-success px-3 py-3 font-semibold text-surface">
            <CircleCheck {...ICON} className="shrink-0" />
            {saved}
          </p>
        )}

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

        {errors.form && <p className="text-danger">{errors.form}</p>}

        <Button type="submit" busy={busy} className="min-h-14 w-full text-lg">
          Save expense
        </Button>
      </form>
    </Card>
  )
}

function TodayExpenses() {
  const lookups = useLookups()

  const expenses = useLiveQuery(() => {
    const { start, end } = todayRange()
    return db.expenses.where('spent_at').between(start, end, true, false).reverse().sortBy('spent_at')
  }, [])

  if (!expenses || !lookups) return null

  const counted = expenses.filter((expense) => expense.sync_state !== 'rejected')
  const total = counted.reduce((sum, expense) => sum + expense.amount, 0)

  return (
    <Card title="Today’s expenses">
      <div className="relative overflow-hidden bg-accent px-4 py-4 text-surface">
        <CornerArt kind="rings" corner="top-right" size={220} tone="text-surface/15" />
        <p className="relative text-sm font-semibold text-surface/85">Total spent today</p>
        <p className="money relative font-heading text-2xl font-bold">{formatMoney(total)}</p>
      </div>

      {expenses.length === 0 ? (
        <p className="px-4 py-4 text-text-muted">No expenses recorded today yet.</p>
      ) : (
        <ul>
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
