// Day, week, month and year periods for the dashboard. Ghana is on UTC all
// year, so the bay's calendar is the UTC calendar and dates are kept as
// "YYYY-MM-DD" strings. Weeks start on Monday.

export type Period = 'day' | 'week' | 'month' | 'year'

export type Span = { first: string; last: string }

const DAY_MS = 24 * 60 * 60 * 1000

const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`)
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const todayKey = (now: Date = new Date()) => now.toISOString().slice(0, 10)

export function addDays(date: string, days: number): string {
  return fromMs(toMs(date) + days * DAY_MS)
}

/** Last day of a month, with `month` counted from 0. */
const lastDayOf = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

const pad = (value: number) => String(value).padStart(2, '0')

/** The same day `months` months away, moved back to the month's last day when it has fewer days. */
function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const y = target.getUTCFullYear()
  const m = target.getUTCMonth()
  return `${y}-${pad(m + 1)}-${pad(Math.min(day, lastDayOf(y, m)))}`
}

/** The whole period that `anchor` falls in. */
export function periodSpan(period: Period, anchor: string): Span {
  const [year, month] = anchor.split('-').map(Number)
  switch (period) {
    case 'day':
      return { first: anchor, last: anchor }
    case 'week': {
      const fromMonday = (new Date(toMs(anchor)).getUTCDay() + 6) % 7
      const first = addDays(anchor, -fromMonday)
      return { first, last: addDays(first, 6) }
    }
    case 'month':
      return { first: `${year}-${pad(month)}-01`, last: `${year}-${pad(month)}-${pad(lastDayOf(year, month - 1))}` }
    case 'year':
      return { first: `${year}-01-01`, last: `${year}-12-31` }
  }
}

/** The part of the period that has happened: a current period stops at today. */
export function elapsedSpan(period: Period, anchor: string, today: string): Span {
  const span = periodSpan(period, anchor)
  return { first: span.first, last: span.last < today ? span.last : today }
}

/**
 * The same stretch one period earlier, for "vs last week". A week that has
 * run Monday to Thursday is compared with Monday to Thursday of last week.
 */
export function previousSpan(period: Period, span: Span): Span {
  switch (period) {
    case 'day':
      return { first: addDays(span.first, -1), last: addDays(span.last, -1) }
    case 'week':
      return { first: addDays(span.first, -7), last: addDays(span.last, -7) }
    case 'month':
      return { first: addMonths(span.first, -1), last: addMonths(span.last, -1) }
    case 'year':
      return { first: addMonths(span.first, -12), last: addMonths(span.last, -12) }
  }
}

/** One period back or forward, for the ‹ › buttons. */
export function shiftAnchor(period: Period, anchor: string, direction: 1 | -1): string {
  switch (period) {
    case 'day':
      return addDays(anchor, direction)
    case 'week':
      return addDays(anchor, 7 * direction)
    case 'month':
      return addMonths(periodSpan('month', anchor).first, direction)
    case 'year':
      return addMonths(periodSpan('year', anchor).first, 12 * direction)
  }
}

/** Start and end (exclusive) as the ISO prefixes that sold_at and spent_at are compared with. */
export function isoRange(span: Span): { start: string; end: string } {
  return { start: `${span.first}T00:00:00`, end: `${addDays(span.last, 1)}T00:00:00` }
}

export type Bucket = { key: string; label: string }

const weekday = new Intl.DateTimeFormat('en-GH', { weekday: 'short', timeZone: 'UTC' })
const monthShort = new Intl.DateTimeFormat('en-GH', { month: 'short', timeZone: 'UTC' })
const monthLong = new Intl.DateTimeFormat('en-GH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayMonth = new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayMonthYear = new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const fullDay = new Intl.DateTimeFormat('en-GH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export const weekdayLabel = (date: string) => weekday.format(new Date(toMs(date)))
export const dayNumber = (date: string) => String(Number(date.slice(8, 10)))
export const monthLabel = (date: string) => monthLong.format(new Date(toMs(date)))

const hourLabel = (hour: number) => (hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`)

/** The bars of the chart: hours of a day, days of a week or month, months of a year. */
export function buckets(period: Period, anchor: string): Bucket[] {
  const span = periodSpan(period, anchor)
  if (period === 'day') {
    return Array.from({ length: 24 }, (_, hour) => ({ key: pad(hour), label: hourLabel(hour) }))
  }
  if (period === 'year') {
    return Array.from({ length: 12 }, (_, month) => {
      const key = `${span.first.slice(0, 4)}-${pad(month + 1)}`
      return { key, label: monthShort.format(new Date(toMs(`${key}-01`))) }
    })
  }
  const days: Bucket[] = []
  for (let date = span.first; date <= span.last; date = addDays(date, 1)) {
    days.push({ key: date, label: period === 'week' ? weekdayLabel(date) : dayNumber(date) })
  }
  return days
}

/** Which bar a sale or expense time (ISO, UTC) belongs to. */
export function bucketKey(period: Period, iso: string): string {
  if (period === 'day') return iso.slice(11, 13)
  if (period === 'year') return iso.slice(0, 7)
  return iso.slice(0, 10)
}

/** The bar that is still filling up, if the period is the current one. */
export function currentBucketKey(period: Period, now: Date = new Date()): string {
  return bucketKey(period, now.toISOString())
}

/** "Fri 20 Nov 2026", "16 – 22 Nov 2026", "November 2026", "2026". */
export function spanLabel(period: Period, anchor: string): string {
  const span = periodSpan(period, anchor)
  switch (period) {
    case 'day':
      return fullDay.format(new Date(toMs(anchor)))
    case 'week': {
      const first = new Date(toMs(span.first))
      const last = new Date(toMs(span.last))
      if (span.first.slice(0, 7) === span.last.slice(0, 7)) return `${dayNumber(span.first)} – ${dayMonthYear.format(last)}`
      if (span.first.slice(0, 4) === span.last.slice(0, 4)) return `${dayMonth.format(first)} – ${dayMonthYear.format(last)}`
      return `${dayMonthYear.format(first)} – ${dayMonthYear.format(last)}`
    }
    case 'month':
      return monthLong.format(new Date(toMs(anchor)))
    case 'year':
      return anchor.slice(0, 4)
  }
}

/** What the trend is measured against: "yesterday", "last week"… */
export function comparedWith(period: Period, anchor: string, today: string): string {
  switch (period) {
    case 'day':
      return anchor === today ? 'yesterday' : 'the day before'
    case 'week':
      return 'last week'
    case 'month':
      return 'last month'
    case 'year':
      return 'last year'
  }
}

/** Percentage change, or null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / previous) * 100
}
