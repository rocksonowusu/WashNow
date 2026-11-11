import { useLiveQuery } from 'dexie-react-hooks'
import { Ban, ChevronDown, ChevronUp, Hand, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { db } from '../db/db.ts'
import { declineVoidRequest, LocalValidationError, requestVoid, voidSale } from '../db/repositories.ts'
import type { Account, Sale } from '../db/types.ts'
import { formatMoney, formatTime } from '../lib/format.ts'
import type { Lookups } from '../lib/useLookups.ts'
import { ICON } from './icon.ts'
import { focusRing } from './styles.ts'
import { Button, Field, Tag } from './ui.tsx'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-text">{children}</dd>
    </div>
  )
}

/**
 * One sale in a list. Tap it to see the details and, depending on who is
 * signed in, ask for a void (cashier) or void and answer requests (owner).
 */
export default function SaleRow({ sale, lookups, account, startOpen = false }: { sale: Sale; lookups: Lookups; account: Account; startOpen?: boolean }) {
  const isOwner = account.role === 'owner'

  const [open, setOpen] = useState(startOpen)
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Commission rows arrive from the server; a sale not synced yet only knows its crew ids.
  const shares = useLiveQuery(() => (open ? db.sale_washers.where('sale_id').equals(sale.id).toArray() : []), [open, sale.id])

  const voided = sale.status === 'voided'
  const refused = sale.sync_state === 'rejected'
  const requested = Boolean(sale.void_requested_at) && !voided
  const crewIds = shares && shares.length > 0 ? shares.map((share) => share.washer_id) : (sale.washer_ids ?? [])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setAsking(false)
      setReason('')
    } catch (caught) {
      setError(caught instanceof LocalValidationError ? caught.message : 'That did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`flex min-h-16 w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-surface-alt ${focusRing}`}
      >
        <span className="min-w-0">
          <span className="block font-semibold text-text">
            {lookups.categoryNames.get(sale.category_id) ?? 'Vehicle'}
            {sale.plate_number && <span className="font-normal text-text-muted"> · {sale.plate_number}</span>}
          </span>
          <span className="block text-sm text-text-muted">
            {formatTime(sale.sold_at)} · {sale.payment_method === 'cash' ? 'Cash' : 'MoMo'}
          </span>
          <span className="mt-1 flex flex-wrap gap-1 empty:hidden">
            {refused ? <Tag tone="danger">Not accepted</Tag> : lookups.waiting.has(sale.id) && <Tag tone="warning">Waiting to sync</Tag>}
            {voided && <Tag tone="danger">Voided</Tag>}
            {requested && <Tag tone="warning">Void requested</Tag>}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <span className={`money font-semibold ${voided || refused ? 'text-text-muted line-through' : 'text-text'}`}>
            {formatMoney(sale.amount)}
          </span>
          {open ? <ChevronUp {...ICON} className="text-text-muted" /> : <ChevronDown {...ICON} className="text-text-muted" />}
        </span>
      </button>

      {open && (
        <div className="space-y-4 bg-surface-alt px-4 py-4">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Detail label="Washed by">
              {crewIds.length === 0
                ? 'Not recorded'
                : crewIds
                    .map((id) => {
                      const share = shares?.find((row) => row.washer_id === id)
                      const name = lookups.crewNames.get(id) ?? 'Former crew member'
                      return isOwner && share ? `${name} (${formatMoney(share.commission_amount)})` : name
                    })
                    .join(', ')}
            </Detail>
            <Detail label="Recorded by">{lookups.userNames.get(sale.recorded_by) ?? 'Someone else'}</Detail>
            {sale.service_note && <Detail label="What was washed">{sale.service_note}</Detail>}
            {sale.override_reason && <Detail label="Price outside the range because">{sale.override_reason}</Detail>}
            {voided && <Detail label="Voided because">{sale.void_reason ?? 'No reason recorded'}</Detail>}
            {sale.void_request_reason && (
              <Detail label={voided ? 'Void was asked for by' : 'Void asked for by'}>
                {lookups.userNames.get(sale.void_requested_by ?? '') ?? 'A cashier'}: {sale.void_request_reason}
              </Detail>
            )}
          </dl>

          {!voided && !refused && !asking && (
            <div className="flex flex-wrap gap-2">
              {isOwner ? (
                <>
                  <Button
                    variant="danger"
                    icon={<Ban {...ICON} />}
                    onClick={() => {
                      setReason(sale.void_request_reason ?? '')
                      setAsking(true)
                    }}
                  >
                    {requested ? 'Approve and void' : 'Void this sale'}
                  </Button>
                  {requested && (
                    <Button variant="secondary" busy={busy} icon={<X {...ICON} />} onClick={() => void run(() => declineVoidRequest(account, sale.id))}>
                      Decline
                    </Button>
                  )}
                </>
              ) : requested ? (
                <p className="font-semibold text-text">Waiting for the owner to answer.</p>
              ) : (
                <Button variant="secondary" icon={<Hand {...ICON} />} onClick={() => setAsking(true)}>
                  Ask the owner to void
                </Button>
              )}
            </div>
          )}

          {asking && (
            <div className="space-y-3">
              <Field
                id={`reason-${sale.id}`}
                label={isOwner ? 'Why is this sale being voided?' : 'Why should this sale be voided?'}
                autoComplete="off"
                autoFocus
                placeholder="Entered twice, wrong amount…"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value)
                  setError(null)
                }}
                error={error}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={isOwner ? 'danger' : 'primary'}
                  busy={busy}
                  onClick={() => void run(() => (isOwner ? voidSale(account, sale.id, reason) : requestVoid(account, sale.id, reason)))}
                >
                  {isOwner ? `Void ${formatMoney(sale.amount)} sale` : 'Send request'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAsking(false)
                    setError(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {!asking && error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </li>
  )
}
