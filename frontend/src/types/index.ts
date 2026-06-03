export type Plan = 'free' | 'pro' | 'team'
export type Cluster = 'b2b-intelligence' | 'consumer-data' | 'health' | 'sports'
export type ModuleStatus = 'active' | 'paused' | 'error' | 'warning' | 'running'
export type JobStatus = 'running' | 'success' | 'failed' | 'queued'
export type AlertChannel = 'email' | 'webhook'

export interface User {
  id: string
  email: string
  plan: Plan
  is_admin: boolean
  created_at: string
}

export interface AdminUserRow {
  id: string
  email: string
  plan: Plan
  is_admin: boolean
  created_at: string
  module_count: number
  signal_count: number
}

export interface AdminOverview {
  total_users: number
  total_signals: number
  total_jobs: number
  active_modules: number
  jobs_last_24h: number
  signals_last_24h: number
  users_by_plan: Record<string, number>
}

export interface ModuleDefinition {
  module_id: string
  display_name: string
  description: string
  cluster: Cluster
  default_schedule: string
  required_plan: Plan
  config_schema: JSONSchema
  ui_component_hint: string
}

export interface ModuleInstance {
  id: string
  user_id: string
  module_type: string
  config: Record<string, unknown>
  enabled: boolean
  created_at: string
  // Joined
  definition?: ModuleDefinition
  status?: ModuleStatus
  last_run?: string
  next_run?: string
  signals_today?: number
}

export interface Signal {
  id: string
  module_id: string
  user_id: string
  title: string
  body: string
  score: number // 0-1
  source_url?: string
  metadata: Record<string, unknown>
  created_at: string
  read: boolean
  archived: boolean
  // Joined
  module_type?: string
  cluster?: Cluster
}

export interface Job {
  id: string
  module_id: string
  status: JobStatus
  started_at: string
  finished_at?: string
  error?: string
  signals_found: number
  // Joined
  module_type?: string
}

export interface JobLog {
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'
  message: string
}

export interface UserStats {
  signals_today: number
  signals_this_week: number
  active_modules: number
  jobs_today: number
  success_rate: number
  modules_limit: number
}

export interface JSONSchema {
  type: string
  properties?: Record<string, JSONSchemaProperty>
  required?: string[]
}

export interface JSONSchemaProperty {
  type: string
  title?: string
  description?: string
  default?: unknown
  enum?: unknown[]
  items?: JSONSchemaProperty
  minimum?: number
  maximum?: number
  format?: string
  /** Explicit wizard section hint set in the backend schema.
   *  'source' → Data Sources step, 'filter' → Filters step (default). */
  section?: 'source' | 'filter'
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
  has_more: boolean
}

export interface SignalFilters {
  cluster?: Cluster
  read?: boolean
  archived?: boolean
  search?: string
  page?: number
  per_page?: number
}

export interface JobFilters {
  module_id?: string
  status?: JobStatus
  date_from?: string
  date_to?: string
  page?: number
  per_page?: number
}
