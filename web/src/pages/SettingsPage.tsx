import { useLiveQuery } from 'dexie-react-hooks'
import { Check, KeyRound, Pencil, Plus, Trash2, UserRoundPlus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { ICON } from '../components/icon.ts'
import { tableHead } from '../components/styles.ts'
import { Button, Card, Choice, Field, Tag } from '../components/ui.tsx'
import { db } from '../db/db.ts'
import { createVehicleType, LocalValidationError, removeVehicleType, updateVehicleType } from '../db/repositories.ts'
import type { Account, Role, User, VehicleCategory } from '../db/types.ts'
import { api, ApiError, NetworkError } from '../lib/api.ts'
import { formatMoney, parseMoney } from '../lib/format.ts'
import { useOnline } from '../lib/useOnline.ts'
import { syncService } from '../sync/SyncService.ts'

/** Pesewas as the cedis someone would type: 1500 becomes "15". */
const cedisText = (pesewas: number) => String(pesewas / 100)

function serverMessage(caught: unknown, fields: string[]): string {
  if (caught instanceof NetworkError) return 'Could not reach the server. This needs internet.'
  if (caught instanceof ApiError) {
    for (const field of fields) {
      if (caught.errors[field]?.[0]) return caught.errors[field][0]
    }
    return caught.message
  }
  return 'That did not work. Try again.'
}

/**
 * Owner only: what the bay charges, who can sign in, and the loyalty rule.
 * (Crew and their commission are on the Crew screen.)
 */
export default function SettingsPage() {
  const { account } = useAuth()
  if (!account) return null

  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <VehicleTypesCard account={account} />
      <div className="space-y-5">
        <UsersCard account={account} />
        <LoyaltyCard account={account} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vehicle types and price ranges. Saved on the device and synced, so they can
// be changed with no internet.
// ---------------------------------------------------------------------------

function VehicleTypesCard({ account }: { account: Account }) {
  const types = useLiveQuery(() => db.vehicle_categories.orderBy('sort_order').toArray(), [])
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)

  if (!types) return null

  return (
    <Card
      title="Vehicle types and prices"
      action={
        editingId === null && (
          <Button variant="quiet" icon={<Plus {...ICON} />} onClick={() => setEditingId('new')}>
            Add
          </Button>
        )
      }
    >
      {editingId === 'new' && <VehicleTypeForm account={account} onDone={() => setEditingId(null)} />}

      <ul>
        {types.map((type) =>
          editingId === type.id ? (
            <li key={type.id} className="border-b border-border last:border-b-0">
              <VehicleTypeForm account={account} type={type} onDone={() => setEditingId(null)} />
            </li>
          ) : (
            <li key={type.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
              <div className="min-w-0">
                <p className="font-semibold text-text">{type.name}</p>
                <p className="money text-sm text-text-muted">
                  {formatMoney(type.min_price)} to {formatMoney(type.max_price)}
                  {type.pricing_note && <> · {type.pricing_note}</>}
                </p>
              </div>
              <Button variant="quiet" icon={<Pencil {...ICON} />} aria-label={`Change ${type.name}`} onClick={() => setEditingId(type.id)}>
                <span className="hidden sm:inline">Change</span>
              </Button>
            </li>
          ),
        )}
      </ul>

      {types.length === 0 && editingId !== 'new' && <p className="px-4 py-4 text-text-muted">No vehicle types yet. Add the first one.</p>}
    </Card>
  )
}

function VehicleTypeForm({ account, type, onDone }: { account: Account; type?: VehicleCategory; onDone: () => void }) {
  const [name, setName] = useState(type?.name ?? '')
  const [minText, setMinText] = useState(type ? cedisText(type.min_price) : '')
  const [maxText, setMaxText] = useState(type ? cedisText(type.max_price) : '')
  const [note, setNote] = useState(type?.pricing_note ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [removing, setRemoving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()

    // A lowest price of 0 is allowed, so read these without parseMoney's "must be above zero".
    const minPrice = /^\d+(\.\d{1,2})?$/.test(minText.trim()) ? Math.round(parseFloat(minText) * 100) : null
    const maxPrice = parseMoney(maxText)
    if (minPrice === null) return setErrors({ minPrice: 'Enter the lowest price, for example 15.' })
    if (maxPrice === null) return setErrors({ maxPrice: 'Enter the highest price, for example 100.' })

    try {
      const input = { name, minPrice, maxPrice, pricingNote: note }
      if (type) await updateVehicleType(account, type.id, input)
      else await createVehicleType(account, input)
      onDone()
    } catch (caught) {
      if (caught instanceof LocalValidationError) setErrors({ [caught.field]: caught.message })
      else setErrors({ form: 'Could not save. Try again.' })
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 bg-surface-alt px-4 py-4">
      <Field id={`type-name-${type?.id ?? 'new'}`} label="Name" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
      <div className="grid grid-cols-2 gap-3">
        <Field id={`type-min-${type?.id ?? 'new'}`} label="Lowest price (GH₵)" inputMode="decimal" autoComplete="off" className="money" value={minText} onChange={(event) => setMinText(event.target.value)} error={errors.minPrice} />
        <Field id={`type-max-${type?.id ?? 'new'}`} label="Highest price (GH₵)" inputMode="decimal" autoComplete="off" className="money" value={maxText} onChange={(event) => setMaxText(event.target.value)} error={errors.maxPrice} />
      </div>
      <Field
        id={`type-note-${type?.id ?? 'new'}`}
        label="What the price depends on (optional)"
        autoComplete="off"
        placeholder="Parts washed, number of tyres…"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" icon={<Check {...ICON} />}>Save</Button>
        <Button variant="secondary" icon={<X {...ICON} />} onClick={onDone}>Cancel</Button>
        {type &&
          (removing ? (
            <Button variant="danger" icon={<Trash2 {...ICON} />} onClick={() => void removeVehicleType(account, type.id).then(onDone)}>
              Yes, remove {type.name}
            </Button>
          ) : (
            <Button variant="quiet" icon={<Trash2 {...ICON} />} onClick={() => setRemoving(true)}>
              Remove
            </Button>
          ))}
      </div>
      {type && <p className="text-sm text-text-muted">A new range applies to sales from now on. Past sales are not changed.</p>}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Users and PINs. These are sign-in details, so they are changed on the
// server directly and need internet.
// ---------------------------------------------------------------------------

type ServerUser = { id: string; name: string; phone: string; role: Role; active: boolean; branch_id: string }

async function keepLocally(user: ServerUser): Promise<void> {
  const existing = await db.users.get(user.id)
  await db.users.put({
    version: 1,
    created_at: null,
    updated_at: null,
    deleted_at: null,
    ...existing,
    ...user,
  })
  void syncService.syncNow()
}

function UsersCard({ account }: { account: Account }) {
  const online = useOnline()
  const users = useLiveQuery(() => db.users.orderBy('id').toArray(), [])
  const [adding, setAdding] = useState(false)

  if (!users) return null

  const sorted = [...users].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Card
      title="People who can sign in"
      action={
        !adding && (
          <Button variant="quiet" icon={<UserRoundPlus {...ICON} />} disabled={!online} onClick={() => setAdding(true)}>
            Add
          </Button>
        )
      }
    >
      {!online && <p className="border-b border-border bg-warning px-4 py-2 font-semibold text-text">Offline. Changing users and PINs needs internet.</p>}

      {adding && <AddUserForm account={account} onDone={() => setAdding(false)} />}

      <table className="w-full">
        <thead>
          <tr className={tableHead}>
            <th scope="col" className="px-4 py-2 font-semibold">Person</th>
            <th scope="col" className="px-4 py-2 text-right font-semibold"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((user) => (
            <UserRow key={user.id} account={account} user={user} online={online} />
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function AddUserForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [role, setRole] = useState<Role>('cashier')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const reply = await api<{ data: ServerUser }>('/users', { method: 'POST', token: account.token, body: { name, phone, pin, role } })
      await keepLocally(reply.data)
      onDone()
    } catch (caught) {
      setError(serverMessage(caught, ['phone', 'pin', 'name', 'role']))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 border-b border-border bg-surface-alt px-4 py-4">
      <Field id="user-name" label="Name" autoComplete="off" autoCapitalize="words" value={name} onChange={(event) => setName(event.target.value)} />
      <Field id="user-phone" label="Phone number (they sign in with this)" type="tel" inputMode="tel" autoComplete="off" placeholder="024 000 0000" value={phone} onChange={(event) => setPhone(event.target.value)} />
      <Field
        id="user-pin"
        label="PIN (4 digits)"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        className="money"
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
        hint="Tell them this PIN yourself. It is not shown again."
      />
      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-text">Role</legend>
        <div className="grid grid-cols-2 gap-2">
          <Choice chosen={role === 'cashier'} onClick={() => setRole('cashier')}>
            <span className="block">Cashier</span>
            <span className={`block text-sm font-normal ${role === 'cashier' ? 'text-surface/85' : 'text-text-muted'}`}>Records sales and expenses</span>
          </Choice>
          <Choice chosen={role === 'owner'} onClick={() => setRole('owner')}>
            <span className="block">Owner</span>
            <span className={`block text-sm font-normal ${role === 'owner' ? 'text-surface/85' : 'text-text-muted'}`}>Sees and changes everything</span>
          </Choice>
        </div>
      </fieldset>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy} disabled={name.trim() === '' || phone.trim() === '' || pin.length !== 4} icon={<Check {...ICON} />}>
          Add person
        </Button>
        <Button variant="secondary" icon={<X {...ICON} />} onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}

function UserRow({ account, user, online }: { account: Account; user: User; online: boolean }) {
  const isSelf = user.id === account.user_id

  const [changingPin, setChangingPin] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const reply = await api<{ data: ServerUser }>(`/users/${user.id}`, { method: 'PUT', token: account.token, body })
      await keepLocally(reply.data)
      setChangingPin(false)
      setPin('')
    } catch (caught) {
      setError(serverMessage(caught, ['pin', 'active', 'role']))
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3">
        <span className="block font-semibold text-text">
          {user.name}
          {isSelf && <span className="font-normal text-text-muted"> (you)</span>}
        </span>
        <span className="block text-sm text-text-muted">
          <span className="capitalize">{user.role}</span> · {user.phone}
        </span>
        {!user.active && (
          <span className="mt-1 block">
            <Tag tone="danger">Turned off</Tag>
          </span>
        )}

        {changingPin && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="w-32">
              <Field
                id={`pin-${user.id}`}
                label="New PIN"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                autoFocus
                className="money"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              />
            </div>
            <Button busy={busy} disabled={pin.length !== 4} onClick={() => void change({ pin })}>Save PIN</Button>
            <Button variant="secondary" onClick={() => setChangingPin(false)}>Cancel</Button>
          </div>
        )}
        {changingPin && !isSelf && <p className="mt-2 text-sm text-text-muted">They will be signed out of every device and must sign in with the new PIN.</p>}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </td>
      <td className="px-4 py-2 text-right">
        {!changingPin && (
          <span className="inline-flex flex-wrap justify-end gap-1">
            <Button variant="quiet" icon={<KeyRound {...ICON} />} disabled={!online} aria-label={`Change PIN for ${user.name}`} onClick={() => setChangingPin(true)}>
              <span className="hidden sm:inline">PIN</span>
            </Button>
            {!isSelf && (
              <Button variant="quiet" busy={busy} disabled={!online} onClick={() => void change({ active: !user.active })}>
                {user.active ? 'Turn off' : 'Turn on'}
              </Button>
            )}
          </span>
        )}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Loyalty rule.
// ---------------------------------------------------------------------------

function LoyaltyCard({ account }: { account: Account }) {
  const online = useOnline()
  const branch = useLiveQuery(() => db.branches.get(account.branch_id), [account.branch_id])

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = branch?.loyalty_every_visits ?? null

  async function save(every: number | null) {
    setBusy(true)
    setError(null)
    try {
      const reply = await api<{ data: { loyalty_every_visits: number | null } }>('/branch', {
        method: 'PUT',
        token: account.token,
        body: { loyalty_every_visits: every },
      })
      await db.branches.update(account.branch_id, { loyalty_every_visits: reply.data.loyalty_every_visits })
      void syncService.syncNow()
      setText('')
    } catch (caught) {
      setError(serverMessage(caught, ['loyalty_every_visits']))
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const every = Number(text)
    if (!Number.isInteger(every) || every < 2 || every > 100) return setError('Enter a whole number from 2 to 100.')
    void save(every)
  }

  return (
    <Card title="Loyalty wash">
      <form onSubmit={submit} noValidate className="space-y-4 px-4 py-4">
        <p className="text-text-muted">
          Reward regulars: when a saved customer reaches every so-many visits, the New sale screen reminds the cashier. You decide the reward; the app does not change the price.
        </p>

        <p>
          <span className="text-sm text-text-muted">Now</span>
          <span className="block font-heading text-2xl font-bold text-text">{current ? `Every ${current} visits` : 'No loyalty rule'}</span>
        </p>

        <Field
          id="loyalty-every"
          label="Remind on every…"
          inputMode="numeric"
          autoComplete="off"
          placeholder="For example 10"
          className="money"
          value={text}
          onChange={(event) => {
            setText(event.target.value.replace(/\D/g, ''))
            setError(null)
          }}
          error={error}
          hint={online ? 'visits. With 10, the 10th, 20th and 30th washes are loyalty washes.' : 'You are offline. This setting needs internet.'}
        />

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary" busy={busy} disabled={!online || text === ''}>Save rule</Button>
          {current && (
            <Button variant="quiet" disabled={!online || busy} onClick={() => void save(null)}>
              Turn off
            </Button>
          )}
        </div>
      </form>
    </Card>
  )
}
