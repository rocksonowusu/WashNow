import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db.ts'
import { formatMoney, formatTime, todayRange } from '../lib/format.ts'
import { Card, Tag } from './ui.tsx'

/**
 * Today's totals and list, read from the device. A sale appears here the
 * moment it is saved, with a tag until the server has confirmed it.
 */
export default function TodaySales() {
  const data = useLiveQuery(async () => {
    const { start, end } = todayRange()

    const [sales, categories, outbox] = await Promise.all([
      db.sales.where('sold_at').between(start, end, true, false).reverse().sortBy('sold_at'),
      db.vehicle_categories.toArray(),
      db.outbox.toArray(),
    ])

    return {
      sales,
      categoryNames: new Map(categories.map((category) => [category.id, category.name])),
      waiting: new Set(outbox.map((item) => item.record_id)),
    }
  }, [])

  if (!data) return null

  // Voided and refused sales stay in the list but never count.
  const counted = data.sales.filter((sale) => sale.status === 'active' && sale.sync_state !== 'rejected')
  const total = counted.reduce((sum, sale) => sum + sale.amount, 0)
  const cash = counted.filter((sale) => sale.payment_method === 'cash').reduce((sum, sale) => sum + sale.amount, 0)

  return (
    <Card>
      {/* Four across only when this card itself is wide, not just the screen. */}
      <div className="@container px-4 py-4">
        <h2 className="text-lg text-text">Today</h2>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 @xl:grid-cols-4">
          <div>
            <dt className="text-sm text-text-muted">Cars washed</dt>
            <dd className="money font-heading text-2xl font-bold text-text">{counted.length}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Total sales</dt>
            <dd className="money font-heading text-2xl font-bold text-text">{formatMoney(total)}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Cash</dt>
            <dd className="money text-lg font-semibold text-text">{formatMoney(cash)}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">MoMo</dt>
            <dd className="money text-lg font-semibold text-text">{formatMoney(total - cash)}</dd>
          </div>
        </dl>
      </div>

      {data.sales.length === 0 ? (
        <p className="border-t border-border px-4 py-4 text-text-muted">No sales recorded today yet.</p>
      ) : (
        <ul className="border-t border-border">
          {data.sales.map((sale) => (
            <li key={sale.id} className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
              <div className="min-w-0">
                <p className="font-semibold text-text">
                  {data.categoryNames.get(sale.category_id) ?? 'Vehicle'}
                  {sale.plate_number && <span className="font-normal text-text-muted"> · {sale.plate_number}</span>}
                </p>
                <p className="text-sm text-text-muted">
                  {formatTime(sale.sold_at)} · {sale.payment_method === 'cash' ? 'Cash' : 'MoMo'}
                </p>
                <div className="mt-1 flex flex-wrap gap-1 empty:hidden">
                  {sale.sync_state === 'rejected' ? (
                    <Tag tone="danger">Not accepted</Tag>
                  ) : (
                    data.waiting.has(sale.id) && <Tag tone="warning">Waiting to sync</Tag>
                  )}
                  {sale.status === 'voided' && <Tag tone="danger">Voided</Tag>}
                </div>
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
  )
}
