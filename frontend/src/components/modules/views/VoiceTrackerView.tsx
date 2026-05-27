'use client'

import { useState, useRef } from 'react'
import { TrendChart } from '@/components/charts/TrendChart'
import { ScoreGauge } from '@/components/charts/ScoreGauge'
import { Mic, Upload, Loader2, AlertCircle } from 'lucide-react'
import { format, subDays } from 'date-fns'
import type { Signal } from '@/types'

interface VoiceTrackerViewProps {
  signals: Signal[]
  isLoading?: boolean
}

export function VoiceTrackerView({ signals, isLoading }: VoiceTrackerViewProps) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const latestScore = signals[0]?.score ?? 0

  const historyData = Array.from({ length: 14 }).map((_, i) => {
    const date = format(subDays(new Date(), 13 - i), 'yyyy-MM-dd')
    const sig = signals.find((s) => s.created_at.startsWith(date))
    return { date, value: sig ? Math.round(sig.score * 100) : 0 }
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return
    setUploading(true)
    // Simulate upload
    setTimeout(() => setUploading(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-40 bg-bg-elevated rounded" />
        <div className="h-32 bg-bg-elevated rounded" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Upload */}
      <div className="bg-bg-elevated border border-border rounded p-5">
        <p className="text-xs text-text-secondary mb-4">Voice Sample Analysis</p>
        <div className="flex items-center gap-4">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent-health/10 border border-accent-health/20 text-accent-health text-sm rounded hover:bg-accent-health/20 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {uploading ? 'Analyzing...' : 'Upload Voice Sample'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <AlertCircle className="w-3.5 h-3.5" />
            Supports .mp3, .wav, .m4a (max 10MB)
          </div>
        </div>
      </div>

      {signals.length > 0 ? (
        <>
          {/* Latest score */}
          <div className="flex gap-4">
            <div className="bg-bg-elevated border border-border rounded p-5 flex flex-col items-center justify-center w-48 shrink-0">
              <p className="text-[10px] text-text-muted uppercase tracking-wide mb-3">
                Latest Score
              </p>
              <ScoreGauge score={latestScore} label="Biomarker" size={160} />
              <p className="text-[11px] text-text-muted mt-2">
                {format(new Date(signals[0].created_at), 'MMM d, HH:mm')}
              </p>
            </div>

            {/* Insights */}
            <div className="flex-1 bg-bg-elevated border border-border rounded p-5">
              <p className="text-[10px] text-text-muted uppercase tracking-wide mb-3">
                Latest Analysis
              </p>
              <p className="text-sm text-text-secondary leading-relaxed">{signals[0]?.body}</p>
              {signals[0]?.metadata && (
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {Object.entries(signals[0].metadata)
                    .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
                    .slice(0, 4)
                    .map(([k, v]) => (
                      <div key={k} className="bg-bg-base rounded p-2">
                        <p className="text-[10px] text-text-muted capitalize">
                          {k.replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-text-primary mt-0.5">{String(v)}</p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Trend chart */}
          <div className="bg-bg-elevated border border-border rounded p-4">
            <p className="text-xs text-text-secondary mb-4">14-Day Biomarker Trend</p>
            <TrendChart
              data={historyData}
              label="Score"
              color="var(--accent-health)"
              height={140}
              valueFormatter={(v) => `${v}`}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-12 h-12 rounded-full bg-bg-elevated border border-border flex items-center justify-center">
            <Mic className="w-6 h-6 text-text-muted" />
          </div>
          <p className="text-text-muted text-sm">No voice samples analyzed yet.</p>
          <p className="text-text-muted text-xs">Upload a sample above to get started.</p>
        </div>
      )}
    </div>
  )
}
