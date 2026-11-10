import { ChevronLeft, LockOpen, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext.tsx'
import AuthLayout from '../components/AuthLayout.tsx'
import { ICON } from '../components/icon.ts'
import { Button, Field } from '../components/ui.tsx'
import type { Account } from '../db/types.ts'

/** Wrong PINs allowed before the device makes the person wait. */
const MAX_TRIES = 5
const WAIT_MS = 60_000

// Kept outside the component so leaving and re-opening the screen does not
// reset the count.
const tries = new Map<string, { count: number; lockedUntil: number }>()

/**
 * Choose who you are, then enter your PIN. Works with no internet, which is
 * also how two people share one phone or laptop.
 */
export default function UnlockPage() {
  const { ready, account, accounts, unlock } = useAuth()
  const navigate = useNavigate()

  const [chosenId, setChosenId] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!ready) return null
  if (account) return <Navigate to="/" replace />
  if (accounts.length === 0) return <Navigate to="/login" replace />

  // With one person on the device there is nothing to choose.
  const chosen: Account | null = accounts.find((candidate) => candidate.user_id === chosenId) ?? (accounts.length === 1 ? accounts[0] : null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!chosen) return

    const record = tries.get(chosen.user_id) ?? { count: 0, lockedUntil: 0 }
    const now = Date.now()

    if (record.lockedUntil > now) {
      setError(`Too many wrong PINs. Wait ${Math.ceil((record.lockedUntil - now) / 1000)} seconds and try again.`)
      setPin('')
      return
    }

    setBusy(true)
    setError(null)
    const correct = await unlock(chosen.user_id, pin)
    setBusy(false)

    if (correct) {
      tries.delete(chosen.user_id)
      navigate('/', { replace: true })
      return
    }

    const count = record.count + 1
    tries.set(chosen.user_id, count >= MAX_TRIES ? { count: 0, lockedUntil: now + WAIT_MS } : { count, lockedUntil: 0 })
    setPin('')
    setError(count >= MAX_TRIES ? 'Too many wrong PINs. Wait a minute and try again.' : 'That PIN is not right. Try again.')
  }

  return (
    <AuthLayout>

      {!chosen ? (
        <>
          <h1 className="text-2xl text-text">Who is using WashNow?</h1>
          <ul className="mt-6 space-y-2">
            {accounts.map((candidate) => (
              <li key={candidate.user_id}>
                <button
                  type="button"
                  onClick={() => {
                    setChosenId(candidate.user_id)
                    setPin('')
                    setError(null)
                  }}
                  className="flex min-h-14 w-full items-center gap-3 rounded-card border border-border bg-surface px-4 text-left hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <UserRound {...ICON} className="shrink-0 text-accent" />
                  <span>
                    <span className="block font-semibold text-text">{candidate.name}</span>
                    <span className="block text-sm text-text-muted capitalize">{candidate.role}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <h1 className="text-2xl text-text">Hello, {chosen.name}</h1>
          <p className="mt-1 text-text-muted">Enter your PIN to unlock.</p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <Field
              id="unlock-pin"
              label="PIN"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="4 digits"
              autoFocus
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              error={error}
            />
            <Button type="submit" busy={busy} disabled={pin.length !== 4} icon={<LockOpen {...ICON} />} className="w-full">
              Unlock
            </Button>
          </form>

          {accounts.length > 1 && (
            <Button variant="quiet" className="mt-2 w-full" icon={<ChevronLeft {...ICON} />} onClick={() => setChosenId(null)}>
              Someone else
            </Button>
          )}
        </>
      )}

      <p className="mt-6 text-text-muted">
        Not on this list?{' '}
        <Link to="/login" className="font-semibold text-accent underline">
          Sign in with phone number and PIN
        </Link>
      </p>
    </AuthLayout>
  )
}
