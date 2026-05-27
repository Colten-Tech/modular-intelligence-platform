'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn, formatRelativeTime, formatAbsoluteTime, scoreToColor } from '@/lib/utils'
import { useMarkRead, useArchiveSignal } from '@/hooks/useSignals'
import { ScoreIndicator } from '@/components/ui/ScoreIndicator'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import type { Signal } from '@/types'
import { Search, Filter, ExternalLink, CheckCheck, Archive, ChevronDown, ChevronUp } from 'lucide-react'

interface SignalTableProps {
  signals: Signal[]
  isLoading?: boolean
  showModuleColumn?: boolean
}

interface Filters {
  search: string
  scoreMin: number
  scoreMax: number
  dateFrom: string
  dateTo: string
}

export function SignalTable({ signals, isLoading, showModuleColumn = false }: SignalTableProps) {
  const router = useRouter()
  const { mutate: markRead } = useMarkRead()
  const { mutate: archive } = useArchiveSignal()
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<Filters>({
    search: '',
    scoreMin: 0,
    scoreMax: 100,
    dateFrom: '',
    dateTo: '',
  })
  const [sortField, setSortField] = useState<'created_at' | 'score'>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function handleSort(field: 'created_at' | 'score') {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const filtered = signals
    .filter((s) => {
      const matchSearch =
        !filters.search ||
        s.title.toLowerCase().includes(filters.search.toLowerCase()) ||
        s.body.toLowerCase().includes(filters.search.toLowerCase())
      const scorePct = s.score * 100
      const matchScore = scorePct >= filters.scoreMin && scorePct <= filters.scoreMax
      const matchDate =
        (!filters.dateFrom || s.created_at >= filters.dateFrom) &&
        (!filters.dateTo || s.created_at <= filters.dateTo + 'T23:59:59')
      return matchSearch && matchScore && matchDate
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortField === 'score') return (a.score - b.score) * dir
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
    })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  function SortIcon({ field }: { field: 'created_at' | 'score' }) {
    if (sortField !== field) return null
    return sortDir === 'desc' ? (
      <ChevronDown className="w-3 h-3" />
    ) : (
      <ChevronUp className="w-3 h-3" />
    )
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search signals..."
            className="w-full pl-7 pr-3 py-1.5 text-xs"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 border rounded text-xs transition-colors',
            showFilters
              ? 'border-border-active text-text-primary bg-bg-hover'
              : 'border-border text-text-muted hover:text-text-primary hover:border-border-active'
          )}
        >
          <Filter className="w-3 h-3" />
          Filters
        </button>
        <span className="text-[11px] text-text-muted ml-auto">
          {filtered.length} signal{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-bg-elevated border border-border rounded p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-[10px] text-text-muted mb-1.5">
              Score Min: {filters.scoreMin}
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={filters.scoreMin}
              onChange={(e) =>
                setFilters((f) => ({ ...f, scoreMin: parseInt(e.target.value) }))
              }
              className="w-full accent-[var(--accent-b2b)]"
            />
          </div>
          <div>
            <label className="block text-[10px] text-text-muted mb-1.5">
              Score Max: {filters.scoreMax}
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={filters.scoreMax}
              onChange={(e) =>
                setFilters((f) => ({ ...f, scoreMax: parseInt(e.target.value) }))
              }
              className="w-full accent-[var(--accent-b2b)]"
            />
          </div>
          <div>
            <label className="block text-[10px] text-text-muted mb-1.5">From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className="w-full px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] text-text-muted mb-1.5">To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className="w-full px-2 py-1.5 text-xs"
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-bg-surface border border-border rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-text-muted px-4 py-2.5 font-normal uppercase tracking-wide text-[10px]">
                  Title
                </th>
                {showModuleColumn && (
                  <th className="text-left text-text-muted px-4 py-2.5 font-normal uppercase tracking-wide text-[10px] whitespace-nowrap">
                    Module
                  </th>
                )}
                <th className="text-left text-text-muted px-4 py-2.5 font-normal uppercase tracking-wide text-[10px] whitespace-nowrap">
                  Source
                </th>
                <th
                  className="text-left text-text-muted px-4 py-2.5 font-normal uppercase tracking-wide text-[10px] cursor-pointer whitespace-nowrap hover:text-text-primary"
                  onClick={() => handleSort('score')}
                >
                  <span className="inline-flex items-center gap-1">
                    Score <SortIcon field="score" />
                  </span>
                </th>
                <th
                  className="text-left text-text-muted px-4 py-2.5 font-normal uppercase tracking-wide text-[10px] cursor-pointer whitespace-nowrap hover:text-text-primary"
                  onClick={() => handleSort('created_at')}
                >
                  <span className="inline-flex items-center gap-1">
                    Time <SortIcon field="created_at" />
                  </span>
                </th>
                <th className="text-left text-text-muted px-4 py-2.5 font-normal uppercase tracking-wide text-[10px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-text-muted text-xs">
                    No signals match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((signal) => (
                  <tr
                    key={signal.id}
                    className={cn(
                      'border-b border-border last:border-0 hover:bg-bg-hover transition-colors cursor-pointer',
                      !signal.read && 'bg-bg-elevated'
                    )}
                    onClick={() => router.push(`/signals/${signal.id}`)}
                  >
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex items-start gap-2">
                        {!signal.read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-b2b shrink-0 mt-1" />
                        )}
                        <p className="text-text-primary line-clamp-2 leading-snug">
                          {signal.title}
                        </p>
                      </div>
                    </td>
                    {showModuleColumn && (
                      <td className="px-4 py-3">
                        <span className="text-text-muted">{signal.module_type ?? '—'}</span>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {signal.source_url ? (
                        <a
                          href={signal.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-text-muted hover:text-text-secondary transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span className="max-w-[80px] truncate">
                            {(() => { try { return new URL(signal.source_url!).hostname } catch { return signal.source_url } })()}
                          </span>
                        </a>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ScoreIndicator score={signal.score} size="sm" />
                        <span
                          className="text-[10px]"
                          style={{ color: scoreToColor(signal.score) }}
                        >
                          {Math.round(signal.score * 100)}
                        </span>
                      </div>
                    </td>
                    <td
                      className="px-4 py-3 text-text-muted whitespace-nowrap"
                      title={formatAbsoluteTime(signal.created_at)}
                    >
                      {formatRelativeTime(signal.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!signal.read && (
                          <button
                            onClick={() => markRead(signal.id)}
                            className="p-1 text-text-muted hover:text-text-primary transition-colors"
                            title="Mark read"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => archive(signal.id)}
                          className="p-1 text-text-muted hover:text-text-primary transition-colors"
                          title="Archive"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
