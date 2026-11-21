import { useLiveQuery } from 'dexie-react-hooks'
import { Check, KeyRound, Pencil, Plus, Power, Trash2, UserRoundPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { ICON } from '../components/icon.ts'
import Modal, { ConfirmDialog, ModalActions } from '../components/Modal.tsx'
import { tableHead } from '../components/styles.ts'
import { useToast } from '../components/Toast.tsx'
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

const errorNote = (error: string | null | undefined) => error && <p className="font-semibold text-danger">{error}</p>

/**
 * Owner only: what the bay charges, who can sign in, and the loyalty rule.
 * (Crew and their commission are on the Crew screen.) Every change opens in
 * a modal over the list.
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
  const [editing, setEditing] = useState<VehicleCategory | 'new' | null>(null)

  if (!types) return null

  return (
    <Card
      title="Vehicle types and prices"
      action={
        <Button variant="quiet" icon={<Plus {...ICON} />} onClick={() => setEditing('new')}>
          Add
        </Button>
      }
    >
      <ul>
        {types.map((type) => (
          <li key={type.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
            <div className="min-w-0">
              <p className="font-semibold text-text">{type.name}</p>
              <p className="money text-sm text-text-muted">
                {formatMoney(type.min_price)} to {formatMoney(type.max_price)}
                {type.pricing_note && <> · {type.pricing_note}</>}
              </p>
            </div>
            <Button variant="quiet" icon={<Pencil {...ICON} />} aria-label={`Change ${type.name}`} onClick={() => setEditing(type)}>
              <span className="hidden sm:inline">Change</span>
            </Button>
          </li>
        ))}
      </ul>

      {types.length === 0 && <p className="px-4 py-4 text-text-muted">No vehicle types yet. Add the first one.</p>}

      {/* A new key for each type, so the form starts from that type's values. */}
      {editing !== null && (
        <VehicleTypeDialog
          key={editing === 'new' ? 'new' : editing.id}
          account={account}
          type={editing === 'new' ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      )}
    </Card>
  )
}

function VehicleTypeDialog({ account, type, onDone }: { account: Account; type?: VehicleCategory; onDone: () => void }) {
  const toast = useToast()

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
      toast(`${name.trim()} is saved.`)
    } catch (caught) {
      if (caught instanceof LocalValidationError) setErrors({ [caught.field]: caught.message })
      else setErrors({ form: 'Could not save. Try again.' })
    }
  }

  async function remove() {
    if (!type) return
    try {
      await removeVehicleType(account, type.id)
      onDone()
      toast(`${type.name} is removed.`)
    } catch (caught) {
      setErrors({ form: caught instanceof LocalValidationError ? caught.message : 'Could not remove. Try again.' })
      setRemoving(false)
    }
  }

  if (type && removing) {
    return (
      <ConfirmDialog
        open
        onClose={() => setRemoving(false)}
        title={`Remove ${type.name}?`}
        tone="danger"
        icon={<Trash2 {...ICON} />}
        confirmLabel={`Remove ${type.name}`}
        cancelLabel="Keep"
        error={errors.form}
        onConfirm={() => void remove()}
      >
        <p>Cashiers will no longer be able to choose {type.name} for a sale. Past sales keep it and are not changed.</p>
      </ConfirmDialog>
    )
  }

  return (
    <Modal
      open
      onClose={onDone}
      title={type ? `Change ${type.name}` : 'Add a vehicle type'}
      size="sm"
      onSubmit={submit}
      footer={
        <ModalActions note={errorNote(errors.form)}>
          {type && (
            <Button variant="quiet" icon={<Trash2 {...ICON} />} onClick={() => setRemoving(true)}>
              Remove
            </Button>
          )}
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" icon={<Check {...ICON} />}>
            Save
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        <Field id="type-name" data-autofocus={type ? undefined : true} label="Name" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="type-min" label="Lowest price (GH₵)" inputMode="decimal" autoComplete="off" className="money" value={minText} onChange={(event) => setMinText(event.target.value)} error={errors.minPrice} />
          <Field id="type-max" label="Highest price (GH₵)" inputMode="decimal" autoComplete="off" className="money" value={maxText} onChange={(event) => setMaxText(event.target.value)} error={errors.maxPrice} />
        </div>
        <Field
          id="type-note"
          label="What the price depends on (optional)"
          autoComplete="off"
          placeholder="Parts washed, number of tyres…"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {type && <p className="text-sm text-text-muted">A new range applies to sales from now on. Past sales are not changed.</p>}
      </div>
    </Modal>
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
        <Button variant="quiet" icon={<UserRoundPlus {...ICON} />} disabled={!online} onClick={() => setAdding(true)}>
          Add
        </Button>
      }
    >
      {!online && <p className="border-b border-border bg-warning px-4 py-2 font-semibold text-text">Offline. Changing users and PINs needs internet.</p>}

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

      {adding && <AddUserDialog account={account} onDone={() => setAdding(false)} />}
    </Card>
  )
}

function AddUserDialog({ account, onDone }: { account: Account; onDone: () => void }) {
  const toast = useToast()

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
      toast(`${reply.data.name} can now sign in.`)
    } catch (caught) {
      setError(serverMessage(caught, ['phone', 'pin', 'name', 'role']))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onDone}
      title="Add someone who can sign in"
      size="sm"
      onSubmit={submit}
      footer={
        <ModalActions note={errorNote(error)}>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} disabled={name.trim() === '' || phone.trim() === '' || pin.length !== 4} icon={<Check {...ICON} />}>
            Add person
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        <Field id="user-name" data-autofocus label="Name" autoComplete="off" autoCapitalize="words" value={name} onChange={(event) => setName(event.target.value)} />
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
      </div>
    </Modal>
  )
}

