'use client'

import { useState } from 'react'
import { TrendChart } from '@/components/charts/TrendChart'
import { Clock, Moon, Calendar, ChevronDown, ChevronUp } from 'lucide-react'
import { downloadBlob } from '@/lib/utils'
import type { Signal } from '@/types'
import { format, subDays } from 'date-fns'

interface NapRecommendation {
  start_time: string
  end_time: string
  duration_min: number
  circadian_phase: string
  reason: string
  score: number
}

function parseNapRecommendation(signal: Signal): NapRecommendation | null {
  try {
    const meta = signal.metadata as Record<string, unknown>
    return {
      start_time: (meta.start_time as string) ?? '13:45',
      end_time: (meta.end_time as string) ?? '14:05',
      duration_min: (meta.duration_min as number) ?? 20,
      circadian_phase: (meta.circadian_phase as string) ?? 'Post-Lunch Dip',
      reason: signal.body,
      score: signal.score,
    }
  } catch {
    return null
  }
}

function generateICS(rec: NapRecommendation): string {
  const today = format(new Date(), 'yyyyMMdd')
  const [startH, startM] = rec.start_time.split(':').map(Number)
  const [endH, endM] = rec.end_time.split(':').map(Number)

  const dtStart = `${today}T${String(startH).padStart(2, '0')}${String(startM).padStart(2, '0')}00`
  const dtEnd = `${today}T${String(endH).padStart(2, '0')}${String(endM).padStart(2, '0')}00`

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MIP//Nap Optimizer//EN',
    'BEGIN:VEVENT',
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:Nap — ${rec.duration_min} min (${rec.circadian_phase})`,
    `DESCRIPTION:${rec.reason.replace(/\n/g, '\\n')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

interface NapOptimizerViewProps {
  signals: Signal[]
  isLoading?: boolean
}

export function NapOptimizerView({ signals, isLoading }: NapOptimizerViewProps) {
  const latest = signals[0]
  const rec = latest ? parseNapRecommendation(latest) : null

  // Build 7-day history from signals
  const historyData = Array.from({ length: 7 }).map((_, i) => {
    const date = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd')
    const sig = signals.find((s) => s.created_at.startsWith(date))
    return { date, value: sig ? Math.round(sig.score * 100) : 0 }
  })

  function handleAddToCalendar() {
    if (!rec) return
    const ics = generateICS(rec)
    downloadBlob(new Blob([ics], { type: 'text/calendar' }), 'nap.ics')
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-bg-elevated rounded" />
        <div className="h-40 bg-bg-elevated rounded" />
      </div>
    )
  }

  if (!rec) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Moon className="w-8 h-8 text-text-muted" />
        <p className="text-text-muted text-sm">No nap recommendation yet.</p>
        <p className="text-text-muted text-xs">Run the module to get today&apos;s schedule.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Today's recommendation card */}
      <div className="bg-bg-elevated border border-border rounded p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">
              Today&apos;s Optimal Nap
            </p>
            <div className="flex items-baseline gap-3">
              <span className="font-display text-4xl tracking-wide text-text-primary">
                {rec.start_time}
              </span>
              <span className="text-text-muted">—</span>
              <span className="font-display text-4xl tracking-wide text-text-primary">
                {rec.end_time}
              </span>
              <span className="px-2 py-0.5 bg-accent-health/10 border border-accent-health/20 text-accent-health text-xs rounded">
                {rec.duration_min} min
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-text-muted" />
            <span className="text-xs text-text-muted">{rec.circadian_phase}</span>
          </div>
        </div>

        <p className="text-sm text-text-secondary leading-relaxed mb-4">{rec.reason}</p>

        <button
          onClick={handleAddToCalendar}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent-health/10 border border-accent-health/20 text-accent-health text-xs rounded hover:bg-accent-health/20 transition-colors"
        >
          <Calendar className="w-3.5 h-3.5" />
          Add to Calendar (.ics)
        </button>
      </div>

      {/* 7-day history */}
      <div className="bg-bg-elevated border border-border rounded p-4">
        <p className="text-xs text-text-secondary mb-4">7-Day Nap Score History</p>
        <TrendChart
          data={historyData}
          label="Nap Score"
          color="var(--accent-health)"
          height={140}
          valueFormatter={(v) => `${v}`}
        />
      </div>
    </div>
  )
}
