'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAdminOverview,
  getAdminUsers,
  adminUpdatePlan,
  adminToggleAdmin,
  adminListModuleSources,
  adminGetModuleSource,
  adminSaveModuleSource,
} from '@/lib/api'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Users,
  Activity,
  Zap,
  BarChart3,
  ShieldCheck,
  ShieldOff,
  Loader2,
  AlertCircle,
  Crown,
  Code2,
  ChevronRight,
  Save,
  X,
  FileCode,
} from 'lucide-react'
import type { AdminUserRow, Plan } from '@/types'

const PLAN_OPTIONS: Plan[] = ['free', 'pro', 'team']

const PLAN_COLORS: Record<Plan, string> = {
  free: 'text-text-muted',
  pro: 'text-accent-b2b',
  team: 'text-yellow-400',
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string
  value: number | string
  sub?: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  color: string
}) {
  return (
    <div className="bg-bg-elevated border border-border rounded p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] text-text-muted tracking-widest uppercase">{label}</p>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <p className="text-2xl font-display tracking-wide" style={{ color }}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-text-muted mt-1">{sub}</p>}
    </div>
  )
}

export default function AdminPage() {
  const user = useAppStore((s) => s.user)
  const queryClient = useQueryClient()
  const [planLoading, setPlanLoading] = useState<string | null>(null)
  const [adminLoading, setAdminLoading] = useState<string | null>(null)
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null)
  const [editedSource, setEditedSource] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // All hooks must be declared before any early return (Rules of Hooks)
  const isAdmin = !user || user.is_admin  // allow through if user not yet loaded

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: getAdminOverview,
    refetchInterval: 30_000,
    enabled: isAdmin,
  })

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: getAdminUsers,
    enabled: isAdmin,
  })

  const { data: moduleSources, isLoading: moduleSourcesLoading } = useQuery({
    queryKey: ['admin', 'module-sources'],
    queryFn: adminListModuleSources,
    enabled: isAdmin,
  })

  const { data: activeSource, isLoading: sourceLoading } = useQuery({
    queryKey: ['admin', 'module-source', selectedModuleId],
    queryFn: () => adminGetModuleSource(selectedModuleId!),
    enabled: isAdmin && !!selectedModuleId,
  })

  const { mutate: saveSource, isPending: saving } = useMutation({
    mutationFn: ({ id, source }: { id: string; source: string }) =>
      adminSaveModuleSource(id, source),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'module-source', data.module_id], data)
      setIsEditing(false)
      setEditedSource(null)
      toast.success(`${data.display_name} saved — restart server to apply changes`)
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  })

  const handleSelectModule = useCallback((id: string) => {
    setSelectedModuleId(id)
    setIsEditing(false)
    setEditedSource(null)
  }, [])

  const handleStartEdit = useCallback(() => {
    setEditedSource(activeSource?.source ?? '')
    setIsEditing(true)
  }, [activeSource])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setEditedSource(null)
  }, [])

  const handleSave = useCallback(() => {
    if (!selectedModuleId || editedSource === null) return
    saveSource({ id: selectedModuleId, source: editedSource })
  }, [selectedModuleId, editedSource, saveSource])

  // Guard: non-admins see a 403 page
  if (user && !user.is_admin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-text-muted text-sm">You don&apos;t have admin access.</p>
      </div>
    )
  }

  async function handlePlanChange(userId: string, plan: string) {
    setPlanLoading(userId)
    try {
      await adminUpdatePlan(userId, plan)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('Plan updated')
    } catch {
      toast.error('Failed to update plan')
    } finally {
      setPlanLoading(null)
    }
  }

  async function handleAdminToggle(row: AdminUserRow) {
    setAdminLoading(row.id)
    try {
      await adminToggleAdmin(row.id, !row.is_admin)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success(row.is_admin ? 'Admin revoked' : 'Admin granted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setAdminLoading(null)
    }
  }

  const planDist = overview?.users_by_plan ?? {}

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl tracking-widest text-text-primary mb-1">ADMIN</h1>
        <p className="text-text-muted text-sm">System overview and user management</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Total Users"
          value={overviewLoading ? '—' : (overview?.total_users ?? 0)}
          icon={Users}
          color="var(--accent-b2b)"
        />
        <StatCard
          label="Signals"
          value={overviewLoading ? '—' : (overview?.total_signals ?? 0)}
          sub={`+${overview?.signals_last_24h ?? 0} today`}
          icon={Zap}
          color="var(--accent-health)"
        />
        <StatCard
          label="Jobs Run"
          value={overviewLoading ? '—' : (overview?.total_jobs ?? 0)}
          sub={`${overview?.jobs_last_24h ?? 0} last 24h`}
          icon={Activity}
          color="var(--accent-consumer)"
        />
        <StatCard
          label="Active Modules"
          value={overviewLoading ? '—' : (overview?.active_modules ?? 0)}
          icon={BarChart3}
          color="var(--accent-sports)"
        />
        <StatCard
          label="Pro Users"
          value={overviewLoading ? '—' : (planDist['pro'] ?? 0)}
          icon={Crown}
          color="var(--accent-b2b)"
        />
        <StatCard
          label="Team Users"
          value={overviewLoading ? '—' : (planDist['team'] ?? 0)}
          icon={Crown}
          color="#facc15"
        />
      </div>

      {/* Users table */}
      <div>
        <h2 className="font-display text-sm tracking-widest text-text-secondary mb-3 uppercase">
          All Users
        </h2>
        <div className="border border-border rounded overflow-hidden">
          {usersLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-bg-elevated border-b border-border">
                  <th className="text-left px-4 py-2.5 text-text-muted font-normal tracking-widest uppercase">Email</th>
                  <th className="text-left px-4 py-2.5 text-text-muted font-normal tracking-widest uppercase">Plan</th>
                  <th className="text-center px-4 py-2.5 text-text-muted font-normal tracking-widest uppercase">Modules</th>
                  <th className="text-center px-4 py-2.5 text-text-muted font-normal tracking-widest uppercase">Signals</th>
                  <th className="text-left px-4 py-2.5 text-text-muted font-normal tracking-widest uppercase">Joined</th>
                  <th className="text-center px-4 py-2.5 text-text-muted font-normal tracking-widest uppercase">Admin</th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((row, i) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b border-border last:border-0',
                      i % 2 === 0 ? 'bg-bg-base' : 'bg-bg-surface',
                      row.id === user?.id && 'ring-1 ring-inset ring-accent-b2b/30'
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-text-primary">
                      {row.email}
                      {row.id === user?.id && (
                        <span className="ml-2 text-[9px] text-accent-b2b">YOU</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {planLoading === row.id ? (
                        <Loader2 className="w-3 h-3 animate-spin text-text-muted" />
                      ) : (
                        <select
                          value={row.plan}
                          onChange={(e) => handlePlanChange(row.id, e.target.value)}
                          className={cn(
                            'bg-transparent border border-border rounded px-2 py-0.5 text-[11px] cursor-pointer',
                            'focus:outline-none focus:border-accent-b2b',
                            PLAN_COLORS[row.plan as Plan]
                          )}
                        >
                          {PLAN_OPTIONS.map((p) => (
                            <option key={p} value={p} className="bg-bg-elevated text-text-primary">
                              {p}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-text-secondary">{row.module_count}</td>
                    <td className="px-4 py-3 text-center text-text-secondary">{row.signal_count}</td>
                    <td className="px-4 py-3 text-text-muted">
                      {new Date(row.created_at).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {adminLoading === row.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted mx-auto" />
                      ) : (
                        <button
                          onClick={() => handleAdminToggle(row)}
                          title={row.is_admin ? 'Revoke admin' : 'Grant admin'}
                          className="mx-auto flex items-center justify-center w-6 h-6 rounded hover:bg-bg-hover transition-colors"
                          disabled={row.id === user?.id}
                        >
                          {row.is_admin ? (
                            <ShieldCheck className="w-3.5 h-3.5 text-accent-b2b" />
                          ) : (
                            <ShieldOff className="w-3.5 h-3.5 text-text-muted" />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Module Source Code */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Code2 className="w-3.5 h-3.5 text-text-muted" />
          <h2 className="font-display text-sm tracking-widest text-text-secondary uppercase">
            Module Source Code
          </h2>
        </div>

        <div className="border border-border rounded overflow-hidden flex" style={{ minHeight: 480 }}>
          {/* Module list sidebar */}
          <div className="w-56 shrink-0 border-r border-border bg-bg-elevated overflow-y-auto">
            {moduleSourcesLoading ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
              </div>
            ) : (
              (moduleSources ?? []).map((m) => (
                <button
                  key={m.module_id}
                  onClick={() => handleSelectModule(m.module_id)}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors border-b border-border last:border-0',
                    selectedModuleId === m.module_id
                      ? 'bg-bg-hover text-text-primary'
                      : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode className="w-3 h-3 shrink-0 text-text-muted" />
                    <span className="text-[11px] truncate">{m.display_name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-text-muted tabular-nums">{m.lines}L</span>
                    <ChevronRight className={cn('w-3 h-3 text-text-muted transition-transform', selectedModuleId === m.module_id && 'text-text-primary')} />
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Code viewer / editor */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selectedModuleId ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-2 text-text-muted">
                <Code2 className="w-8 h-8 opacity-30" />
                <p className="text-xs">Select a module to view its source</p>
              </div>
            ) : sourceLoading ? (
              <div className="flex items-center justify-center flex-1 gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
                <span className="text-xs text-text-muted">Loading source…</span>
              </div>
            ) : activeSource ? (
              <>
                {/* Toolbar */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-surface shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-text-secondary">{activeSource.filename}</span>
                    <span className="text-[10px] text-text-muted">
                      {(isEditing ? editedSource ?? '' : activeSource.source).split('\n').length} lines
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <button
                          onClick={handleCancelEdit}
                          className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary border border-border rounded px-2 py-0.5 transition-colors"
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </button>
                        <button
                          onClick={handleSave}
                          disabled={saving || editedSource === activeSource.source}
                          className="inline-flex items-center gap-1 text-[11px] text-accent-b2b border border-accent-b2b/30 rounded px-2 py-0.5 hover:bg-accent-b2b/10 transition-colors disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          Save
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleStartEdit}
                        className="inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary border border-border rounded px-2 py-0.5 hover:border-border-active transition-colors"
                      >
                        <Code2 className="w-3 h-3" />
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                {/* Source code area */}
                {isEditing ? (
                  <textarea
                    value={editedSource ?? activeSource.source}
                    onChange={(e) => setEditedSource(e.target.value)}
                    spellCheck={false}
                    className="flex-1 w-full bg-bg-base text-text-primary font-mono text-[11px] leading-relaxed p-4 resize-none border-0 outline-none focus:outline-none"
                    style={{ fontFamily: 'IBM Plex Mono, Menlo, monospace', tabSize: 4 }}
                  />
                ) : (
                  <div className="flex-1 overflow-auto">
                    <pre className="p-4 text-[11px] leading-relaxed font-mono text-text-secondary whitespace-pre"
                      style={{ fontFamily: 'IBM Plex Mono, Menlo, monospace' }}>
                      {activeSource.source}
                    </pre>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
