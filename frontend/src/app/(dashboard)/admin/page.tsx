'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAdminOverview,
  getAdminUsers,
  adminUpdatePlan,
  adminToggleAdmin,
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

  // Guard: non-admins see a 403 page
  if (user && !user.is_admin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-text-muted text-sm">You don't have admin access.</p>
      </div>
    )
  }

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: getAdminOverview,
    refetchInterval: 30_000,
  })

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: getAdminUsers,
  })

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
    </div>
  )
}
