'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '@/lib/api'
import type { ModuleDefinition, ModuleInstance } from '@/types'
import { toast } from 'sonner'

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
    mutationFn: (instanceId: string) => api.runModule(instanceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: moduleKeys.all })
      toast.success('Module job started')

      // The backend returns 202 *before* the background task creates the job
      // row. Delay the first invalidation so the DB write has time to land,
      // then poll again a few seconds later to catch any stragglers.
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['jobs'] }), 1500)
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['jobs'] }), 5000)
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
