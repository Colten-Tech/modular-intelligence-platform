'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '@/lib/api'
import type { SignalFilters } from '@/types'
import { toast } from 'sonner'

export const signalKeys = {
  all: ['signals'] as const,
  list: (params: SignalFilters) => ['signals', 'list', params] as const,
  detail: (id: string) => ['signals', id] as const,
  module: (moduleId: string, params: SignalFilters) =>
    ['signals', 'module', moduleId, params] as const,
}

export function useSignals(params: SignalFilters = {}) {
  return useQuery({
    queryKey: signalKeys.list(params),
    queryFn: () => api.getSignals(params),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

export function useModuleSignals(moduleId: string | null, params: SignalFilters = {}) {
  return useQuery({
    queryKey: signalKeys.module(moduleId ?? '', params),
    queryFn: () => api.getModuleSignals(moduleId!, params),
    enabled: !!moduleId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

export function useSignal(id: string | null) {
  return useQuery({
    queryKey: signalKeys.detail(id ?? ''),
    queryFn: () => api.getSignal(id!),
    enabled: !!id,
    staleTime: 60_000,
  })
}

export function useMarkRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.markRead(id),
    onMutate: async (id) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: signalKeys.all })
      const previousData = queryClient.getQueriesData({ queryKey: signalKeys.all })

      queryClient.setQueriesData({ queryKey: signalKeys.all }, (old: unknown) => {
        if (!old || typeof old !== 'object') return old
        const data = old as { data?: Array<{ id: string; read: boolean }> }
        if (data.data) {
          return {
            ...data,
            data: data.data.map((s) => (s.id === id ? { ...s, read: true } : s)),
          }
        }
        return old
      })

      return { previousData }
    },
    onError: (_err, _id, context) => {
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: signalKeys.all })
    },
  })
}

export function useArchiveSignal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.archiveSignal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: signalKeys.all })
      toast.success('Signal archived')
    },
    onError: (err: Error) => {
      toast.error(`Failed to archive: ${err.message}`)
    },
  })
}

export function useUserStats() {
  return useQuery({
    queryKey: ['user-stats'],
    queryFn: api.getUserStats,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}
