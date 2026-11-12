import { Banknote, CarFront, FileSpreadsheet, FileText, HandCoins, PiggyBank, Receipt, Smartphone, Wallet, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { DailyBars, HorizontalBars } from '../components/charts.tsx'
import { ICON } from '../components/icon.ts'
import { inputClass, tableHead } from '../components/styles.ts'
import { Button, Card, Choice, StatTile } from '../components/ui.tsx'
import { api, ApiError, downloadFile, NetworkError } from '../lib/api.ts'
import { formatMoney } from '../lib/format.ts'
import { useOnline } from '../lib/useOnline.ts'

type Report = {
  from: string
  to: string
  totals: { vehicles: number; sales: number; cash: number; momo: number; expenses: number; commission: number; net: number; voided: number }
  daily: { date: string; vehicles: number; sales: number; expenses: number }[]
  by_vehicle: { category_id: string; name: string; vehicles: number; amount: number }[]
  by_crew: { washer_id: string; name: string; vehicles: number; commission: number }[]
  expenses_by_category: { category: string; amount: number }[]
  top_customers: { customer_id: string; plate_number: string; name: string | null; visits: number; spent: number }[]
}

type Range = { from: string; to: string }

// Ghana is on UTC all year, so the bay's dates are UTC dates.
const iso = (date: Date) => date.toISOString().slice(0, 10)
const daysAgo = (days: number) => iso(new Date(Date.now() - days * 24 * 60 * 60 * 1000))

function presets(): { label: string; range: Range }[] {
  const now = new Date()
  const monthStart = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
  const lastMonthStart = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))
  const lastMonthEnd = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)))

  return [
    { label: 'Today', range: { from: daysAgo(0), to: daysAgo(0) } },
    { label: 'Yesterday', range: { from: daysAgo(1), to: daysAgo(1) } },
    { label: 'Last 7 days', range: { from: daysAgo(6), to: daysAgo(0) } },
    { label: 'This month', range: { from: monthStart, to: daysAgo(0) } },
    { label: 'Last month', range: { from: lastMonthStart, to: lastMonthEnd } },
  ]
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Owner only. Figures for any run of days, worked out by the server from
 * everything every device has synced, so this screen needs internet.
 */
