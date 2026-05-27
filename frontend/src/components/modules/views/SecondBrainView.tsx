'use client'

import { useState } from 'react'
import { cn, formatAbsoluteTime } from '@/lib/utils'
import { Search, Upload, Plus, Tag, BookOpen, X, ExternalLink, ChevronRight } from 'lucide-react'
import type { Signal } from '@/types'

interface Paper {
  id: string
  title: string
  authors: string[]
  year: number
  tags: string[]
  claims: string[]
  methodology: string
  results: string
  limitations: string
  source_url?: string
  created_at: string
}

function parseSignalsToPapers(signals: Signal[]): Paper[] {
  return signals.map((s) => {
    const meta = s.metadata as Record<string, unknown>
    return {
      id: s.id,
      title: s.title,
      authors: (meta.authors as string[]) ?? [],
      year: (meta.year as number) ?? new Date().getFullYear(),
      tags: (meta.tags as string[]) ?? [],
      claims: (meta.claims as string[]) ?? [s.body.slice(0, 200)],
      methodology: (meta.methodology as string) ?? '',
      results: (meta.results as string) ?? '',
      limitations: (meta.limitations as string) ?? '',
      source_url: s.source_url,
      created_at: s.created_at,
    }
  })
}

interface SecondBrainViewProps {
  signals: Signal[]
  isLoading?: boolean
}

export function SecondBrainView({ signals, isLoading }: SecondBrainViewProps) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [arxivInput, setArxivInput] = useState('')
  const [showArxivInput, setShowArxivInput] = useState(false)

  const papers = parseSignalsToPapers(signals)

  // All unique tags
  const allTags = Array.from(new Set(papers.flatMap((p) => p.tags)))

  const filtered = papers.filter((p) => {
    const matchSearch =
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.authors.join(' ').toLowerCase().includes(search.toLowerCase())
    const matchTag = !filterTag || p.tags.includes(filterTag)
    return matchSearch && matchTag
  })

  const selected = papers.find((p) => p.id === selectedId) ?? filtered[0] ?? null

  if (isLoading) {
    return (
      <div className="flex gap-4 animate-pulse h-96">
        <div className="w-1/3 bg-bg-elevated rounded" />
        <div className="flex-1 bg-bg-elevated rounded" />
      </div>
    )
  }

  return (
    <div className="flex gap-4 h-[600px]">
      {/* Left panel — paper list */}
      <div className="w-[280px] shrink-0 flex flex-col bg-bg-elevated border border-border rounded overflow-hidden">
        {/* Search & actions */}
        <div className="p-3 border-b border-border space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search papers..."
              className="w-full pl-7 pr-3 py-1.5 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <button className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-text-muted hover:text-text-primary border border-border rounded hover:border-border-active transition-colors">
              <Upload className="w-3 h-3" />
              PDF
            </button>
            <button
              onClick={() => setShowArxivInput(!showArxivInput)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-text-muted hover:text-text-primary border border-border rounded hover:border-border-active transition-colors"
            >
              <Plus className="w-3 h-3" />
              arXiv
            </button>
          </div>
          {showArxivInput && (
            <div className="flex gap-2">
              <input
                type="text"
                value={arxivInput}
                onChange={(e) => setArxivInput(e.target.value)}
                placeholder="arxiv.org/abs/..."
                className="flex-1 px-2 py-1 text-xs"
              />
              <button
                className="px-2 py-1 bg-accent-consumer/10 text-accent-consumer text-xs rounded border border-accent-consumer/20"
                onClick={() => {
                  setArxivInput('')
                  setShowArxivInput(false)
                }}
              >
                Add
              </button>
            </div>
          )}
        </div>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1.5 overflow-x-auto">
            <button
              onClick={() => setFilterTag(null)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors',
                !filterTag
                  ? 'border-border-active text-text-primary bg-bg-hover'
                  : 'border-border text-text-muted hover:text-text-secondary'
              )}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setFilterTag(tag === filterTag ? null : tag)}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors',
                  filterTag === tag
                    ? 'border-accent-consumer/40 text-accent-consumer bg-accent-consumer/10'
                    : 'border-border text-text-muted hover:text-text-secondary'
                )}
              >
                <Tag className="w-2 h-2" />
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Paper list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <BookOpen className="w-8 h-8 text-text-muted" />
              <p className="text-text-muted text-xs text-center px-4">
                {search ? 'No papers match your search.' : 'No papers yet. Add one above.'}
              </p>
            </div>
          ) : (
            filtered.map((paper) => (
              <button
                key={paper.id}
                onClick={() => setSelectedId(paper.id)}
                className={cn(
                  'w-full text-left px-3 py-3 border-b border-border last:border-0 transition-colors',
                  selected?.id === paper.id
                    ? 'bg-bg-hover border-l-2 border-l-accent-consumer'
                    : 'hover:bg-bg-hover'
                )}
              >
                <p className="text-xs text-text-primary line-clamp-2 leading-snug mb-1">
                  {paper.title}
                </p>
                <p className="text-[10px] text-text-muted">
                  {paper.authors.slice(0, 2).join(', ')}
                  {paper.authors.length > 2 ? ' et al.' : ''} · {paper.year}
                </p>
                {paper.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {paper.tags.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="px-1.5 py-0.5 rounded text-[9px] bg-bg-base border border-border text-text-muted"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel — paper detail */}
      <div className="flex-1 bg-bg-elevated border border-border rounded overflow-y-auto">
        {selected ? (
          <div className="p-5 space-y-5">
            <div>
              <h2 className="text-sm text-text-primary font-medium leading-snug mb-2">
                {selected.title}
              </h2>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[11px] text-text-muted">
                  {selected.authors.join(', ')} · {selected.year}
                </span>
                {selected.source_url && (
                  <a
                    href={selected.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-accent-consumer hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Source
                  </a>
                )}
              </div>
              {selected.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selected.tags.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded text-[10px] bg-accent-consumer/10 border border-accent-consumer/20 text-accent-consumer"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {selected.claims.length > 0 && (
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wide mb-2">
                  Key Claims
                </p>
                <ul className="space-y-2">
                  {selected.claims.map((claim, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <ChevronRight className="w-3 h-3 text-accent-consumer shrink-0 mt-0.5" />
                      <p className="text-xs text-text-secondary leading-relaxed">{claim}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selected.methodology && (
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wide mb-2">
                  Methodology
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {selected.methodology}
                </p>
              </div>
            )}

            {selected.results && (
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wide mb-2">Results</p>
                <p className="text-xs text-text-secondary leading-relaxed">{selected.results}</p>
              </div>
            )}

            {selected.limitations && (
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wide mb-2">
                  Limitations
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {selected.limitations}
                </p>
              </div>
            )}

            <p className="text-[10px] text-text-muted">
              Added {formatAbsoluteTime(selected.created_at)}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <BookOpen className="w-8 h-8 text-text-muted" />
            <p className="text-text-muted text-sm">Select a paper to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}
