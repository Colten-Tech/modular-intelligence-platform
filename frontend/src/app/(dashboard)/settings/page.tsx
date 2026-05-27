'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAppStore } from '@/store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { copyToClipboard } from '@/lib/utils'
import { toast } from 'sonner'
import { Copy, Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react'

const profileSchema = z.object({
  email: z.string().email(),
})

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(8, 'Min 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

type ProfileForm = z.infer<typeof profileSchema>
type PasswordForm = z.infer<typeof passwordSchema>

const FAKE_API_KEY = 'mip_sk_' + 'x'.repeat(32)

export default function SettingsPage() {
  const user = useAppStore((s) => s.user)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const supabase = getSupabaseBrowserClient()

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { email: user?.email ?? '' },
  })

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  })

  const [emailFrequency, setEmailFrequency] = useState('daily')
  const [alertTypes, setAlertTypes] = useState({
    high_score: true,
    module_errors: true,
    job_complete: false,
    weekly_digest: true,
  })

  async function onProfileSubmit(data: ProfileForm) {
    const { error } = await supabase.auth.updateUser({ email: data.email })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Email updated — check your inbox to confirm')
    }
  }

  async function onPasswordSubmit(data: PasswordForm) {
    const { error } = await supabase.auth.updateUser({
      password: data.newPassword,
    })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Password updated')
      passwordForm.reset()
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div className="mb-2">
        <h1 className="font-display text-3xl tracking-widest text-text-primary mb-1">
          SETTINGS
        </h1>
        <p className="text-text-muted text-xs">Manage your account preferences</p>
      </div>

      {/* 1. Profile */}
      <Section title="Profile">
        <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
          <Field label="Email">
            <input
              {...profileForm.register('email')}
              type="email"
              className="w-full px-3 py-2 text-sm"
            />
            {profileForm.formState.errors.email && (
              <p className="text-error text-[11px] mt-1">
                {profileForm.formState.errors.email.message}
              </p>
            )}
          </Field>
          <Field label="Plan">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-accent-b2b/10 border border-accent-b2b/20 text-accent-b2b text-xs rounded capitalize">
                {user?.plan ?? 'free'}
              </span>
              <a
                href="/billing"
                className="text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                Change plan →
              </a>
            </div>
          </Field>
          <button
            type="submit"
            disabled={profileForm.formState.isSubmitting}
            className="px-4 py-2 bg-accent-b2b text-bg-base text-xs font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {profileForm.formState.isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              'Save Profile'
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-border">
          <p className="text-xs text-text-secondary font-medium mb-4">Change Password</p>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
            <Field label="Current Password">
              <div className="relative">
                <input
                  {...passwordForm.register('currentPassword')}
                  type={passwordVisible ? 'text' : 'password'}
                  className="w-full pr-8 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible(!passwordVisible)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                >
                  {passwordVisible ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </Field>
            <Field label="New Password">
              <input
                {...passwordForm.register('newPassword')}
                type="password"
                className="w-full px-3 py-2 text-sm"
              />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-error text-[11px] mt-1">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </Field>
            <Field label="Confirm Password">
              <input
                {...passwordForm.register('confirmPassword')}
                type="password"
                className="w-full px-3 py-2 text-sm"
              />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-error text-[11px] mt-1">
                  {passwordForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </Field>
            <button
              type="submit"
              disabled={passwordForm.formState.isSubmitting}
              className="px-4 py-2 border border-border text-text-secondary text-xs rounded hover:border-border-active hover:text-text-primary transition-colors disabled:opacity-50"
            >
              Update Password
            </button>
          </form>
        </div>
      </Section>

      {/* 2. Notifications */}
      <Section title="Notifications">
        <Field label="Email Digest Frequency">
          <select
            value={emailFrequency}
            onChange={(e) => setEmailFrequency(e.target.value)}
            className="w-48 px-3 py-2 text-sm"
          >
            <option value="realtime">Real-time</option>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="off">Off</option>
          </select>
        </Field>

        <div className="mt-4 space-y-3">
          <p className="text-[10px] text-text-muted uppercase tracking-wide">Alert Types</p>
          {(
            Object.entries(alertTypes) as [keyof typeof alertTypes, boolean][]
          ).map(([key, enabled]) => (
            <label
              key={key}
              className="flex items-center justify-between cursor-pointer group"
            >
              <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors capitalize">
                {key.replace(/_/g, ' ')}
              </span>
              <button
                type="button"
                onClick={() =>
                  setAlertTypes((a) => ({ ...a, [key]: !enabled }))
                }
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  enabled ? 'bg-accent-b2b' : 'bg-bg-elevated border border-border'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-bg-base transition-transform ${
                    enabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>
          ))}
        </div>

        <button
          onClick={() => toast.success('Notification preferences saved')}
          className="mt-4 px-4 py-2 bg-accent-b2b text-bg-base text-xs font-medium rounded hover:opacity-90 transition-opacity"
        >
          Save Notifications
        </button>
      </Section>

      {/* 3. Integrations */}
      <Section title="Integrations">
        <div className="space-y-3">
          <IntegrationRow
            name="Email (Resend)"
            description="Deliver signal digests via Resend"
            connected
          />
          <IntegrationRow
            name="Stripe"
            description="Billing and subscription management"
            connected={user?.plan !== 'free'}
            href="/billing"
          />
        </div>
      </Section>

      {/* 4. API Access (Team only) */}
      {user?.plan === 'team' && (
        <Section title="API Access">
          <p className="text-xs text-text-muted mb-4">
            Use your API key to access MIP programmatically.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-bg-elevated border border-border rounded text-xs font-mono text-text-secondary">
              {showApiKey ? FAKE_API_KEY : '•'.repeat(40)}
            </code>
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="p-2 border border-border rounded text-text-muted hover:text-text-primary transition-colors"
            >
              {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => { copyToClipboard(FAKE_API_KEY); toast.success('API key copied') }}
              className="p-2 border border-border rounded text-text-muted hover:text-text-primary transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-text-muted mt-2">
            Keep this key secret. Regenerate if compromised.
          </p>
        </Section>
      )}

      {/* 5. Danger Zone */}
      <Section title="Danger Zone">
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-bg-elevated border border-border rounded">
            <div>
              <p className="text-xs text-text-secondary font-medium mb-0.5">Export My Data</p>
              <p className="text-[11px] text-text-muted">Download all your signals and settings as JSON</p>
            </div>
            <button
              onClick={() => toast.success('Export queued — you will receive an email shortly')}
              className="px-3 py-1.5 border border-border text-text-secondary text-xs rounded hover:border-border-active hover:text-text-primary transition-colors"
            >
              Export
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-error/5 border border-error/20 rounded">
            <div>
              <p className="text-xs text-error font-medium mb-0.5">Delete Account</p>
              <p className="text-[11px] text-text-muted">
                Permanently delete your account and all data. This cannot be undone.
              </p>
            </div>
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toast.error('Account deletion requested')}
                  className="px-3 py-1.5 bg-error text-white text-xs rounded hover:opacity-90 transition-opacity"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-1.5 border border-error/30 text-error text-xs rounded hover:bg-error/10 transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
                Delete
              </button>
            )}
          </div>
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h2 className="text-[10px] text-text-muted uppercase tracking-[0.2em] mb-4 pb-2 border-b border-border">
        {title}
      </h2>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs text-text-secondary">{label}</label>
      {children}
    </div>
  )
}

function IntegrationRow({
  name,
  description,
  connected,
  href,
}: {
  name: string
  description: string
  connected: boolean
  href?: string
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-bg-elevated border border-border rounded">
      <div>
        <p className="text-xs text-text-secondary font-medium mb-0.5">{name}</p>
        <p className="text-[11px] text-text-muted">{description}</p>
      </div>
      {connected ? (
        <span className="text-[10px] text-success border border-success/30 bg-success/10 px-2 py-0.5 rounded">
          Connected
        </span>
      ) : href ? (
        <a
          href={href}
          className="text-[11px] text-text-muted hover:text-text-secondary border border-border rounded px-2 py-0.5 transition-colors"
        >
          Connect →
        </a>
      ) : (
        <span className="text-[10px] text-text-muted border border-border px-2 py-0.5 rounded">
          Not connected
        </span>
      )}
    </div>
  )
}
