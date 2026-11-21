import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowUpRight,
  CalendarDays,
  CarFront,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Banknote,
  PiggyBank,
  Receipt,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext.tsx'
import { PeriodBars, PillBars, Ring } from '../components/charts.tsx'
import CornerArt from '../components/CornerArt.tsx'
import { ICON } from '../components/icon.ts'
import { useNewSale } from '../components/NewSale.tsx'
import { focusRing, hitArea } from '../components/styles.ts'
import { Tag } from '../components/ui.tsx'
import VoidRequests from '../components/VoidRequests.tsx'
import { db } from '../db/db.ts'
import type { Sale } from '../db/types.ts'
import { formatDateTime, formatMoney, formatTime } from '../lib/format.ts'
import {
  bucketKey,
  buckets,
  comparedWith,
  currentBucketKey,
  dayNumber,
  elapsedSpan,
  isoRange,
  monthLabel,
  percentChange,
  periodSpan,
  previousSpan,
  shiftAnchor,
  spanLabel,
  todayKey,
  weekdayLabel,
  type Period,
  type Span,
} from '../lib/periods.ts'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

const isPeriod = (value: string | null): value is Period => PERIODS.some((option) => option.value === value)

const sum = (rows: { amount: number }[]) => rows.reduce((total, row) => total + row.amount, 0)
const counts = (sale: Sale) => sale.status === 'active' && sale.sync_state !== 'rejected'

/** Whole cedis, short: 35,000 pesewas reads as "350", 120,000 as "1.2K". */
const shortCedis = (pesewas: number) => new Intl.NumberFormat('en-GH', { notation: 'compact', maximumFractionDigits: 1 }).format(pesewas / 100)

function salesIn(span: Span) {
  const { start, end } = isoRange(span)
  return db.sales.where('sold_at').between(start, end, true, false).toArray()
}

function expensesIn(span: Span) {
  const { start, end } = isoRange(span)
  return db.expenses.where('spent_at').between(start, end, true, false).toArray()
}

async function commissionFor(sales: Sale[]) {
  if (sales.length === 0) return []
  return db.sale_washers
    .where('sale_id')
    .anyOf(sales.map((sale) => sale.id))
    .toArray()
}

/**
 * The bay at a glance, read from the device so it works offline.
 *
 * The owner's device holds every day, so the owner can look at a day, week,
 * month or year, step back through earlier ones, and see each figure against
 * the same stretch of the period before. A cashier's device holds today
 * only, so a cashier sees today's sales.
 */
