import { Banknote, Car, Check, ChevronLeft, Clock, KeyRound, MapPin, Pause, Pencil, Phone, Play, Power, UserRound, UserRoundPlus, UsersRound } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/AuthContext.tsx'
import { ICON } from '../components/icon.ts'
import Modal, { ConfirmDialog, ModalActions } from '../components/Modal.tsx'
import { focusRing } from '../components/styles.ts'
import { useToast } from '../components/Toast.tsx'
import { Button, Card, Choice, Field, StatTile, Tag } from '../components/ui.tsx'
import { adminError, lastActive, monthLabel, slug, type Bay, type BayPerson } from '../lib/admin.ts'
import { api } from '../lib/api.ts'
import { formatLastActive, formatMoney } from '../lib/format.ts'
import { useOnline } from '../lib/useOnline.ts'
import { LoadState } from './AdminPage.tsx'
import { ReportView } from './ReportsPage.tsx'

const errorNote = (error: string | null) => error && <p className="font-semibold text-danger">{error}</p>

/**
 * One washing bay, for the WashNow admin: its details and status, the people
 * who sign in to it (add owners and cashiers, new PINs, turn someone off),
 * and its full figures for any dates, with Excel and PDF.
 */
export default function AdminBayPage() {
  const { id = '' } = useParams()
  const { account } = useAuth()
  const token = account?.token ?? null
  const online = useOnline()
  const toast = useToast()

  const [bay, setBay] = useState<Bay | null>(null)
  const [monthStart, setMonthStart] = useState<string | null>(null)
  const [people, setPeople] = useState<BayPerson[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const [editing, setEditing] = useState(false)
  const [addingPerson, setAddingPerson] = useState(false)
  const [suspending, setSuspending] = useState(false)
  const [turningOff, setTurningOff] = useState<BayPerson | null>(null)
  const [resuming, setResuming] = useState(false)

  useEffect(() => {
    if (!token || !online || !id) return

    let cancelled = false
    Promise.all([
      api<{ data: Bay; month_start: string }>(`/admin/branches/${id}`, { token }),
      api<{ data: BayPerson[] }>(`/admin/branches/${id}/users`, { token }),
    ])
      .then(([bayReply, peopleReply]) => {
        if (cancelled) return
        setBay(bayReply.data)
        setMonthStart(bayReply.month_start)
        setPeople(peopleReply.data)
        setLoadError(null)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoadError(adminError(caught))
      })

    return () => {
      cancelled = true
    }
  }, [token, online, id, reload])

  const backLink = (
    <Link to="/admin" className={`mb-3 inline-flex min-h-10 items-center gap-1 rounded-pill pr-3 font-semibold text-accent hover:underline ${focusRing}`}>
      <ChevronLeft {...ICON} />
      All washing bays
    </Link>
  )

  if (!bay || !people || !token) {
    return (
      <>
        {backLink}
        <LoadState online={online} error={loadError} what="this washing bay" onRetry={() => setReload((count) => count + 1)} />
      </>
    )
  }

  const suspended = bay.suspended_at !== null
  const month = monthStart ? monthLabel(monthStart) : 'this month'
  const hasOwner = people.some((person) => person.role === 'owner' && person.active)

  // People changed: the bay's counts (owner, staff) come from the server again.
  async function refreshBay() {
    try {
      const reply = await api<{ data: Bay }>(`/admin/branches/${id}`, { token })
      setBay(reply.data)
    } catch {
      // The figures catch up on the next visit.
    }
  }

  function replacePerson(person: BayPerson) {
    setPeople((current) => (current ?? []).map((existing) => (existing.id === person.id ? person : existing)))
    void refreshBay()
  }

  async function resume() {
    setResuming(true)
    try {
      const reply = await api<{ data: Bay }>(`/admin/branches/${id}/suspend`, { method: 'DELETE', token })
      setBay(reply.data)
      toast(`${reply.data.name} is running again. Its people can sign in.`)
    } catch (caught) {
      toast(adminError(caught))
    } finally {
      setResuming(false)
    }
  }

  async function turnOn(person: BayPerson) {
    try {
      const reply = await api<{ data: BayPerson }>(`/admin/branches/${id}/users/${person.id}`, { method: 'PUT', token, body: { active: true } })
      replacePerson(reply.data)
      toast(`${person.name} can sign in again.`)
    } catch (caught) {
      toast(adminError(caught))
    }
  }

  return (
    <div>
      {backLink}

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl leading-tight [overflow-wrap:anywhere] text-text">{bay.name}</h1>
            {suspended ? <Tag tone="danger">Suspended</Tag> : <Tag tone="success">Running</Tag>}
            {!hasOwner && <Tag tone="warning">No owner yet</Tag>}
          </div>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-text-muted">
            {bay.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={16} strokeWidth={2} aria-hidden="true" />
                {bay.location}
              </span>
            )}
            {bay.phone && (
              <span className="money inline-flex items-center gap-1">
                <Phone size={16} strokeWidth={2} aria-hidden="true" />
                {bay.phone}
              </span>
            )}
            {suspended && bay.suspended_at && <span>Suspended {formatLastActive(bay.suspended_at).toLowerCase()}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Pencil {...ICON} />} onClick={() => setEditing(true)}>
            Edit details
          </Button>
          {suspended ? (
            <Button busy={resuming} icon={<Play {...ICON} />} onClick={() => void resume()}>
              Turn back on
            </Button>
          ) : (
            <Button variant="danger" icon={<Pause {...ICON} />} onClick={() => setSuspending(true)}>
              Suspend
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="col-span-2 lg:col-span-1">
            <StatTile strong icon={Banknote} label={`Sales in ${month}`} value={formatMoney(bay.month.sales_total)} />
          </div>
          <StatTile icon={Car} colour="aqua" label="Vehicles" value={bay.month.sales_count} note={`In ${month}`} />
          <StatTile icon={UsersRound} colour="aqua" label="People" value={bay.staff_count} note="Can sign in" />
          <div className="col-span-2 lg:col-span-1">
            <StatTile icon={Clock} label="Last active" value={<span className="text-xl">{formatLastActive(lastActive(bay))}</span>} />
          </div>
        </div>

        <Card
          title="People who sign in"
          action={
            <Button className="shrink-0" icon={<UserRoundPlus {...ICON} />} onClick={() => setAddingPerson(true)} aria-label="Add a person to this bay">
              <span className="sm:hidden">Add</span>
              <span className="hidden sm:inline">Add a person</span>
            </Button>
          }
        >
          {people.length === 0 ? (
            <p className="px-4 pb-5 text-text-muted">Nobody signs in to this bay yet. Add its owner.</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {people.map((person) => (
                <PersonRow key={person.id} bayId={id} person={person} token={token} onTurnOff={() => setTurningOff(person)} onTurnOn={() => void turnOn(person)} />
              ))}
            </ul>
          )}
        </Card>

        <section aria-labelledby="bay-figures">
          <h2 id="bay-figures" className="mb-3 text-xl text-text">
            Takings and figures
          </h2>
          <ReportView basePath={`/admin/branches/${id}/reports`} fileLabel={slug(bay.name)} />
        </section>
      </div>

      {editing && (
        <EditBayDrawer
          bay={bay}
          token={token}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setBay(saved)
            setEditing(false)
            toast(`${saved.name} is saved.`)
          }}
        />
      )}

      {addingPerson && (
        <AddPersonDrawer
          bay={bay}
          token={token}
          suggestOwner={!hasOwner}
          onClose={() => setAddingPerson(false)}
          onAdded={(person) => {
            setAddingPerson(false)
            setPeople((current) => [...(current ?? []), person])
            void refreshBay()
            toast(`${person.name} can sign in to ${bay.name} now.`)
          }}
        />
      )}

      {suspending && (
        <SuspendDialog
          bay={bay}
          token={token}
          onClose={() => setSuspending(false)}
          onDone={(saved) => {
            setBay(saved)
            setSuspending(false)
            toast(`${saved.name} is suspended. Everyone in it has been signed out.`)
          }}
        />
      )}

      {turningOff && (
        <TurnOffDialog
          bayId={id}
          person={turningOff}
          token={token}
          onClose={() => setTurningOff(null)}
          onDone={(saved) => {
            replacePerson(saved)
            setTurningOff(null)
            toast(`${saved.name} is turned off and signed out.`)
          }}
        />
      )}
    </div>
  )
}

