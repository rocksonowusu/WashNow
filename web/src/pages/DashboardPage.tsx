import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Banknote, CarFront, CirclePlus, HandCoins, PiggyBank, Receipt, Smartphone, Wallet } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext.tsx'
import { HorizontalBars, SplitBar } from '../components/charts.tsx'
import { ICON } from '../components/icon.ts'
import { tableHead } from '../components/styles.ts'
import { Card, StatTile, Tag } from '../components/ui.tsx'
import VoidRequests from '../components/VoidRequests.tsx'
import { db } from '../db/db.ts'
import { formatMoney, formatTime, todayRange } from '../lib/format.ts'

/**
 * Today at a glance, read from the device so it works offline. Everyone sees
 * the sales figures; expenses, commission and what is left are for the owner.
 */
export default function DashboardPage() {
  const { account } = useAuth()
  const isOwner = account?.role === 'owner'

  const data = useLiveQuery(async () => {
    const { start, end } = todayRange()
    const yesterday = todayRange(new Date(Date.now() - 24 * 60 * 60 * 1000))

    const [sales, yesterdaySales, expenses, categories, washers, outbox] = await Promise.all([
      db.sales.where('sold_at').between(start, end, true, false).reverse().sortBy('sold_at'),
      db.sales.where('sold_at').between(yesterday.start, yesterday.end, true, false).toArray(),
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

    const yesterdayTotal = yesterdaySales
      .filter((sale) => sale.status === 'active' && sale.sync_state !== 'rejected')
      .reduce((sum, sale) => sum + sale.amount, 0)

    return { sales, counted, yesterdayTotal, expenses, categories, washers, commissions, waiting: new Set(outbox.map((item) => item.record_id)) }
  }, [])

  if (!data) return null

  const sum = (rows: { amount: number }[]) => rows.reduce((total, row) => total + row.amount, 0)

  const total = sum(data.counted)
  const cash = sum(data.counted.filter((sale) => sale.payment_method === 'cash'))
  const expensesTotal = sum(data.expenses.filter((expense) => expense.sync_state !== 'rejected'))
  const commissionTotal = data.commissions.reduce((owed, row) => owed + row.commission_amount, 0)
  const left = total - expensesTotal - commissionTotal

  // The server works out commission, so sales still waiting to sync have none yet.
  const withCommission = new Set(data.commissions.map((row) => row.sale_id))
  const awaitingCommission = data.counted.filter((sale) => !withCommission.has(sale.id)).length

  const byCategory = data.categories
    .map((category) => {
      const rows = data.counted.filter((sale) => sale.category_id === category.id)
      return { id: category.id, name: category.name, cars: rows.length, amount: sum(rows) }
    })
    .filter((row) => row.cars > 0)

  const byCrew = data.washers
    .map((member) => {
      const rows = data.commissions.filter((row) => row.washer_id === member.id)
      return { id: member.id, name: member.name, cars: rows.length, amount: rows.reduce((owed, row) => owed + row.commission_amount, 0) }
    })
    .filter((row) => row.cars > 0)

  const categoryNames = new Map(data.categories.map((category) => [category.id, category.name]))
  const recent = data.sales.slice(0, 5)

  // Cashier devices only hold today, so only the owner gets a comparison.
  const change = total - data.yesterdayTotal
  const versusYesterday = !isOwner
    ? undefined
    : change === 0
      ? `Same as yesterday (${formatMoney(data.yesterdayTotal)})`
      : `${change > 0 ? 'Up' : 'Down'} ${formatMoney(Math.abs(change))} on yesterday (${formatMoney(data.yesterdayTotal)})`

  return (
    <div className="space-y-5">
      <Link
        to="/new-sale"
        className="flex min-h-16 items-center justify-center gap-2 rounded-control bg-accent px-4 text-xl font-semibold text-surface hover:bg-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent-pressed lg:hidden"
      >
        <CirclePlus size={24} strokeWidth={2} aria-hidden="true" />
        New sale
      </Link>

      <VoidRequests />

      <section aria-label="Sales today" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile strong icon={Wallet} label="Total sales today" value={formatMoney(total)} note={versusYesterday} />
        <StatTile colour="aqua" icon={CarFront} label="Vehicles washed" value={data.counted.length} />
        <StatTile colour="success" icon={Banknote} label="Cash" value={formatMoney(cash)} />
        <StatTile icon={Smartphone} label="MoMo" value={formatMoney(total - cash)} />
      </section>

      {isOwner && (
        <section aria-label="Money today" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile colour="danger" icon={Receipt} label="Expenses" value={formatMoney(expensesTotal)} />
          <StatTile
            colour="aqua"
            icon={HandCoins}
            label="Crew commission owed"
            value={formatMoney(commissionTotal)}
            note={awaitingCommission > 0 ? `${awaitingCommission} sale(s) not counted until synced` : undefined}
          />
          <div className="sm:col-span-2 xl:col-span-1">
            <StatTile
              colour="success"
              icon={PiggyBank}
              label="Left after expenses and commission"
              value={formatMoney(left)}
              valueTone={left < 0 ? 'text-danger' : 'text-success'}
            />
          </div>
        </section>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card title="Sales by vehicle">
          {byCategory.length === 0 ? (
            <p className="px-4 py-4 text-text-muted">No sales recorded today yet.</p>
          ) : (
            <div className="px-2 py-3">
              <HorizontalBars label="Sales" rows={byCategory.map((row) => ({ name: `${row.name} (${row.cars})`, value: row.amount }))} />
            </div>
          )}
          {total > 0 && (
            <div className="border-t border-border px-4 py-4">
              <p className="mb-2 text-sm font-semibold text-text">Cash and MoMo</p>
              <SplitBar parts={[{ name: 'Cash', value: cash }, { name: 'MoMo', value: total - cash }]} />
            </div>
          )}
        </Card>

        <Card
          title="Latest sales"
          action={
            <Link to="/today" className="inline-flex items-center gap-1 font-semibold text-accent underline">
              See all <ArrowRight {...ICON} />
            </Link>
          }
        >
          {recent.length === 0 ? (
            <p className="px-4 py-4 text-text-muted">No sales recorded today yet.</p>
          ) : (
            <ul>
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
          <Card title="Crew today" className="lg:col-span-2">
            {byCrew.length === 0 ? (
              <p className="px-4 py-4 text-text-muted">No commission to show yet. It appears once today’s sales have synced.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className={tableHead}>
                    <th scope="col" className="px-4 py-2 font-semibold">Name</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold">Washed</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold">Commission owed</th>
                  </tr>
                </thead>
                <tbody>
                  {byCrew.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold text-text">{row.name}</td>
                      <td className="money px-4 py-3 text-right text-text">{row.cars}</td>
                      <td className="money px-4 py-3 text-right font-semibold text-text">{formatMoney(row.amount)}</td>
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