export default function DashboardPage() {
  const { account } = useAuth()
  const isOwner = account?.role === 'owner'
  const openNewSale = useNewSale()
  const [params, setParams] = useSearchParams()

  const today = todayKey()
  const askedDate = params.get('date')
  const period: Period = isOwner && isPeriod(params.get('period')) ? (params.get('period') as Period) : 'day'
  const anchor = isOwner && askedDate && /^\d{4}-\d{2}-\d{2}$/.test(askedDate) && askedDate <= today ? askedDate : today

  function choose(nextPeriod: Period, nextAnchor: string) {
    const next = new URLSearchParams()
    if (nextPeriod !== 'day') next.set('period', nextPeriod)
    if (nextAnchor !== today) next.set('date', nextAnchor)
    setParams(next, { replace: true })
  }

  const data = useLiveQuery(async () => {
    const span = periodSpan(period, anchor)
    const previous = previousSpan(period, elapsedSpan(period, anchor, today))
    const week = periodSpan('week', anchor)

    const [sales, expenses, previousSales, previousExpenses, weekSales, categories, washers, outbox] = await Promise.all([
      salesIn(span),
      expensesIn(span),
      salesIn(previous),
      expensesIn(previous),
      salesIn(week),
      db.vehicle_categories.orderBy('sort_order').toArray(),
      db.washers.toArray(),
      db.outbox.toArray(),
    ])

    const counted = sales.filter(counts)
    const previousCounted = previousSales.filter(counts)
    const [commissions, previousCommissions] = await Promise.all([commissionFor(counted), commissionFor(previousCounted)])

    return {
      sales: [...sales].sort((a, b) => b.sold_at.localeCompare(a.sold_at)),
      counted,
      expenses: expenses.filter((expense) => expense.sync_state !== 'rejected'),
      previousCounted,
      previousExpenses: previousExpenses.filter((expense) => expense.sync_state !== 'rejected'),
      commissions,
      previousCommissions,
      weekSales: weekSales.filter(counts),
      categories,
      washers,
      waiting: new Set(outbox.map((item) => item.record_id)),
    }
  }, [period, anchor, today])

  if (!data || !account) return null

  // ---- Headline figures, and the same figures for the stretch before.
  const total = sum(data.counted)
  const cash = sum(data.counted.filter((sale) => sale.payment_method === 'cash'))
  const expensesTotal = sum(data.expenses)
  const commissionTotal = data.commissions.reduce((owed, row) => owed + row.commission_amount, 0)
  const left = total - expensesTotal - commissionTotal

  const previousTotal = sum(data.previousCounted)
  const previousLeft =
    previousTotal - sum(data.previousExpenses) - data.previousCommissions.reduce((owed, row) => owed + row.commission_amount, 0)

  // The server works out commission, so sales still waiting to sync have none yet.
  const withCommission = new Set(data.commissions.map((row) => row.sale_id))
  const awaitingCommission = data.counted.filter((sale) => !withCommission.has(sale.id)).length

  const compared = comparedWith(period, anchor, today)
  const span = periodSpan(period, anchor)
  const isCurrent = span.first <= today && today <= span.last

  // ---- Chart: one bar per hour, day or month.
  const nowKey = isCurrent ? currentBucketKey(period) : null
  const totals = new Map<string, number>()
  for (const sale of data.counted) {
    const key = bucketKey(period, sale.sold_at)
    totals.set(key, (totals.get(key) ?? 0) + sale.amount)
  }
  let bars = buckets(period, anchor).map((bucket) => ({ ...bucket, value: totals.get(bucket.key) ?? 0, current: bucket.key === nowKey }))
  if (period === 'day') {
    // Opening hours, widened if a sale was recorded earlier or later.
    const busy = bars.filter((bar) => bar.value > 0).map((bar) => Number(bar.key))
    const from = Math.min(6, ...busy)
    const to = Math.max(21, ...busy)
    bars = bars.filter((bar) => Number(bar.key) >= from && Number(bar.key) <= to)
  }

  // ---- Week strip.
  const week = periodSpan('week', anchor)
  const weekDays = buckets('week', anchor).map((bucket) => bucket.key)
  const dayTotals = new Map<string, number>()
  for (const sale of data.weekSales) {
    const day = sale.sold_at.slice(0, 10)
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + sale.amount)
  }

  const byCategory = data.categories
    .map((category) => {
      const rows = data.counted.filter((sale) => sale.category_id === category.id)
      return { name: `${category.name} · ${rows.length}`, value: sum(rows), cars: rows.length }
    })
    .filter((row) => row.cars > 0)

  const byCrew = data.washers
    .map((member) => {
      const rows = data.commissions.filter((row) => row.washer_id === member.id)
      return { id: member.id, name: member.name, cars: rows.length, amount: rows.reduce((owed, row) => owed + row.commission_amount, 0) }
    })
    .filter((row) => row.cars > 0)
    .sort((a, b) => b.amount - a.amount)

  const categoryNames = new Map(data.categories.map((category) => [category.id, category.name]))
  const latest = data.sales.slice(0, 6)
  const periodWord = { day: 'day', week: 'week', month: 'month', year: 'year' }[period]
  const nothingYet = isCurrent ? `No sales recorded this ${periodWord} yet.` : `No sales recorded that ${periodWord}.`

  return (
    <div className="space-y-5">
      {/* Laptops have this button in the header instead. */}
      <button
        type="button"
        onClick={openNewSale}
        className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-pill bg-accent px-4 text-lg font-semibold text-surface hover:bg-accent-pressed active:bg-accent-pressed lg:hidden ${focusRing}`}
      >
        <CirclePlus {...ICON} />
        New sale
      </button>

      <VoidRequests />

      {isOwner && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <div role="group" aria-label="Period" className="grid grid-cols-4 gap-2 sm:flex">
            {PERIODS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={period === option.value}
                onClick={() => choose(option.value, anchor)}
                className={`min-h-10 rounded-pill border px-4 text-[0.9375rem] font-semibold ${hitArea} ${focusRing} ${
                  period === option.value ? 'border-accent bg-accent text-surface' : 'border-border bg-surface text-text hover:border-accent hover:bg-accent-tint'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-1 rounded-pill border border-border bg-surface p-0.5">
            <button
              type="button"
              aria-label={`Previous ${periodWord}`}
              onClick={() => choose(period, shiftAnchor(period, anchor, -1))}
              className={`inline-flex size-10 shrink-0 items-center justify-center rounded-pill text-text hover:bg-surface-alt ${hitArea} ${focusRing}`}
            >
              <ChevronLeft {...ICON} />
            </button>
            <p className="flex min-w-0 items-center gap-2 px-1 font-semibold text-text" aria-live="polite">
              <CalendarDays {...ICON} className="shrink-0 text-text-muted" />
              <span className="truncate">{spanLabel(period, anchor)}</span>
            </p>
            <button
              type="button"
              aria-label={`Next ${periodWord}`}
              disabled={shiftAnchor(period, anchor, 1) > today}
              onClick={() => choose(period, shiftAnchor(period, anchor, 1))}
              className={`inline-flex size-10 shrink-0 items-center justify-center rounded-pill text-text hover:bg-surface-alt ${hitArea} disabled:cursor-not-allowed disabled:text-border disabled:hover:bg-transparent ${focusRing}`}
            >
              <ChevronRight {...ICON} />
            </button>
          </div>

          {(anchor !== today || period !== 'day') && (
            <button type="button" onClick={() => choose('day', today)} className={`min-h-10 rounded-pill px-4 text-[0.9375rem] font-semibold text-accent hover:bg-accent-tint ${hitArea} ${focusRing}`}>
              Back to today
            </button>
          )}
        </div>
      )}

      <section aria-label="Headline figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <TrendTile
          strong
          className="col-span-2 sm:col-span-1"
          icon={Wallet}
          label={period === 'day' && anchor === today ? 'Total sales today' : 'Total sales'}
          value={formatMoney(total)}
          change={isOwner ? percentChange(total, previousTotal) : undefined}
          compared={compared}
        />
        <TrendTile
          colour="aqua"
          icon={CarFront}
          label="Vehicles washed"
          value={data.counted.length}
          change={isOwner ? percentChange(data.counted.length, data.previousCounted.length) : undefined}
          compared={compared}
        />
        {isOwner ? (
          <>
            <TrendTile
              colour="danger"
              icon={Receipt}
              label="Expenses"
              value={formatMoney(expensesTotal)}
              change={percentChange(expensesTotal, sum(data.previousExpenses))}
              compared={compared}
              goodWhenUp={false}
            />
            <TrendTile
              colour="success"
              className="col-span-2 sm:col-span-1"
              icon={PiggyBank}
              label="Left after expenses and crew pay"
              value={formatMoney(left)}
              valueTone={left < 0 ? 'text-danger' : 'text-text'}
              change={previousLeft > 0 ? percentChange(left, previousLeft) : null}
              compared={compared}
              note={awaitingCommission > 0 ? `${awaitingCommission} sale(s) have no crew pay until synced` : undefined}
            />
          </>
        ) : (
          <>
            <TrendTile colour="success" icon={Banknote} label="Cash" value={formatMoney(cash)} />
            <TrendTile className="col-span-2 sm:col-span-1" icon={Smartphone} label="MoMo" value={formatMoney(total - cash)} />
          </>
        )}
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Panel
          title="Sales"
          className="lg:col-span-2"
          action={
            isOwner ? (
              <RoundLink to="/reports" label="Open reports">
                <ArrowUpRight {...ICON} />
              </RoundLink>
            ) : undefined
          }
        >
          <PeriodBars rows={bars} label={`Sales for ${spanLabel(period, anchor)}`} />
          {nowKey && (
            <p className="mt-2 flex items-center gap-2 text-sm text-text-muted">
              <span className="inline-block h-3 w-5 rounded-pill border-2 border-accent bg-accent-tint" aria-hidden="true" />
              Striped: {period === 'day' ? 'this hour' : period === 'year' ? 'this month' : 'today'}, still filling up
            </p>
          )}
        </Panel>

        <div className="space-y-5">
          {isOwner && (
            <Panel title={monthLabel(anchor)} action={<span className="text-sm text-text-muted">Tap a day</span>}>
              <div className="grid grid-cols-7 gap-1" role="group" aria-label={`Week of ${spanLabel('week', week.first)}`}>
                {weekDays.map((day) => {
                  const selected = period === 'day' && day === anchor
                  const isToday = day === today
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={day > today}
                      aria-pressed={selected}
                      aria-label={`${weekdayLabel(day)} ${dayNumber(day)}: ${formatMoney(dayTotals.get(day) ?? 0)}`}
                      onClick={() => choose('day', day)}
                      className={`flex min-h-24 flex-col items-center justify-center gap-0.5 rounded-pill py-3 ${focusRing} disabled:cursor-not-allowed disabled:opacity-40 ${
                        selected ? 'bg-accent text-surface' : isToday ? 'text-text ring-2 ring-accent ring-inset' : 'text-text hover:bg-surface-alt'
                      }`}
                    >
                      <span className={`text-xs font-semibold ${selected ? 'text-surface/85' : 'text-text-muted'}`}>{weekdayLabel(day)}</span>
                      <span className="font-heading text-lg leading-tight font-bold">{dayNumber(day)}</span>
                      <span className={`money text-xs ${selected ? 'text-surface/85' : 'text-text-muted'}`}>
                        {day > today ? '' : shortCedis(dayTotals.get(day) ?? 0)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Panel>
          )}

          <Panel title="Cash and MoMo">
            <div className="flex items-center gap-5">
              <Ring parts={[{ name: 'Cash', value: cash }, { name: 'MoMo', value: total - cash }]} />
              <dl className="min-w-0 flex-1 space-y-3">
                {[
                  { name: 'Cash', value: cash, dot: 'bg-accent' },
                  { name: 'MoMo', value: total - cash, dot: 'bg-chart-2' },
                ].map((part) => (
                  <div key={part.name}>
                    <dt className="flex items-center gap-2 text-sm text-text-muted">
                      <span className={`size-3 rounded-pill ${part.dot}`} aria-hidden="true" />
                      {part.name}
                      {total > 0 && <span>· {Math.round((part.value / total) * 100)}%</span>}
                    </dt>
                    <dd className="money text-lg font-semibold text-text">{formatMoney(part.value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Panel>
        </div>

        <Panel title="Sales by vehicle" className={isOwner ? '' : 'lg:col-span-3'}>
          {byCategory.length === 0 ? (
            <p className="text-text-muted">{nothingYet}</p>
          ) : (
            <PillBars label="Sales by vehicle" rows={[...byCategory].sort((a, b) => b.value - a.value).map(({ name, value }) => ({ name, value }))} />
          )}
        </Panel>

        {isOwner && (
          <Panel
            title="Crew pay"
            className="lg:col-span-2"
            bodyClassName="pb-2"
            action={<span className="money font-heading text-lg font-bold text-text">{formatMoney(commissionTotal)}</span>}
          >
            {byCrew.length === 0 ? (
              <p className="px-5 pb-3 text-text-muted">No crew pay to show yet. It appears once the sales have synced.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-alt text-left text-sm text-text-muted">
                    <th scope="col" className="px-5 py-2 font-semibold">Name</th>
                    <th scope="col" className="px-5 py-2 text-right font-semibold">Washed</th>
                    <th scope="col" className="px-5 py-2 text-right font-semibold">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {byCrew.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-b-0">
                      <td className="px-5 py-3 font-semibold text-text">{row.name}</td>
                      <td className="money px-5 py-3 text-right text-text">{row.cars}</td>
                      <td className="money px-5 py-3 text-right font-semibold text-text">{formatMoney(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        )}

        <Panel
          title="Latest sales"
          className="lg:col-span-3"
          bodyClassName="pb-2"
          action={
            <RoundLink to="/today" label="See all of today’s sales">
              <ArrowUpRight {...ICON} />
            </RoundLink>
          }
        >
          {latest.length === 0 ? (
            <p className="px-5 pb-3 text-text-muted">{nothingYet}</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-surface-alt text-left text-sm text-text-muted">
                  <th scope="col" className="px-5 py-2 font-semibold">Vehicle</th>
                  <th scope="col" className="hidden px-3 py-2 font-semibold sm:table-cell">Plate</th>
                  <th scope="col" className="hidden px-3 py-2 font-semibold md:table-cell">{period === 'day' ? 'Time' : 'When'}</th>
                  <th scope="col" className="hidden px-3 py-2 font-semibold md:table-cell">Paid with</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Amount</th>
                  <th scope="col" className="hidden px-5 py-2 text-right font-semibold sm:table-cell">Status</th>
                </tr>
              </thead>
              <tbody>
                {latest.map((sale) => {
                  const crossed = sale.status === 'voided' || sale.sync_state === 'rejected'
                  const when = period === 'day' ? formatTime(sale.sold_at) : formatDateTime(sale.sold_at)
                  return (
                    <tr key={sale.id} className="border-b border-border last:border-b-0">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="hidden size-10 shrink-0 items-center justify-center rounded-pill bg-accent-tint text-accent sm:flex">
                            <CarFront {...ICON} />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-text">{categoryNames.get(sale.category_id) ?? 'Vehicle'}</p>
                            <p className="text-sm text-text-muted md:hidden">
                              {when} · {sale.payment_method === 'cash' ? 'Cash' : 'MoMo'}
                              <span className="sm:hidden">{sale.plate_number && <> · {sale.plate_number}</>}</span>
                            </p>
                            <span className="mt-1 block sm:hidden">
                              <SaleStatus sale={sale} waiting={data.waiting.has(sale.id)} />
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="money hidden px-3 py-3 text-text sm:table-cell">{sale.plate_number ?? <span className="text-text-muted">–</span>}</td>
                      <td className="hidden px-3 py-3 text-text md:table-cell">{when}</td>
                      <td className="hidden px-3 py-3 text-text md:table-cell">{sale.payment_method === 'cash' ? 'Cash' : 'MoMo'}</td>
                      <td className={`money px-3 py-3 text-right font-semibold ${crossed ? 'text-text-muted line-through' : 'text-text'}`}>
                        {formatMoney(sale.amount)}
                      </td>
                      <td className="hidden px-5 py-3 text-right sm:table-cell">
                        <SaleStatus sale={sale} waiting={data.waiting.has(sale.id)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  )
}

/** A white panel with rounded corners and its title on the panel itself. */
function Panel({
  title,
  action,
  className = '',
  bodyClassName = 'px-5 pb-5',
  children,
}: {
  title: string
  action?: ReactNode
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <section className={`overflow-clip rounded-panel border border-border bg-surface ${className}`}>
      <div className="flex min-h-16 items-center justify-between gap-3 px-5 pt-3 pb-2">
        <h2 className="text-lg text-text">{title}</h2>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

function RoundLink({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-pill border border-border text-text ${hitArea} hover:border-accent hover:bg-accent-tint hover:text-accent ${focusRing}`}
    >
      {children}
    </Link>
  )
}

function SaleStatus({ sale, waiting }: { sale: Sale; waiting: boolean }) {
  if (sale.sync_state === 'rejected') return <Tag tone="danger">Not accepted</Tag>
  if (sale.status === 'voided') return <Tag tone="danger">Voided</Tag>
  if (waiting) return <Tag tone="warning">Waiting to sync</Tag>
  return <Tag tone="success">Synced</Tag>
}

const tileColours = {
  accent: 'bg-accent-tint text-accent',
  aqua: 'bg-aqua-tint text-aqua',
  success: 'bg-success-tint text-success',
  danger: 'bg-danger-tint text-danger',
} as const

/**
 * One headline number with how it moved against the period before.
 * `strong` fills the tile solid blue: the figure that matters most.
 */
function TrendTile({
  icon: Icon,
  label,
  value,
  change,
  compared,
  goodWhenUp = true,
  strong = false,
  colour = 'accent',
  valueTone = 'text-text',
  note,
  className = '',
}: {
  className?: string
  icon: LucideIcon
  label: string
  value: ReactNode
  /** Percentage change; null when there is nothing to compare with; leave out to show no trend. */
  change?: number | null
  compared?: string
  /** Expenses going up is bad news, so it is shown in red. */
  goodWhenUp?: boolean
  strong?: boolean
  colour?: keyof typeof tileColours
  valueTone?: string
  note?: string
}) {
  const rounded = change == null ? 0 : Math.round(change * 10) / 10
  const good = goodWhenUp ? rounded > 0 : rounded < 0
  const chip =
    rounded === 0
      ? strong
        ? 'bg-surface/15 text-surface'
        : 'bg-surface-alt text-text-muted'
      : strong
        ? 'bg-surface text-accent'
        : good
          ? 'bg-success-tint text-success'
          : 'bg-danger-tint text-danger'

  return (
    <div
      className={`relative flex min-h-32 flex-col justify-between gap-3 overflow-hidden rounded-panel border px-4 py-4 sm:min-h-36 sm:px-5 ${className} ${
        strong ? 'border-accent bg-accent text-surface' : 'border-border bg-surface'
      }`}
    >
      {strong && <CornerArt kind="rings" corner="top-right" size={200} tone="text-surface/15" />}

      <div className="relative flex items-start justify-between gap-3">
        <p className={`pt-1 font-semibold ${strong ? 'text-surface/85' : 'text-text-muted'}`}>{label}</p>
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-pill ${strong ? 'bg-surface text-accent' : tileColours[colour]}`}
        >
          <Icon size={20} strokeWidth={2} aria-hidden="true" />
        </span>
      </div>

      <div className="relative">
        <p className={`money font-heading text-2xl leading-tight font-bold sm:text-3xl ${strong ? 'text-surface' : valueTone}`}>{value}</p>

        {change !== undefined && (
          <p className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${strong ? 'text-surface/85' : 'text-text-muted'}`}>
            {change === null ? (
              <span>Nothing {compared} to compare</span>
            ) : (
              <>
                <span className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 font-semibold ${chip}`}>
                  {rounded > 0 ? (
                    <TrendingUp size={16} strokeWidth={2} aria-hidden="true" />
                  ) : rounded < 0 ? (
                    <TrendingDown size={16} strokeWidth={2} aria-hidden="true" />
                  ) : null}
                  <span className="money">
                    {rounded > 0 ? 'Up ' : rounded < 0 ? 'Down ' : ''}
                    {rounded === 0 ? 'No change' : `${Math.abs(rounded)}%`}
                  </span>
                </span>
                <span>vs {compared}</span>
              </>
            )}
          </p>
        )}

        {note && <p className={`mt-1 text-sm ${strong ? 'text-surface/85' : 'text-text-muted'}`}>{note}</p>}
      </div>
    </div>
  )
}
