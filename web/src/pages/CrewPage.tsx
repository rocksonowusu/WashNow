import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Pencil, Trash2, UserRoundPlus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { ICON } from '../components/icon.ts'
import { inputClass, tableHead } from '../components/styles.ts'
import { Button, Card, Field, Tag } from '../components/ui.tsx'
import { db } from '../db/db.ts'
import { createCrewMember, LocalValidationError, removeCrewMember, updateCrewMember } from '../db/repositories.ts'
import type { Account, Washer } from '../db/types.ts'
import { api, ApiError, NetworkError } from '../lib/api.ts'
import { useOnline } from '../lib/useOnline.ts'
import { syncService } from '../sync/SyncService.ts'

/** "30.00" is shown as "30%", "27.50" as "27.5%". */
function showPercent(value: string | null | undefined): string {
  return value == null ? 'Not set' : `${Number(value)}%`
}

function parsePercent(text: string): number | null {
  const clean = text.trim().replace('%', '')
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  const value = Number(clean)
  return value >= 0 && value <= 100 ? value : null
}

function message(caught: unknown, fallback: string): string {
  return caught instanceof LocalValidationError ? caught.message : fallback
}

/**
 * The crew: the people who wash the vehicles. Anyone can add a person here;
 * the owner also sets what each person earns.
 */
