import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, CirclePlus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext.tsx'
import { ICON } from '../components/icon.ts'
import { Card, Tag } from '../components/ui.tsx'
import { db } from '../db/db.ts'
import { formatMoney, formatTime, todayRange } from '../lib/format.ts'

function Stat({ label, value, note, tone = 'text-text' }: { label: string; value: ReactNode; note?: string; tone?: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-sm text-text-muted">{label}</p>
      <p className={`money font-heading text-2xl font-bold ${tone}`}>{value}</p>
      {note && <p className="text-sm text-text-muted">{note}</p>}
    </Card>
  )
}

/**
 * Today at a glance, read from the device so it works offline. Everyone sees
 * the sales figures; expenses, commission and what is left are for the owner.
 */
export default function DashboardPage() {
  const { account } = useAuth()
  const isOwner = account?.role === 'owner'

  const data = useLiveQuery(async () => {
    const { start, end } = todayRange()

    const [sales, expenses, categories, washers, outbox] = await Promise.all([
      db.sales.where('sold_at').between(start, end, true, false).reverse().sortBy('sold_at'),
      db.expenses.where('spent_at').between(start, end, true, false).toArray(),
      db.vehicle_categories.orderBy('sort_order').toArray(),
      db.washers.toArray(),
      db.outbox.toArray(),
    ])

    // Voided and refused sales never count.
    const counted = sales.filter((sale) => sale.status === 'active' && sale.sync_state !== 'rejected')
    const commissions = await db.sale_washers
      .where('sale_id')
      .anyOf(counted.map((sale) => sale.id))
      .toArray()

    return { sales, counted, expenses, categories, washers, commissions, waiting: new Set(outbox.map((item) => item.record_id)) }
  }, [])

  if (!data) return null

  const sum = (rows: { amount: number }[]) => rows.reduce((total, row) => total + row.amount, 0)

  const total = sum(data.counted)
  const cash = sum(data.counted.filter((sale) => sale.payment_method === 'cash'))
  const expensesTotal = sum(data.expenses.filter((expense) => expense.sync_state !== 'rejected'))
  const commissionTotal = data.commissions.reduce((owed, row) => owed + row.commission_amount, 0)

  // The server works out commission, so sales still waiting to sync have none yet.
  const withCommission = new Set(data.commissions.map((row) => row.sale_id))
  const awaitingCommission = data.counted.filter((sale) => !withCommission.has(sale.id)).length

  const byCategory = data.categories
    .map((category) => {
      const rows = data.counted.filter((sale) => sale.category_id === category.id)
      return { id: category.id, name: category.name, cars: rows.length, amount: sum(rows) }
    })
    .filter((row) => row.cars > 0)

  const byWasher = data.washers
    .map((washer) => {
      const rows = data.commissions.filter((row) => row.washer_id === washer.id)
      return { id: washer.id, name: washer.name, cars: rows.length, amount: rows.reduce((owed, row) => owed + row.commission_amount, 0) }
    })
    .filter((row) => row.cars > 0)

  const categoryNames = new Map(data.categories.map((category) => [category.id, category.name]))
  const recent = data.sales.slice(0, 5)

  return (
    <div className="space-y-5">
      <Link
        to="/new-sale"
        className="flex min-h-16 items-center justify-center gap-2 rounded-control bg-accent px-4 text-xl font-semibold text-surface hover:bg-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent-pressed lg:max-w-sm"
      >
        <CirclePlus size={24} strokeWidth={2} aria-hidden="true" />
        New sale
      </Link>

      <section aria-label="Sales today" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cars washed" value={data.counted.length} />
        <Stat label="Total sales" value={formatMoney(total)} />
        <Stat label="Cash" value={formatMoney(cash)} />
        <Stat label="MoMo" value={formatMoney(total - cash)} />
      </section>

      {isOwner && (
        <section aria-label="Money today" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Expenses" value={formatMoney(expensesTotal)} />
          <Stat
            label="Commission owed"
            value={formatMoney(commissionTotal)}
            note={awaitingCommission > 0 ? `${awaitingCommission} sale(s) not counted until synced` : undefined}
          />
          <div className="col-span-2 lg:col-span-1">
            <Stat
              label="Left after expenses and commission"
              value={formatMoney(total - expensesTotal - commissionTotal)}
              tone={total - expensesTotal - commissionTotal < 0 ? 'text-danger' : 'text-success'}
            />
          </div>
        </section>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="px-4 pt-4 text-lg text-text">By vehicle</h2>
          {byCategory.length === 0 ? (
            <p className="px-4 py-4 text-text-muted">No sales recorded today yet.</p>
          ) : (
            <table className="mt-2 w-full">
              <thead>
                <tr className="border-b border-border text-left text-sm text-text-muted">
                  <th scope="col" className="px-4 py-2 font-semibold">Vehicle</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Cars</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Sales</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-semibold text-text">{row.name}</td>
                    <td className="money px-4 py-3 text-right text-text">{row.cars}</td>
                    <td className="money px-4 py-3 text-right text-text">{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3 px-4 pt-4">
            <h2 className="text-lg text-text">Latest sales</h2>
            <Link to="/today" className="inline-flex items-center gap-1 font-semibold text-accent underline">
              See all <ArrowRight {...ICON} />
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="px-4 py-4 text-text-muted">No sales recorded today yet.</p>
          ) : (
            <ul className="mt-2">
              {recent.map((sale) => (
                <li key={sale.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-text">
                      {categoryNames.get(sale.category_id) ?? 'Vehicle'}
                      {sale.plate_number && <span className="font-normal text-text-muted"> · {sale.plate_number}</span>}
                    </p>
                    <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
                      {formatTime(sale.sold_at)} · {sale.payment_method === 'cash' ? 'Cash' : 'MoMo'}
                      {sale.sync_state === 'rejected' ? (
                        <Tag tone="danger">Not accepted</Tag>
                      ) : sale.status === 'voided' ? (
                        <Tag tone="danger">Voided</Tag>
                      ) : (
                        data.waiting.has(sale.id) && <Tag tone="warning">Waiting to sync</Tag>
                      )}
                    </p>
                  </div>
                  <p
                    className={`money shrink-0 font-semibold ${sale.status === 'voided' || sale.sync_state === 'rejected' ? 'text-text-muted line-through' : 'text-text'}`}
                  >
                    {formatMoney(sale.amount)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {isOwner && (
          <Card className="lg:col-span-2">
            <h2 className="px-4 pt-4 text-lg text-text">Washers today</h2>
            {byWasher.length === 0 ? (
              <p className="px-4 py-4 text-text-muted">No commission to show yet. It appears once today’s sales have synced.</p>
            ) : (
              <table className="mt-2 w-full">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-text-muted">
                    <th scope="col" className="px-4 py-2 font-semibold">Washer</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold">Cars</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold">Commission owed</th>
                  </tr>
                </thead>
                <tbody>
                  {byWasher.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-3 font-semibold text-text">{row.name}</td>
                      <td className="money px-4 py-3 text-right text-text">{row.cars}</td>
                      <td className="money px-4 py-3 text-right text-text">{formatMoney(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
