'use client'

import { useState, useEffect } from 'react'
import { useSignals, useUserStats } from '@/hooks/useSignals'
import { useModules, useRunModule } from '@/hooks/useModules'
import { useJobs } from '@/hooks/useJobs'
import { SignalCard } from '@/components/signals/SignalCard'
import { JobLogViewer } from '@/components/jobs/JobLogViewer'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { StatusDot } from '@/components/ui/StatusDot'
import { CLUSTER_COLORS } from '@/lib/constants'
import { formatRelativeTime, cn } from '@/lib/utils'
import type { Cluster, JobStatus, ModuleStatus } from '@/types'
import { Zap, TrendingUp, Layers, Briefcase, Play, Pause, ChevronDown, ChevronUp, Activity } from 'lucide-react'
import { toast } from 'sonner'

const JOB_STATUS_MAP: Record<JobStatus, ModuleStatus> = {
  running: 'running',
  success: 'active',
  failed: 'error',
  queued: 'paused',
}

const CLUSTER_FILTERS: { label: string; value: Cluster | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'B2B', value: 'b2b-intelligence' },
  { label: 'Consumer', value: 'consumer-data' },
  { label: 'Health', value: 'health' },
  { label: 'Sports', value: 'sports' },
]

export default function OverviewPage() {
  const [clusterFilter, setClusterFilter] = useState<Cluster | 'all'>('all')
  const [search, setSearch] = useState('')
  const [activityOpen, setActivityOpen] = useState(false)

  // Backend always excludes archived signals; cluster is a client-side filter
  // because the /signals endpoint doesn't accept a cluster param.
  const { data: signalsData, isLoading: signalsLoading } = useSignals({})

  const { data: stats, isLoading: statsLoading } = useUserStats()
  const { data: modulesData } = useModules()
  const { mutate: runModule } = useRunModule()
  const { data: jobsData } = useJobs({ limit: 20 })

  const signals = signalsData?.items ?? []
  const unreadCount = signals.filter((s) => !s.read).length

  // Build a module_type → cluster map so we can filter signals by cluster
  // client-side (the /signals API doesn't accept a cluster param).
  const moduleClusterMap = new Map(
    (modulesData?.definitions ?? []).map((d) => [d.module_id, d.cluster])
  )

  const filtered = signals.filter((s) => {
    if (clusterFilter !== 'all') {
      const cluster = moduleClusterMap.get(s.module_type ?? '')
      if (cluster !== clusterFilter) return false
    }
    if (search) {
      const q = search.toLowerCase()
      return s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)
    }
    return true
  })

  const activeInstances = modulesData?.instances.filter((i) => i.enabled) ?? []

  // Live activity
  const recentJobs = jobsData?.items ?? []
  const runningJobs = recentJobs.filter((j) => j.status === 'running')

  // Auto-open panel when jobs start running
  useEffect(() => {
    if (runningJobs.length > 0) setActivityOpen(true)
  }, [runningJobs.length])

  function handleRunAll() {
    if (activeInstances.length === 0) return
    activeInstances.forEach((inst) => {
      const def = modulesData?.definitions.find((d) => d.module_id === inst.module_type)
      runModule({ instanceId: inst.id, moduleType: def?.display_name })
    })
    toast.success(`Started ${activeInstances.length} module${activeInstances.length !== 1 ? 's' : ''}`)
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel (65%) */}
      <div className="flex-1 flex flex-col border-r border-border overflow-hidden min-w-0">
        <div className="shrink-0 px-5 pt-5">
          {/* System status row */}
          {activeInstances.length > 0 && (
            <div className="flex items-center gap-3 mb-4 overflow-x-auto scrollbar-none pb-1">
              <span className="text-[10px] text-text-muted uppercase tracking-wide shrink-0">
                Live
              </span>
              {activeInstances.map((inst) => {
                const def = modulesData?.definitions.find(
                  (d) => d.module_id === inst.module_type
                )
                const color = def ? CLUSTER_COLORS[def.cluster] : 'var(--text-muted)'
                return (
                  <div key={inst.id} className="inline-flex items-center gap-1.5 shrink-0">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: color }}
                    />
                    <span className="text-[11px] text-text-secondary">
                      {def?.display_name ?? inst.module_type}
                    </span>
                    {inst.status && <StatusDot status={inst.status} />}
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-medium text-text-primary">All Signals</h1>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 bg-accent-b2b/10 border border-accent-b2b/30 text-accent-b2b text-[10px] rounded">
                  {unreadCount} new
                </span>
              )}
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="flex gap-1 bg-bg-elevated rounded p-0.5">
              {CLUSTER_FILTERS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setClusterFilter(value)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs transition-all duration-100',
                    clusterFilter === value
                      ? 'bg-bg-hover text-text-primary'
                      : 'text-text-muted hover:text-text-secondary'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search signals..."
              className="px-3 py-1.5 text-xs flex-1 min-w-[160px] max-w-xs"
            />
          </div>
        </div>

        {/* Signal list */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
          {signalsLoading ? (
            Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-12 h-12 rounded-full bg-bg-elevated border border-border flex items-center justify-center">
                <Zap className="w-6 h-6 text-text-muted" />
              </div>
              <p className="text-text-muted text-sm text-center max-w-xs">
                {search
                  ? 'No signals match your search.'
                  : 'No signals yet. Enable a module to start receiving intelligence.'}
              </p>
            </div>
          ) : (
            filtered.map((signal) => <SignalCard key={signal.id} signal={signal} />)
          )}
        </div>
      </div>

      {/* Right panel (35%) */}
      <div className="w-[300px] shrink-0 overflow-y-auto bg-bg-surface">
        <div className="p-5 space-y-5">
          {/* Stats */}
          <div className="space-y-2">
            <p className="text-[10px] text-text-muted uppercase tracking-wide">Overview</p>
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label="Signals Today"
                value={stats?.signals_today ?? 0}
                icon={Zap}
                color="var(--accent-b2b)"
                loading={statsLoading}
              />
              <StatCard
                label="This Week"
                value={stats?.signals_this_week ?? 0}
                icon={TrendingUp}
                color="var(--accent-consumer)"
                loading={statsLoading}
              />
              <StatCard
                label="Active Modules"
                value={`${stats?.active_modules ?? 0}/${stats?.modules_limit ?? 2}`}
                icon={Layers}
                color="var(--accent-sports)"
                loading={statsLoading}
              />
              <StatCard
                label="Jobs Today"
                value={stats?.jobs_today ?? 0}
                sub={
                  stats?.success_rate !== undefined
                    ? `${Math.round(stats.success_rate)}% ok`
                    : undefined
                }
                icon={Briefcase}
                color="var(--accent-health)"
                loading={statsLoading}
              />
            </div>
          </div>

          {/* Module status grid */}
          {activeInstances.length > 0 && (
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wide mb-2">
                Module Status
              </p>
              <div className="space-y-1.5">
                {activeInstances.map((inst) => {
                  const def = modulesData?.definitions.find(
                    (d) => d.module_id === inst.module_type
                  )
                  const color = def ? CLUSTER_COLORS[def.cluster] : 'var(--text-muted)'
                  return (
                    <div
                      key={inst.id}
                      className="flex items-center justify-between py-1.5 px-3 bg-bg-elevated rounded border border-border"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: color }}
                        />
                        <span className="text-xs text-text-secondary truncate">
                          {def?.display_name ?? inst.module_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {inst.signals_today !== undefined && (
                          <span className="text-[10px] text-text-muted">
                            {inst.signals_today}
                          </span>
                        )}
                        {inst.status && <StatusDot status={inst.status} />}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Next runs */}
          {activeInstances.some((i) => i.next_run) && (
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wide mb-2">
                Next Runs
              </p>
              <div className="space-y-1">
                {activeInstances
                  .filter((i) => i.next_run)
                  .sort(
                    (a, b) =>
                      new Date(a.next_run!).getTime() - new Date(b.next_run!).getTime()
                  )
                  .slice(0, 5)
                  .map((inst) => {
                    const def = modulesData?.definitions.find(
                      (d) => d.module_id === inst.module_type
                    )
                    return (
                      <div
                        key={inst.id}
                        className="flex items-center justify-between py-1 text-xs"
                      >
                        <span className="text-text-muted truncate">
                          {def?.display_name ?? inst.module_type}
                        </span>
                        <span className="text-text-secondary shrink-0 ml-2">
                          {formatRelativeTime(inst.next_run!)}
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-2">
              Quick Actions
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleRunAll}
                disabled={activeInstances.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 bg-accent-b2b/10 border border-accent-b2b/20 text-accent-b2b text-xs rounded hover:bg-accent-b2b/20 transition-colors disabled:opacity-40"
              >
                <Play className="w-3 h-3" />
                Run All
                {runningJobs.length > 0 && (
                  <span className="ml-1 px-1 py-0.5 bg-accent-b2b/20 text-[9px] rounded-full leading-none">
                    {runningJobs.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => toast.info('Pause all — coming soon')}
                disabled={activeInstances.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 bg-bg-elevated border border-border text-text-muted text-xs rounded hover:text-text-primary hover:border-border-active transition-colors disabled:opacity-40"
              >
                <Pause className="w-3 h-3" />
                Pause All
              </button>
            </div>
          </div>

          {/* Live Activity */}
          <div>
            <button
              onClick={() => setActivityOpen((o) => !o)}
              className="w-full flex items-center justify-between mb-2 group"
            >
              <div className="flex items-center gap-2">
                <Activity className="w-3 h-3 text-text-muted" />
                <p className="text-[10px] text-text-muted uppercase tracking-wide">
                  Live Activity
                </p>
                {runningJobs.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-accent-consumer/10 border border-accent-consumer/30 text-accent-consumer text-[9px] rounded-full animate-pulse">
                    {runningJobs.length} running
                  </span>
                )}
              </div>
              {activityOpen ? (
                <ChevronUp className="w-3 h-3 text-text-muted group-hover:text-text-primary transition-colors" />
              ) : (
                <ChevronDown className="w-3 h-3 text-text-muted group-hover:text-text-primary transition-colors" />
              )}
            </button>

            {activityOpen && (
              <div className="space-y-3">
                {recentJobs.length === 0 ? (
                  <p className="text-[11px] text-text-muted py-4 text-center">
                    No recent jobs — run a module to see activity here.
                  </p>
                ) : (
                  recentJobs.slice(0, 6).map((job) => {
                    const def = modulesData?.definitions.find(
                      (d) => d.module_id === job.module_type
                    )
                    const isRunning = job.status === 'running'
                    return (
                      <div key={job.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-text-secondary truncate flex-1 mr-2">
                            {def?.display_name ?? job.module_type ?? 'Module'}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {job.signals_found > 0 && (
                              <span className="text-[9px] text-text-muted">
                                {job.signals_found} signals
                              </span>
                            )}
                            <StatusDot status={JOB_STATUS_MAP[job.status]} />
                          </div>
                        </div>
                        <JobLogViewer jobId={job.id} height={160} isRunning={isRunning} />
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  color: string
  loading?: boolean
}

function StatCard({ label, value, sub, icon: Icon, color, loading }: StatCardProps) {
  return (
    <div className="bg-bg-elevated border border-border rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-text-muted">{label}</p>
        <Icon className="w-3 h-3" style={{ color } as React.CSSProperties} />
      </div>
      {loading ? (
        <div className="h-6 w-12 bg-bg-hover rounded animate-pulse" />
      ) : (
        <>
          <p className="text-xl font-display tracking-wide leading-none" style={{ color } as React.CSSProperties}>
            {value}
          </p>
          {sub && <p className="text-[10px] text-text-muted mt-1">{sub}</p>}
        </>
      )}
    </div>
  )
}
