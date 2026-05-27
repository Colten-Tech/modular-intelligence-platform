'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn, formatAbsoluteTime } from '@/lib/utils'
import { Plus, X, Trophy, Target, Zap, Calendar } from 'lucide-react'
import type { Signal } from '@/types'

interface Bout {
  id: string
  date: string
  opponent: string
  weapon: string
  my_score: number
  their_score: number
  notes: string
}

const boutSchema = z.object({
  opponent: z.string().min(1, 'Required'),
  weapon: z.enum(['foil', 'epee', 'sabre']),
  my_score: z.number().min(0).max(45),
  their_score: z.number().min(0).max(45),
  notes: z.string().optional(),
})

type BoutForm = z.infer<typeof boutSchema>

function parseBouts(signals: Signal[]): Bout[] {
  return signals.map((s) => {
    const meta = s.metadata as Record<string, unknown>
    return {
      id: s.id,
      date: s.created_at,
      opponent: (meta.opponent as string) ?? 'Unknown',
      weapon: (meta.weapon as string) ?? 'foil',
      my_score: (meta.my_score as number) ?? 0,
      their_score: (meta.their_score as number) ?? 0,
      notes: s.body,
    }
  })
}

interface FencingDashboardProps {
  signals: Signal[]
  isLoading?: boolean
}

export function FencingDashboard({ signals, isLoading }: FencingDashboardProps) {
  const [showModal, setShowModal] = useState(false)
  const [localBouts, setLocalBouts] = useState<Bout[]>([])

  const apiBouts = parseBouts(signals)
  const allBouts = [...localBouts, ...apiBouts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  const wins = allBouts.filter((b) => b.my_score > b.their_score).length
  const total = allBouts.length
  const winRate = total ? Math.round((wins / total) * 100) : 0
  const totalTouchesFor = allBouts.reduce((sum, b) => sum + b.my_score, 0)
  const totalTouchesAgainst = allBouts.reduce((sum, b) => sum + b.their_score, 0)
  const touchRatio =
    totalTouchesAgainst > 0
      ? (totalTouchesFor / totalTouchesAgainst).toFixed(2)
      : '—'
  const avgScore =
    total ? Math.round(allBouts.reduce((s, b) => s + b.my_score, 0) / total) : 0
  const thisMonth = allBouts.filter(
    (b) =>
      new Date(b.date).getMonth() === new Date().getMonth() &&
      new Date(b.date).getFullYear() === new Date().getFullYear()
  ).length

  const form = useForm<BoutForm>({
    resolver: zodResolver(boutSchema),
    defaultValues: {
      opponent: '',
      weapon: 'foil',
      my_score: 0,
      their_score: 0,
      notes: '',
    },
  })

  function handleAddBout(data: BoutForm) {
    setLocalBouts((prev) => [
      {
        id: `local-${Date.now()}`,
        date: new Date().toISOString(),
        ...data,
        notes: data.notes ?? '',
      },
      ...prev,
    ])
    form.reset()
    setShowModal(false)
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-bg-elevated rounded" />
          ))}
        </div>
        <div className="h-64 bg-bg-elevated rounded" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Win Rate', value: `${winRate}%`, icon: Trophy, color: 'var(--accent-sports)' },
          { label: 'Touch Ratio', value: touchRatio, icon: Target, color: 'var(--accent-b2b)' },
          { label: 'Avg Score', value: String(avgScore), icon: Zap, color: 'var(--accent-consumer)' },
          { label: 'Bouts This Month', value: String(thisMonth), icon: Calendar, color: 'var(--accent-health)' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-bg-elevated border border-border rounded p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-text-muted uppercase tracking-wide">{label}</p>
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <p className="text-2xl font-display tracking-wide" style={{ color }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Bout log */}
      <div className="bg-bg-elevated border border-border rounded overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-xs text-text-secondary">Bout Log ({total} total)</p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-sports/10 border border-accent-sports/20 text-accent-sports text-xs rounded hover:bg-accent-sports/20 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Log Bout
          </button>
        </div>

        {allBouts.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-text-muted text-sm">No bouts logged yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {['Date', 'Opponent', 'Weapon', 'My Score', 'Their Score', 'Result', 'Notes'].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left text-text-muted px-4 py-2 font-normal uppercase tracking-wide text-[10px] whitespace-nowrap"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {allBouts.map((bout) => {
                  const win = bout.my_score > bout.their_score
                  return (
                    <tr
                      key={bout.id}
                      className="border-b border-border last:border-0 hover:bg-bg-hover transition-colors"
                    >
                      <td className="px-4 py-2.5 text-text-muted whitespace-nowrap">
                        {formatAbsoluteTime(bout.date)}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">{bout.opponent}</td>
                      <td className="px-4 py-2.5">
                        <span className="capitalize text-text-secondary">{bout.weapon}</span>
                      </td>
                      <td className="px-4 py-2.5 text-text-primary font-medium">{bout.my_score}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{bout.their_score}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-medium',
                            win
                              ? 'bg-success/10 text-success border border-success/20'
                              : 'bg-error/10 text-error border border-error/20'
                          )}
                        >
                          {win ? 'W' : 'L'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-text-muted max-w-[200px] truncate">
                        {bout.notes}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add bout modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-bg-surface border border-border rounded p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm text-text-primary font-medium">Log New Bout</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-text-muted hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={form.handleSubmit(handleAddBout)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Opponent</label>
                  <input {...form.register('opponent')} className="w-full px-3 py-2 text-sm" />
                  {form.formState.errors.opponent && (
                    <p className="text-error text-[11px] mt-1">
                      {form.formState.errors.opponent.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Weapon</label>
                  <select {...form.register('weapon')} className="w-full px-3 py-2 text-sm">
                    <option value="foil">Foil</option>
                    <option value="epee">Épée</option>
                    <option value="sabre">Sabre</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">My Score</label>
                  <input
                    {...form.register('my_score', { valueAsNumber: true })}
                    type="number"
                    min="0"
                    max="45"
                    className="w-full px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Their Score</label>
                  <input
                    {...form.register('their_score', { valueAsNumber: true })}
                    type="number"
                    min="0"
                    max="45"
                    className="w-full px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Notes</label>
                <textarea
                  {...form.register('notes')}
                  rows={2}
                  className="w-full px-3 py-2 text-sm resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2 border border-border text-text-secondary text-sm rounded hover:text-text-primary hover:border-border-active transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-accent-sports text-bg-base text-sm font-medium rounded hover:opacity-90 transition-opacity"
                >
                  Log Bout
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
