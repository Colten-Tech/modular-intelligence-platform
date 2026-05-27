'use client'

import { useState } from 'react'
import { useModules } from '@/hooks/useModules'
import { SetupWizard } from '@/components/modules/SetupWizard'
import { CLUSTER_COLORS, CLUSTER_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { ModuleDefinition } from '@/types'
import { Plus, CheckCircle2, Lock } from 'lucide-react'

const PLAN_RANK = { free: 0, pro: 1, team: 2 }

export default function ModulesPage() {
  const { data: modulesData, isLoading } = useModules()
  const user = useAppStore((s) => s.user)
  const [setupModule, setSetupModule] = useState<ModuleDefinition | null>(null)
  const [clusterFilter, setClusterFilter] = useState<string>('all')

  const defs = modulesData?.enriched ?? []
  const instanceMap = new Map(
    modulesData?.instances.map((i) => [i.module_type, i]) ?? []
  )

  const clusters = ['all', 'b2b-intelligence', 'consumer-data', 'health', 'sports']
  const filtered =
    clusterFilter === 'all' ? defs : defs.filter((d) => d.cluster === clusterFilter)

  const userPlanRank = PLAN_RANK[user?.plan ?? 'free']

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-widest text-text-primary mb-1">
          MODULE LIBRARY
        </h1>
        <p className="text-text-muted text-xs">
          {defs.length} intelligence modules across 4 clusters
        </p>
      </div>

      {/* Cluster filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {clusters.map((c) => {
          const color = c !== 'all' ? CLUSTER_COLORS[c] : undefined
          return (
            <button
              key={c}
              onClick={() => setClusterFilter(c)}
              className={cn(
                'px-3 py-1.5 rounded text-xs border transition-all duration-100',
                clusterFilter === c
                  ? 'border-border-active bg-bg-hover text-text-primary'
                  : 'border-border text-text-muted hover:text-text-secondary hover:border-border-active'
              )}
              style={
                clusterFilter === c && color
                  ? { borderColor: `${color}60`, color }
                  : undefined
              }
            >
              {c === 'all' ? 'All Clusters' : CLUSTER_LABELS[c]}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 bg-bg-elevated rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((mod) => {
            const instance = instanceMap.get(mod.module_id)
            const clusterColor = CLUSTER_COLORS[mod.cluster]
            const requiredRank = PLAN_RANK[mod.required_plan]
            const locked = userPlanRank < requiredRank

            return (
              <div
                key={mod.module_id}
                className={cn(
                  'relative flex overflow-hidden rounded border transition-all duration-150',
                  instance
                    ? 'bg-bg-elevated border-border-active'
                    : 'bg-bg-surface border-border hover:bg-bg-elevated hover:border-border-active',
                  locked && 'opacity-60'
                )}
              >
                {/* Color accent bar */}
                <div
                  className="w-1 shrink-0 rounded-l"
                  style={{ background: clusterColor }}
                />

                <div className="flex-1 p-4">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded border"
                        style={{
                          color: clusterColor,
                          borderColor: `${clusterColor}40`,
                          background: `${clusterColor}10`,
                        }}
                      >
                        {CLUSTER_LABELS[mod.cluster]}
                      </span>

                      {instance ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-success border border-success/30 bg-success/10 px-1.5 py-0.5 rounded">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Enabled
                        </span>
                      ) : locked ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-text-muted border border-border px-1.5 py-0.5 rounded capitalize">
                          <Lock className="w-2.5 h-2.5" />
                          {mod.required_plan}+
                        </span>
                      ) : (
                        <span className="text-[10px] text-text-muted border border-border px-1.5 py-0.5 rounded capitalize">
                          {mod.required_plan === 'free' ? 'Free' : `${mod.required_plan}+`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Name */}
                  <h3 className="text-sm text-text-primary font-medium mb-1 leading-snug">
                    {mod.display_name}
                  </h3>

                  {/* Description */}
                  <p className="text-[12px] text-text-secondary leading-relaxed mb-3 line-clamp-2">
                    {mod.description}
                  </p>

                  {/* Action */}
                  {!instance && !locked && (
                    <button
                      onClick={() => setSetupModule(mod)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-b2b/10 border border-accent-b2b/20 text-accent-b2b text-xs rounded hover:bg-accent-b2b/20 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Enable Module
                    </button>
                  )}
                  {!instance && locked && (
                    <button
                      onClick={() => (window.location.href = '/billing')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border text-text-muted text-xs rounded hover:border-border-active transition-colors"
                    >
                      <Lock className="w-3 h-3" />
                      Upgrade to {mod.required_plan}
                    </button>
                  )}
                  {instance && (
                    <a
                      href={`/modules/${instance.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bg-hover border border-border text-text-secondary text-xs rounded hover:text-text-primary transition-colors"
                    >
                      Open Dashboard →
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Setup wizard modal */}
      {setupModule && (
        <SetupWizard
          module={setupModule}
          onClose={() => setSetupModule(null)}
          onSuccess={() => setSetupModule(null)}
        />
      )}
    </div>
  )
}
