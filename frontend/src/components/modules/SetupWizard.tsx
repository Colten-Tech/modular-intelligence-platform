'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { CLUSTER_COLORS, CLUSTER_LABELS } from '@/lib/constants'
import { ConfigFormRenderer } from './ConfigFormRenderer'
import { useEnableModule } from '@/hooks/useModules'
import type { ModuleDefinition } from '@/types'
import { X, ChevronLeft, ChevronRight, Zap, CheckCircle2, Mail, Globe } from 'lucide-react'

interface SetupWizardProps {
  module: ModuleDefinition
  onClose: () => void
  onSuccess?: () => void
}

const STEPS = [
  'Overview',
  'Data Sources',
  'Filters',
  'Delivery',
  'Confirm',
]

interface DeliverySettings {
  email_enabled: boolean
  email_frequency: string
  webhook_url: string
}

export function SetupWizard({ module, onClose, onSuccess }: SetupWizardProps) {
  const [step, setStep] = useState(0)
  const [moduleConfig, setModuleConfig] = useState<Record<string, unknown>>({})
  const [delivery, setDelivery] = useState<DeliverySettings>({
    email_enabled: true,
    email_frequency: 'daily',
    webhook_url: '',
  })
  const { mutate: enableModule, isPending } = useEnableModule()

  const clusterColor = CLUSTER_COLORS[module.cluster] ?? 'var(--text-muted)'
  const progress = ((step + 1) / STEPS.length) * 100

  // Split schema properties into data-source fields vs filter fields
  const allProps = Object.entries(module.config_schema.properties ?? {})
  const dataSrcKeys = allProps
    .filter(([k]) => k.includes('url') || k.includes('api_key') || k.includes('source'))
    .map(([k]) => k)
  const filterKeys = allProps
    .filter(([k]) => !dataSrcKeys.includes(k) && !k.includes('schedule'))
    .map(([k]) => k)

  function makeSubSchema(keys: string[]) {
    const props: Record<string, typeof allProps[number][1]> = {}
    for (const [k, v] of allProps) {
      if (keys.includes(k)) props[k] = v
    }
    return { ...module.config_schema, properties: props }
  }

  function handleFinish() {
    const finalConfig = {
      ...moduleConfig,
      delivery_email: delivery.email_enabled,
      delivery_email_frequency: delivery.email_frequency,
      delivery_webhook_url: delivery.webhook_url || undefined,
    }

    enableModule(
      { moduleId: module.module_id, config: finalConfig },
      {
        onSuccess: () => {
          onSuccess?.()
          onClose()
        },
      }
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-lg bg-bg-surface border border-border rounded overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: clusterColor }}
            />
            <div>
              <h2 className="text-sm text-text-primary font-medium">{module.display_name}</h2>
              <p className="text-[10px] text-text-muted">{CLUSTER_LABELS[module.cluster]}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-[2px] bg-bg-elevated">
          <motion.div
            className="h-full rounded-full"
            style={{ background: clusterColor }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-between px-5 py-3">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  'text-[10px] uppercase tracking-wide transition-colors',
                  i === step
                    ? 'text-text-primary'
                    : i < step
                    ? 'text-text-muted line-through'
                    : 'text-text-muted'
                )}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <span className="text-text-muted text-[10px]">/</span>
              )}
            </div>
          ))}
        </div>

        {/* Content — scrollable, fills remaining height between header and footer */}
        <div className="px-5 pb-5 min-h-[280px] overflow-y-auto flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.15 }}
            >
              {step === 0 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-text-primary font-medium text-sm mb-1">What this module does</h3>
                    <p className="text-text-secondary text-sm leading-relaxed">
                      {module.description}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] text-text-muted uppercase tracking-wide">Details</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-bg-elevated rounded p-3">
                        <p className="text-[10px] text-text-muted mb-1">Intelligence cluster</p>
                        <p className="text-xs text-text-secondary">
                          {CLUSTER_LABELS[module.cluster]}
                        </p>
                      </div>
                      <div className="bg-bg-elevated rounded p-3">
                        <p className="text-[10px] text-text-muted mb-1">Runs automatically</p>
                        <p className="text-xs text-text-secondary">{module.default_schedule}</p>
                      </div>
                      <div className="bg-bg-elevated rounded p-3">
                        <p className="text-[10px] text-text-muted mb-1">Required plan</p>
                        <p className="text-xs text-text-secondary capitalize">
                          {module.required_plan}+
                        </p>
                      </div>
                      <div className="bg-bg-elevated rounded p-3">
                        <p className="text-[10px] text-text-muted mb-1">Setup steps</p>
                        <p className="text-xs text-text-secondary">
                          {dataSrcKeys.length > 0 ? 'Sources → Filters → Delivery' : 'Filters → Delivery'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-text-muted border-l-2 border-border pl-3 leading-relaxed">
                    After enabling, the first job runs within minutes. Signals appear in your feed as the module discovers them. All settings can be updated at any time.
                  </p>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-text-primary font-medium text-sm mb-1">Data Sources</h3>
                    <p className="text-text-muted text-xs leading-relaxed">
                      {dataSrcKeys.length > 0
                        ? `Tell the module where to fetch its data. ${module.display_name} will check these sources on every scheduled run.`
                        : `${module.display_name} uses built-in data sources and requires no URLs or API keys. Continue to the next step to set your filters.`}
                    </p>
                  </div>
                  {dataSrcKeys.length > 0 ? (
                    <ConfigFormRenderer
                      schema={makeSubSchema(dataSrcKeys)}
                      defaultValues={moduleConfig}
                      onSubmit={(vals) => {
                        setModuleConfig((prev) => ({ ...prev, ...vals }))
                        setStep(2)
                      }}
                      submitLabel="Next: Filters →"
                    />
                  ) : (
                    <div className="flex items-start gap-3 p-3 bg-bg-elevated rounded border border-border">
                      <span className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: clusterColor }} />
                      <p className="text-xs text-text-secondary leading-relaxed">
                        No source configuration needed. Click <strong className="text-text-primary">Next</strong> below to configure your relevance filters.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-text-primary font-medium text-sm mb-1">Filters & Relevance</h3>
                    <p className="text-text-muted text-xs leading-relaxed">
                      {filterKeys.length > 0
                        ? `Tell the module what's relevant to you. Signals that don't match your criteria are filtered out before they reach your feed. All of these can be changed at any time after enabling.`
                        : `No filter configuration needed — ${module.display_name} surfaces all detected signals to your feed.`}
                    </p>
                  </div>
                  {filterKeys.length > 0 ? (
                    <ConfigFormRenderer
                      schema={makeSubSchema(filterKeys)}
                      defaultValues={moduleConfig}
                      onSubmit={(vals) => {
                        setModuleConfig((prev) => ({ ...prev, ...vals }))
                        setStep(3)
                      }}
                      submitLabel="Next: Delivery →"
                    />
                  ) : (
                    <div className="flex items-start gap-3 p-3 bg-bg-elevated rounded border border-border">
                      <span className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: clusterColor }} />
                      <p className="text-xs text-text-secondary leading-relaxed">
                        No filters to configure. Click <strong className="text-text-primary">Next</strong> to set up your delivery preferences.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-text-primary font-medium text-sm mb-1">Delivery Settings</h3>
                    <p className="text-text-muted text-xs leading-relaxed">
                      Choose how and when you receive signals. Email digests batch signals to reduce noise — use real-time only for high-urgency modules. You can update these in Settings at any time.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {/* Email toggle */}
                    <div className="flex items-center justify-between p-3 bg-bg-elevated rounded border border-border">
                      <div className="flex items-center gap-3">
                        <Mail className="w-4 h-4 text-text-muted" />
                        <div>
                          <p className="text-xs text-text-primary">Email Digest</p>
                          <p className="text-[10px] text-text-muted">Get signals delivered via email</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDelivery((d) => ({ ...d, email_enabled: !d.email_enabled }))
                        }
                        className={cn(
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                          delivery.email_enabled ? 'bg-accent-b2b' : 'bg-bg-base border border-border'
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-3.5 w-3.5 transform rounded-full bg-bg-base transition-transform',
                            delivery.email_enabled ? 'translate-x-4' : 'translate-x-0.5'
                          )}
                        />
                      </button>
                    </div>

                    {delivery.email_enabled && (
                      <div>
                        <label className="text-xs text-text-secondary block mb-1.5">
                          Email frequency
                        </label>
                        <select
                          value={delivery.email_frequency}
                          onChange={(e) =>
                            setDelivery((d) => ({ ...d, email_frequency: e.target.value }))
                          }
                          className="w-full px-3 py-2 text-sm"
                        >
                          <option value="realtime">Real-time (each signal)</option>
                          <option value="hourly">Hourly digest</option>
                          <option value="daily">Daily digest</option>
                          <option value="weekly">Weekly digest</option>
                        </select>
                      </div>
                    )}

                    {/* Webhook */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-text-muted" />
                        <label className="text-xs text-text-secondary">Webhook URL (optional)</label>
                      </div>
                      <input
                        type="url"
                        value={delivery.webhook_url}
                        onChange={(e) =>
                          setDelivery((d) => ({ ...d, webhook_url: e.target.value }))
                        }
                        placeholder="https://hooks.example.com/..."
                        className="w-full px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-text-primary font-medium text-sm mb-1">Ready to launch</h3>
                    <p className="text-text-muted text-xs leading-relaxed">
                      Review your configuration below. Once enabled, the first job will be queued immediately and signals will appear in your feed as they're discovered. You can pause, reconfigure, or remove the module at any time.
                    </p>
                  </div>

                  <div className="bg-bg-elevated rounded border border-border p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: clusterColor }}
                      />
                      <span className="text-sm text-text-primary">{module.display_name}</span>
                    </div>

                    {Object.entries(moduleConfig).length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-border">
                        {Object.entries(moduleConfig)
                          .filter(([, v]) => v !== undefined && v !== '')
                          .slice(0, 5)
                          .map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-4">
                              <span className="text-[11px] text-text-muted capitalize">
                                {k.replace(/_/g, ' ')}
                              </span>
                              <span className="text-[11px] text-text-secondary truncate max-w-[200px]">
                                {Array.isArray(v) ? v.join(', ') : String(v)}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}

                    <div className="pt-2 border-t border-border space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[11px] text-text-muted">Email delivery</span>
                        <span className="text-[11px] text-text-secondary">
                          {delivery.email_enabled ? delivery.email_frequency : 'Off'}
                        </span>
                      </div>
                      {delivery.webhook_url && (
                        <div className="flex justify-between">
                          <span className="text-[11px] text-text-muted">Webhook</span>
                          <span className="text-[11px] text-text-secondary">Configured</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <button
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors px-3 py-1.5"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {step === 0 ? 'Cancel' : 'Back'}
          </button>

          {/* Steps 1 and 2 use a form's own submit button when fields exist.
              When there are no fields the form is not rendered, so we fall
              back to showing the standard Next button here instead. */}
          {!(step === 1 && dataSrcKeys.length > 0) &&
           !(step === 2 && filterKeys.length > 0) && (
            <button
              onClick={() => {
                if (step === STEPS.length - 1) {
                  handleFinish()
                } else {
                  setStep((s) => s + 1)
                }
              }}
              disabled={isPending}
              className="flex items-center gap-1.5 text-xs px-4 py-2 bg-accent-b2b text-bg-base rounded font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {step === STEPS.length - 1 ? (
                isPending ? (
                  'Enabling...'
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    Enable & Run First Job
                  </>
                )
              ) : (
                <>
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
