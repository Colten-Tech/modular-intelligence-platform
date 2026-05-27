'use client'

import { useState } from 'react'
import { useModules } from '@/hooks/useModules'
import { SetupWizard } from '@/components/modules/SetupWizard'
import { CLUSTER_COLORS, CLUSTER_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { ModuleDefinition } from '@/types'
import {
  Plus,
  CheckCircle2,
  Lock,
  ArrowRight,
  Briefcase,
  ShoppingCart,
  Heart,
  Swords,
  LayoutGrid,
} from 'lucide-react'

const PLAN_RANK = { free: 0, pro: 1, team: 2 }

const CLUSTER_ICONS = {
  'b2b-intelligence': Briefcase,
  'consumer-data': ShoppingCart,
  health: Heart,
  sports: Swords,
}

const CLUSTERS = [
  { id: 'all', label: 'All' },
  { id: 'b2b-intelligence', label: 'B2B Intel' },
  { id: 'consumer-data', label: 'Consumer' },
  { id: 'health', label: 'Health' },
  { id: 'sports', label: 'Sports' },
]

export default function ModulesPage() {
  const { data: modulesData, isLoading } = useModules()
  const user = useAppStore((s) => s.user)
  const [setupModule, setSetupModule] = useState<ModuleDefinition | null>(null)
  const [clusterFilter, setClusterFilter] = useState<string>('all')

  const defs = modulesData?.enriched ?? []
  const instanceMap = new Map(
    modulesData?.instances.map((i) => [i.module_type, i]) ?? []
  )

  const filtered =
    clusterFilter === 'all' ? defs : defs.filter((d) => d.cluster === clusterFilter)

  const userPlanRank = PLAN_RANK[user?.plan ?? 'free']
  const enabledCount = defs.filter((d) => instanceMap.has(d.module_id)).length
  const availableCount = defs.length

  // Count per cluster for badges
  const clusterCounts = defs.reduce<Record<string, number>>((acc, d) => {
    acc[d.cluster] = (acc[d.cluster] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6 max-w-7xl">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="text-[10px] text-text-muted tracking-[0.2em] uppercase mb-1">
            Intelligence Platform
          </p>
          <h1 className="font-display text-3xl tracking-widest text-text-primary">
            MODULE LIBRARY
          </h1>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="text-2xl font-display tracking-wide text-text-primary">
              {isLoading ? '—' : enabledCount}
              <span className="text-text-muted text-sm font-sans">/{availableCount}</span>
            </p>
            <p className="text-[10px] text-text-muted tracking-widest uppercase">Active</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <p className="text-2xl font-display tracking-wide" style={{ color: 'var(--accent-b2b)' }}>
              4
            </p>
            <p className="text-[10px] text-text-muted tracking-widest uppercase">Clusters</p>
          </div>
        </div>
      </div>

      {/* ── Cluster filter ──────────────────────────────────────────── */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {CLUSTERS.map(({ id, label }) => {
          const color = id !== 'all' ? CLUSTER_COLORS[id] : undefined
          const count = id === 'all' ? defs.length : (clusterCounts[id] ?? 0)
          const Icon = id !== 'all' ? CLUSTER_ICONS[id as keyof typeof CLUSTER_ICONS] : LayoutGrid
          const active = clusterFilter === id

          return (
            <button
              key={id}
              onClick={() => setClusterFilter(id)}
              className={cn(
                'flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs transition-all duration-150',
                active
                  ? 'text-text-primary bg-bg-elevated border-border-active shadow-sm'
                  : 'text-text-muted bg-bg-surface border-border hover:text-text-secondary hover:bg-bg-elevated hover:border-border-active'
              )}
              style={active && color ? { borderColor: `${color}50`, color } : undefined}
            >
              <Icon
                className="w-3.5 h-3.5 shrink-0"
                style={active && color ? { color } : undefined}
              />
              <span>{label}</span>
              <span
                className={cn(
                  'ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full tabular-nums',
                  active ? 'bg-bg-hover' : 'bg-bg-hover text-text-muted'
                )}
                style={active && color ? { background: `${color}20`, color } : undefined}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Grid ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 bg-bg-elevated rounded-xl animate-pulse border border-border" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <LayoutGrid className="w-8 h-8 text-text-muted mb-3" />
          <p className="text-text-secondary text-sm">No modules in this cluster yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((mod) => {
            const instance = instanceMap.get(mod.module_id)
            const clusterColor = CLUSTER_COLORS[mod.cluster]
            const ClusterIcon = CLUSTER_ICONS[mod.cluster as keyof typeof CLUSTER_ICONS]
            const requiredRank = PLAN_RANK[mod.required_plan]
            const locked = userPlanRank < requiredRank

            return (
              <div
                key={mod.module_id}
                className={cn(
                  'group relative flex flex-col rounded-xl border transition-all duration-200',
                  instance
                    ? 'bg-bg-elevated border-border-active'
                    : locked
                    ? 'bg-bg-surface border-border opacity-70'
                    : 'bg-bg-surface border-border hover:bg-bg-elevated hover:border-border-active hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20'
                )}
              >
                {/* Top color bar */}
                <div
                  className="h-0.5 rounded-t-xl w-full"
                  style={{ background: instance ? clusterColor : locked ? 'var(--border)' : `${clusterColor}60` }}
                />

                <div className="flex flex-col flex-1 p-5">
                  {/* Cluster + status row */}
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium tracking-wide"
                      style={{
                        color: clusterColor,
                        background: `${clusterColor}15`,
                      }}
                    >
                      <ClusterIcon className="w-3 h-3" />
                      {CLUSTER_LABELS[mod.cluster]}
                    </div>

                    {instance ? (
                      <div className="flex items-center gap-1 text-[10px] text-success">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Active</span>
                      </div>
                    ) : locked ? (
                      <div className="flex items-center gap-1 text-[10px] text-text-muted">
                        <Lock className="w-3 h-3" />
                        <span className="capitalize">{mod.required_plan}+</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-text-muted">
                        {mod.required_plan === 'free' ? 'Free' : `${mod.required_plan}+`}
                      </span>
                    )}
                  </div>

                  {/* Module name */}
                  <h3 className="text-sm font-semibold text-text-primary leading-snug mb-2">
                    {mod.display_name}
                  </h3>

                  {/* Description */}
                  <p className="text-[12px] text-text-secondary leading-relaxed line-clamp-3 flex-1">
                    {mod.description}
                  </p>

                  {/* Divider */}
                  <div className="h-px bg-border my-4" />

                  {/* Action */}
                  {instance ? (
                    <a
                      href={`/modules/${instance.id}`}
                      className="flex items-center justify-between text-xs text-text-secondary hover:text-text-primary transition-colors group/link"
                    >
                      <span>Open dashboard</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 transition-transform" />
                    </a>
                  ) : locked ? (
                    <button
                      onClick={() => (window.location.href = '/billing')}
                      className="flex items-center justify-between w-full text-xs text-text-muted hover:text-text-secondary transition-colors"
                    >
                      <span>Upgrade to unlock</span>
                      <Lock className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setSetupModule(mod)}
                      className="flex items-center justify-between w-full text-xs transition-colors"
                      style={{ color: clusterColor }}
                    >
                      <span className="font-medium">Enable module</span>
                      <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-200" />
                    </button>
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
