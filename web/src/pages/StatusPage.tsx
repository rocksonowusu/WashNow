import { CircleAlert, CircleCheck, LoaderCircle, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { API_URL, getHealth } from '../lib/api.ts'

type Check =
  | { state: 'checking' }
  | { state: 'ok'; status: string }
  | { state: 'failed'; reason: string }

export default function StatusPage() {
  const [check, setCheck] = useState<Check>({ state: 'checking' })

  const runCheck = useCallback((signal?: AbortSignal) => {
    getHealth(signal)
      .then((status) => setCheck({ state: 'ok', status }))
      .catch((error: unknown) => {
        if (signal?.aborted) return
        setCheck({
          state: 'failed',
          reason:
            error instanceof TypeError
              ? 'Could not reach the API. Check that it is running.'
              : error instanceof Error
                ? error.message
                : 'Something went wrong.',
        })
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    runCheck(controller.signal)
    return () => controller.abort()
  }, [runCheck])

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-2xl items-center px-4 py-3">
          <img
            src="/brand/washnow-logo.svg"
            alt="WashNow"
            className="h-9 w-auto"
          />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl text-text">Setup check</h1>
        <p className="mt-1 text-text-muted">
          This page confirms the app can talk to the server.
        </p>

        <section className="mt-5 rounded-card border border-border bg-surface">
          <div className="flex items-center justify-between gap-4 px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-text-muted">Server</p>
              <p className="break-all text-text">{API_URL}</p>
            </div>
            <StatusLabel check={check} />
          </div>

          {check.state === 'failed' && (
            <p className="border-t border-border px-4 py-3 text-danger">
              {check.reason}
            </p>
          )}

          <div className="border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={() => {
                setCheck({ state: 'checking' })
                runCheck()
              }}
              disabled={check.state === 'checking'}
              className="inline-flex min-h-12 items-center gap-2 rounded-control bg-accent px-4 font-semibold text-surface hover:bg-accent-pressed active:bg-accent-pressed disabled:bg-surface-alt disabled:text-text-muted"
            >
              <RefreshCw size={20} strokeWidth={2} aria-hidden="true" />
              Check again
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

function StatusLabel({ check }: { check: Check }) {
  if (check.state === 'checking') {
    return (
      <span className="inline-flex items-center gap-2 font-semibold text-text-muted">
        <LoaderCircle
          size={20}
          strokeWidth={2}
          className="animate-spin"
          aria-hidden="true"
        />
        Checking
      </span>
    )
  }

  if (check.state === 'failed') {
    return (
      <span className="inline-flex items-center gap-2 font-semibold text-danger">
        <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
        Not reachable
      </span>
    )
  }

  return (
    <span
      data-testid="health-status"
      className="inline-flex items-center gap-2 font-semibold text-success"
    >
      <CircleCheck size={20} strokeWidth={2} aria-hidden="true" />
      {check.status}
    </span>
  )
}
