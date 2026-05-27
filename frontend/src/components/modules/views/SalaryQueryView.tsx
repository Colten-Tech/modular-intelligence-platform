'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { Search, TrendingUp, DollarSign, Info } from 'lucide-react'

const querySchema = z.object({
  role: z.string().min(2, 'Enter a role'),
  city: z.string().min(1, 'Select a city'),
  years_exp: z.number().min(0).max(30),
  company_size: z.string().min(1, 'Select company size'),
  your_salary: z.number().optional(),
})

type QueryForm = z.infer<typeof querySchema>

interface SalaryResult {
  p25: number
  median: number
  p75: number
  p90: number
  percentile_rank?: number
  sample_size: number
}

// Simulated result — in real app this comes from API
function simulateResult(data: QueryForm): SalaryResult {
  const base = 60000 + data.years_exp * 8000
  return {
    p25: Math.round(base * 0.8),
    median: base,
    p75: Math.round(base * 1.25),
    p90: Math.round(base * 1.6),
    percentile_rank: data.your_salary
      ? Math.min(99, Math.round(((data.your_salary - base * 0.7) / (base * 0.9)) * 100))
      : undefined,
    sample_size: Math.floor(Math.random() * 2000 + 500),
  }
}

function formatSalary(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${Math.round(n / 1000)}K`
  return `$${n}`
}

const CITIES = [
  'San Francisco, CA',
  'New York, NY',
  'Seattle, WA',
  'Austin, TX',
  'Boston, MA',
  'Chicago, IL',
  'Los Angeles, CA',
  'Denver, CO',
  'Remote',
]

const COMPANY_SIZES = [
  { value: 'startup', label: 'Startup (1-50)' },
  { value: 'mid', label: 'Mid-size (51-500)' },
  { value: 'enterprise', label: 'Enterprise (500+)' },
  { value: 'faang', label: 'FAANG / Big Tech' },
]

export function SalaryQueryView() {
  const [result, setResult] = useState<SalaryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [showContribute, setShowContribute] = useState(false)

  const form = useForm<QueryForm>({
    resolver: zodResolver(querySchema),
    defaultValues: {
      role: '',
      city: '',
      years_exp: 3,
      company_size: '',
    },
  })

  async function onSubmit(data: QueryForm) {
    setLoading(true)
    // Simulate API call
    await new Promise((r) => setTimeout(r, 800))
    setResult(simulateResult(data))
    setLoading(false)
  }

  const yoe = form.watch('years_exp')

  return (
    <div className="space-y-6">
      {/* Query form */}
      <div className="bg-bg-elevated border border-border rounded p-5">
        <h3 className="text-xs text-text-secondary mb-4">Query Salary Data</h3>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Role / Title</label>
              <input
                {...form.register('role')}
                placeholder="e.g. Senior Software Engineer"
                className="w-full px-3 py-2 text-sm"
              />
              {form.formState.errors.role && (
                <p className="text-error text-[11px] mt-1">
                  {form.formState.errors.role.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-text-secondary mb-1.5">City / Location</label>
              <select {...form.register('city')} className="w-full px-3 py-2 text-sm">
                <option value="">Select city...</option>
                {CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {form.formState.errors.city && (
                <p className="text-error text-[11px] mt-1">
                  {form.formState.errors.city.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-text-secondary mb-1.5">
                Years Experience: <span className="text-text-primary">{yoe}</span>
              </label>
              <input
                {...form.register('years_exp', { valueAsNumber: true })}
                type="range"
                min={0}
                max={30}
                className="w-full accent-[var(--accent-b2b)]"
              />
              <div className="flex justify-between text-[10px] text-text-muted mt-1">
                <span>0</span>
                <span>15</span>
                <span>30+</span>
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Company Size</label>
              <select {...form.register('company_size')} className="w-full px-3 py-2 text-sm">
                <option value="">Select size...</option>
                {COMPANY_SIZES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showContribute && (
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">
                Your Current Salary (optional — contributes to dataset)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                <input
                  {...form.register('your_salary', { valueAsNumber: true })}
                  type="number"
                  placeholder="e.g. 120000"
                  className="w-full pl-8 pr-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setShowContribute(!showContribute)}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              {showContribute ? '− Hide' : '+ Add'} your salary
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent-b2b text-bg-base text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? (
                'Querying...'
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  Query
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Results */}
      {result && (
        <div className="bg-bg-elevated border border-border rounded p-5 space-y-5 animate-fade-in-up">
          <div className="flex items-center justify-between">
            <h3 className="text-xs text-text-secondary">Salary Range</h3>
            <span className="text-[10px] text-text-muted">
              Based on {result.sample_size.toLocaleString()} data points
            </span>
          </div>

          {/* Percentile bars */}
          <div className="space-y-3">
            {[
              { label: 'P25', value: result.p25, color: 'var(--score-low)' },
              { label: 'Median', value: result.median, color: 'var(--accent-b2b)', prominent: true },
              { label: 'P75', value: result.p75, color: 'var(--score-mid)' },
              { label: 'P90', value: result.p90, color: 'var(--score-high)' },
            ].map(({ label, value, color, prominent }) => (
              <div key={label} className="flex items-center gap-3">
                <span
                  className={cn(
                    'w-10 text-[11px] text-right shrink-0',
                    prominent ? 'text-text-primary font-medium' : 'text-text-muted'
                  )}
                >
                  {label}
                </span>
                <div className="flex-1 h-2 bg-bg-base rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(value / result.p90) * 100}%`,
                      background: color,
                    }}
                  />
                </div>
                <span
                  className={cn(
                    'w-16 text-xs shrink-0',
                    prominent ? 'text-text-primary font-medium' : 'text-text-secondary'
                  )}
                >
                  {formatSalary(value)}
                </span>
              </div>
            ))}
          </div>

          {/* Your salary comparison */}
          {result.percentile_rank !== undefined && (
            <div className="bg-bg-base rounded border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-accent-b2b" />
                <p className="text-xs text-text-secondary">Your Salary Percentile</p>
              </div>
              <p className="text-2xl font-display tracking-wide" style={{ color: 'var(--accent-b2b)' }}>
                {result.percentile_rank}th
              </p>
              <p className="text-[11px] text-text-muted mt-1">
                You earn more than {result.percentile_rank}% of respondents in this role/location.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