function UserRow({ account, user, online }: { account: Account; user: User; online: boolean }) {
  const isSelf = user.id === account.user_id
  const toast = useToast()

  const [dialog, setDialog] = useState<'pin' | 'turn-off' | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    setDialog(null)
    setPin('')
    setError(null)
  }

  async function change(body: Record<string, unknown>, done: string) {
    setBusy(true)
    setError(null)
    try {
      const reply = await api<{ data: ServerUser }>(`/users/${user.id}`, { method: 'PUT', token: account.token, body })
      await keepLocally(reply.data)
      close()
      toast(done)
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
        {dialog === null && error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </td>
      <td className="px-4 py-2 text-right">
        <span className="inline-flex flex-wrap justify-end gap-1">
          <Button variant="quiet" icon={<KeyRound {...ICON} />} disabled={!online} aria-label={`Change PIN for ${user.name}`} onClick={() => setDialog('pin')}>
            <span className="hidden sm:inline">PIN</span>
          </Button>
          {!isSelf &&
            (user.active ? (
              <Button variant="quiet" disabled={!online} onClick={() => setDialog('turn-off')}>
                Turn off
              </Button>
            ) : (
              <Button variant="quiet" busy={busy} disabled={!online} onClick={() => void change({ active: true }, `${user.name} can sign in again.`)}>
                Turn on
              </Button>
            ))}
        </span>

        <Modal
          open={dialog === 'pin'}
          onClose={close}
          title={isSelf ? 'Change your PIN' : `New PIN for ${user.name}`}
          size="sm"
          onSubmit={(event) => {
            event.preventDefault()
            void change({ pin }, isSelf ? 'Your PIN is changed.' : `${user.name}’s PIN is changed.`)
          }}
          footer={
            <ModalActions note={errorNote(error)}>
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" busy={busy} disabled={pin.length !== 4} icon={<Check {...ICON} />}>
                Save PIN
              </Button>
            </ModalActions>
          }
        >
          <div className="space-y-3 text-left">
            <Field
              id={`pin-${user.id}`}
              data-autofocus
              label="New PIN (4 digits)"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              className="money max-w-40 text-2xl tracking-widest"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            />
            {!isSelf && <p className="text-sm text-text-muted">They will be signed out of every device and must sign in with the new PIN. Tell them the PIN yourself.</p>}
          </div>
        </Modal>

        <ConfirmDialog
          open={dialog === 'turn-off'}
          onClose={close}
          title={`Turn off ${user.name}?`}
          tone="danger"
          icon={<Power {...ICON} />}
          confirmLabel={`Turn off ${user.name}`}
          busy={busy}
          error={error}
          onConfirm={() => void change({ active: false }, `${user.name} is turned off.`)}
        >
          <p className="text-left">
            {user.name} will be signed out of every device and cannot sign in until you turn them on again. Their past sales and expenses stay.
          </p>
        </ConfirmDialog>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Loyalty rule.
// ---------------------------------------------------------------------------

function LoyaltyCard({ account }: { account: Account }) {
  const online = useOnline()
  const toast = useToast()
  const branch = useLiveQuery(() => db.branches.get(account.branch_id), [account.branch_id])

  const [changing, setChanging] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = branch?.loyalty_every_visits ?? null

  function close() {
    setChanging(false)
    setText('')
    setError(null)
  }

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
      close()
      toast(reply.data.loyalty_every_visits ? `Loyalty wash every ${reply.data.loyalty_every_visits} visits.` : 'Loyalty rule turned off.')
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
      <div className="space-y-4 px-4 py-4">
        <p className="text-text-muted">
          Reward regulars: when a saved customer reaches every so-many visits, the New sale screen reminds the cashier. You decide the reward; the app does not change the price.
        </p>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <p>
            <span className="text-sm text-text-muted">Now</span>
            <span className="block font-heading text-2xl font-bold text-text">{current ? `Every ${current} visits` : 'No loyalty rule'}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {current && (
              <Button variant="quiet" busy={busy && !changing} disabled={!online} onClick={() => void save(null)}>
                Turn off
              </Button>
            )}
            <Button variant="secondary" icon={<Pencil {...ICON} />} disabled={!online} onClick={() => setChanging(true)}>
              {current ? 'Change' : 'Set a rule'}
            </Button>
          </div>
        </div>

        {!online && <p className="text-sm text-text-muted">You are offline. Changing this needs internet.</p>}
        {!changing && error && <p className="text-sm text-danger">{error}</p>}
      </div>

      <Modal
        open={changing}
        onClose={close}
        title="Loyalty wash"
        description={current ? `Now every ${current} visits` : 'No rule yet'}
        size="sm"
        onSubmit={submit}
        footer={
          <ModalActions>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" busy={busy} disabled={!online || text === ''} icon={<Check {...ICON} />}>
              Save rule
            </Button>
          </ModalActions>
        }
      >
        <Field
          id="loyalty-every"
          data-autofocus
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
          hint="visits. With 10, the 10th, 20th and 30th washes are loyalty washes."
        />
      </Modal>
    </Card>
  )
}
