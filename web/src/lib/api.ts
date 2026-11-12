export const API_URL = import.meta.env.VITE_API_URL.replace(/\/$/, '')

/** The server answered, but with an error (wrong PIN, validation, no access). */
export class ApiError extends Error {
  readonly status: number
  readonly errors: Record<string, string[]>

  constructor(status: number, message: string, errors: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }
}

/** The server could not be reached at all: offline, timed out, or down. */
export class NetworkError extends Error {
  constructor(message = 'Could not reach the server.') {
    super(message)
    this.name = 'NetworkError'
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  token?: string | null
  timeoutMs?: number
}

/**
 * Fetch a file (a report export) and hand it to the browser to save. The
 * token goes in a header, so this cannot be a plain link.
 */
export async function downloadFile(path: string, token: string | null, fileName: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(60_000),
    })
  } catch {
    throw new NetworkError()
  }

  if (!response.ok) {
    const details = ((await response.json().catch(() => null)) ?? {}) as { message?: string }
    throw new ApiError(response.status, details.message ?? `The server answered with status ${response.status}.`)
  }

  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { method = 'GET', body, token, timeoutMs = 20_000 } = options

  let response: Response
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new NetworkError()
  }

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const details = (payload ?? {}) as { message?: string; errors?: Record<string, string[]> }
    throw new ApiError(response.status, details.message ?? `The server answered with status ${response.status}.`, details.errors)
  }

  return payload as T
}
