import { LogIn, WifiOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthContext.tsx'
import AuthLayout from '../components/AuthLayout.tsx'
import { ICON } from '../components/icon.ts'
import { Button, Field } from '../components/ui.tsx'
import { ApiError, NetworkError } from '../lib/api.ts'
import { useOnline } from '../lib/useOnline.ts'

/**
 * Sign in with phone number and PIN. This is the only screen that needs
 * internet: it is used the first time someone uses this device, and again if
 * their PIN is changed or their access is turned off and on.
 */
export default function LoginPage() {
  const { account, accounts, signIn } = useAuth()
  const online = useOnline()
  const location = useLocation()
  const prefill = (location.state as { phone?: string; notice?: string } | null) ?? {}

  const [phone, setPhone] = useState(prefill.phone ?? '')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (account?.token) return <Navigate to="/" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)

    try {
      await signIn(phone, pin)
    } catch (caught) {
      setPin('')
      if (caught instanceof NetworkError) {
        setError('Could not reach the server. Check the internet connection and try again.')
      } else if (caught instanceof ApiError) {
        setError(caught.errors.phone?.[0] ?? caught.errors.pin?.[0] ?? caught.message)
      } else {
        setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>

      <h1 className="text-2xl text-text">Sign in</h1>
      <p className="mt-1 text-text-muted">Use the phone number and PIN the owner gave you.</p>

      {prefill.notice && <p className="mt-4 rounded-control border border-warning px-3 py-2 text-warning">{prefill.notice}</p>}

      {!online && (
        <p className="mt-4 flex items-start gap-2 rounded-control border border-warning px-3 py-2 text-warning">
          <WifiOff {...ICON} className="mt-0.5 shrink-0" />
          You are offline. Signing in on this device for the first time needs internet.
        </p>
      )}

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Field
          id="phone"
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="username"
          placeholder="024 000 0000"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          required
        />
        <Field
          id="pin"
          label="PIN"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          pattern="[0-9]*"
          maxLength={4}
          placeholder="4 digits"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
          error={error}
          required
        />
        <Button type="submit" busy={busy} disabled={phone.trim() === '' || pin.length !== 4} icon={<LogIn {...ICON} />} className="w-full">
          Sign in
        </Button>
      </form>

      {accounts.length > 0 && (
        <p className="mt-6 text-text-muted">
          Already signed in on this device?{' '}
          <Link to="/unlock" className="font-semibold text-accent underline">
            Unlock with your PIN
          </Link>
        </p>
      )}
    </AuthLayout>
  )
}
