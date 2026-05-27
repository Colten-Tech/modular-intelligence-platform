'use client'

import { useState } from 'react'
import { useJobs, useRetryJob } from '@/hooks/useJobs'
import { JobLogViewer } from '@/components/jobs/JobLogViewer'
import { formatRelativeTime, formatAbsoluteTime, formatDuration, cn } from '@/lib/utils'
import type { Job, JobStatus } from '@/types'
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  PlayCircle,
  Filter,
} from 'lucide-react'

const STATUS_STYLES: Record<
  JobStatus,
  { color: string; bg: string; icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  success: {
    color: 'var(--success)',
    bg: 'rgba(74,240,74,0.1)',
    icon: CheckCircle2,
    label: 'Success',
  },
  failed: {
    color: 'var(--error)',
    bg: 'rgba(240,74,74,0.1)',
    icon: XCircle,
    label: 'Failed',
  },
  running: {
    color: 'var(--accent-consumer)',
    bg: 'rgba(74,240,200,0.1)',
    icon: PlayCircle,
    label: 'Running',
  },
  queued: {
    color: 'var(--text-muted)',
    bg: 'rgba(68,68,68,0.1)',
    icon: Clock,
    label: 'Queued',
  },
}

export default function JobsPage() {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all')
  const [moduleFilter, setModuleFilter] = useState('')
  const { mutate: retryJob, isPending: retrying } = useRetryJob()

  const { data: jobsData, isLoading } = useJobs({
    status: statusFilter !== 'all' ? statusFilter : undefined,
  })

  const jobs = jobsData?.data ?? []

  const filtered = moduleFilter
    ? jobs.filter((j) =>
        (j.module_type ?? j.module_id).toLowerCase().includes(moduleFilter.toLowerCase())
      )
    : jobs

  function toggleExpand(id: string) {
    setExpandedJobId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-widest text-text-primary mb-1">
          JOB LOGS
        </h1>
        <p className="text-text-muted text-xs">
          Execution history for all module runs
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 bg-bg-elevated rounded p-0.5">
          {(['all', 'success', 'failed', 'running', 'queued'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-2.5 py-1 rounded text-xs transition-all duration-100 capitalize',
                statusFilter === s
                  ? 'bg-bg-hover text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="relative">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
          <input
            type="text"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            placeholder="Filter by module..."
            className="pl-7 pr-3 py-1.5 text-xs"
          />
        </div>

        <span className="text-[11px] text-text-muted ml-auto">
          {filtered.length} job{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="bg-bg-surface border border-border rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {[
                  'Module',
                  'Started',
                  'Duration',
                  'Status',
                  'Signals',
                  'Actions',
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left text-text-muted px-4 py-2.5 font-normal uppercase tracking-wide text-[10px] whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3 bg-bg-elevated rounded animate-pulse w-16" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-text-muted">
                    No jobs found.
                  </td>
                </tr>
              ) : (
                filtered.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    expanded={expandedJobId === job.id}
                    onToggle={() => toggleExpand(job.id)}
                    onRetry={() => retryJob(job.id)}
                    retrying={retrying}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

interface JobRowProps {
  job: Job
  expanded: boolean
  onToggle: () => void
  onRetry: () => void
  retrying: boolean
}

function JobRow({ job, expanded, onToggle, onRetry, retrying }: JobRowProps) {
  const style = STATUS_STYLES[job.status] ?? STATUS_STYLES.queued
  const StatusIcon = style.icon

  return (
    <>
      <tr
        className={cn(
          'border-b border-border hover:bg-bg-hover transition-colors cursor-pointer',
          expanded && 'bg-bg-hover'
        )}
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-text-secondary">
          {job.module_type ?? job.module_id}
        </td>
        <td className="px-4 py-3 text-text-muted whitespace-nowrap" title={formatAbsoluteTime(job.started_at)}>
          {formatRelativeTime(job.started_at)}
        </td>
        <td className="px-4 py-3 text-text-muted whitespace-nowrap">
          {formatDuration(job.started_at, job.finished_at)}
        </td>
        <td className="px-4 py-3">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium"
            style={{ color: style.color, background: style.bg, border: `1px solid ${style.color}30` }}
          >
            {job.status === 'running' ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <StatusIcon className="w-3 h-3" />
            )}
            {style.label}
          </span>
        </td>
        <td className="px-4 py-3 text-text-secondary tabular-nums">
          {job.signals_found}
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            {job.status === 'failed' && (
              <button
                onClick={onRetry}
                disabled={retrying}
                className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary border border-border rounded px-2 py-0.5 hover:border-border-active transition-colors disabled:opacity-50"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            )}
            <button
              onClick={onToggle}
              className="p-1 text-text-muted hover:text-text-primary transition-colors"
            >
              {expanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border">
          <td colSpan={6} className="px-4 py-3 bg-bg-base">
            {job.error && (
              <div className="flex items-start gap-2 mb-3 p-3 bg-error/5 border border-error/20 rounded">
                <XCircle className="w-3.5 h-3.5 text-error shrink-0 mt-0.5" />
                <p className="text-xs text-error/80">{job.error}</p>
              </div>
            )}
            <JobLogViewer jobId={job.id} height={240} />
          </td>
        </tr>
      )}
    </>
  )
}