/** One person, with a new PIN for when they forget theirs, and turning them off or on. */
function PersonRow({
  bayId,
  person,
  token,
  onTurnOff,
  onTurnOn,
}: {
  bayId: string
  person: BayPerson
  token: string
  onTurnOff: () => void
  onTurnOn: () => void
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function savePin(event: FormEvent) {
    event.preventDefault()
    if (pin.length !== 4) return
    setBusy(true)
    setError(null)
    try {
      await api(`/admin/branches/${bayId}/users/${person.id}/pin`, { method: 'PUT', token, body: { pin } })
      setOpen(false)
      setPin('')
      toast(`${person.name} can sign in with the new PIN. Their old sign-ins have ended.`)
    } catch (caught) {
      setError(adminError(caught, ['pin']))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-pill ${person.active ? 'bg-accent-tint text-accent' : 'bg-surface-alt text-text-muted'}`}>
          <UserRound {...ICON} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-text">
            <span className="[overflow-wrap:anywhere]">{person.name}</span>
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
          <div className="flex gap-1 max-sm:w-full max-sm:justify-end">
            <Button variant="quiet" icon={<KeyRound {...ICON} />} onClick={() => setOpen(true)} aria-label={`New PIN for ${person.name}`}>
              New PIN
            </Button>
            {person.active ? (
              <Button variant="quiet" icon={<Power {...ICON} />} onClick={onTurnOff} aria-label={`Turn off ${person.name}`}>
                Turn off
              </Button>
            ) : (
              <Button variant="quiet" icon={<Power {...ICON} />} onClick={onTurnOn} aria-label={`Turn on ${person.name}`}>
                Turn on
              </Button>
            )}
          </div>
        )}
      </div>

      {open && (
        <form onSubmit={savePin} className="mt-3 flex flex-wrap items-end gap-2 sm:pl-13">
          <Field
            id={`pin-${person.id}`}
            label={`New PIN for ${person.name}`}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            className="money w-36"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
          />
          <Button type="submit" busy={busy} disabled={pin.length !== 4} icon={<Check {...ICON} />}>
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
        </form>
      )}
    </li>
  )
}

function EditBayDrawer({ bay, token, onClose, onSaved }: { bay: Bay; token: string; onClose: () => void; onSaved: (bay: Bay) => void }) {
  const [name, setName] = useState(bay.name)
  const [location, setLocation] = useState(bay.location ?? '')
  const [phone, setPhone] = useState(bay.phone ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      setError(adminError(caught, ['name', 'location', 'phone']))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit the bay's details"
      size="sm"
      onSubmit={save}
      footer={
        <ModalActions note={errorNote(error)}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} disabled={!changed || name.trim() === ''} icon={<Check {...ICON} />}>
            Save
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        <Field id="edit-name" data-autofocus label="Name" autoComplete="off" autoCapitalize="words" value={name} onChange={(event) => setName(event.target.value)} />
        <Field id="edit-location" label="Where it is" autoComplete="off" autoCapitalize="words" value={location} onChange={(event) => setLocation(event.target.value)} />
        <Field id="edit-phone" label="Bay phone" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(event) => setPhone(event.target.value)} />
      </div>
    </Modal>
  )
}

function AddPersonDrawer({
  bay,
  token,
  suggestOwner,
  onClose,
  onAdded,
}: {
  bay: Bay
  token: string
  suggestOwner: boolean
  onClose: () => void
  onAdded: (person: BayPerson) => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [role, setRole] = useState<BayPerson['role']>(suggestOwner ? 'owner' : 'cashier')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = name.trim() !== '' && phone.trim() !== '' && pin.length === 4

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const reply = await api<{ data: BayPerson }>(`/admin/branches/${bay.id}/users`, {
        method: 'POST',
        token,
        body: { name: name.trim(), phone, pin, role },
      })
      onAdded(reply.data)
    } catch (caught) {
      setError(adminError(caught, ['phone', 'pin', 'name', 'role']))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add someone to ${bay.name}`}
      size="sm"
      onSubmit={submit}
      footer={
        <ModalActions note={errorNote(error)}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} disabled={!ready} icon={<Check {...ICON} />}>
            Add person
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-text">Role</legend>
          <div className="grid grid-cols-2 gap-2">
            <Choice chosen={role === 'owner'} onClick={() => setRole('owner')}>
              <span className="block">Owner</span>
              <span className={`block text-sm font-normal ${role === 'owner' ? 'text-surface/85' : 'text-text-muted'}`}>Runs the bay, sees everything</span>
            </Choice>
            <Choice chosen={role === 'cashier'} onClick={() => setRole('cashier')}>
              <span className="block">Cashier</span>
              <span className={`block text-sm font-normal ${role === 'cashier' ? 'text-surface/85' : 'text-text-muted'}`}>Records sales and expenses</span>
            </Choice>
          </div>
        </fieldset>
        <Field id="person-name" data-autofocus label="Name" autoComplete="off" autoCapitalize="words" value={name} onChange={(event) => setName(event.target.value)} />
        <Field id="person-phone" label="Phone number (they sign in with this)" type="tel" inputMode="tel" autoComplete="off" placeholder="024 000 0000" value={phone} onChange={(event) => setPhone(event.target.value)} />
        <Field
          id="person-pin"
          label="PIN (4 digits)"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          className="money"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
          hint="Tell them this PIN yourself. It is not shown again."
        />
      </div>
    </Modal>
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
      setError(adminError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog open onClose={onClose} title={`Suspend ${bay.name}?`} confirmLabel="Suspend the bay" tone="danger" icon={<Pause {...ICON} />} busy={busy} error={error} onConfirm={() => void confirm()}>
      <p>Everyone in {bay.name} is signed out now and cannot sign in until you turn the bay back on.</p>
      <p className="text-text-muted">Sales and other records are kept. Anything a phone has not synced yet stays on that phone.</p>
    </ConfirmDialog>
  )
}

function TurnOffDialog({
  bayId,
  person,
  token,
  onClose,
  onDone,
}: {
  bayId: string
  person: BayPerson
  token: string
  onClose: () => void
  onDone: (person: BayPerson) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const reply = await api<{ data: BayPerson }>(`/admin/branches/${bayId}/users/${person.id}`, { method: 'PUT', token, body: { active: false } })
      onDone(reply.data)
    } catch (caught) {
      setError(adminError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog open onClose={onClose} title={`Turn off ${person.name}?`} confirmLabel="Turn off" tone="danger" icon={<Power {...ICON} />} busy={busy} error={error} onConfirm={() => void confirm()}>
      <p>{person.name} is signed out of every phone and cannot sign in until you turn them back on.</p>
      <p className="text-text-muted">The sales they recorded are kept.</p>
    </ConfirmDialog>
  )
}
