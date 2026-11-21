import { Banknote, Building2, Car, Check, KeyRound, MapPin, Pause, Phone, Play, Plus, Settings2, UserRound, WifiOff } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { ICON } from '../components/icon.ts'
import Modal, { ConfirmDialog, ModalActions } from '../components/Modal.tsx'
import { useToast } from '../components/Toast.tsx'
import { Button, Card, Field, StatTile, Tag } from '../components/ui.tsx'
import { api, ApiError, NetworkError } from '../lib/api.ts'
import { formatLastActive, formatMoney } from '../lib/format.ts'
import { useOnline } from '../lib/useOnline.ts'

type Bay = {
  id: string
  name: string
  location: string | null
  phone: string | null
  suspended_at: string | null
  created_at: string | null
  is_own: boolean
  owners: { id: string; name: string; phone: string; active: boolean }[]
  staff_count: number
  month: { sales_count: number; sales_total: number }
  last_sale_at: string | null
  last_seen_at: string | null
}

type BayPerson = {
  id: string
  name: string
  phone: string
  role: 'owner' | 'cashier'
  active: boolean
  last_seen_at: string | null
}

const monthName = new Intl.DateTimeFormat('en-GH', { month: 'long', timeZone: 'Africa/Accra' })

function serverMessage(caught: unknown, fields: string[] = []): string {
  if (caught instanceof NetworkError) return 'Could not reach the server. This page needs internet.'
  if (caught instanceof ApiError) {
    for (const field of fields) {
      if (caught.errors[field]?.[0]) return caught.errors[field][0]
    }
    return caught.message
  }
  return 'That did not work. Try again.'
}

const errorNote = (error: string | null) => error && <p className="font-semibold text-danger">{error}</p>

/** The later of the last sale and the last time anyone in the bay used the app. */
function lastActive(bay: Bay): string | null {
  const times = [bay.last_sale_at, bay.last_seen_at].filter((value): value is string => value !== null)
  return times.sort().at(-1) ?? null
}

/**
 * For the person who runs WashNow itself: every washing bay, how it is doing
 * this month, and the jobs only they can do — add a bay with its owner,
 * rename it, reset a forgotten PIN, suspend or turn a bay back on.
 * Online only: nothing here is stored on the device.
 */
