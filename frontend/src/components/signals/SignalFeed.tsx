'use client'

import { SignalCard } from './SignalCard'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import type { Signal } from '@/types'
import { Inbox } from 'lucide-react'

interface SignalFeedProps {
  signals: Signal[]
  isLoading?: boolean
  emptyMessage?: string
}

export function SignalFeed({
  signals,
  isLoading = false,
  emptyMessage = 'No signals yet. Enable a module to start receiving intelligence.',
}: SignalFeedProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (!signals.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-full bg-bg-elevated border border-border flex items-center justify-center">
          <Inbox className="w-6 h-6 text-text-muted" />
        </div>
        <p className="text-text-muted text-sm text-center max-w-xs">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {signals.map((signal) => (
        <SignalCard key={signal.id} signal={signal} />
      ))}
    </div>
  )
}
