const cedis = new Intl.NumberFormat('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 1500 pesewas becomes "GH₵15.00". */
export function formatMoney(pesewas: number): string {
  return `GH₵${cedis.format(pesewas / 100)}`
}

/**
 * What a cashier types ("35", "35.5", "35.50") becomes whole pesewas.
 * Returns null for anything that is not a positive amount.
 */
export function parseMoney(text: string): number | null {
  const clean = text.trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null

  const pesewas = Math.round(parseFloat(clean) * 100)
  return pesewas > 0 ? pesewas : null
}

/** Same rule as the server: capital letters and digits only. */
export function normalisePlate(plate: string | null | undefined): string | null {
  const clean = (plate ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return clean === '' ? null : clean
}

const TIME_ZONE = 'Africa/Accra'

const time = new Intl.DateTimeFormat('en-GH', { hour: 'numeric', minute: '2-digit', timeZone: TIME_ZONE })
const dateTime = new Intl.DateTimeFormat('en-GH', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: TIME_ZONE,
})

export function formatTime(iso: string): string {
  return time.format(new Date(iso))
}

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

/**
 * Start and end of today at the bay, as ISO strings. Ghana is on UTC all
 * year, so the bay's day is the UTC day.
 */
export function todayRange(now: Date = new Date()): { start: string; end: string } {
  const day = now.toISOString().slice(0, 10)
  const next = new Date(Date.parse(`${day}T00:00:00.000Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  return { start: `${day}T00:00:00`, end: `${next}T00:00:00` }
}
