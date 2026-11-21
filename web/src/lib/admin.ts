import { ApiError, NetworkError } from './api.ts'

/** One washing bay as the WashNow admin sees it (GET /admin/branches). */
export type Bay = {
  id: string
  name: string
  location: string | null
  phone: string | null
  suspended_at: string | null
  created_at: string | null
  owners: { id: string; name: string; phone: string; active: boolean }[]
  staff_count: number
  month: { sales_count: number; sales_total: number }
  last_sale_at: string | null
  last_seen_at: string | null
}

/** Someone who signs in to a bay (GET /admin/branches/{id}/users). */
export type BayPerson = {
  id: string
  name: string
  phone: string
  role: 'owner' | 'cashier'
  active: boolean
  last_seen_at: string | null
}

/** What went wrong, in words for the screen. */
export function adminError(caught: unknown, fields: string[] = []): string {
  if (caught instanceof NetworkError) return 'Could not reach the server. This page needs internet.'
  if (caught instanceof ApiError) {
    for (const field of fields) {
      if (caught.errors[field]?.[0]) return caught.errors[field][0]
    }
    return caught.message
  }
  return 'That did not work. Try again.'
}

/** The later of the bay's last sale and the last time anyone in it used the app. */
export function lastActive(bay: Bay): string | null {
  const times = [bay.last_sale_at, bay.last_seen_at].filter((value): value is string => value !== null)
  return times.sort().at(-1) ?? null
}

/** "Adenta Wash Bay" becomes "adenta-wash-bay", for file names. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const monthName = new Intl.DateTimeFormat('en-GH', { month: 'long', timeZone: 'Africa/Accra' })

/** "2026-11-01" becomes "November". */
export function monthLabel(monthStart: string): string {
  return monthName.format(new Date(`${monthStart}T12:00:00Z`))
}
