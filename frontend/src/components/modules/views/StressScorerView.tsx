'use client'

import { TrendChart } from '@/components/charts/TrendChart'
import { ScoreGauge } from '@/components/charts/ScoreGauge'
import { format, subDays } from 'date-fns'
import type { Signal } from '@/types'
import { Activity } from 'lucide-react'

interface StressScorerViewProps {
  signals: Signal[]
  isLoading?: boolean
}

export function StressScorerView({ signals, isLoading }: StressScorerViewProps) {
  const latest = signals[0]
  const score = latest?.score ?? 0

  const stressLabel = score >= 0.7 ? 'High Recovery' : score >= 0.4 ? 'Moderate' : 'High Stress'
  const stressColor = score >= 0.7 ? 'var(--score-high)' : score >= 0.4 ? 'var(--score-mid)' : 'var(--score-low)'

  const trendData = Array.from({ length: 14 }).map((_, i) => {
    const date = format(subDays(new Date(), 13 - i), 'yyyy-MM-dd')
    const sig = signals.find((s) => s.created_at.startsWith(date))
    return { date, value: sig ? Math.round(sig.score * 100) : 0 }
  })

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-40 bg-bg-elevated rounded" />
        <div className="h-36 bg-bg-elevated rounded" />
      </div>
    )
  }

  if (!latest) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Activity className="w-8 h-8 text-text-muted" />
        <p className="text-text-muted text-sm">No stress data yet. Run the module to get scored.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        {/* Gauge */}
        <div className="bg-bg-elevated border border-border rounded p-5 w-52 shrink-0 flex flex-col items-center">
          <p className="text-[10px] text-text-muted uppercase tracking-wide mb-3">
            Recovery Score
          </p>
          <ScoreGauge score={score} label="Recovery" size={160} />
          <span
            className="text-xs mt-2 font-medium"
            style={{ color: stressColor }}
          >
            {stressLabel}
          </span>
        </div>

        {/* Details */}
        <div className="flex-1 bg-bg-elevated border border-border rounded p-5">
          <p className="text-[10px] text-text-muted uppercase tracking-wide mb-3">Analysis</p>
          <p className="text-sm text-text-secondary leading-relaxed mb-4">{latest.body}</p>

          {Object.entries(latest.metadata)
            .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
            .length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(latest.metadata)
                .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
                .slice(0, 6)
                .map(([k, v]) => (
                  <div key={k} className="bg-bg-base rounded p-2">
                    <p className="text-[10px] text-text-muted capitalize">
                      {k.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-text-primary mt-0.5">{String(v)}</p>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Trend */}
      <div className="bg-bg-elevated border border-border rounded p-4">
        <p className="text-xs text-text-secondary mb-4">14-Day Recovery Trend</p>
        <TrendChart
          data={trendData}
          label="Recovery Score"
          color="var(--accent-health)"
          height={140}
          valueFormatter={(v) => `${v}`}
        />
      </div>
    </div>
  )
}
