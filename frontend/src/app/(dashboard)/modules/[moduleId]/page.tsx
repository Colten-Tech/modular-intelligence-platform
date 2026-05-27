'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useModules, useModuleStatus, useRunModule, useDeleteModule, usePauseModule, useResumeModule, useUpdateModuleConfig } from '@/hooks/useModules'
import { useModuleSignals } from '@/hooks/useSignals'
import { ModuleStatusIndicator } from '@/components/modules/ModuleStatusIndicator'
import { ConfigFormRenderer } from '@/components/modules/ConfigFormRenderer'
import { SignalTable } from '@/components/signals/SignalTable'
import { NapOptimizerView } from '@/components/modules/views/NapOptimizerView'
import { FencingDashboard } from '@/components/modules/views/FencingDashboard'
import { SecondBrainView } from '@/components/modules/views/SecondBrainView'
import { SalaryQueryView } from '@/components/modules/views/SalaryQueryView'
import { VoiceTrackerView } from '@/components/modules/views/VoiceTrackerView'
import { StressScorerView } from '@/components/modules/views/StressScorerView'
import { SchedulePlannerView } from '@/components/modules/views/SchedulePlannerView'
import { CLUSTER_COLORS } from '@/lib/constants'
import { formatRelativeTime, formatAbsoluteTime } from '@/lib/utils'
import {
  Play,
  Pause,
  Settings2,
  Trash2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export default function ModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>()
  const router = useRouter()
  const [showConfig, setShowConfig] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: modulesData, isLoading: modulesLoading } = useModules()
  const instance = modulesData?.instances.find((i) => i.id === moduleId)
  const definition = instance
    ? modulesData?.definitions.find((d) => d.module_id === instance.module_type)
    : null

  const { data: status } = useModuleStatus(moduleId)
  const { data: signalsData, isLoading: signalsLoading } = useModuleSignals(
    instance?.id ?? null
  )

  const { mutate: runModule, isPending: running } = useRunModule()
  const { mutate: deleteModule, isPending: deleting } = useDeleteModule()
  const { mutate: pauseModule, isPending: pausing } = usePauseModule()
  const { mutate: resumeModule, isPending: resuming } = useResumeModule()
  const { mutate: updateConfig, isPending: saving } = useUpdateModuleConfig()

  const signals = signalsData?.data ?? []
  const clusterColor = definition ? CLUSTER_COLORS[definition.cluster] : 'var(--text-muted)'

  if (modulesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    )
  }

  if (!instance || !definition) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-8 h-8 text-error" />
        <p className="text-text-muted text-sm">Module not found or not enabled.</p>
        <button
          onClick={() => router.push('/modules')}
          className="text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          ← Back to Module Library
        </button>
      </div>
    )
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteModule(instance!.id, {
      onSuccess: () => router.push('/modules'),
    })
  }

  const moduleStatus = (instance.status ?? 'paused') as import('@/types').ModuleStatus

  return (
    <div className="p-6 max-w-5xl">
      {/* Back */}
      <button
        onClick={() => router.push('/modules')}
        className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Module Library
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-6 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: clusterColor }}
            />
            <h1 className="font-display text-3xl tracking-widest text-text-primary">
              {definition.display_name.toUpperCase()}
            </h1>
          </div>
          <p className="text-text-secondary text-sm leading-relaxed max-w-xl mb-3">
            {definition.description}
          </p>

          {/* Status + last run */}
          <div className="flex items-center gap-4 flex-wrap">
            <ModuleStatusIndicator
              status={moduleStatus}
              last_run={instance.last_run ?? undefined}
              error={undefined}
              showDetails
            />
            {instance.last_run && (
              <span className="text-[11px] text-text-muted">
                Last run: {formatRelativeTime(instance.last_run)}
                {status?.job_counts && (
                  <> — {status.job_counts.signals ?? 0} signals found</>
                )}
              </span>
            )}
            {!instance.last_run && (
              <span className="text-[11px] text-text-muted">Never run</span>
            )}
            {instance.next_run && (
              <span className="text-[11px] text-text-muted">
                Next: {formatRelativeTime(instance.next_run)}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <button
            onClick={() => runModule(instance.id)}
            disabled={running || moduleStatus === 'running'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-b2b/10 border border-accent-b2b/20 text-accent-b2b text-xs rounded hover:bg-accent-b2b/20 transition-colors disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            Run Now
          </button>

          {moduleStatus === 'paused' ? (
            <button
              onClick={() => resumeModule(instance.id)}
              disabled={resuming}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border text-text-secondary text-xs rounded hover:border-border-active hover:text-text-primary transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              Resume
            </button>
          ) : (
            <button
              onClick={() => pauseModule(instance.id)}
              disabled={pausing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border text-text-secondary text-xs rounded hover:border-border-active hover:text-text-primary transition-colors disabled:opacity-50"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause
            </button>
          )}

          <button
            onClick={() => setShowConfig(!showConfig)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs rounded transition-colors',
              showConfig
                ? 'border-border-active text-text-primary bg-bg-hover'
                : 'border-border text-text-secondary hover:border-border-active hover:text-text-primary'
            )}
          >
            <Settings2 className="w-3.5 h-3.5" />
            Configure
          </button>

          <button
            onClick={handleDelete}
            disabled={deleting}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs rounded transition-colors',
              confirmDelete
                ? 'border-error/50 text-error bg-error/10 hover:bg-error/20'
                : 'border-border text-text-muted hover:border-error/50 hover:text-error'
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {confirmDelete ? 'Confirm Delete' : 'Delete'}
          </button>
          {confirmDelete && (
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-text-muted hover:text-text-secondary"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Module view — switches on ui_component_hint */}
      <div className="mb-6">
        <ModuleView
          hint={definition.ui_component_hint}
          signals={signals}
          isLoading={signalsLoading}
          instanceId={instance.id}
        />
      </div>

      {/* Collapsible config */}
      <div className="border border-border rounded overflow-hidden">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="w-full flex items-center justify-between px-4 py-3 bg-bg-elevated hover:bg-bg-hover transition-colors"
        >
          <span className="text-xs text-text-secondary">Configuration</span>
          {showConfig ? (
            <ChevronUp className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          )}
        </button>

        {showConfig && (
          <div className="p-5 border-t border-border">
            <ConfigFormRenderer
              schema={definition.config_schema}
              defaultValues={instance.config}
              onSubmit={(values) =>
                updateConfig({ instanceId: instance.id, config: values })
              }
              loading={saving}
              submitLabel="Save Configuration"
            />
          </div>
        )}
      </div>
    </div>
  )
}

interface ModuleViewProps {
  hint: string
  signals: import('@/types').Signal[]
  isLoading: boolean
  instanceId: string
}

function ModuleView({ hint, signals, isLoading, instanceId }: ModuleViewProps) {
  switch (hint) {
    case 'nap-optimizer':
      return <NapOptimizerView signals={signals} isLoading={isLoading} />
    case 'fencing-dashboard':
      return <FencingDashboard signals={signals} isLoading={isLoading} />
    case 'second-brain':
      return <SecondBrainView signals={signals} isLoading={isLoading} />
    case 'salary-query':
      return <SalaryQueryView />
    case 'voice-tracker':
      return <VoiceTrackerView signals={signals} isLoading={isLoading} />
    case 'stress-scorer':
      return <StressScorerView signals={signals} isLoading={isLoading} />
    case 'schedule-planner':
      return <SchedulePlannerView signals={signals} isLoading={isLoading} />
    case 'signal-feed':
    default:
      return (
        <SignalTable
          signals={signals}
          isLoading={isLoading}
          showModuleColumn={false}
        />
      )
  }
}
