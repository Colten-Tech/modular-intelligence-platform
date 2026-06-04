import { getSupabaseBrowserClient } from './supabase'
import type {
  ModuleDefinition,
  ModuleInstance,
  Signal,
  Job,
  JobLog,
  UserStats,
  PaginatedResponse,
  SignalFilters,
  JobFilters,
  AdminUserRow,
  AdminOverview,
} from '@/types'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    return { 'Content-Type': 'application/json' }
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    const errorBody = await res.text().catch(() => 'Unknown error')
    throw new Error(`API ${res.status}: ${errorBody}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function buildQuery(params: Record<string, unknown>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return q ? `?${q}` : ''
}

// Modules
// Backend returns a flat List[ModuleInfo] — each item contains both definition
// fields and optional instance fields. We split them into two arrays here.
type RawModuleInfo = ModuleDefinition & {
  enabled: boolean
  instance_id: string | null
  instance_config: Record<string, unknown> | null
}

export async function getModules(): Promise<{
  definitions: ModuleDefinition[]
  instances: ModuleInstance[]
}> {
  const raw = await request<RawModuleInfo[]>('/api/modules')

  const definitions: ModuleDefinition[] = raw.map(
    ({ enabled: _e, instance_id: _i, instance_config: _c, ...def }) => def
  )

  const instances: ModuleInstance[] = raw
    .filter((m) => m.instance_id != null)
    .map((m) => ({
      id: m.instance_id!,
      user_id: '',
      module_type: m.module_id,
      config: m.instance_config ?? {},
      enabled: m.enabled,
      created_at: '',
    }))

  return { definitions, instances }
}

export async function enableModule(
  moduleId: string,
  config: Record<string, unknown>
): Promise<ModuleInstance> {
  return request(`/api/modules/${moduleId}/enable`, {
    method: 'POST',
    body: JSON.stringify({ config }),
  })
}

export async function updateModuleConfig(
  instanceId: string,
  config: Record<string, unknown>
): Promise<ModuleInstance> {
  return request(`/api/modules/${instanceId}/config`, {
    method: 'PUT',
    body: JSON.stringify({ config }),
  })
}

export async function runModule(
  instanceId: string
): Promise<{ job_id: string; module_instance_id: string }> {
  return request(`/api/modules/${instanceId}/run`, { method: 'POST' })
}

export async function deleteModule(instanceId: string): Promise<void> {
  return request(`/api/modules/${instanceId}`, { method: 'DELETE' })
}

export async function pauseModule(instanceId: string): Promise<ModuleInstance> {
  return request(`/api/modules/${instanceId}/pause`, { method: 'POST' })
}

export async function resumeModule(instanceId: string): Promise<ModuleInstance> {
  return request(`/api/modules/${instanceId}/resume`, { method: 'POST' })
}

export async function getModuleSignals(
  instanceId: string,
  params: SignalFilters = {}
): Promise<PaginatedResponse<Signal>> {
  return request(`/api/modules/${instanceId}/signals${buildQuery(params as Record<string, unknown>)}`)
}

export async function getModuleStatus(instanceId: string): Promise<{
  module_id: string
  instance_id: string | null
  enabled: boolean
  last_run: string | null
  next_run: string | null
  total_jobs: number
  successful_jobs: number
  failed_jobs: number
  total_signals: number
}> {
  return request(`/api/modules/${instanceId}/status`)
}

// Signals
export async function getSignals(
  params: SignalFilters = {}
): Promise<PaginatedResponse<Signal>> {
  return request(`/api/signals${buildQuery(params as Record<string, unknown>)}`)
}

export async function getSignal(id: string): Promise<Signal> {
  return request(`/api/signals/${id}`)
}

export async function markRead(id: string): Promise<void> {
  return request(`/api/signals/${id}/read`, { method: 'POST' })
}

export async function archiveSignal(id: string): Promise<void> {
  return request(`/api/signals/${id}/archive`, { method: 'POST' })
}

// Jobs
export async function getJobs(params: JobFilters = {}): Promise<PaginatedResponse<Job>> {
  return request(`/api/jobs${buildQuery(params as Record<string, unknown>)}`)
}

export async function getJobLogs(jobId: string): Promise<JobLog[]> {
  return request(`/api/jobs/${jobId}/logs`)
}

export async function retryJob(jobId: string): Promise<void> {
  return request(`/api/jobs/${jobId}/retry`, { method: 'POST' })
}

// Stats
export async function getUserStats(): Promise<UserStats> {
  return request('/api/stats')
}

// Settings
export async function getUserSettings(): Promise<Record<string, unknown>> {
  return request('/api/settings')
}

export async function updateUserSettings(
  settings: Record<string, unknown>
): Promise<void> {
  return request('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  })
}

// Billing
export async function getBillingPortalUrl(): Promise<string> {
  const data = await request<{ portal_url: string }>('/api/billing/portal')
  return data.portal_url
}

export async function createCheckoutSession(plan: string): Promise<{ checkout_url: string; session_id: string }> {
  return request('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  })
}

// Admin
export async function getAdminOverview(): Promise<AdminOverview> {
  return request('/api/admin/overview')
}

export async function getAdminUsers(): Promise<AdminUserRow[]> {
  return request('/api/admin/users')
}

export async function adminUpdatePlan(userId: string, plan: string): Promise<AdminUserRow> {
  return request(`/api/admin/users/${userId}/plan`, {
    method: 'PATCH',
    body: JSON.stringify({ plan }),
  })
}

export async function adminToggleAdmin(userId: string, isAdmin: boolean): Promise<AdminUserRow> {
  return request(`/api/admin/users/${userId}/admin`, {
    method: 'PATCH',
    body: JSON.stringify({ is_admin: isAdmin }),
  })
}

export async function adminListModuleSources(): Promise<import('@/types').ModuleSourceInfo[]> {
  return request('/api/admin/module-sources')
}

export async function adminGetModuleSource(moduleId: string): Promise<import('@/types').ModuleSourceResponse> {
  return request(`/api/admin/module-sources/${moduleId}`)
}

export async function adminSaveModuleSource(moduleId: string, source: string): Promise<import('@/types').ModuleSourceResponse> {
  return request(`/api/admin/module-sources/${moduleId}`, {
    method: 'PUT',
    body: JSON.stringify({ source }),
  })
}
