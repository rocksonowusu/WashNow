import { useLiveQuery } from 'dexie-react-hooks'
import { Check } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.tsx'
import { db } from '../db/db.ts'
import type { SyncIssue } from '../db/types.ts'
import { formatDateTime, formatMoney } from '../lib/format.ts'
import { useLookups, type Lookups } from '../lib/useLookups.ts'
import { ICON } from './icon.ts'
import { Button, Card, Tag } from './ui.tsx'

const REASONS: Record<string, string> = {
  invalid: 'Not valid',
  day_closed: 'Day already closed',
  forbidden: 'Not allowed',
  stale: 'Changed elsewhere first',
  voided: 'Sale was voided',
  deleted: 'Removed elsewhere',
  duplicate_plate: 'Customer already saved',
  duplicate_name: 'Crew member already saved',
}

const TABLES: Record<string, string> = {
  sales: 'Sale',
  expenses: 'Expense',
  customers: 'Customer',
  washers: 'Crew member',
  vehicle_categories: 'Vehicle type',
}

/** A short description of the refused record, from what the device tried to send. */
function describe(issue: SyncIssue, lookups: Lookups): string {
  const record = issue.record as Record<string, unknown>
  const parts: string[] = []

  if (typeof record.amount === 'number') parts.push(formatMoney(record.amount))
  if (typeof record.category_id === 'string') parts.push(lookups.categoryNames.get(record.category_id) ?? 'Vehicle')
  if (typeof record.category === 'string') parts.push(record.category)
  if (typeof record.plate_number === 'string' && record.plate_number) parts.push(record.plate_number)
  if (typeof record.name === 'string' && record.name) parts.push(record.name)
  if (typeof record.sold_at === 'string') parts.push(formatDateTime(record.sold_at))
  if (typeof record.spent_at === 'string') parts.push(formatDateTime(record.spent_at))

  return parts.join(' · ')
}

/**
 * Records this device sent that the server refused. They are listed until
 * the owner has looked at each one and marked it dealt with. Renders nothing
 * when there are none.
 */
export default function NeedsReview() {
  const { account } = useAuth()
  const lookups = useLookups()
  const issues = useLiveQuery(() => db.sync_issues.orderBy('seq').reverse().toArray(), [])

  if (!account || !lookups || !issues || issues.length === 0) return null

  const isOwner = account.role === 'owner'

  return (
    <Card title={issues.length === 1 ? '1 record needs review' : `${issues.length} records need review`}>
      <p className="border-b border-border px-4 py-3 text-text-muted">
        The server did not accept these. They are not in the bay’s totals.
        {isOwner ? ' Record them again correctly if needed, then mark each as dealt with.' : ' Tell the owner.'}
      </p>
      <ul>
        {issues.map((issue) => (
          <li key={issue.seq} className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-text">
                {TABLES[issue.table] ?? issue.table}
                <Tag tone="danger">{REASONS[issue.reason] ?? issue.reason}</Tag>
              </p>
              {describe(issue, lookups) && <p className="money text-text">{describe(issue, lookups)}</p>}
              <p className="text-sm text-text-muted">{issue.message}</p>
              <p className="text-sm text-text-muted">
                Recorded by {lookups.userNames.get(issue.user_id) ?? 'someone'} · refused {formatDateTime(issue.at)}
              </p>
            </div>
            {isOwner && (
              <Button variant="secondary" icon={<Check {...ICON} />} onClick={() => void db.sync_issues.delete(issue.seq!)}>
                Dealt with
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
