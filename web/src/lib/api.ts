export const API_URL = import.meta.env.VITE_API_URL.replace(/\/$/, '')

export async function getHealth(signal?: AbortSignal): Promise<string> {
  const response = await fetch(`${API_URL}/api/health`, {
    headers: { Accept: 'application/json' },
    signal,
  })

  if (!response.ok) {
    throw new Error(`The API answered with status ${response.status}.`)
  }

  const body: { status: string } = await response.json()
  return body.status
}
