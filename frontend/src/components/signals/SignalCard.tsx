'use client'

import { useRouter } from 'next/navigation'
import { cn, formatRelativeTime, formatAbsoluteTime, scoreToColor, copyToClipboard } from '@/lib/utils'
import { CLUSTER_COLORS, CLUSTER_LABELS } from '@/lib/constants'
import { useMarkRead, useArchiveSignal } from '@/hooks/useSignals'
import { ScoreIndicator } from '@/components/ui/ScoreIndicator'
import type { Signal } from '@/types'
import { ExternalLink, Archive, CheckCheck, Copy, Eye } from 'lucide-react'
import { toast } from 'sonner'

interface SignalCardProps {
  signal: Signal
  style?: React.CSSProperties
}

export function SignalCard({ signal, style }: SignalCardProps) {
  const router = useRouter()
  const { mutate: markRead } = useMarkRead()
  const { mutate: archive } = useArchiveSignal()

  const clusterColor = signal.cluster
    ? CLUSTER_COLORS[signal.cluster] ?? 'var(--text-muted)'
    : 'var(--text-muted)'

  const clusterLabel = signal.cluster ? CLUSTER_LABELS[signal.cluster] : signal.module_type ?? '—'

  const scoreColor = scoreToColor(signal.score)

  function handleCardClick(e: React.MouseEvent) {
    // Don't navigate if clicking buttons
    if ((e.target as HTMLElement).closest('button, a')) return
    router.push(`/signals/${signal.id}`)
  }

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    await copyToClipboard(`${signal.title}\n\n${signal.body}`)
    toast.success('Copied to clipboard')
  }

  return (
    <div
      style={style}
      onClick={handleCardClick}
      className={cn(
        'flex overflow-hidden rounded border transition-all duration-150 cursor-pointer group',
        signal.read
          ? 'bg-bg-surface border-border hover:bg-bg-hover'
          : 'bg-bg-surface border-border hover:bg-bg-hover',
        !signal.read && 'shadow-[inset_0_0_0_1px_rgba(232,240,74,0.06)]'
      )}
    >
      {/* Cluster color left border */}
      <div
        className="w-[3px] shrink-0 rounded-l"
        style={{ background: clusterColor }}
      />

      <div className="flex-1 p-4 min-w-0">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Cluster badge */}
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                background: `${clusterColor}18`,
                color: clusterColor,
                border: `1px solid ${clusterColor}30`,
              }}
            >
              {clusterLabel}
            </span>

            {/* Unread indicator */}
            {!signal.read && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-b2b" />
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Score */}
            <ScoreIndicator score={signal.score} size="sm" />

            {/* Timestamp */}
            <span
              className="text-[10px] text-text-muted whitespace-nowrap"
              title={formatAbsoluteTime(signal.created_at)}
            >
              {formatRelativeTime(signal.created_at)}
            </span>
          </div>
        </div>

        {/* Title */}
        <p
          className={cn(
            'text-sm leading-snug mb-2 line-clamp-2',
            signal.read ? 'text-text-secondary' : 'text-text-primary font-medium'
          )}
        >
          {signal.title}
        </p>

        {/* Body preview */}
        <p className="text-[12px] text-text-secondary line-clamp-3 leading-relaxed mb-3">
          {signal.body}
        </p>

        {/* Actions row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {!signal.read && (
              <button
                onClick={(e) => { e.stopPropagation(); markRead(signal.id) }}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-all duration-100"
              >
                <CheckCheck className="w-3 h-3" />
                Mark Read
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); archive(signal.id) }}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-all duration-100"
            >
              <Archive className="w-3 h-3" />
              Archive
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); router.push(`/signals/${signal.id}`) }}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-all duration-100"
            >
              <Eye className="w-3 h-3" />
              Open
            </button>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-all duration-100"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
          </div>

          {signal.source_url && (
            <a
              href={signal.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary transition-colors"
              title={signal.source_url}
            >
              <ExternalLink className="w-3 h-3" />
              <span className="max-w-[120px] truncate">
                {(() => {
                  try { return new URL(signal.source_url!).hostname } catch { return signal.source_url }
                })()}
              </span>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
