'use client'

import { cn } from '@/lib/utils'
import type { ModuleStatus } from '@/types'

interface StatusDotProps {
  status: ModuleStatus
  className?: string
  showLabel?: boolean
}

const STATUS_CONFIG: Record<
  ModuleStatus,
  { color: string; label: string; pulse: boolean }
> = {
  active: { color: 'var(--success)', label: 'Active', pulse: false },
  running: { color: 'var(--accent-consumer)', label: 'Running', pulse: true },
  warning: { color: 'var(--warning)', label: 'Warning', pulse: false },
  error: { color: 'var(--error)', label: 'Error', pulse: false },
  paused: { color: 'var(--text-muted)', label: 'Paused', pulse: false },
}

export function StatusDot({ status, className, showLabel = false }: StatusDotProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.paused

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="relative flex w-2 h-2 shrink-0">
        {config.pulse && (
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
            style={{ background: config.color }}
          />
        )}
        <span
          className="relative inline-flex rounded-full w-2 h-2"
          style={{ background: config.color }}
        />
      </span>
      {showLabel && (
        <span className="text-xs" style={{ color: config.color }}>
          {config.label}
        </span>
      )}
    </span>
  )
}
