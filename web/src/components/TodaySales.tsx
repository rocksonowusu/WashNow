import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../auth/AuthContext.tsx'
import { db } from '../db/db.ts'
import { formatMoney, todayRange } from '../lib/format.ts'
import { useLookups } from '../lib/useLookups.ts'
import CornerArt from './CornerArt.tsx'
import SaleRow from './SaleRow.tsx'
import { Card } from './ui.tsx'

/**
 * Today's totals and list, read from the device. A sale appears here the
 * moment it is saved, with a tag until the server has confirmed it. Tap a
 * sale for its details and void actions.
 */
export default function TodaySales() {
  const { account } = useAuth()
  const lookups = useLookups()

  const sales = useLiveQuery(() => {
    const { start, end } = todayRange()
    return db.sales.where('sold_at').between(start, end, true, false).reverse().sortBy('sold_at')
  }, [])

  if (!sales || !lookups || !account) return null

  // Voided and refused sales stay in the list but never count.
  const counted = sales.filter((sale) => sale.status === 'active' && sale.sync_state !== 'rejected')
  const total = counted.reduce((sum, sale) => sum + sale.amount, 0)
  const cash = counted.filter((sale) => sale.payment_method === 'cash').reduce((sum, sale) => sum + sale.amount, 0)

  return (
    <Card title="Today’s sales">
      {/* Four across only when this card itself is wide, not just the screen. */}
      <div className="@container relative overflow-hidden bg-accent px-4 py-4 text-surface">
        <CornerArt kind="rings" corner="top-right" size={220} tone="text-surface/15" />
        <dl className="relative grid grid-cols-2 gap-x-4 gap-y-3 @xl:grid-cols-4">
          <div>
            <dt className="text-sm font-semibold text-surface/85">Total sales</dt>
            <dd className="money font-heading text-2xl font-bold">{formatMoney(total)}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-surface/85">Vehicles washed</dt>
            <dd className="money font-heading text-2xl font-bold">{counted.length}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-surface/85">Cash</dt>
            <dd className="money text-lg font-semibold">{formatMoney(cash)}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-surface/85">MoMo</dt>
            <dd className="money text-lg font-semibold">{formatMoney(total - cash)}</dd>
          </div>
        </dl>
      </div>

      {sales.length === 0 ? (
        <p className="px-4 py-4 text-text-muted">No sales recorded today yet.</p>
      ) : (
        <ul>
          {sales.map((sale) => (
            <SaleRow key={sale.id} sale={sale} lookups={lookups} account={account} />
          ))}
        </ul>
      )}
    </Card>
  )
}
