import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Pencil, Trash2, UserRoundPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { ICON } from '../components/icon.ts'
import Modal, { ConfirmDialog, ModalActions } from '../components/Modal.tsx'
import { tableHead } from '../components/styles.ts'
import { useToast } from '../components/Toast.tsx'
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
  const toast = useToast()
  const crew = useLiveQuery(() => db.washers.orderBy('name').toArray(), [])
  const branch = useLiveQuery(() => (account ? db.branches.get(account.branch_id) : undefined), [account?.branch_id])
  const waiting = useLiveQuery(async () => new Set((await db.outbox.toArray()).map((item) => item.record_id)), [])
  const [adding, setAdding] = useState(false)

  if (!account || !crew) return null

  const isOwner = account.role === 'owner'
  const standard = branch?.default_commission_percent ?? null

  return (
    <div className="space-y-5">
      <div className={`grid items-start gap-5 ${isOwner ? 'xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''}`}>
        <Card
          title={crew.length === 1 ? '1 person on the crew' : `${crew.length} people on the crew`}
          action={
            <Button icon={<UserRoundPlus {...ICON} />} className="shrink-0" aria-label="Add someone to the crew" onClick={() => setAdding(true)}>
              <span className="sm:hidden">Add</span>
              <span className="hidden sm:inline">Add someone</span>
            </Button>
          }
        >
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

        {isOwner && <StandardRateCard account={account} standard={standard} />}
      </div>

      <AddCrewDialog
        account={account}
        standard={standard}
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(text) => {
          setAdding(false)
          toast(text)
        }}
      />
    </div>
  )
}

