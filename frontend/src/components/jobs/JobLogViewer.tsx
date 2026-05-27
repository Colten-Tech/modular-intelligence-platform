'use client'

import { FixedSizeList, type ListChildComponentProps } from 'react-window'
import { useJobLogs } from '@/hooks/useJobs'
import { cn, copyToClipboard, downloadBlob } from '@/lib/utils'
import { Copy, Download, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { JobLog } from '@/types'

interface JobLogViewerProps {
  jobId: string
  height?: number
}

const LOG_LEVEL_STYLES: Record<JobLog['level'], { color: string; label: string }> = {
  INFO: { color: 'var(--text-muted)', label: 'INFO' },
  WARN: { color: 'var(--warning)', label: 'WARN' },
  ERROR: { color: 'var(--error)', label: 'ERR ' },
  SUCCESS: { color: 'var(--success)', label: 'OK  ' },
}

function LogRow({ index, style, data }: ListChildComponentProps<JobLog[]>) {
  const log = data[index]
  const levelStyle = LOG_LEVEL_STYLES[log.level] ?? LOG_LEVEL_STYLES.INFO

  return (
    <div
      style={style}
      className="flex items-baseline gap-2 px-3 text-[11px] font-mono hover:bg-bg-hover transition-colors"
    >
      <span className="text-text-muted shrink-0 tabular-nums">
        {log.timestamp.slice(11, 19)}
      </span>
      <span
        className="shrink-0 font-medium"
        style={{ color: levelStyle.color }}
      >
        [{levelStyle.label}]
      </span>
      <span
        className={cn(
          'flex-1 truncate',
          log.level === 'ERROR' && 'text-error/90',
          log.level === 'WARN' && 'text-warning/90',
          log.level === 'SUCCESS' && 'text-success/90',
          log.level === 'INFO' && 'text-text-secondary'
        )}
      >
        {log.message}
      </span>
    </div>
  )
}

export function JobLogViewer({ jobId, height = 300 }: JobLogViewerProps) {
  const { data: logs, isLoading, error } = useJobLogs(jobId)

  function handleCopyAll() {
    if (!logs?.length) return
    const text = logs
      .map((l) => `${l.timestamp} [${l.level}] ${l.message}`)
      .join('\n')
    copyToClipboard(text)
    toast.success('Logs copied to clipboard')
  }

  function handleDownload() {
    if (!logs?.length) return
    const text = logs
      .map((l) => `${l.timestamp} [${l.level}] ${l.message}`)
      .join('\n')
    downloadBlob(new Blob([text], { type: 'text/plain' }), `job-${jobId}-logs.txt`)
  }

  return (
    <div
      className="bg-bg-base border border-border rounded overflow-hidden"
      style={{ fontFamily: 'IBM Plex Mono, monospace' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-surface">
        <span className="text-[10px] text-text-muted uppercase tracking-wide">
          Job Logs {logs?.length ? `— ${logs.length} lines` : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyAll}
            disabled={!logs?.length}
            className="inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary transition-colors disabled:opacity-40"
          >
            <Copy className="w-3 h-3" />
            Copy
          </button>
          <button
            onClick={handleDownload}
            disabled={!logs?.length}
            className="inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary transition-colors disabled:opacity-40"
          >
            <Download className="w-3 h-3" />
            .txt
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
          <span className="text-text-muted text-xs">Loading logs...</span>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center gap-2 py-8">
          <AlertCircle className="w-4 h-4 text-error" />
          <span className="text-error text-xs">Failed to load logs</span>
        </div>
      ) : !logs?.length ? (
        <div className="flex items-center justify-center py-8">
          <span className="text-text-muted text-xs">No logs available</span>
        </div>
      ) : (
        <FixedSizeList
          height={height}
          width="100%"
          itemCount={logs.length}
          itemSize={24}
          itemData={logs}
        >
          {LogRow}
        </FixedSizeList>
      )}
    </div>
  )
}