export default function CrewPage() {
  const { account } = useAuth()
  const crew = useLiveQuery(() => db.washers.orderBy('name').toArray(), [])
  const branch = useLiveQuery(() => (account ? db.branches.get(account.branch_id) : undefined), [account?.branch_id])
  const waiting = useLiveQuery(async () => new Set((await db.outbox.toArray()).map((item) => item.record_id)), [])

  if (!account || !crew) return null

  const isOwner = account.role === 'owner'
  const standard = branch?.default_commission_percent ?? null

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="space-y-5">
        <AddCrewCard account={account} standard={standard} />
        {isOwner && <StandardRateCard account={account} standard={standard} />}
      </div>

      <Card title={crew.length === 1 ? '1 person on the crew' : `${crew.length} people on the crew`}>
        {crew.length === 0 ? (
          <p className="px-4 py-4 text-text-muted">Nobody yet. Add the people who wash the vehicles.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className={tableHead}>
                <th scope="col" className="px-4 py-2 font-semibold">Name</th>
                {isOwner && <th scope="col" className="px-4 py-2 text-right font-semibold">Commission</th>}
                {isOwner && <th scope="col" className="px-4 py-2 text-right font-semibold"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {crew.map((member) => (
                <CrewRow key={member.id} account={account} member={member} waiting={waiting?.has(member.id) ?? false} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

function AddCrewCard({ account, standard }: { account: Account; standard: string | null }) {
  const isOwner = account.role === 'owner'

  const [name, setName] = useState('')
  const [percentText, setPercentText] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [added, setAdded] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setAdded(null)

    let commissionPercent: number | null = null
    if (isOwner && percentText.trim() !== '') {
      commissionPercent = parsePercent(percentText)
      if (commissionPercent === null) return setErrors({ commissionPercent: 'Enter a number from 0 to 100.' })
    }

    setBusy(true)
    try {
      const member = await createCrewMember(account, { name, commissionPercent })
      setAdded(`${member.name} is on the crew.`)
      setName('')
      setPercentText('')
      setErrors({})
    } catch (caught) {
      if (caught instanceof LocalValidationError) setErrors({ [caught.field]: caught.message })
      else setErrors({ name: 'Could not add this person. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Add someone">
      <form onSubmit={submit} noValidate className="space-y-4 px-4 py-4">
        <Field
          id="crew-name"
          label="Name"
          autoComplete="off"
          autoCapitalize="words"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setErrors({})
            setAdded(null)
          }}
          error={errors.name}
        />

        {isOwner ? (
          <Field
            id="crew-percent"
            label="Commission (%)"
            inputMode="decimal"
            autoComplete="off"
            placeholder={standard ? `${Number(standard)} (standard)` : 'For example 30'}
            value={percentText}
            onChange={(event) => {
              setPercentText(event.target.value)
              setErrors({})
            }}
            error={errors.commissionPercent}
            hint={standard ? 'Leave empty to use the standard commission.' : undefined}
          />
        ) : (
          errors.commissionPercent && <p className="text-sm text-danger">{errors.commissionPercent}</p>
        )}

        <Button type="submit" busy={busy} disabled={name.trim() === ''} icon={<UserRoundPlus {...ICON} />} className="w-full">
          Add to crew
        </Button>

        {added && (
          <p role="status" className="rounded-control bg-success px-3 py-2 font-semibold text-surface">
            {added}
          </p>
        )}
      </form>
    </Card>
  )
}

/**
 * Owner only. This is a setting on the server, so changing it needs internet;
 * every device then picks it up on its next sync.
 */
function StandardRateCard({ account, standard }: { account: Account; standard: string | null }) {
  const online = useOnline()

  const [percentText, setPercentText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaved(false)

    const percent = parsePercent(percentText)
    if (percent === null) return setError('Enter a number from 0 to 100.')

    setBusy(true)
    setError(null)
    try {
      const reply = await api<{ data: { default_commission_percent: string | null } }>('/branch', {
        method: 'PUT',
        token: account.token,
        body: { default_commission_percent: percent },
      })

      await db.branches.update(account.branch_id, { default_commission_percent: reply.data.default_commission_percent })
      void syncService.syncNow()

      setPercentText('')
      setSaved(true)
    } catch (caught) {
      if (caught instanceof NetworkError) setError('Could not reach the server. This setting needs internet.')
      else if (caught instanceof ApiError) setError(caught.errors.default_commission_percent?.[0] ?? caught.message)
      else setError('Could not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Standard commission">
      <form onSubmit={submit} noValidate className="space-y-4 px-4 py-4">
        <p className="text-text-muted">
          What a new person earns when a cashier adds them while recording a sale. You can still give anyone their own rate.
        </p>

        <p>
          <span className="text-sm text-text-muted">Now</span>
          <span className="money block font-heading text-2xl font-bold text-text">{showPercent(standard)}</span>
        </p>

        {standard === null && (
          <p className="rounded-control bg-warning px-3 py-2 font-semibold text-text">
            Until this is set, cashiers cannot add new people.
          </p>
        )}

        <Field
          id="standard-percent"
          label="New standard commission (%)"
          inputMode="decimal"
          autoComplete="off"
          placeholder="For example 30"
          value={percentText}
          onChange={(event) => {
            setPercentText(event.target.value)
            setError(null)
            setSaved(false)
          }}
          error={error}
          hint={online ? undefined : 'You are offline. This setting needs internet.'}
        />

        <Button type="submit" variant="secondary" busy={busy} disabled={!online || percentText.trim() === ''} className="w-full">
          Save standard commission
        </Button>

        {saved && (
          <p role="status" className="rounded-control bg-success px-3 py-2 font-semibold text-surface">
            Saved.
          </p>
        )}
      </form>
    </Card>
  )
}

function CrewRow({ account, member, waiting }: { account: Account; member: Washer; waiting: boolean }) {
  const isOwner = account.role === 'owner'

  const [mode, setMode] = useState<'view' | 'edit' | 'remove'>('view')
  const [name, setName] = useState(member.name)
  const [percentText, setPercentText] = useState(String(Number(member.commission_percent)))
  const [error, setError] = useState<string | null>(null)

  function startEditing() {
    setName(member.name)
    setPercentText(String(Number(member.commission_percent)))
    setError(null)
    setMode('edit')
  }

  async function save() {
    const commissionPercent = parsePercent(percentText)
    if (commissionPercent === null) return setError('Commission must be a number from 0 to 100.')

    try {
      await updateCrewMember(account, member.id, { name, commissionPercent })
      setMode('view')
    } catch (caught) {
      setError(message(caught, 'Could not save. Try again.'))
    }
  }

  async function remove() {
    try {
      await removeCrewMember(account, member.id)
    } catch (caught) {
      setError(message(caught, 'Could not remove. Try again.'))
      setMode('view')
    }
  }

  if (mode === 'edit') {
    return (
      <tr className="border-b border-border last:border-b-0">
        <td colSpan={3} className="px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto_auto] sm:items-end">
            <div>
              <label htmlFor={`name-${member.id}`} className="mb-1 block text-sm font-semibold text-text">Name</label>
              <input id={`name-${member.id}`} value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" className={`${inputClass} border-border`} />
            </div>
            <div>
              <label htmlFor={`percent-${member.id}`} className="mb-1 block text-sm font-semibold text-text">Commission (%)</label>
              <input id={`percent-${member.id}`} value={percentText} onChange={(event) => setPercentText(event.target.value)} inputMode="decimal" autoComplete="off" className={`${inputClass} money border-border`} />
            </div>
            <Button icon={<Check {...ICON} />} onClick={() => void save()}>Save</Button>
            <Button variant="secondary" icon={<X {...ICON} />} onClick={() => setMode('view')}>Cancel</Button>
          </div>
          <p className="mt-2 text-sm text-text-muted">A new rate applies to sales from now on. Past sales keep the rate they were recorded with.</p>
          {error && <p className="mt-1 text-sm text-danger">{error}</p>}
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-3">
        <span className="font-semibold text-text">{member.name}</span>
        {waiting && <span className="ml-2 align-middle"><Tag tone="warning">Waiting to sync</Tag></span>}
        {error && <p className="text-sm text-danger">{error}</p>}
      </td>
      {isOwner && <td className="money px-4 py-3 text-right text-text">{showPercent(member.commission_percent)}</td>}
      {isOwner && (
        <td className="px-4 py-2 text-right">
          {mode === 'remove' ? (
            <span className="inline-flex flex-wrap justify-end gap-2">
              <Button variant="danger" icon={<Trash2 {...ICON} />} onClick={() => void remove()}>Remove {member.name}</Button>
              <Button variant="secondary" onClick={() => setMode('view')}>Keep</Button>
            </span>
          ) : (
            <span className="inline-flex justify-end gap-1">
              <Button variant="quiet" icon={<Pencil {...ICON} />} aria-label={`Change ${member.name}`} onClick={startEditing}>
                <span className="hidden sm:inline">Change</span>
              </Button>
              <Button variant="quiet" icon={<Trash2 {...ICON} />} aria-label={`Remove ${member.name}`} onClick={() => setMode('remove')}>
                <span className="hidden sm:inline">Remove</span>
              </Button>
            </span>
          )}
        </td>
      )}
    </tr>
  )
}
