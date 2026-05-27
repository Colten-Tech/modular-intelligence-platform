'use client'

import { useParams, useRouter } from 'next/navigation'
import { useSignal, useMarkRead, useArchiveSignal } from '@/hooks/useSignals'
import { ScoreIndicator } from '@/components/ui/ScoreIndicator'
import { CLUSTER_COLORS, CLUSTER_LABELS } from '@/lib/constants'
import { formatAbsoluteTime, formatRelativeTime, scoreToLabel, scoreToColor, copyToClipboard, cn } from '@/lib/utils'
import {
  ArrowLeft,
  ExternalLink,
  CheckCheck,
  Archive,
  Download,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

export default function SignalDetailPage() {
  const { signalId } = useParams<{ signalId: string }>()
  const router = useRouter()

  const { data: signal, isLoading, error } = useSignal(signalId)
  const { mutate: markRead } = useMarkRead()
  const { mutate: archive } = useArchiveSignal()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    )
  }

  if (error || !signal) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-text-muted text-sm">Signal not found.</p>
        <button
          onClick={() => router.back()}
          className="text-xs text-text-secondary hover:text-text-primary"
        >
          ← Go back
        </button>
      </div>
    )
  }

  const clusterColor = signal.cluster
    ? CLUSTER_COLORS[signal.cluster]
    : 'var(--text-muted)'
  const scoreColor = scoreToColor(signal.score)
  const clusterLabel = signal.cluster ? CLUSTER_LABELS[signal.cluster] : signal.module_type ?? '—'

  function handleExport() {
    if (!signal) return
    const content = JSON.stringify(signal, null, 2)
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `signal-${signal.id}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Signal exported')
  }

  const metaEntries = Object.entries(signal.metadata).filter(
    ([, v]) => v !== null && v !== undefined && v !== ''
  )

  return (
    <div className="p-6 max-w-3xl">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </button>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1 min-w-0">
          {/* Cluster + module */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium"
              style={{
                background: `${clusterColor}15`,
                color: clusterColor,
                border: `1px solid ${clusterColor}30`,
              }}
            >
              {clusterLabel}
            </span>
            {signal.module_type && (
              <span className="text-[11px] text-text-muted">{signal.module_type}</span>
            )}
            {!signal.read && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-b2b" />
            )}
          </div>

          <h1 className="text-lg text-text-primary font-medium leading-snug mb-2">
            {signal.title}
          </h1>

          <div className="flex items-center gap-3 text-[11px] text-text-muted">
            <span title={formatAbsoluteTime(signal.created_at)}>
              {formatRelativeTime(signal.created_at)}
            </span>
            <span>·</span>
            <span>{formatAbsoluteTime(signal.created_at)}</span>
          </div>
        </div>

        {/* Score */}
        <div className="shrink-0 text-center">
          <ScoreIndicator score={signal.score} size="lg" />
          <p className="text-[10px] mt-1" style={{ color: scoreColor }}>
            {scoreToLabel(signal.score)}
          </p>
        </div>
      </div>

      {/* Score bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-[10px] text-text-muted mb-1">
          <span>Relevance Score</span>
          <span style={{ color: scoreColor }}>{Math.round(signal.score * 100)} / 100</span>
        </div>
        <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${signal.score * 100}%`, background: scoreColor }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {!signal.read && (
          <button
            onClick={() => { markRead(signal.id); toast.success('Marked as read') }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border text-text-secondary text-xs rounded hover:border-border-active hover:text-text-primary transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark Read
          </button>
        )}
        <button
          onClick={() => archive(signal.id)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border text-text-secondary text-xs rounded hover:border-border-active hover:text-text-primary transition-colors"
        >
          <Archive className="w-3.5 h-3.5" />
          Archive
        </button>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border text-text-secondary text-xs rounded hover:border-border-active hover:text-text-primary transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export JSON
        </button>
        {signal.source_url && (
          <a
            href={signal.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-b2b/10 border border-accent-b2b/20 text-accent-b2b text-xs rounded hover:bg-accent-b2b/20 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Source
          </a>
        )}
      </div>

      {/* Body */}
      <div className="bg-bg-surface border border-border rounded p-5 mb-6">
        <p className="text-[10px] text-text-muted uppercase tracking-wide mb-3">Content</p>
        <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap font-sans">
          {signal.body}
        </div>
      </div>

      {/* Source URL detail */}
      {signal.source_url && (
        <div className="bg-bg-surface border border-border rounded p-4 mb-6">
          <p className="text-[10px] text-text-muted uppercase tracking-wide mb-2">Source</p>
          <a
            href={signal.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs text-accent-consumer hover:underline break-all"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            {signal.source_url}
          </a>
        </div>
      )}

      {/* Metadata */}
      {metaEntries.length > 0 && (
        <div className="bg-bg-surface border border-border rounded p-4">
          <p className="text-[10px] text-text-muted uppercase tracking-wide mb-3">Metadata</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {metaEntries.map(([key, value]) => (
              <div key={key} className="flex items-start gap-3">
                <span className="text-[11px] text-text-muted capitalize shrink-0 w-28">
                  {key.replace(/_/g, ' ')}
                </span>
                <span className="text-[11px] text-text-secondary break-all">
                  {Array.isArray(value)
                    ? value.join(', ')
                    : typeof value === 'object'
                    ? JSON.stringify(value)
                    : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
