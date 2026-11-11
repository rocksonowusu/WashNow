import { useAuth } from '../auth/AuthContext.tsx'
import { useLookups } from '../lib/useLookups.ts'
import { usePendingVoidRequests } from '../lib/usePendingVoidRequests.ts'
import SaleRow from './SaleRow.tsx'
import { Card } from './ui.tsx'

/**
 * Owner only: every void request waiting for an answer, whatever day the
 * sale was made. Renders nothing when there are none.
 */
export default function VoidRequests() {
  const { account } = useAuth()
  const lookups = useLookups()
  const pending = usePendingVoidRequests()

  if (!account || account.role !== 'owner' || !lookups || !pending || pending.length === 0) return null

  return (
    <Card title={pending.length === 1 ? '1 void request to answer' : `${pending.length} void requests to answer`}>
      <ul>
        {pending.map((sale) => (
          <SaleRow key={sale.id} sale={sale} lookups={lookups} account={account} startOpen />
        ))}
      </ul>
    </Card>
  )
}