export default function ReportsPage() {
  const { account } = useAuth()
  const online = useOnline()

  const [range, setRange] = useState<Range>(() => presets()[2].range)
  const [state, setState] = useState<{ key: string; report: Report | null; error: string | null }>({ key: '', report: null, error: null })
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const token = account?.token ?? null
  const key = `${range.from}:${range.to}`
  const valid = range.from !== '' && range.to !== '' && range.from <= range.to

  useEffect(() => {
    if (!token || !valid || !online) return

    let cancelled = false
    api<{ data: Report }>(`/reports/summary?from=${range.from}&to=${range.to}`, { token })
      .then((reply) => {
        if (!cancelled) setState({ key, report: reply.data, error: null })
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        const error =
          caught instanceof NetworkError
            ? 'Could not reach the server. Reports need internet.'
            : caught instanceof ApiError
              ? (caught.errors.to?.[0] ?? caught.errors.from?.[0] ?? caught.message)
              : 'The report could not be loaded.'
        setState({ key, report: null, error })
      })

    return () => {
      cancelled = true
    }
  }, [token, valid, online, key, range.from, range.to])

  const loading = online && valid && state.key !== key
  const report = state.key === key ? state.report : null
  const error = !valid ? 'The end date cannot be before the start date.' : state.key === key ? state.error : null

  async function exportAs(format: 'xlsx' | 'pdf') {
    setExporting(format)
    setExportError(null)
    try {
      const name = range.from === range.to ? range.from : `${range.from}-to-${range.to}`
      await downloadFile(`/reports/export?from=${range.from}&to=${range.to}&format=${format}`, token, `washnow-report-${name}.${format}`)
    } catch (caught) {
      setExportError(caught instanceof NetworkError ? 'Could not reach the server. Try again when online.' : 'The file could not be made. Try again.')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-5">
      <Card title="Period">
        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-wrap gap-2">
            {presets().map((preset) => (
              <Choice
                key={preset.label}
                chosen={preset.range.from === range.from && preset.range.to === range.to}
                onClick={() => setRange(preset.range)}
              >
                {preset.label}
              </Choice>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="report-from" className="mb-1 block text-sm font-semibold text-text">From</label>
              <input id="report-from" type="date" value={range.from} max={range.to} onChange={(event) => setRange({ ...range, from: event.target.value })} className={`${inputClass} border-border`} />
            </div>
            <div>
              <label htmlFor="report-to" className="mb-1 block text-sm font-semibold text-text">To</label>
              <input id="report-to" type="date" value={range.to} min={range.from} max={daysAgo(0)} onChange={(event) => setRange({ ...range, to: event.target.value })} className={`${inputClass} border-border`} />
            </div>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button variant="secondary" icon={<FileSpreadsheet {...ICON} />} busy={exporting === 'xlsx'} disabled={!online || !valid || exporting !== null} onClick={() => void exportAs('xlsx')}>
                Excel
              </Button>
              <Button variant="secondary" icon={<FileText {...ICON} />} busy={exporting === 'pdf'} disabled={!online || !valid || exporting !== null} onClick={() => void exportAs('pdf')}>
                PDF
              </Button>
            </div>
          </div>

          {exportError && <p className="text-sm text-danger">{exportError}</p>}
        </div>
      </Card>

      {!online && (
        <p className="flex items-start gap-2 rounded-control bg-warning px-3 py-3 font-semibold text-text">
          <WifiOff {...ICON} className="mt-0.5 shrink-0" />
          You are offline. Reports are worked out by the server, so they need internet. Today’s figures are on the Dashboard.
        </p>
      )}

      {error && online && <p className="rounded-control bg-danger px-3 py-3 font-semibold text-surface">{error}</p>}
      {loading && <p className="text-text-muted">Working out the report…</p>}

      {report && <ReportBody report={report} />}
    </div>
  )
}

function ReportBody({ report }: { report: Report }) {
  const { totals } = report

  return (
    <>
      <section aria-label="Totals" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile strong icon={Wallet} label="Total sales" value={formatMoney(totals.sales)} />
        <StatTile colour="aqua" icon={CarFront} label="Vehicles washed" value={totals.vehicles} note={totals.voided > 0 ? `${totals.voided} voided, not counted` : undefined} />
        <StatTile colour="success" icon={Banknote} label="Cash" value={formatMoney(totals.cash)} />
        <StatTile icon={Smartphone} label="MoMo" value={formatMoney(totals.momo)} />
        <StatTile colour="danger" icon={Receipt} label="Expenses" value={formatMoney(totals.expenses)} />
        <StatTile colour="aqua" icon={HandCoins} label="Crew commission" value={formatMoney(totals.commission)} />
        <div className="sm:col-span-2">
          <StatTile
            colour="success"
            icon={PiggyBank}
            label="Left after expenses and commission"
            value={formatMoney(totals.net)}
            valueTone={totals.net < 0 ? 'text-danger' : 'text-success'}
          />
        </div>
      </section>

      {report.daily.length > 1 && (
        <Card title="Sales and expenses by day">
          <div className="px-4 py-4">
            <DailyBars days={report.daily} />
          </div>
        </Card>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card title="Crew pay sheet">
          {report.by_crew.length === 0 ? (
            <p className="px-4 py-4 text-text-muted">No commission in this period.</p>
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
                {report.by_crew.map((row) => (
                  <tr key={row.washer_id} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold text-text">{row.name}</td>
                    <td className="money px-4 py-3 text-right text-text">{row.vehicles}</td>
                    <td className="money px-4 py-3 text-right font-semibold text-text">{formatMoney(row.commission)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-surface-alt">
                  <td className="px-4 py-3 font-semibold text-text" colSpan={2}>Total to pay</td>
                  <td className="money px-4 py-3 text-right font-semibold text-text">{formatMoney(totals.commission)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Sales by vehicle">
          {report.by_vehicle.length === 0 ? (
            <p className="px-4 py-4 text-text-muted">No sales in this period.</p>
          ) : (
            <div className="px-2 py-3">
              <HorizontalBars label="Sales" rows={report.by_vehicle.map((row) => ({ name: `${row.name} (${row.vehicles})`, value: row.amount }))} />
            </div>
          )}
        </Card>

        <Card title="Expenses">
          {report.expenses_by_category.length === 0 ? (
            <p className="px-4 py-4 text-text-muted">No expenses in this period.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className={tableHead}>
                  <th scope="col" className="px-4 py-2 font-semibold">Spent on</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.expenses_by_category.map((row) => (
                  <tr key={row.category} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold text-text">{capital(row.category)}</td>
                    <td className="money px-4 py-3 text-right font-semibold text-text">{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Top customers">
          {report.top_customers.length === 0 ? (
            <p className="px-4 py-4 text-text-muted">No sales to saved customers in this period.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className={tableHead}>
                  <th scope="col" className="px-4 py-2 font-semibold">Customer</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Visits</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Spent</th>
                </tr>
              </thead>
              <tbody>
                {report.top_customers.map((row) => (
                  <tr key={row.customer_id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <span className="money block font-semibold text-text">{row.plate_number}</span>
                      {row.name && <span className="block text-sm text-text-muted">{row.name}</span>}
                    </td>
                    <td className="money px-4 py-3 text-right text-text">{row.visits}</td>
                    <td className="money px-4 py-3 text-right font-semibold text-text">{formatMoney(row.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  )
}