export default function AdminPage() {
  const { account } = useAuth()
  const token = account?.token ?? null
  const online = useOnline()
  const toast = useToast()

  const [bays, setBays] = useState<Bay[] | null>(null)
  const [monthStart, setMonthStart] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const [adding, setAdding] = useState(false)
  const [managing, setManaging] = useState<Bay | null>(null)
  const [suspending, setSuspending] = useState<Bay | null>(null)

  useEffect(() => {
    if (!token || !online) return

    let cancelled = false
    api<{ data: Bay[]; month_start: string }>('/admin/branches', { token })
      .then((reply) => {
        if (cancelled) return
        setBays(reply.data)
        setMonthStart(reply.month_start)
        setLoadError(null)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoadError(serverMessage(caught))
      })

    return () => {
      cancelled = true
    }
  }, [token, online, reload])

  const refresh = () => setReload((count) => count + 1)

  // Keeps the page current after a change without waiting for a reload.
  function replace(bay: Bay) {
    setBays((current) => (current ?? []).map((existing) => (existing.id === bay.id ? bay : existing)))
  }

  if (!bays) {
    return (
      <Card>
        <div className="flex items-start gap-3 px-4 py-5">
          {online && !loadError ? (
            <p className="text-text-muted">Loading the washing bays…</p>
          ) : (
            <>
              <WifiOff {...ICON} className="mt-0.5 shrink-0 text-text-muted" />
              <div>
                <p className="font-semibold text-text">{online ? 'The washing bays could not be loaded' : 'This page needs internet'}</p>
                <p className="text-text-muted">{loadError ?? 'Connect to the internet and it loads by itself.'}</p>
                {online && (
                  <Button variant="secondary" className="mt-3" onClick={refresh}>
                    Try again
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </Card>
    )
  }

  const monthTotal = bays.reduce((total, bay) => total + bay.month.sales_total, 0)
  const monthWashes = bays.reduce((total, bay) => total + bay.month.sales_count, 0)
  const suspendedCount = bays.filter((bay) => bay.suspended_at).length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <StatTile strong icon={Banknote} label={monthStart ? `Sales in ${monthName.format(new Date(`${monthStart}T12:00:00Z`))}` : 'Sales this month'} value={formatMoney(monthTotal)} note="All bays together" />
        </div>
        <StatTile
          icon={Building2}
          colour="aqua"
          label="Washing bays"
          value={bays.length}
          note={suspendedCount > 0 ? `${bays.length - suspendedCount} running, ${suspendedCount} suspended` : 'All running'}
        />
        <StatTile icon={Car} colour="aqua" label="Vehicles washed" value={monthWashes} note="This month" />
      </div>

      <Card
        title={bays.length === 1 ? '1 washing bay' : `${bays.length} washing bays`}
        action={
          <Button className="shrink-0" icon={<Plus {...ICON} />} onClick={() => setAdding(true)} aria-label="Add a washing bay">
            <span className="sm:hidden">Add</span>
            <span className="hidden sm:inline">Add a washing bay</span>
          </Button>
        }
      >
        {!online && (
          <p className="mx-4 mb-2 rounded-control bg-surface-alt px-3 py-2 text-sm text-text-muted">
            You are offline. These figures are from when you were last connected.
          </p>
        )}
        <ul className="grid gap-3 px-4 pt-1 pb-4 md:grid-cols-2 2xl:grid-cols-3">
          {bays.map((bay) => (
            <BayCard key={bay.id} bay={bay} onManage={() => setManaging(bay)} />
          ))}
        </ul>
      </Card>

      {adding && token && (
        <AddBayDrawer
          token={token}
          onClose={() => setAdding(false)}
          onCreated={(bay) => {
            setAdding(false)
            setBays((current) => [...(current ?? []), bay].sort((a, b) => a.name.localeCompare(b.name)))
            const owner = bay.owners[0]
            toast(owner ? `${bay.name} is ready. ${owner.name} can sign in now.` : `${bay.name} is ready.`)
          }}
        />
      )}

      {managing && token && (
        <ManageBayDrawer
          key={managing.id}
          bay={managing}
          token={token}
          onClose={() => setManaging(null)}
          onSaved={(bay) => {
            replace(bay)
            setManaging(null)
            toast(`${bay.name} is saved.`)
          }}
          onSuspend={() => {
            // One panel at a time: the drawer gives way to the confirmation.
            setSuspending(managing)
            setManaging(null)
          }}
          onResumed={(bay) => {
            replace(bay)
            setManaging(null)
            toast(`${bay.name} is running again. Its people can sign in.`)
          }}
        />
      )}

      {suspending && token && (
        <SuspendDialog
          bay={suspending}
          token={token}
          onClose={() => setSuspending(null)}
          onDone={(bay) => {
            replace(bay)
            setSuspending(null)
            toast(`${bay.name} is suspended. Everyone in it has been signed out.`)
          }}
        />
      )}
    </div>
  )
}

function BayCard({ bay, onManage }: { bay: Bay; onManage: () => void }) {
  const owner = bay.owners[0]
  const suspended = bay.suspended_at !== null

  return (
    <li className={`flex min-w-0 flex-col rounded-panel border p-4 ${suspended ? 'border-border bg-surface-alt' : 'border-border bg-surface'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-lg leading-snug font-bold [overflow-wrap:anywhere] text-text">{bay.name}</h3>
          {bay.location && (
            <p className="flex items-center gap-1 truncate text-sm text-text-muted">
              <MapPin size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
              {bay.location}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {bay.is_own && <Tag tone="muted">Your bay</Tag>}
          {suspended ? <Tag tone="danger">Suspended</Tag> : <Tag tone="success">Running</Tag>}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <dt className="text-sm text-text-muted">This month</dt>
          <dd className="money font-heading text-xl font-bold text-accent">{formatMoney(bay.month.sales_total)}</dd>
        </div>
        <div>
          <dt className="text-sm text-text-muted">Vehicles</dt>
          <dd className="money font-heading text-xl font-bold text-text">{bay.month.sales_count}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-text-muted">Owner</dt>
          <dd className="truncate font-semibold text-text">{owner?.name ?? 'No owner'}</dd>
          {owner && <dd className="money truncate text-sm text-text-muted">{owner.phone}</dd>}
        </div>
        <div>
          <dt className="text-sm text-text-muted">Last active</dt>
          <dd className="font-semibold text-text">{formatLastActive(lastActive(bay))}</dd>
          <dd className="text-sm text-text-muted">{bay.staff_count === 1 ? '1 person signs in' : `${bay.staff_count} people sign in`}</dd>
        </div>
      </dl>

      <div className="mt-4 flex justify-end border-t border-border pt-3">
        <Button variant="secondary" icon={<Settings2 {...ICON} />} onClick={onManage} aria-label={`Manage ${bay.name}`}>
          Manage
        </Button>
      </div>
    </li>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 font-heading text-base font-bold text-text">{children}</h3>
}

function AddBayDrawer({ token, onClose, onCreated }: { token: string; onClose: () => void; onCreated: (bay: Bay) => void }) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [phone, setPhone] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [ownerPin, setOwnerPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = name.trim() !== '' && ownerName.trim() !== '' && ownerPhone.trim() !== '' && ownerPin.length === 4

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const reply = await api<{ data: Bay }>('/admin/branches', {
        method: 'POST',
        token,
        body: {
          name: name.trim(),
          location: location.trim() || null,
          phone: phone.trim() || null,
          owner_name: ownerName.trim(),
          owner_phone: ownerPhone,
          owner_pin: ownerPin,
        },
      })
      onCreated(reply.data)
    } catch (caught) {
      setError(serverMessage(caught, ['name', 'owner_phone', 'owner_pin', 'owner_name', 'location', 'phone']))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a washing bay"
      description="The bay starts with the usual vehicle types and price ranges. Its owner can change them in Settings."
      size="md"
      onSubmit={submit}
      footer={
        <ModalActions note={errorNote(error)}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} disabled={!ready} icon={<Check {...ICON} />}>
            Add the bay
          </Button>
        </ModalActions>
      }
    >
      <section>
        <SectionTitle>The bay</SectionTitle>
        <div className="space-y-4">
          <Field id="bay-name" data-autofocus label="Name" autoComplete="off" autoCapitalize="words" placeholder="Adenta Wash Bay" value={name} onChange={(event) => setName(event.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="bay-location" label="Where it is (optional)" autoComplete="off" autoCapitalize="words" placeholder="Adenta, Accra" value={location} onChange={(event) => setLocation(event.target.value)} />
            <Field id="bay-phone" label="Bay phone (optional)" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
        </div>
      </section>

      <section className="mt-6">
        <SectionTitle>Its owner</SectionTitle>
        <div className="space-y-4">
          <Field id="owner-name" label="Owner's name" autoComplete="off" autoCapitalize="words" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="owner-phone"
              label="Phone number (they sign in with this)"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="024 000 0000"
              value={ownerPhone}
              onChange={(event) => setOwnerPhone(event.target.value)}
            />
            <Field
              id="owner-pin"
              label="PIN (4 digits)"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              className="money"
              value={ownerPin}
              onChange={(event) => setOwnerPin(event.target.value.replace(/\D/g, ''))}
              hint="Tell the owner this PIN yourself. It is not shown again."
            />
          </div>
        </div>
      </section>
    </Modal>
  )
}

function ManageBayDrawer({
  bay,
  token,
  onClose,
  onSaved,
  onSuspend,
  onResumed,
}: {
  bay: Bay
  token: string
  onClose: () => void
  onSaved: (bay: Bay) => void
  onSuspend: () => void
  onResumed: (bay: Bay) => void
}) {
  const [name, setName] = useState(bay.name)
  const [location, setLocation] = useState(bay.location ?? '')
  const [phone, setPhone] = useState(bay.phone ?? '')
  const [busy, setBusy] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [people, setPeople] = useState<BayPerson[] | null>(null)
  const [peopleError, setPeopleError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api<{ data: BayPerson[] }>(`/admin/branches/${bay.id}/users`, { token })
      .then((reply) => {
        if (!cancelled) setPeople(reply.data)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setPeopleError(serverMessage(caught))
      })
    return () => {
      cancelled = true
    }
  }, [bay.id, token])

  const changed = name.trim() !== bay.name || location.trim() !== (bay.location ?? '') || phone.trim() !== (bay.phone ?? '')

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!changed || name.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const reply = await api<{ data: Bay }>(`/admin/branches/${bay.id}`, {
        method: 'PUT',
        token,
        body: { name: name.trim(), location: location.trim() || null, phone: phone.trim() || null },
      })
      onSaved(reply.data)
    } catch (caught) {
      setError(serverMessage(caught, ['name', 'location', 'phone']))
    } finally {
      setBusy(false)
    }
  }

  async function resume() {
    setResuming(true)
    setError(null)
    try {
      const reply = await api<{ data: Bay }>(`/admin/branches/${bay.id}/suspend`, { method: 'DELETE', token })
      onResumed(reply.data)
    } catch (caught) {
      setError(serverMessage(caught))
    } finally {
      setResuming(false)
    }
  }

  const suspended = bay.suspended_at !== null

  return (
    <Modal
      open
      onClose={onClose}
      title={bay.name}
      description={suspended ? 'Suspended: nobody in this bay can sign in.' : bay.is_own ? 'Your own bay.' : undefined}
      size="md"
      onSubmit={save}
      footer={
        <ModalActions note={errorNote(error)}>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" busy={busy} disabled={!changed || name.trim() === ''} icon={<Check {...ICON} />}>
            Save details
          </Button>
        </ModalActions>
      }
    >
      <section>
        <SectionTitle>Details</SectionTitle>
        <div className="space-y-4">
          <Field id="manage-name" label="Name" autoComplete="off" autoCapitalize="words" value={name} onChange={(event) => setName(event.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="manage-location" label="Where it is" autoComplete="off" autoCapitalize="words" value={location} onChange={(event) => setLocation(event.target.value)} />
            <Field id="manage-phone" label="Bay phone" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
        </div>
      </section>

      <section className="mt-6">
        <SectionTitle>People who sign in</SectionTitle>
        {peopleError ? (
          <p className="text-danger">{peopleError}</p>
        ) : !people ? (
          <p className="text-text-muted">Loading…</p>
        ) : (
          <ul className="divide-y divide-border rounded-panel border border-border">
            {people.map((person) => (
              <PersonRow key={person.id} bayId={bay.id} person={person} token={token} />
            ))}
          </ul>
        )}
      </section>

      {!bay.is_own && (
        <section className="mt-6">
          <SectionTitle>{suspended ? 'Turn the bay back on' : 'Suspend the bay'}</SectionTitle>
          <p className="mb-3 text-text-muted">
            {suspended
              ? 'Its people can sign in again straight away. Nothing was deleted while it was suspended.'
              : 'Everyone in the bay is signed out and cannot sign in until you turn it back on. Its records are kept.'}
          </p>
          {suspended ? (
            <Button busy={resuming} icon={<Play {...ICON} />} onClick={resume}>
              Turn back on
            </Button>
          ) : (
            <Button variant="danger" icon={<Pause {...ICON} />} onClick={onSuspend}>
              Suspend the bay
            </Button>
          )}
        </section>
      )}
    </Modal>
  )
}

/** One person, with a new PIN for when they have forgotten theirs. */
function PersonRow({ bayId, person, token }: { bayId: string; person: BayPerson; token: string }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function savePin() {
    if (pin.length !== 4) return
    setBusy(true)
    setError(null)
    try {
      await api(`/admin/branches/${bayId}/users/${person.id}/pin`, { method: 'PUT', token, body: { pin } })
      setOpen(false)
      setPin('')
      toast(`${person.name} can sign in with the new PIN. Their old sign-ins have ended.`)
    } catch (caught) {
      setError(serverMessage(caught, ['pin']))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="px-3 py-3">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-accent-tint text-accent">
          <UserRound {...ICON} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 font-semibold text-text">
            <span className="truncate">{person.name}</span>
            <Tag tone="muted" className="capitalize">
              {person.role}
            </Tag>
            {!person.active && <Tag tone="warning">Turned off</Tag>}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-text-muted">
            <span className="money inline-flex items-center gap-1">
              <Phone size={14} strokeWidth={2} aria-hidden="true" />
              {person.phone}
            </span>
            <span>Last seen: {formatLastActive(person.last_seen_at)}</span>
          </p>
        </div>
        {!open && (
          <Button variant="quiet" className="shrink-0" icon={<KeyRound {...ICON} />} onClick={() => setOpen(true)} aria-label={`New PIN for ${person.name}`}>
            <span className="max-sm:sr-only">New PIN</span>
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-3 flex flex-wrap items-end gap-2 sm:pl-13">
          <Field
            id={`pin-${person.id}`}
            label={`New PIN for ${person.name}`}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            className="money w-36"
            value={pin}
            autoFocus
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => {
              // Enter saves this PIN, not the bay details around it.
              if (event.key === 'Enter') {
                event.preventDefault()
                void savePin()
              }
            }}
          />
          <Button busy={busy} disabled={pin.length !== 4} icon={<Check {...ICON} />} onClick={savePin}>
            Save PIN
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              setOpen(false)
              setPin('')
              setError(null)
            }}
          >
            Cancel
          </Button>
          {error && <p className="w-full font-semibold text-danger">{error}</p>}
        </div>
      )}
    </li>
  )
}

function SuspendDialog({ bay, token, onClose, onDone }: { bay: Bay; token: string; onClose: () => void; onDone: (bay: Bay) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const reply = await api<{ data: Bay }>(`/admin/branches/${bay.id}/suspend`, { method: 'POST', token })
      onDone(reply.data)
    } catch (caught) {
      setError(serverMessage(caught, ['branch']))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={`Suspend ${bay.name}?`}
      confirmLabel="Suspend the bay"
      tone="danger"
      icon={<Pause {...ICON} />}
      busy={busy}
      error={error}
      onConfirm={confirm}
    >
      <p>Everyone in {bay.name} is signed out now and cannot sign in until you turn the bay back on.</p>
      <p className="text-text-muted">Sales and other records are kept. Anything a phone has not synced yet stays on that phone.</p>
    </ConfirmDialog>
  )
}
