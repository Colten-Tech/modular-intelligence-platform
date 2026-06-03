'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '@/lib/api'
import type { JobFilters } from '@/types'
import { toast } from 'sonner'

export const jobKeys = {
  all: ['jobs'] as const,
  list: (params: JobFilters) => ['jobs', 'list', params] as const,
  logs: (jobId: string) => ['jobs', jobId, 'logs'] as const,
}

export function useJobs(params: JobFilters = {}) {
  return useQuery({
    queryKey: jobKeys.list(params),
    queryFn: () => api.getJobs(params),
    refetchInterval: 5_000,  // poll every 5s so new jobs surface quickly
    staleTime: 3_000,
  })
}

export function useJobLogs(jobId: string | null) {
  return useQuery({
    queryKey: jobKeys.logs(jobId ?? ''),
    queryFn: () => api.getJobLogs(jobId!),
    enabled: !!jobId,
    staleTime: 30_000,
  })
}

export function useRetryJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (jobId: string) => api.retryJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all })
      toast.success('Job retry queued')
    },
    onError: (err: Error) => {
      toast.error(`Failed to retry job: ${err.message}`)
    },
  })
}
