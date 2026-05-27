'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Mail, Lock, ArrowRight, Loader2, Zap } from 'lucide-react'
import { toast } from 'sonner'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

const magicLinkSchema = z.object({
  email: z.string().email('Invalid email address'),
})

type LoginForm = z.infer<typeof loginSchema>
type MagicLinkForm = z.infer<typeof magicLinkSchema>

export default function LoginPage() {
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [loading, setLoading] = useState(false)
  const [magicSent, setMagicSent] = useState(false)
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const passwordForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const magicForm = useForm<MagicLinkForm>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: '' },
  })

  async function onPasswordSubmit(data: LoginForm) {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })
      if (error) throw error
      router.push('/overview')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  async function onMagicLinkSubmit(data: MagicLinkForm) {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: data.email,
        options: { emailRedirectTo: `${window.location.origin}/overview` },
      })
      if (error) throw error
      setMagicSent(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send magic link')
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

        {/* Card */}
        <div className="bg-bg-surface border border-border rounded p-6">
          {/* Mode Toggle */}
          <div className="flex gap-1 mb-6 bg-bg-elevated rounded p-1">
            <button
              onClick={() => setMode('password')}
              className={cn(
                'flex-1 text-xs py-1.5 rounded transition-all duration-150',
                mode === 'password'
                  ? 'bg-bg-hover text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              Password
            </button>
            <button
              onClick={() => setMode('magic')}
              className={cn(
                'flex-1 text-xs py-1.5 rounded transition-all duration-150',
                mode === 'magic'
                  ? 'bg-bg-hover text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              Magic Link
            </button>
          </div>

          {mode === 'password' ? (
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                  <input
                    {...passwordForm.register('email')}
                    type="email"
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2 text-sm"
                    autoComplete="email"
                  />
                </div>
                {passwordForm.formState.errors.email && (
                  <p className="text-error text-xs mt-1">
                    {passwordForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                  <input
                    {...passwordForm.register('password')}
                    type="password"
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 text-sm"
                    autoComplete="current-password"
                  />
                </div>
                {passwordForm.formState.errors.password && (
                  <p className="text-error text-xs mt-1">
                    {passwordForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-b2b text-bg-base text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : magicSent ? (
            <div className="text-center py-4">
              <div className="w-10 h-10 rounded-full bg-bg-elevated border border-success flex items-center justify-center mx-auto mb-3">
                <Mail className="w-5 h-5 text-success" />
              </div>
              <p className="text-text-primary text-sm mb-1">Check your inbox</p>
              <p className="text-text-muted text-xs">
                We sent a magic link to{' '}
                <span className="text-text-secondary">{magicForm.getValues('email')}</span>
              </p>
              <button
                onClick={() => setMagicSent(false)}
                className="mt-4 text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                Send again
              </button>
            </div>
          ) : (
            <form onSubmit={magicForm.handleSubmit(onMagicLinkSubmit)} className="space-y-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                  <input
                    {...magicForm.register('email')}
                    type="email"
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2 text-sm"
                    autoComplete="email"
                  />
                </div>
                {magicForm.formState.errors.email && (
                  <p className="text-error text-xs mt-1">
                    {magicForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-b2b text-bg-base text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Send Magic Link
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-text-muted text-xs mt-6">
          No account?{' '}
          <Link
            href="/auth/signup"
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
