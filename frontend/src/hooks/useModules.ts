'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '@/lib/api'
import type { Job, ModuleDefinition, ModuleInstance, PaginatedResponse } from '@/types'
import { toast } from 'sonner'
import { jobKeys } from '@/hooks/useJobs'

export const moduleKeys = {
  all: ['modules'] as const,
  detail: (id: string) => ['modules', id] as const,
  status: (id: string) => ['modules', id, 'status'] as const,
  signals: (id: string) => ['modules', id, 'signals'] as const,
}

export interface ModulesData {
  definitions: ModuleDefinition[]
  instances: ModuleInstance[]
  // Derived: definition merged with instance
  enriched: (ModuleDefinition & { instance?: ModuleInstance })[]
}

export function useModules() {
  return useQuery({
    queryKey: moduleKeys.all,
    queryFn: async (): Promise<ModulesData> => {
      const { definitions, instances } = await api.getModules()
      const instanceMap = new Map(instances.map((i) => [i.module_type, i]))
      const enriched = definitions.map((def) => ({
        ...def,
        instance: instanceMap.get(def.module_id),
      }))
      return { definitions, instances, enriched }
    },
    staleTime: 30_000,
  })
}

export function useModuleStatus(instanceId: string | null) {
  return useQuery({
    queryKey: moduleKeys.status(instanceId ?? ''),
    queryFn: () => api.getModuleStatus(instanceId!),
    enabled: !!instanceId,
    refetchInterval: 30_000,
  })
}

export function useEnableModule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      moduleId,
      config,
    }: {
      moduleId: string
      config: Record<string, unknown>
    }) => api.enableModule(moduleId, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: moduleKeys.all })
      toast.success('Module enabled successfully')
    },
    onError: (err: Error) => {
      toast.error(`Failed to enable module: ${err.message}`)
    },
  })
}

export function useUpdateModuleConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      instanceId,
      config,
    }: {
      instanceId: string
      config: Record<string, unknown>
    }) => api.updateModuleConfig(instanceId, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: moduleKeys.all })
      toast.success('Configuration saved')
    },
    onError: (err: Error) => {
      toast.error(`Failed to save config: ${err.message}`)
    },
  })
}

export function useRunModule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ instanceId, moduleType }: { instanceId: string; moduleType?: string }) =>
      api.runModule(instanceId),
    onSuccess: (data, { moduleType }) => {
      queryClient.invalidateQueries({ queryKey: moduleKeys.all })

      // Inject the new job directly into every cached jobs list so it
      // appears as "running" immediately — no polling delay needed.
      const runningJob: Job = {
        id: data.job_id,
        module_id: data.module_instance_id,
        status: 'running',
        started_at: new Date().toISOString(),
        signals_found: 0,
        module_type: moduleType,
      }
      queryClient.setQueriesData<PaginatedResponse<Job>>(
        { queryKey: ['jobs'], exact: false },
        (old) => {
          if (!old) return old
          // Avoid duplicates if the query already refetched
          if (old.items.some((j) => j.id === data.job_id)) return old
          return { ...old, items: [runningJob, ...old.items], total: old.total + 1 }
        }
      )

      // Invalidate after a short delay so the live DB state replaces the
      // optimistic entry once the background task has committed.
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['jobs'] }), 3000)

      toast.success('Module job started')
    },
    onError: (err: Error) => {
      toast.error(`Failed to run module: ${err.message}`)
    },
  })
}

export function useDeleteModule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (instanceId: string) => api.deleteModule(instanceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: moduleKeys.all })
      toast.success('Module removed')
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete module: ${err.message}`)
    },
  })
}

export function usePauseModule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (instanceId: string) => api.pauseModule(instanceId),
    onSuccess: (data: ModuleInstance) => {
      queryClient.invalidateQueries({ queryKey: moduleKeys.all })
      toast.success(`Module ${data.enabled ? 'resumed' : 'paused'}`)
    },
    onError: (err: Error) => {
      toast.error(`Failed to update module: ${err.message}`)
    },
  })
}

export function useResumeModule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (instanceId: string) => api.resumeModule(instanceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: moduleKeys.all })
      toast.success('Module resumed')
    },
    onError: (err: Error) => {
      toast.error(`Failed to resume module: ${err.message}`)
    },
  })
}
