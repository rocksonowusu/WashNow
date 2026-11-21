import type { XAxisTickContentProps } from 'recharts'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMoney } from '../lib/format.ts'

// Chart colours come from DESIGN.md. Blue is the main series; the second
// series colour was checked against it for colour-blind separation.
const ACCENT = '#155EA6'
const SECOND = '#0E9AA7'
const INK = '#15202B'
const MUTED = '#5B6770'
const GRID = '#DCE1E4'
const HOVER = '#EBEEF0'
const TRACK = '#F4F6F7'
const TINT = '#E3EEF8'

const tick = { fill: MUTED, fontSize: 13 }
const tooltipStyle = {
  border: `1px solid ${GRID}`,
  borderRadius: 6,
  boxShadow: 'none',
  color: INK,
  fontSize: 14,
}

export type BarRow = { name: string; value: number }

/**
 * One measure across a handful of named things (vehicle types, crew), as
 * horizontal bars with the value written at the end of each bar.
 */
export function HorizontalBars({ rows, format = formatMoney, label }: { rows: BarRow[]; format?: (value: number) => string; label: string }) {
  return (
    <div style={{ height: rows.length * 44 + 12 }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 96, bottom: 4, left: 8 }} barCategoryGap={10}>
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis type="category" dataKey="name" width={140} axisLine={false} tickLine={false} tick={{ ...tick, fill: INK }} />
          <Tooltip cursor={{ fill: HOVER }} contentStyle={tooltipStyle} formatter={(value) => [format(Number(value)), label]} />
          <Bar dataKey="value" fill={ACCENT} radius={[0, 999, 999, 0]} barSize={20} isAnimationActive={false}>
            <LabelList dataKey="value" position="right" formatter={(value) => format(Number(value))} fill={INK} fontSize={14} fontWeight={600} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export type DayRow = { date: string; sales: number; expenses: number }

const shortDay = new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Whole cedis for the axis: 12,000 pesewas reads as "120". */
const axisCedis = (pesewas: number) => new Intl.NumberFormat('en-GH', { notation: 'compact' }).format(pesewas / 100)

/**
 * Sales against expenses, one pair of bars per day.
 */
export function DailyBars({ days }: { days: DayRow[] }) {
  const rows = days.map((day) => ({ ...day, label: shortDay.format(new Date(`${day.date}T00:00:00Z`)) }))

  return (
    <div className="h-72" role="img" aria-label="Sales and expenses for each day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="24%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" axisLine={{ stroke: GRID }} tickLine={false} tick={tick} minTickGap={16} />
          <YAxis axisLine={false} tickLine={false} tick={tick} tickFormatter={axisCedis} width={48} />
          <Tooltip cursor={{ fill: HOVER }} contentStyle={tooltipStyle} formatter={(value, name) => [formatMoney(Number(value)), name]} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 14, color: INK }} formatter={(value) => <span style={{ color: INK }}>{value}</span>} />
          <Bar dataKey="sales" name="Sales" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          <Bar dataKey="expenses" name="Expenses" fill={SECOND} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Two parts of one total (Cash and MoMo) as a single split bar, each part
 * labelled with its name and amount so it never relies on colour alone.
 */
export function SplitBar({ parts }: { parts: [BarRow, BarRow] }) {
  const total = parts[0].value + parts[1].value
  const colours = ['bg-accent', 'bg-chart-2']

  return (
    <div>
      <div className="flex h-5 gap-0.5 overflow-hidden rounded-control bg-surface-alt" aria-hidden="true">
        {total > 0 &&
          parts.map((part, index) =>
            part.value > 0 ? <span key={part.name} className={colours[index]} style={{ width: `${(part.value / total) * 100}%` }} /> : null,
          )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        {parts.map((part, index) => (
          <div key={part.name}>
            <dt className="flex items-center gap-2 text-sm text-text-muted">
              <span className={`size-3 rounded-control ${colours[index]}`} aria-hidden="true" />
              {part.name}
              {total > 0 && <span>· {Math.round((part.value / total) * 100)}%</span>}
            </dt>
            <dd className="money text-lg font-semibold text-text">{formatMoney(part.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * A short ranked list (vehicle types, crew) as rounded bars on pale tracks,
 * name and amount written above each bar. Plain HTML, so it fits any width.
 */
export function PillBars({ rows, format = formatMoney, label }: { rows: BarRow[]; format?: (value: number) => string; label: string }) {
  const largest = Math.max(...rows.map((row) => row.value), 1)
  return (
    <ul className="space-y-4" aria-label={label}>
      {rows.map((row) => (
        <li key={row.name}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="truncate font-semibold text-text">{row.name}</span>
            <span className="money shrink-0 font-semibold text-text">{format(row.value)}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-pill bg-bg" aria-hidden="true">
            <div className="h-full rounded-pill bg-accent" style={{ width: `${Math.max((row.value / largest) * 100, 3)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export type PeriodBar = { key: string; label: string; value: number; current: boolean }

/** Stripes for the bar that is still filling up. Drawn once, used by url(#…). */
function StripeDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <pattern id="wn-bar-current" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="9" height="9" fill={TINT} />
          <rect width="4" height="9" fill={ACCENT} />
        </pattern>
      </defs>
    </svg>
  )
}

type TickProps = { x?: number | string; y?: number | string; payload?: { value: string | number; index: number } }

/** An axis label; the one under the bar still filling up is bold. */
function periodTick({ x = 0, y = 0, payload }: TickProps, currentIndex: number) {
  const current = payload?.index === currentIndex
  return (
    <text x={x} y={Number(y) + 14} textAnchor="middle" fill={current ? INK : MUTED} fontSize={13} fontWeight={current ? 700 : 400}>
      {payload?.value}
    </text>
  )
}

/**
 * Sales for each hour, day or month of the chosen period, as fully rounded
 * bars on pale tracks. The bar that is still filling up (this hour, today,
 * this month) is striped and its label is bold.
 */
export function PeriodBars({ rows, label }: { rows: PeriodBar[]; label: string }) {
  const currentIndex = rows.findIndex((row) => row.current)

  return (
    <div className="relative h-64 sm:h-72" role="img" aria-label={label}>
      <StripeDefs />
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={(props: XAxisTickContentProps) => periodTick(props, currentIndex)} interval="preserveStartEnd" minTickGap={6} height={28} />
          <YAxis axisLine={false} tickLine={false} tick={tick} tickFormatter={axisCedis} width={44} />
          <Tooltip
            cursor={false}
            contentStyle={{ ...tooltipStyle, borderRadius: 12 }}
            formatter={(value, _name, item) => [formatMoney(Number(value)), (item.payload as PeriodBar).current ? 'Sales so far' : 'Sales']}
          />
          <Bar dataKey="value" radius={999} maxBarSize={44} background={{ fill: TRACK, radius: 999 }} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.key} fill={row.current ? 'url(#wn-bar-current)' : ACCENT} stroke={row.current ? ACCENT : 'none'} strokeWidth={row.current ? 2 : 0} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * A ring split in two (Cash and MoMo), with the first part's share written in
 * the middle. The parts are also listed in words beside it, so it never
 * relies on colour alone.
 */
export function Ring({ parts, size = 112 }: { parts: [BarRow, BarRow]; size?: number }) {
  const total = parts[0].value + parts[1].value
  const stroke = 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const firstShare = total > 0 ? parts[0].value / total : 0
  // A small gap between the two parts when both are there.
  const gap = firstShare > 0 && firstShare < 1 ? 6 : 0
  const firstLength = Math.max(firstShare * circumference - gap, 0)
  const secondLength = Math.max((1 - firstShare) * circumference - gap, 0)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`} fill="none" strokeWidth={stroke}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={TRACK} />
        {total > 0 && firstLength > 0 && (
          <circle cx={size / 2} cy={size / 2} r={radius} stroke={ACCENT} strokeLinecap="round" strokeDasharray={`${firstLength} ${circumference}`} />
        )}
        {total > 0 && secondLength > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={SECOND}
            strokeLinecap="round"
            strokeDasharray={`${secondLength} ${circumference}`}
            strokeDashoffset={-(firstShare * circumference)}
          />
        )}
      </g>
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill={INK} fontSize={22} fontWeight={700} fontFamily="Archivo Variable, sans-serif">
        {total > 0 ? `${Math.round(firstShare * 100)}%` : '–'}
      </text>
    </svg>
  )
}
