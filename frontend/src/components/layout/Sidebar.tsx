'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useModules } from '@/hooks/useModules'
import { CLUSTER_COLORS } from '@/lib/constants'
import type { ModuleStatus } from '@/types'
import {
  LayoutDashboard,
  Layers,
  Briefcase,
  Settings,
  CreditCard,
  Plus,
  Zap,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  Code2,
  ShieldCheck,
} from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { toast } from 'sonner'

function StatusDotSmall({ status }: { status?: ModuleStatus }) {
  const colors: Record<string, string> = {
    active: 'var(--success)',
    running: 'var(--accent-consumer)',
    warning: 'var(--warning)',
    error: 'var(--error)',
    paused: 'var(--text-muted)',
  }
  const color = colors[status ?? 'paused'] ?? colors.paused
  return (
    <span
      className="relative inline-block w-1.5 h-1.5 rounded-full shrink-0"
      style={{ background: color }}
    />
  )
}

const NAV_ITEMS = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/modules', label: 'Modules', icon: Layers },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/studio', label: 'Studio', icon: Code2 },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  const user = useAppStore((s) => s.user)
  const { data: modulesData } = useModules()
  const supabase = getSupabaseBrowserClient()

  const activeInstances = modulesData?.instances.filter((i) => i.enabled) ?? []

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.error('Sign out failed')
      return
    }
    router.push('/auth/login')
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-bg-surface border-r border-border flex flex-col z-40 transition-all duration-200',
        sidebarCollapsed ? 'w-[52px]' : 'w-[240px]'
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'flex items-center border-b border-border shrink-0',
          sidebarCollapsed ? 'h-[52px] justify-center px-0' : 'h-[52px] px-4 gap-3'
        )}
      >
        <div className="w-6 h-6 bg-accent-b2b flex items-center justify-center rounded-sm shrink-0">
          <Zap className="w-3.5 h-3.5 text-bg-base" strokeWidth={2.5} />
        </div>
        {!sidebarCollapsed && (
          <div className="flex flex-col leading-none">
            <span className="font-display text-xl tracking-widest text-text-primary">MIP</span>
            <span className="text-[9px] text-text-muted tracking-[0.15em] uppercase">
              modular intelligence
            </span>
          </div>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
        <ul className="space-y-0.5 px-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-2.5 px-2 py-1.5 rounded text-xs transition-all duration-100',
                    active
                      ? 'text-text-primary bg-bg-hover border-l-2 border-l-accent-b2b pl-[6px]'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover border-l-2 border-l-transparent pl-[6px]',
                    sidebarCollapsed && 'justify-center px-0 border-l-0 pl-0'
                  )}
                  title={sidebarCollapsed ? label : undefined}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {!sidebarCollapsed && <span>{label}</span>}
                </Link>
              </li>
            )
          })}
          {/* Admin link — only visible to admins */}
          {user?.is_admin && (() => {
            const active = pathname.startsWith('/admin')
            return (
              <li>
                <Link
                  href="/admin"
                  className={cn(
                    'flex items-center gap-2.5 px-2 py-1.5 rounded text-xs transition-all duration-100',
                    active
                      ? 'text-accent-b2b bg-bg-hover border-l-2 border-l-accent-b2b pl-[6px]'
                      : 'text-text-muted hover:text-accent-b2b hover:bg-bg-hover border-l-2 border-l-transparent pl-[6px]',
                    sidebarCollapsed && 'justify-center px-0 border-l-0 pl-0'
                  )}
                  title={sidebarCollapsed ? 'Admin' : undefined}
                >
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  {!sidebarCollapsed && <span>Admin</span>}
                </Link>
              </li>
            )
          })()}
        </ul>

        {/* Active modules */}
        {!sidebarCollapsed && activeInstances.length > 0 && (
          <div className="mt-4 px-2">
            <p className="text-[9px] text-text-muted uppercase tracking-[0.15em] px-2 mb-2">
              Active Modules
            </p>
            <ul className="space-y-0.5">
              {activeInstances.map((inst) => {
                const def = modulesData?.definitions.find(
                  (d) => d.module_id === inst.module_type
                )
                const clusterColor = def ? CLUSTER_COLORS[def.cluster] : 'var(--text-muted)'
                const active = pathname === `/modules/${inst.id}`
                return (
                  <li key={inst.id}>
                    <Link
                      href={`/modules/${inst.id}`}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-all duration-100',
                        active
                          ? 'text-text-primary bg-bg-hover'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                      )}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: clusterColor }}
                      />
                      <span className="truncate">
                        {def?.display_name ?? inst.module_type}
                      </span>
                      <StatusDotSmall status={inst.status} />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Add module */}
        {!sidebarCollapsed && (
          <div className="mt-2 px-2">
            <Link
              href="/modules"
              className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-all duration-100"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Module</span>
            </Link>
          </div>
        )}
      </nav>

      {/* Bottom section */}
      <div className="shrink-0 border-t border-border py-2 px-2 space-y-0.5">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-2.5 px-2 py-1.5 rounded text-xs transition-all duration-100',
            pathname === '/settings'
              ? 'text-text-primary bg-bg-hover'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
            sidebarCollapsed && 'justify-center'
          )}
          title={sidebarCollapsed ? 'Settings' : undefined}
        >
          <Settings className="w-3.5 h-3.5 shrink-0" />
          {!sidebarCollapsed && <span>Settings</span>}
        </Link>

        <Link
          href="/billing"
          className={cn(
            'flex items-center gap-2.5 px-2 py-1.5 rounded text-xs transition-all duration-100',
            pathname === '/billing'
              ? 'text-text-primary bg-bg-hover'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
            sidebarCollapsed && 'justify-center'
          )}
          title={sidebarCollapsed ? 'Billing' : undefined}
        >
          <CreditCard className="w-3.5 h-3.5 shrink-0" />
          {!sidebarCollapsed && <span>Billing</span>}
        </Link>

        {/* User row */}
        {user && (
          <div
            className={cn(
              'flex items-center mt-2 pt-2 border-t border-border',
              sidebarCollapsed ? 'justify-center' : 'gap-2 px-2'
            )}
          >
            <div className="w-6 h-6 rounded-full bg-bg-elevated border border-border flex items-center justify-center shrink-0">
              <User className="w-3 h-3 text-text-muted" />
            </div>
            {!sidebarCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-text-secondary truncate">{user.email}</p>
                  <p className="text-[9px] text-text-muted capitalize">{user.plan} plan</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-1 text-text-muted hover:text-error transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-[52px] w-6 h-6 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-text-muted hover:text-text-primary hover:border-border-active transition-all duration-150 z-50"
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>
    </aside>
  )
}