function AddCrewDialog({
  account,
  standard,
  open,
  onClose,
  onSaved,
}: {
  account: Account
  standard: string | null
  open: boolean
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const isOwner = account.role === 'owner'

  const [name, setName] = useState('')
  const [percentText, setPercentText] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function close() {
    setErrors({})
    onClose()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()

    let commissionPercent: number | null = null
    if (isOwner && percentText.trim() !== '') {
      commissionPercent = parsePercent(percentText)
      if (commissionPercent === null) return setErrors({ commissionPercent: 'Enter a number from 0 to 100.' })
    }

    setBusy(true)
    try {
      const member = await createCrewMember(account, { name, commissionPercent })
      setName('')
      setPercentText('')
      setErrors({})
      onSaved(`${member.name} is on the crew.`)
    } catch (caught) {
      if (caught instanceof LocalValidationError) setErrors({ [caught.field]: caught.message })
      else setErrors({ name: 'Could not add this person. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add someone to the crew"
      size="sm"
      onSubmit={submit}
      footer={
        <ModalActions note={!isOwner && errors.commissionPercent && <p className="font-semibold text-danger">{errors.commissionPercent}</p>}>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} disabled={name.trim() === ''} icon={<UserRoundPlus {...ICON} />}>
            Add to crew
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        <Field
          id="crew-name"
          data-autofocus
          label="Name"
          autoComplete="off"
          autoCapitalize="words"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setErrors({})
          }}
          error={errors.name}
        />

        {isOwner && (
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
        )}
      </div>
    </Modal>
  )
}

/**
 * Owner only. This is a setting on the server, so changing it needs internet;
 * every device then picks it up on its next sync.
 */
function StandardRateCard({ account, standard }: { account: Account; standard: string | null }) {
  const online = useOnline()
  const toast = useToast()

  const [changing, setChanging] = useState(false)
  const [percentText, setPercentText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    setChanging(false)
    setPercentText('')
    setError(null)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()

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

      close()
      toast(`Standard commission is now ${showPercent(reply.data.default_commission_percent)}.`)
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
      <div className="space-y-4 px-4 py-4">
        <p className="text-text-muted">
          What a new person earns when a cashier adds them while recording a sale. You can still give anyone their own rate.
        </p>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <p>
            <span className="text-sm text-text-muted">Now</span>
            <span className="money block font-heading text-2xl font-bold text-text">{showPercent(standard)}</span>
          </p>
          <Button variant="secondary" icon={<Pencil {...ICON} />} disabled={!online} onClick={() => setChanging(true)}>
            Change
          </Button>
        </div>

        {standard === null && (
          <p className="rounded-control bg-warning px-3 py-2 font-semibold text-text">Until this is set, cashiers cannot add new people.</p>
        )}
        {!online && <p className="text-sm text-text-muted">You are offline. Changing this needs internet.</p>}
      </div>

      <Modal
        open={changing}
        onClose={close}
        title="Standard commission"
        description={`Now ${showPercent(standard)}`}
        size="sm"
        onSubmit={submit}
        footer={
          <ModalActions>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" busy={busy} disabled={!online || percentText.trim() === ''} icon={<Check {...ICON} />}>
              Save
            </Button>
          </ModalActions>
        }
      >
        <Field
          id="standard-percent"
          data-autofocus
          label="New standard commission (%)"
          inputMode="decimal"
          autoComplete="off"
          placeholder="For example 30"
          value={percentText}
          onChange={(event) => {
            setPercentText(event.target.value)
            setError(null)
          }}
          error={error}
          hint={online ? 'People with their own rate keep it.' : 'You are offline. This setting needs internet.'}
        />
      </Modal>
    </Card>
  )
}

function CrewRow({ account, member, waiting }: { account: Account; member: Washer; waiting: boolean }) {
  const isOwner = account.role === 'owner'
  const toast = useToast()

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

  function close() {
    setError(null)
    setMode('view')
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const commissionPercent = parsePercent(percentText)
    if (commissionPercent === null) return setError('Commission must be a number from 0 to 100.')

    try {
      await updateCrewMember(account, member.id, { name, commissionPercent })
      close()
      toast(`${name.trim()} is saved.`)
    } catch (caught) {
      setError(message(caught, 'Could not save. Try again.'))
    }
  }

  async function remove() {
    try {
      await removeCrewMember(account, member.id)
      close()
      toast(`${member.name} is off the crew.`)
    } catch (caught) {
      setError(message(caught, 'Could not remove. Try again.'))
    }
  }

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-3">
        <span className="font-semibold text-text">{member.name}</span>
        {waiting && <span className="ml-2 align-middle"><Tag tone="warning">Waiting to sync</Tag></span>}
      </td>
      {isOwner && <td className="money px-4 py-3 text-right text-text">{showPercent(member.commission_percent)}</td>}
      {isOwner && (
        <td className="px-4 py-2 text-right">
          <span className="inline-flex justify-end gap-1">
            <Button variant="quiet" icon={<Pencil {...ICON} />} aria-label={`Change ${member.name}`} onClick={startEditing}>
              <span className="hidden sm:inline">Change</span>
            </Button>
            <Button variant="quiet" icon={<Trash2 {...ICON} />} aria-label={`Remove ${member.name}`} onClick={() => setMode('remove')}>
              <span className="hidden sm:inline">Remove</span>
            </Button>
          </span>

          <Modal
            open={mode === 'edit'}
            onClose={close}
            title={`Change ${member.name}`}
            size="sm"
            onSubmit={save}
            footer={
              <ModalActions note={error && <p className="font-semibold text-danger">{error}</p>}>
                <Button variant="secondary" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" icon={<Check {...ICON} />}>
                  Save
                </Button>
              </ModalActions>
            }
          >
            <div className="space-y-4 text-left">
              <Field id={`name-${member.id}`} label="Name" autoComplete="off" autoCapitalize="words" value={name} onChange={(event) => setName(event.target.value)} />
              <Field
                id={`percent-${member.id}`}
                label="Commission (%)"
                inputMode="decimal"
                autoComplete="off"
                className="money"
                value={percentText}
                onChange={(event) => setPercentText(event.target.value)}
                hint="A new rate applies to sales from now on. Past sales keep the rate they were recorded with."
              />
            </div>
          </Modal>

          <ConfirmDialog
            open={mode === 'remove'}
            onClose={close}
            title={`Remove ${member.name}?`}
            tone="danger"
            icon={<Trash2 {...ICON} />}
            confirmLabel={`Remove ${member.name}`}
            cancelLabel="Keep"
            error={error}
            onConfirm={() => void remove()}
          >
            <p className="text-left">
              {member.name} will no longer be offered when recording a sale. Sales they already washed, and the commission on them, stay as they are.
            </p>
          </ConfirmDialog>
        </td>
      )}
    </tr>
  )
}
