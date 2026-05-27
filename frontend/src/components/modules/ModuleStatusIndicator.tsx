'use client'

import { formatRelativeTime } from '@/lib/utils'
import type { ModuleStatus } from '@/types'

interface ModuleStatusIndicatorProps {
  status: ModuleStatus
  last_run?: string
  error?: string
  showDetails?: boolean
}

const STATUS_CONFIG: Record<
  ModuleStatus,
  { color: string; label: string; bgColor: string }
> = {
  active: {
    color: 'var(--success)',
    label: 'Active',
    bgColor: 'rgba(74, 240, 74, 0.08)',
  },
  running: {
    color: 'var(--accent-consumer)',
    label: 'Running',
    bgColor: 'rgba(74, 240, 200, 0.08)',
  },
  warning: {
    color: 'var(--warning)',
    label: 'Warning',
    bgColor: 'rgba(240, 200, 74, 0.08)',
  },
  error: {
    color: 'var(--error)',
    label: 'Error',
    bgColor: 'rgba(240, 74, 74, 0.08)',
  },
  paused: {
    color: 'var(--text-muted)',
    label: 'Paused',
    bgColor: 'rgba(68, 68, 68, 0.08)',
  },
}

export function ModuleStatusIndicator({
  status,
  last_run,
  error,
  showDetails = false,
}: ModuleStatusIndicatorProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.paused

  return (
    <div className="inline-flex items-center gap-2">
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs"
        style={{
          color: config.color,
          background: config.bgColor,
          border: `1px solid ${config.color}30`,
        }}
      >
        {/* Dot */}
        <span className="relative flex w-1.5 h-1.5 shrink-0">
          {status === 'running' && (
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
              style={{ background: config.color }}
            />
          )}
          <span
            className="relative inline-flex rounded-full w-1.5 h-1.5"
            style={{ background: config.color }}
          />
        </span>
        {config.label}
        {status === 'error' && error && (
          <span className="text-[10px] opacity-70 max-w-[120px] truncate">
            — {error}
          </span>
        )}
      </span>

      {showDetails && last_run && (
        <span className="text-[11px] text-text-muted">
          Last run {formatRelativeTime(last_run)}
        </span>
      )}
    </div>
  )
}
