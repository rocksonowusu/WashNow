import { useLiveQuery } from 'dexie-react-hooks'
import { LockKeyhole, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { ICON } from '../components/icon.ts'
import { inputClass, tableHead } from '../components/styles.ts'
import { Button, Card, Tag } from '../components/ui.tsx'
import { db } from '../db/db.ts'
import { api, ApiError, NetworkError } from '../lib/api.ts'
import { formatDateTime, formatMoney } from '../lib/format.ts'
import { useOnline } from '../lib/useOnline.ts'
import { syncService } from '../sync/SyncService.ts'

type Summary = {
  date: string
  cars_washed: number
  sales_total: number
  cash_total: number
  momo_total: number
  voided_count: number
  expenses_total: number
  commission_total: number
  commissions: { washer_id: string; washer_name: string | null; cars: number; amount: number }[]
  net: number
  closed: boolean
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Owner only. See a day's totals as the server has them, then close the day:
 * the totals are saved and nothing dated that day can be added or changed.
 */
export default function DayClosePage() {
  const { account } = useAuth()
  const online = useOnline()
  const token = account?.token ?? null

  const [date, setDate] = useState(today)
  const [reload, setReload] = useState(0)
  const [state, setState] = useState<{ key: string; summary: Summary | null; error: string | null }>({ key: '', summary: null, error: null })
  const [confirming, setConfirming] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  const waiting = useLiveQuery(() => db.outbox.count(), [], 0)
  const closings = useLiveQuery(() => db.day_closings.orderBy('date').reverse().limit(14).toArray(), [])

  const key = `${date}:${reload}`

  useEffect(() => {
    if (!token || !online || date === '') return

    let cancelled = false
    api<{ data: Summary }>(`/day-summary?date=${date}`, { token })
      .then((reply) => {
        if (!cancelled) setState({ key, summary: reply.data, error: null })
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setState({ key, summary: null, error: caught instanceof NetworkError ? 'Could not reach the server.' : 'The day could not be loaded.' })
        }
      })

    return () => {
      cancelled = true
    }
  }, [token, online, date, key])

  const summary = state.key === key ? state.summary : null
  const error = state.key === key ? state.error : null

  async function closeDay() {
    setClosing(true)
    setCloseError(null)
    try {
      await api('/day-closings', { method: 'POST', token, body: { date } })
      setConfirming(false)
      setReload((count) => count + 1)
      void syncService.syncNow()
    } catch (caught) {
      setCloseError(
        caught instanceof NetworkError
          ? 'Could not reach the server. The day is not closed.'
          : caught instanceof ApiError
            ? (caught.errors.date?.[0] ?? caught.message)
            : 'The day could not be closed. Try again.',
      )
    } finally {
      setClosing(false)
    }
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card title="Close a day">
        <div className="space-y-4 px-4 py-4">
          <div className="max-w-xs">
            <label htmlFor="close-date" className="mb-1 block text-sm font-semibold text-text">Day</label>
            <input
              id="close-date"
              type="date"
              value={date}
              max={today()}
              onChange={(event) => {
                setDate(event.target.value)
                setConfirming(false)
                setCloseError(null)
              }}
              className={`${inputClass} border-border`}
            />
          </div>

          {!online && (
            <p className="flex items-start gap-2 rounded-control bg-warning px-3 py-3 font-semibold text-text">
              <WifiOff {...ICON} className="mt-0.5 shrink-0" />
              You are offline. Closing a day uses the server’s totals, so it needs internet.
            </p>
          )}

          {error && online && <p className="rounded-control bg-danger px-3 py-3 font-semibold text-surface">{error}</p>}
          {online && !summary && !error && <p className="text-text-muted">Loading the day…</p>}

          {summary && (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <Figure label="Vehicles washed" value={String(summary.cars_washed)} />
                <Figure label="Total sales" value={formatMoney(summary.sales_total)} />
                <Figure label="Cash" value={formatMoney(summary.cash_total)} />
                <Figure label="MoMo" value={formatMoney(summary.momo_total)} />
                <Figure label="Expenses" value={formatMoney(summary.expenses_total)} />
                <Figure label="Crew commission" value={formatMoney(summary.commission_total)} />
                <Figure label="Left after both" value={formatMoney(summary.net)} strong />
                <Figure label="Voided sales" value={String(summary.voided_count)} />
              </dl>

              {summary.commissions.length > 0 && (
                <table className="w-full">
                  <thead>
                    <tr className={tableHead}>
                      <th scope="col" className="px-3 py-2 font-semibold">Crew</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Washed</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">To pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.commissions.map((row) => (
                      <tr key={row.washer_id} className="border-t border-border">
                        <td className="px-3 py-2 font-semibold text-text">{row.washer_name ?? 'Removed crew member'}</td>
                        <td className="money px-3 py-2 text-right text-text">{row.cars}</td>
                        <td className="money px-3 py-2 text-right font-semibold text-text">{formatMoney(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {summary.closed ? (
                <p className="flex items-center gap-2 rounded-control bg-success px-3 py-3 font-semibold text-surface">
                  <LockKeyhole {...ICON} className="shrink-0" />
                  This day is closed. Its records can no longer be changed.
                </p>
              ) : (
                <div className="space-y-3 border-t border-border pt-4">
                  {waiting > 0 && (
                    <p className="rounded-control bg-warning px-3 py-3 font-semibold text-text">
                      This device still has {waiting} record(s) waiting to sync. Sync first, and check other phones have synced too, or their sales for this day will be refused.
                    </p>
                  )}

                  {confirming ? (
                    <>
                      <p className="text-text">
                        Closing {summary.date} saves these totals and locks the day. Sales, voids and expenses dated that day will be refused afterwards. This cannot be undone here.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button busy={closing} icon={<LockKeyhole {...ICON} />} onClick={() => void closeDay()}>
                          Yes, close {summary.date}
                        </Button>
                        <Button variant="secondary" onClick={() => setConfirming(false)}>
                          Not yet
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Button icon={<LockKeyhole {...ICON} />} onClick={() => setConfirming(true)}>
                      Close this day
                    </Button>
                  )}

                  {closeError && <p className="text-sm text-danger">{closeError}</p>}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      <Card title="Closed days">
        {!closings || closings.length === 0 ? (
          <p className="px-4 py-4 text-text-muted">No day has been closed yet.</p>
        ) : (
          <ul>
            {closings.map((closing) => {
              const totals = closing.totals as { sales_total?: number; net?: number; cars_washed?: number }
              return (
                <li key={closing.id} className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
                  <div>
                    <button type="button" onClick={() => setDate(String(closing.date).slice(0, 10))} className="money font-semibold text-accent underline">
                      {String(closing.date).slice(0, 10)}
                    </button>
                    <p className="text-sm text-text-muted">
                      {totals.cars_washed ?? 0} washed · closed {formatDateTime(closing.closed_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="money font-semibold text-text">{formatMoney(totals.sales_total ?? 0)}</p>
                    <Tag tone="muted">left {formatMoney(totals.net ?? 0)}</Tag>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Figure({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className={`money font-semibold ${strong ? 'font-heading text-2xl text-accent' : 'text-lg text-text'}`}>{value}</dd>
    </div>
  )
}
