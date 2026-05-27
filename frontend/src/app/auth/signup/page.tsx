'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Mail, Lock, ArrowRight, Loader2, Zap, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

const signupSchema = z
  .object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

type SignupForm = z.infer<typeof signupSchema>

const FEATURES = [
  'Automated signal intelligence',
  '14 specialized data modules',
  'Hourly job scheduling',
  'Email + webhook delivery',
]

export default function SignupPage() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const form = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  })

  async function onSubmit(data: SignupForm) {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/overview`,
        },
      })
      if (error) throw error
      setSuccess(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
      {/* Background grid */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, var(--text-primary) 0px, transparent 1px), repeating-linear-gradient(90deg, var(--text-primary) 0px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="w-full max-w-sm animate-fade-in-up">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-accent-b2b flex items-center justify-center rounded-sm">
              <Zap className="w-4 h-4 text-bg-base" strokeWidth={2.5} />
            </div>
            <span className="font-display text-4xl tracking-widest text-text-primary">MIP</span>
          </div>
          <p className="text-text-muted text-xs font-mono tracking-[0.2em] uppercase">
            Your intelligence, automated.
          </p>
        </div>

        {success ? (
          <div className="bg-bg-surface border border-border rounded p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-bg-elevated border border-success flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6 text-success" />
            </div>
            <p className="text-text-primary text-sm font-medium mb-2">Account created!</p>
            <p className="text-text-muted text-xs mb-6">
              Check your email to confirm your account and get started.
            </p>
            <button
              onClick={() => router.push('/auth/login')}
              className="w-full py-2.5 bg-accent-b2b text-bg-base text-sm font-medium rounded hover:opacity-90 transition-opacity"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <>
            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 justify-center mb-6">
              {FEATURES.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-bg-elevated border border-border text-text-muted text-[11px] rounded"
                >
                  <span className="w-1 h-1 rounded-full bg-accent-b2b" />
                  {f}
                </span>
              ))}
            </div>

            {/* Card */}
            <div className="bg-bg-surface border border-border rounded p-6">
              <h2 className="text-text-primary text-sm font-medium mb-6">Create your account</h2>

              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                    <input
                      {...form.register('email')}
                      type="email"
                      placeholder="you@example.com"
                      className="w-full pl-9 pr-3 py-2 text-sm"
                      autoComplete="email"
                    />
                  </div>
                  {form.formState.errors.email && (
                    <p className="text-error text-xs mt-1">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                    <input
                      {...form.register('password')}
                      type="password"
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 text-sm"
                      autoComplete="new-password"
                    />
                  </div>
                  {form.formState.errors.password && (
                    <p className="text-error text-xs mt-1">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                    <input
                      {...form.register('confirmPassword')}
                      type="password"
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 text-sm"
                      autoComplete="new-password"
                    />
                  </div>
                  {form.formState.errors.confirmPassword && (
                    <p className="text-error text-xs mt-1">
                      {form.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-2.5 bg-accent-b2b text-bg-base text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-50'
                  )}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Create Account
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <p className="text-center text-text-muted text-[11px]">
                  Free plan. No credit card required.
                </p>
              </form>
            </div>
          </>
        )}

        {/* Footer */}
        <p className="text-center text-text-muted text-xs mt-6">
          Already have an account?{' '}
          <Link
            href="/auth/login"
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
