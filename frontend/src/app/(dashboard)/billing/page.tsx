'use client'

import { useState } from 'react'
import { useAppStore } from '@/store'
import { useUserStats } from '@/hooks/useSignals'
import { createCheckoutSession, getBillingPortalUrl } from '@/lib/api'
import { PLAN_FEATURES, PLAN_PRICES, PLAN_LIMITS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Check, ExternalLink, Loader2, Zap, Crown, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Plan } from '@/types'

const PLAN_ICONS: Record<Plan, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  free: Zap,
  pro: Crown,
  team: Building2,
}

export default function BillingPage() {
  const user = useAppStore((s) => s.user)
  const { data: stats } = useUserStats()
  const [loading, setLoading] = useState<Plan | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)

  const currentPlan = user?.plan ?? 'free'

  async function handleUpgrade(plan: Plan) {
    if (plan === currentPlan) return
    setLoading(plan)
    try {
      const { checkout_url } = await createCheckoutSession(plan)
      window.location.href = checkout_url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start checkout')
    } finally {
      setLoading(null)
    }
  }

  async function handleManageSubscription() {
    setPortalLoading(true)
    try {
      const url = await getBillingPortalUrl()
      window.open(url, '_blank')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open billing portal')
    } finally {
      setPortalLoading(false)
    }
  }

  const modulesLimit = PLAN_LIMITS[currentPlan].modules
  const activeModules = stats?.active_modules ?? 0

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-widest text-text-primary mb-1">
          BILLING
        </h1>
        <p className="text-text-muted text-xs">Manage your plan and usage</p>
      </div>

      {/* Current plan status */}
      <div className="mb-8 p-4 bg-bg-elevated border border-border rounded">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">
              Current Plan
            </p>
            <div className="flex items-center gap-2">
              <span
                className="px-2.5 py-1 text-sm font-medium rounded capitalize"
                style={{
                  background: 'var(--accent-b2b)15',
                  color: 'var(--accent-b2b)',
                  border: '1px solid var(--accent-b2b)30',
                }}
              >
                {currentPlan}
              </span>
              {currentPlan !== 'free' && (
                <button
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  {portalLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="w-3.5 h-3.5" />
                  )}
                  Manage Subscription
                </button>
              )}
            </div>
          </div>

          {/* Usage stats */}
          <div className="flex items-center gap-6">
            <UsageStat
              label="Modules"
              used={activeModules}
              limit={modulesLimit}
            />
            <UsageStat
              label="Jobs This Month"
              used={stats?.jobs_today ?? 0}
              limit={currentPlan === 'free' ? 30 : 1000}
            />
            <UsageStat
              label="Signals Generated"
              used={stats?.signals_this_week ?? 0}
              limit={currentPlan === 'free' ? 100 : 10000}
            />
          </div>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {(['free', 'pro', 'team'] as Plan[]).map((plan) => {
          const Icon = PLAN_ICONS[plan]
          const price = PLAN_PRICES[plan]
          const features = PLAN_FEATURES[plan]
          const isCurrent = plan === currentPlan
          const isPopular = plan === 'pro'

          return (
            <div
              key={plan}
              className={cn(
                'relative rounded border p-5 flex flex-col',
                isCurrent
                  ? 'bg-bg-elevated border-accent-b2b/40'
                  : 'bg-bg-surface border-border hover:border-border-active transition-colors'
              )}
            >
              {isPopular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-accent-b2b text-bg-base text-[10px] font-medium rounded-full">
                  Most Popular
                </span>
              )}

              <div className="flex items-center gap-2 mb-4">
                <Icon
                  className="w-4 h-4"
                  style={{
                    color: isCurrent ? 'var(--accent-b2b)' : 'var(--text-muted)',
                  } as React.CSSProperties}
                />
                <span
                  className={cn(
                    'text-sm font-medium capitalize',
                    isCurrent ? 'text-text-primary' : 'text-text-secondary'
                  )}
                >
                  {plan}
                </span>
                {isCurrent && (
                  <span className="ml-auto text-[10px] text-accent-b2b">Current</span>
                )}
              </div>

              <div className="mb-4">
                <span className="text-3xl font-display tracking-wide text-text-primary">
                  ${price.monthly}
                </span>
                <span className="text-text-muted text-xs">/mo</span>
              </div>

              <ul className="space-y-2 flex-1 mb-5">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="w-3 h-3 text-success shrink-0 mt-0.5" />
                    <span className="text-[12px] text-text-secondary leading-snug">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade(plan)}
                disabled={isCurrent || loading === plan}
                className={cn(
                  'w-full py-2 text-sm font-medium rounded transition-all duration-150',
                  isCurrent
                    ? 'bg-bg-hover border border-border-active text-text-muted cursor-default'
                    : 'bg-accent-b2b text-bg-base hover:opacity-90 disabled:opacity-50'
                )}
              >
                {loading === plan ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : isCurrent ? (
                  'Current Plan'
                ) : currentPlan === 'free' ? (
                  `Upgrade to ${plan}`
                ) : plan === 'free' ? (
                  'Downgrade'
                ) : (
                  `Switch to ${plan}`
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* FAQ */}
      <div className="border-t border-border pt-6">
        <p className="text-[10px] text-text-muted uppercase tracking-wide mb-4">
          Questions?
        </p>
        <p className="text-xs text-text-secondary">
          Contact us at{' '}
          <a
            href="mailto:support@mip.io"
            className="text-accent-consumer hover:underline"
          >
            support@mip.io
          </a>{' '}
          for billing inquiries.
        </p>
      </div>
    </div>
  )
}

function UsageStat({
  label,
  used,
  limit,
}: {
  label: string
  used: number
  limit: number
}) {
  const pct = Math.min(100, (used / limit) * 100)
  const color =
    pct >= 90 ? 'var(--error)' : pct >= 70 ? 'var(--warning)' : 'var(--success)'

  return (
    <div className="text-center">
      <p className="text-[10px] text-text-muted mb-1">{label}</p>
      <p className="text-lg font-display tracking-wide" style={{ color } as React.CSSProperties}>
        {used}
        <span className="text-text-muted text-xs">/{limit}</span>
      </p>
      <div className="w-20 h-1 bg-bg-base rounded-full mt-1 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}
