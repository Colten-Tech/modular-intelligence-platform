'use client'

import { cn } from '@/lib/utils'
import type { Signal } from '@/types'
import { Clock, Sun, Moon, Sunset } from 'lucide-react'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6) // 6am - midnight

interface ScheduleBlock {
  day: number // 0-6
  hour: number
  duration: number // in hours
  label: string
  type: 'work' | 'rest' | 'exercise' | 'deep-work' | 'social'
}

const TYPE_COLORS: Record<ScheduleBlock['type'], string> = {
  'deep-work': 'var(--accent-b2b)',
  work: 'var(--accent-consumer)',
  exercise: 'var(--accent-sports)',
  rest: 'var(--accent-health)',
  social: 'var(--warning)',
}

function parseScheduleFromSignals(signals: Signal[]): ScheduleBlock[] {
  const blocks: ScheduleBlock[] = []
  signals.forEach((s) => {
    const meta = s.metadata as Record<string, unknown>
    if (meta.schedule_blocks && Array.isArray(meta.schedule_blocks)) {
      blocks.push(...(meta.schedule_blocks as ScheduleBlock[]))
    }
  })

  // Return default schedule if no data
  if (!blocks.length) {
    return [
      { day: 0, hour: 6, duration: 1, label: 'Morning Routine', type: 'rest' },
      { day: 0, hour: 9, duration: 3, label: 'Deep Work', type: 'deep-work' },
      { day: 0, hour: 13, duration: 1, label: 'Lunch + Nap', type: 'rest' },
      { day: 0, hour: 14, duration: 3, label: 'Focus Work', type: 'work' },
      { day: 0, hour: 18, duration: 1, label: 'Exercise', type: 'exercise' },
      { day: 1, hour: 9, duration: 4, label: 'Deep Work', type: 'deep-work' },
      { day: 2, hour: 9, duration: 3, label: 'Meetings', type: 'work' },
      { day: 2, hour: 19, duration: 2, label: 'Social', type: 'social' },
      { day: 3, hour: 7, duration: 1, label: 'Exercise', type: 'exercise' },
      { day: 3, hour: 9, duration: 4, label: 'Deep Work', type: 'deep-work' },
      { day: 4, hour: 9, duration: 3, label: 'Work', type: 'work' },
      { day: 5, hour: 8, duration: 2, label: 'Exercise', type: 'exercise' },
      { day: 6, hour: 9, duration: 3, label: 'Personal Projects', type: 'deep-work' },
    ]
  }

  return blocks
}

interface SchedulePlannerViewProps {
  signals: Signal[]
  isLoading?: boolean
}

export function SchedulePlannerView({ signals, isLoading }: SchedulePlannerViewProps) {
  const blocks = parseScheduleFromSignals(signals)

  if (isLoading) {
    return <div className="h-96 bg-bg-elevated rounded animate-pulse" />
  }

  const todayDay = new Date().getDay()
  // Convert JS day (0=Sun) to our day (0=Mon)
  const todayIdx = todayDay === 0 ? 6 : todayDay - 1

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <span className="w-2 h-2 rounded-sm" style={{ background: color }} />
            <span className="capitalize">{type.replace('-', ' ')}</span>
          </div>
        ))}
      </div>

      {/* Week grid */}
      <div className="bg-bg-elevated border border-border rounded overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Day headers */}
          <div className="grid grid-cols-8 border-b border-border">
            <div className="py-2 px-2" />
            {DAYS.map((day, i) => (
              <div
                key={day}
                className={cn(
                  'py-2 text-center text-[11px] border-l border-border',
                  i === todayIdx ? 'text-accent-b2b font-medium' : 'text-text-muted'
                )}
              >
                {day}
                {i === todayIdx && (
                  <div className="w-1 h-1 rounded-full bg-accent-b2b mx-auto mt-1" />
                )}
              </div>
            ))}
          </div>

          {/* Hour rows */}
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="grid grid-cols-8 border-b border-border"
              style={{ height: 40 }}
            >
              {/* Time label */}
              <div className="flex items-start justify-end pr-2 pt-1">
                <span className="text-[10px] text-text-muted">
                  {hour === 12 ? '12pm' : hour > 12 ? `${hour - 12}pm` : `${hour}am`}
                </span>
              </div>

              {/* Day cells */}
              {DAYS.map((_, dayIdx) => {
                const block = blocks.find(
                  (b) => b.day === dayIdx && b.hour === hour
                )
                return (
                  <div
                    key={dayIdx}
                    className="relative border-l border-border"
                    style={{ height: 40 }}
                  >
                    {block && (
                      <div
                        className="absolute inset-x-0.5 top-0.5 rounded-sm px-1 overflow-hidden"
                        style={{
                          height: block.duration * 40 - 4,
                          background: `${TYPE_COLORS[block.type]}18`,
                          border: `1px solid ${TYPE_COLORS[block.type]}30`,
                          zIndex: 1,
                        }}
                        title={block.label}
                      >
                        <p
                          className="text-[9px] font-medium truncate pt-0.5"
                          style={{ color: TYPE_COLORS[block.type] }}
                        >
                          {block.label}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Today's summary */}
      <div className="bg-bg-elevated border border-border rounded p-4">
        <p className="text-[10px] text-text-muted uppercase tracking-wide mb-3">Today&apos;s Schedule</p>
        <div className="space-y-2">
          {blocks
            .filter((b) => b.day === todayIdx)
            .sort((a, b) => a.hour - b.hour)
            .map((block, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-[11px] text-text-muted w-12 shrink-0">
                  {block.hour === 12
                    ? '12pm'
                    : block.hour > 12
                    ? `${block.hour - 12}pm`
                    : `${block.hour}am`}
                </span>
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: TYPE_COLORS[block.type] }}
                />
                <span className="text-xs text-text-secondary">{block.label}</span>
                <span className="text-[10px] text-text-muted ml-auto">
                  {block.duration}h
                </span>
              </div>
            ))}
          {blocks.filter((b) => b.day === todayIdx).length === 0 && (
            <p className="text-text-muted text-xs">No schedule for today.</p>
          )}
        </div>
      </div>
    </div>
  )
}
