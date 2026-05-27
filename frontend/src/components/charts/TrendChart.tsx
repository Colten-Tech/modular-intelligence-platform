'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipProps,
} from 'recharts'
import { format, parseISO } from 'date-fns'

interface TrendChartProps {
  data: { date: string; value: number }[]
  label: string
  color?: string
  height?: number
  valueFormatter?: (v: number) => string
}

function CustomTooltip({
  active,
  payload,
  label: tooltipLabel,
  valueFormatter,
  chartLabel,
}: TooltipProps<number, string> & {
  valueFormatter?: (v: number) => string
  chartLabel: string
}) {
  if (!active || !payload?.length) return null

  const value = payload[0].value ?? 0
  const formatted = valueFormatter ? valueFormatter(value) : String(value)

  let displayDate = tooltipLabel as string
  try {
    displayDate = format(parseISO(tooltipLabel as string), 'MMM d')
  } catch {
    /* keep raw */
  }

  return (
    <div
      className="rounded border text-xs py-2 px-3 space-y-0.5"
      style={{
        background: 'var(--bg-elevated)',
        borderColor: 'var(--border-active)',
        fontFamily: 'IBM Plex Mono, monospace',
        color: 'var(--text-primary)',
      }}
    >
      <p style={{ color: 'var(--text-muted)' }}>{displayDate}</p>
      <p>
        {chartLabel}: <span style={{ color: payload[0].color }}>{formatted}</span>
      </p>
    </div>
  )
}

export function TrendChart({
  data,
  label,
  color = 'var(--accent-b2b)',
  height = 160,
  valueFormatter,
}: TrendChartProps) {
  const tickFormatter = (val: string) => {
    try {
      return format(parseISO(val), 'MMM d')
    } catch {
      return val
    }
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid
          strokeDasharray="2 4"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tickFormatter={tickFormatter}
          tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={valueFormatter}
          width={32}
        />
        <Tooltip
          content={(props) => (
            <CustomTooltip
              {...props}
              chartLabel={label}
              valueFormatter={valueFormatter}
            />
          )}
          cursor={{ stroke: 'var(--border-active)', strokeWidth: 1 }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
