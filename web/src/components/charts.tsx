import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMoney } from '../lib/format.ts'

// Chart colours come from DESIGN.md. Blue is the main series; the second
// series colour was checked against it for colour-blind separation.
const ACCENT = '#155EA6'
const SECOND = '#0E9AA7'
const INK = '#15202B'
const MUTED = '#5B6770'
const GRID = '#DCE1E4'
const HOVER = '#EBEEF0'

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
          <Bar dataKey="value" fill={ACCENT} radius={[0, 4, 4, 0]} barSize={20} isAnimationActive={false}>
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
