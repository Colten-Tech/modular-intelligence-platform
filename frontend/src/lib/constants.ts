export const CLUSTER_COLORS: Record<string, string> = {
  'b2b-intelligence': 'var(--accent-b2b)',
  'consumer-data': 'var(--accent-consumer)',
  health: 'var(--accent-health)',
  sports: 'var(--accent-sports)',
}

export const CLUSTER_LABELS: Record<string, string> = {
  'b2b-intelligence': 'B2B Intel',
  'consumer-data': 'Consumer',
  health: 'Health',
  sports: 'Sports',
}

export const MODULE_LIST = [
  { id: 'startup-signal-tracker', name: 'Startup Signal Tracker', cluster: 'b2b-intelligence' },
  { id: 'vc-portfolio-tracker', name: 'VC Portfolio Tracker', cluster: 'b2b-intelligence' },
  { id: 'founder-movement-tracker', name: 'Founder Movement Tracker', cluster: 'b2b-intelligence' },
  { id: 'grant-funding-tracker', name: 'Grant & Funding Tracker', cluster: 'b2b-intelligence' },
  { id: 'price-drop-intelligence', name: 'Price Drop Intelligence', cluster: 'b2b-intelligence' },
  { id: 'clinical-trial-tracker', name: 'Clinical Trial Tracker', cluster: 'b2b-intelligence' },
  { id: 'real-estate-signal', name: 'Real Estate Signal Tool', cluster: 'b2b-intelligence' },
  { id: 'salary-intelligence', name: 'Salary Intelligence', cluster: 'consumer-data' },
  { id: 'researcher-second-brain', name: 'Researcher Second Brain', cluster: 'consumer-data' },
  { id: 'voice-biomarker-tracker', name: 'Voice Biomarker Tracker', cluster: 'health' },
  { id: 'stress-recovery-scorer', name: 'Stress & Recovery Scorer', cluster: 'health' },
  { id: 'nap-optimizer', name: 'Nap Optimizer', cluster: 'health' },
  { id: 'chronotype-planner', name: 'Chronotype Planner', cluster: 'health' },
  { id: 'fencing-analytics', name: 'Fencing Analytics', cluster: 'sports' },
] as const

export const PLAN_LIMITS = {
  free: { modules: 2, schedule: 'daily' },
  pro: { modules: 14, schedule: 'hourly' },
  team: { modules: 14, schedule: 'hourly' },
}

export const PLAN_FEATURES = {
  free: [
    'Up to 2 active modules',
    'Daily job scheduling',
    'Signal feed (last 7 days)',
    'Email digest (weekly)',
  ],
  pro: [
    'All 14 modules',
    'Hourly job scheduling',
    'Signal feed (unlimited)',
    'Email digest (daily)',
    'Webhook delivery',
    'Signal export',
  ],
  team: [
    'Everything in Pro',
    'API access',
    'Team members (up to 5)',
    'Priority support',
    'Custom schedules',
    'White-label reports',
  ],
}

export const PLAN_PRICES = {
  free: { monthly: 0, label: 'Free' },
  pro: { monthly: 29, label: 'Pro' },
  team: { monthly: 99, label: 'Team' },
}
