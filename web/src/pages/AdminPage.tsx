import { Banknote, Building2, Car, Check, ChevronRight, MapPin, Plus, WifiOff } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext.tsx'
import { PillBars } from '../components/charts.tsx'
import { ICON } from '../components/icon.ts'
import Modal, { ModalActions } from '../components/Modal.tsx'
import { focusRing, hitArea } from '../components/styles.ts'
import { useToast } from '../components/Toast.tsx'
import { Button, Card, Field, StatTile, Tag } from '../components/ui.tsx'
import { adminError, lastActive, monthLabel, type Bay } from '../lib/admin.ts'
import { api } from '../lib/api.ts'
import { formatLastActive, formatMoney } from '../lib/format.ts'
import { useOnline } from '../lib/useOnline.ts'

const errorNote = (error: string | null) => error && <p className="font-semibold text-danger">{error}</p>

/**
 * The WashNow admin's home: every washing bay at a glance, how they compare
 * this month, and adding a new bay with its owner. Each bay opens its own
 * page with its people and full figures. Online only: nothing here is stored
 * on the device.
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
        if (!cancelled) setLoadError(adminError(caught))
      })

    return () => {
      cancelled = true
    }
  }, [token, online, reload])

  const heading = <h1 className="mb-4 text-2xl text-text">Washing bays</h1>

  if (!bays) {
    return (
      <>
        {heading}
        <LoadState online={online} error={loadError} what="the washing bays" onRetry={() => setReload((count) => count + 1)} />
      </>
    )
  }

  const month = monthStart ? monthLabel(monthStart) : 'this month'
  const monthTotal = bays.reduce((total, bay) => total + bay.month.sales_total, 0)
  const monthVehicles = bays.reduce((total, bay) => total + bay.month.sales_count, 0)
  const suspendedCount = bays.filter((bay) => bay.suspended_at).length
  const ranked = [...bays].sort((a, b) => b.month.sales_total - a.month.sales_total)

  return (
    <div>
      {heading}
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <StatTile strong icon={Banknote} label={`Sales in ${month}`} value={formatMoney(monthTotal)} note="All bays together" />
          </div>
          <StatTile
            icon={Building2}
            colour="aqua"
            label="Washing bays"
            value={bays.length}
            note={suspendedCount > 0 ? `${bays.length - suspendedCount} running, ${suspendedCount} suspended` : 'All running'}
          />
          <StatTile icon={Car} colour="aqua" label="Vehicles washed" value={monthVehicles} note={`In ${month}`} />
        </div>

        {!online && (
          <p className="rounded-control bg-surface-alt px-3 py-2 text-sm text-text-muted">
            You are offline. These figures are from when you were last connected.
          </p>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
          <Card
            title={bays.length === 1 ? '1 washing bay' : `${bays.length} washing bays`}
            action={
              <Button className="shrink-0" icon={<Plus {...ICON} />} onClick={() => setAdding(true)} aria-label="Add a washing bay">
                <span className="sm:hidden">Add</span>
                <span className="hidden sm:inline">Add a washing bay</span>
              </Button>
            }
          >
            {bays.length === 0 ? (
              <p className="px-4 pb-5 text-text-muted">No washing bays yet. Add the first one and its owner.</p>
            ) : (
              <ul className="grid gap-3 px-4 pt-1 pb-4 md:grid-cols-2">
                {bays.map((bay) => (
                  <BayCard key={bay.id} bay={bay} />
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Takings in ${month}`}>
            <div className="px-4 pt-1 pb-5">
              {monthTotal === 0 ? (
                <p className="text-text-muted">No sales in any bay yet this month.</p>
              ) : (
                <PillBars label={`Takings by bay in ${month}`} rows={ranked.map((bay) => ({ name: bay.name, value: bay.month.sales_total }))} />
              )}
            </div>
          </Card>
        </div>
      </div>

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
    </div>
  )
}

/** While loading, or when the page cannot load (offline, server down). */
export function LoadState({ online, error, what, onRetry }: { online: boolean; error: string | null; what: string; onRetry: () => void }) {
  return (
    <Card>
      <div className="flex items-start gap-3 px-4 py-5">
        {online && !error ? (
          <p className="text-text-muted">Loading {what}…</p>
        ) : (
          <>
            <WifiOff {...ICON} className="mt-0.5 shrink-0 text-text-muted" />
            <div>
              <p className="font-semibold text-text">{online ? `Could not load ${what}` : 'This page needs internet'}</p>
              <p className="text-text-muted">{error ?? 'Connect to the internet and it loads by itself.'}</p>
              {online && (
                <Button variant="secondary" className="mt-3" onClick={onRetry}>
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

function BayCard({ bay }: { bay: Bay }) {
  const owner = bay.owners[0]
  const suspended = bay.suspended_at !== null

  return (
    <li className={`flex min-w-0 flex-col rounded-panel border border-border p-4 ${suspended ? 'bg-surface-alt' : 'bg-surface'}`}>
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
        {suspended ? <Tag tone="danger">Suspended</Tag> : <Tag tone="success">Running</Tag>}
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
          {owner ? (
            <>
              <dd className="truncate font-semibold text-text">{owner.name}</dd>
              <dd className="money truncate text-sm text-text-muted">{owner.phone}</dd>
            </>
          ) : (
            <dd>
              <Tag tone="warning">No owner yet</Tag>
            </dd>
          )}
        </div>
        <div>
          <dt className="text-sm text-text-muted">Last active</dt>
          <dd className="font-semibold text-text">{formatLastActive(lastActive(bay))}</dd>
          <dd className="text-sm text-text-muted">{bay.staff_count === 1 ? '1 person signs in' : `${bay.staff_count} people sign in`}</dd>
        </div>
      </dl>

      <div className="mt-4 flex justify-end border-t border-border pt-3">
        <Link
          to={`/admin/bays/${bay.id}`}
          aria-label={`Open ${bay.name}`}
          className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-pill border border-border bg-surface px-4 text-[0.9375rem] font-semibold text-text hover:bg-surface-alt ${hitArea} ${focusRing}`}
        >
          Open
          <ChevronRight {...ICON} />
        </Link>
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
      setError(adminError(caught, ['name', 'owner_phone', 'owner_pin', 'owner_name', 'location', 'phone']))
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
