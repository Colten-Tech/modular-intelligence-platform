'use client'

import { type ReactNode, useState, useMemo } from 'react'
import { cn, copyToClipboard } from '@/lib/utils'
import {
  Code2,
  BookOpen,
  Table2,
  Copy,
  Check,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Terminal,
  Zap,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'build' | 'guide' | 'reference'
type CodeTab = 'python' | 'typescript' | 'sql' | 'commands'

interface ConfigField {
  id: string
  name: string
  type: 'string' | 'number' | 'boolean' | 'array'
  title: string
  description: string
  required: boolean
  defaultValue: string
  enumValues: string
}

interface ModuleForm {
  displayName: string
  description: string
  cluster: 'b2b-intelligence' | 'consumer-data' | 'health' | 'sports'
  requiredPlan: 'free' | 'pro' | 'team'
  schedulePreset: 'hourly' | 'daily' | 'weekly' | 'custom'
  customCron: string
  uiHint: 'signal-feed' | 'custom'
  needsTable: boolean
  fields: ConfigField[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toKebab(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function toSnake(s: string) {
  return toKebab(s).replace(/-/g, '_')
}

function toPascal(s: string) {
  return s
    .split(/[\s-_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}

function scheduleFromPreset(preset: string, custom: string): string {
  if (preset === 'custom') return custom || '0 * * * *'
  if (preset === 'hourly') return '0 * * * *'
  if (preset === 'daily') return '0 9 * * *'
  return '0 9 * * 1'
}

function uid() {
  return Math.random().toString(36).slice(2, 8)
}

// ─── Code generators ──────────────────────────────────────────────────────────

function generatePython(form: ModuleForm): string {
  const moduleId = toKebab(form.displayName)
  const className = toPascal(form.displayName) + 'Module'
  const cron = scheduleFromPreset(form.schedulePreset, form.customCron)

  const required = form.fields.filter((f) => f.required).map((f) => `"${f.name}"`)

  const propsLines = form.fields
    .map((f) => {
      const parts: string[] = [`"type": "${f.type === 'array' ? 'array' : f.type}"`]
      if (f.title) parts.push(`"title": "${f.title}"`)
      if (f.description) parts.push(`"description": "${f.description}"`)
      if (f.type === 'array') {
        parts.push('"items": {"type": "string"}')
      }
      if (f.enumValues) {
        const vals = f.enumValues
          .split(',')
          .map((v) => `"${v.trim()}"`)
          .join(', ')
        parts.push(`"enum": [${vals}]`)
      }
      if (f.defaultValue !== '') {
        const dv =
          f.type === 'number'
            ? f.defaultValue
            : f.type === 'boolean'
              ? f.defaultValue
              : `"${f.defaultValue}"`
        parts.push(`"default": ${dv}`)
      }
      return `            "${f.name}": {\n                ${parts.join(',\n                ')}\n            }`
    })
    .join(',\n')

  const configSchemaBody =
    propsLines
      ? `{\n        "type": "object",\n        "properties": {\n${propsLines}\n        }${required.length ? `,\n        "required": [${required.join(', ')}]` : ''}\n    }`
      : `{"type": "object", "properties": {}}`

  const firstRequired = form.fields.find((f) => f.required)
  const validateBody = firstRequired
    ? `        return bool(config.get("${firstRequired.name}"))`
    : `        return True`

  const demoTitle = form.displayName
    ? `f"New signal from {moduleId} — demo"`
    : '"Demo Signal"'

  return `# backend/app/modules/${toSnake(form.displayName)}.py
from typing import Any, Dict, List
from app.core.base_module import BaseModule, Signal


class ${className}(BaseModule):
    module_id        = "${moduleId}"
    display_name     = "${form.displayName || 'My Module'}"
    description      = "${form.description || 'Describe what this module does.'}"
    cluster          = "${form.cluster}"
    required_plan    = "${form.requiredPlan}"
    default_schedule = "${cron}"

    config_schema = ${configSchemaBody}

    def validate_config(self, config: Dict[str, Any]) -> bool:
${validateBody}

    def get_ui_component_hint(self) -> str:
        return "${form.uiHint === 'custom' ? moduleId : 'signal-feed'}"

    async def run(self, config: Dict[str, Any], db_session) -> List[Signal]:
        results: List[Signal] = []

        try:
            # ── your scraping / API logic here ──────────────────────────────
            # from app.core.scraper import ScraperEngine
            # from app.utils.llm import LLMExtractor
            #
            # scraper = ScraperEngine()
            # raw_html = await scraper.fetch("https://example.com/data")
            #
            # llm = LLMExtractor()
            # items = await llm.extract_structured(raw_html, schema={
            #     "type": "array",
            #     "items": {"type": "object", "properties": {
            #         "title": {"type": "string"},
            #         "score": {"type": "number"},
            #     }}
            # })
            #
            # for item in items:
            #     results.append(Signal(
            #         title=item["title"],
            #         body=item.get("body", ""),
            #         score=item.get("score", 0.7),
            #         source_url=item.get("url"),
            #         metadata=item,
            #     ))
            pass

        except Exception as exc:
            # Always fall back to demo — never let the job runner crash
            results = self._demo_signals(config)

        return results

    # ── demo fallback ──────────────────────────────────────────────────────────
    def _demo_signals(self, config: Dict[str, Any]) -> List[Signal]:
        return [
            Signal(
                title=${demoTitle},
                body="This is a demo signal generated while your real data source "
                     "is not yet wired up. Replace _demo_signals() once live.",
                score=0.78,
                source_url=None,
                metadata={"demo": True, "config": config},
            )
        ]
`
}

function generateTypeScript(form: ModuleForm): string {
  const moduleId = toKebab(form.displayName)
  if (!moduleId) return '// Fill in the module name above to generate this entry.'
  return `// Add this entry to MODULE_LIST in frontend/src/lib/constants.ts

  {
    id: '${moduleId}',
    name: '${form.displayName}',
    cluster: '${form.cluster}',
  },`
}

function generateSQL(form: ModuleForm): string {
  const moduleId = toKebab(form.displayName)
  const tableName = toSnake(form.displayName) + '_entries'
  if (!form.needsTable || !moduleId) {
    return `-- No dedicated table needed.
-- All signals are stored in the signals table with metadata JSONB.
-- Only add a migration if your module requires structured relational queries.`
  }
  return `-- supabase/migrations/002_${toSnake(form.displayName)}.sql

CREATE TABLE ${tableName} (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- add your module-specific columns here
  raw_data    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_only" ON ${tableName}
  USING (user_id = auth.uid());

CREATE INDEX idx_${toSnake(form.displayName)}_user ON ${tableName} (user_id);
CREATE INDEX idx_${toSnake(form.displayName)}_module ON ${tableName} (module_id);
`
}

function generateCommands(form: ModuleForm): string {
  const moduleId = toKebab(form.displayName)
  const snake = toSnake(form.displayName)
  if (!moduleId) return '# Fill in the module name above.'
  return `# 1. Stage your new files
git add backend/app/modules/${snake}.py
git add frontend/src/lib/constants.ts${form.needsTable ? `\ngit add supabase/migrations/002_${snake}.sql` : ''}

# 2. Commit
git commit -m "feat: add ${moduleId} module"

# 3. Push — CI/CD will redeploy automatically
git push origin main

# ── OR restart locally ──────────────────────────────────────────
docker compose restart api worker beat

# 4. Verify auto-discovery picked it up
curl -s http://localhost:8000/api/modules/catalog | \\
  python3 -m json.tool | grep '"module_id"'
# → should include "${moduleId}"
`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  async function handle() {
    await copyToClipboard(code)
    setCopied(true)
    toast.success(label ? `${label} copied` : 'Copied')
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handle}
      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-text-muted hover:text-text-primary bg-bg-elevated border border-border rounded transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function CodeBlock({ code, lang = 'python' }: { code: string; lang?: string }) {
  return (
    <div className="relative group">
      <pre className="text-[11px] leading-relaxed font-mono text-text-secondary bg-bg-base border border-border rounded p-4 overflow-x-auto whitespace-pre">
        {code}
      </pre>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton code={code} />
      </div>
    </div>
  )
}

function GuideStep({
  n,
  title,
  badge,
  badgeColor,
  children,
}: {
  n: number
  title: string
  badge?: string
  badgeColor?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(n === 1)
  return (
    <div className="border border-border rounded overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-bg-elevated hover:bg-bg-hover transition-colors text-left"
      >
        <span className="w-6 h-6 rounded-full bg-bg-base border border-border flex items-center justify-center text-[10px] font-mono text-text-muted shrink-0">
          {n}
        </span>
        <span className="flex-1 text-xs font-medium text-text-primary">{title}</span>
        {badge && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider shrink-0"
            style={{ color: badgeColor, borderColor: badgeColor + '40', background: badgeColor + '12' }}
          >
            {badge}
          </span>
        )}
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
        )}
      </button>
      {open && <div className="px-4 pb-4 pt-3 bg-bg-surface space-y-3">{children}</div>}
    </div>
  )
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-block text-[10px] px-2 py-0.5 rounded border font-mono"
      style={{ color, borderColor: color + '40', background: color + '12' }}
    >
      {label}
    </span>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const DEFAULT_FORM: ModuleForm = {
  displayName: '',
  description: '',
  cluster: 'b2b-intelligence',
  requiredPlan: 'pro',
  schedulePreset: 'daily',
  customCron: '0 9 * * *',
  uiHint: 'signal-feed',
  needsTable: false,
  fields: [],
}

export default function StudioPage() {
  const [tab, setTab] = useState<Tab>('build')
  const [form, setForm] = useState<ModuleForm>(DEFAULT_FORM)
  const [codeTab, setCodeTab] = useState<CodeTab>('python')

  const moduleId = toKebab(form.displayName)

  const generatedCode = useMemo(() => ({
    python: generatePython(form),
    typescript: generateTypeScript(form),
    sql: generateSQL(form),
    commands: generateCommands(form),
  }), [form])

  function patchForm(patch: Partial<ModuleForm>) {
    setForm((f) => ({ ...f, ...patch }))
  }

  function addField() {
    patchForm({
      fields: [
        ...form.fields,
        { id: uid(), name: '', type: 'string', title: '', description: '', required: false, defaultValue: '', enumValues: '' },
      ],
    })
  }

  function patchField(id: string, patch: Partial<ConfigField>) {
    patchForm({ fields: form.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  }

  function removeField(id: string) {
    patchForm({ fields: form.fields.filter((f) => f.id !== id) })
  }

  const tabClass = (t: Tab) =>
    cn(
      'px-3 py-1.5 text-xs rounded transition-all',
      tab === t
        ? 'bg-bg-hover text-text-primary'
        : 'text-text-muted hover:text-text-secondary'
    )

  const codeTabClass = (t: CodeTab) =>
    cn(
      'px-3 py-1.5 text-[11px] font-mono border-b-2 transition-all',
      codeTab === t
        ? 'border-accent-b2b text-accent-b2b'
        : 'border-transparent text-text-muted hover:text-text-secondary'
    )

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-5 pt-5 pb-3 border-b border-border flex items-center gap-3">
        <div className="w-7 h-7 rounded bg-accent-b2b/10 border border-accent-b2b/20 flex items-center justify-center">
          <Code2 className="w-3.5 h-3.5 text-accent-b2b" />
        </div>
        <div>
          <h1 className="text-sm font-medium text-text-primary">Module Studio</h1>
          <p className="text-[10px] text-text-muted mt-0.5">
            Build · document · generate code — without leaving the dashboard
          </p>
        </div>
        <div className="ml-auto flex gap-1 bg-bg-elevated rounded p-0.5">
          <button className={tabClass('build')} onClick={() => setTab('build')}>
            <span className="flex items-center gap-1.5"><Code2 className="w-3 h-3" />Build</span>
          </button>
          <button className={tabClass('guide')} onClick={() => setTab('guide')}>
            <span className="flex items-center gap-1.5"><BookOpen className="w-3 h-3" />Guide</span>
          </button>
          <button className={tabClass('reference')} onClick={() => setTab('reference')}>
            <span className="flex items-center gap-1.5"><Table2 className="w-3 h-3" />Reference</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">

        {/* ── BUILD TAB ── */}
        {tab === 'build' && (
          <div className="flex h-full">
            {/* Left: Form */}
            <div className="w-[360px] shrink-0 overflow-y-auto border-r border-border bg-bg-surface p-5 space-y-5">
              <section className="space-y-3">
                <p className="text-[10px] text-text-muted uppercase tracking-widest">Basic Info</p>

                <div className="space-y-1">
                  <label className="text-[11px] text-text-secondary">Display Name</label>
                  <input
                    value={form.displayName}
                    onChange={(e) => patchForm({ displayName: e.target.value })}
                    placeholder="Patent Tracker"
                    className="w-full px-3 py-2 text-xs"
                  />
                  {moduleId && (
                    <p className="text-[10px] text-text-muted font-mono">
                      ID: <span className="text-accent-b2b">{moduleId}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-text-secondary">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => patchForm({ description: e.target.value })}
                    placeholder="What does this module do?"
                    rows={2}
                    className="w-full px-3 py-2 text-xs resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-text-secondary">Cluster</label>
                    <select
                      value={form.cluster}
                      onChange={(e) => patchForm({ cluster: e.target.value as ModuleForm['cluster'] })}
                      className="w-full px-3 py-2 text-xs"
                    >
                      <option value="b2b-intelligence">B2B Intelligence</option>
                      <option value="consumer-data">Consumer Data</option>
                      <option value="health">Health & Perf</option>
                      <option value="sports">Sports</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-text-secondary">Plan</label>
                    <select
                      value={form.requiredPlan}
                      onChange={(e) => patchForm({ requiredPlan: e.target.value as ModuleForm['requiredPlan'] })}
                      className="w-full px-3 py-2 text-xs"
                    >
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="team">Team</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-text-secondary">Schedule</label>
                  <select
                    value={form.schedulePreset}
                    onChange={(e) => patchForm({ schedulePreset: e.target.value as ModuleForm['schedulePreset'] })}
                    className="w-full px-3 py-2 text-xs"
                  >
                    <option value="hourly">Hourly (0 * * * *)</option>
                    <option value="daily">Daily 9am (0 9 * * *)</option>
                    <option value="weekly">Weekly Mon 9am (0 9 * * 1)</option>
                    <option value="custom">Custom cron…</option>
                  </select>
                  {form.schedulePreset === 'custom' && (
                    <input
                      value={form.customCron}
                      onChange={(e) => patchForm({ customCron: e.target.value })}
                      placeholder="0 9 * * 1"
                      className="w-full px-3 py-2 text-xs font-mono mt-1"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-text-secondary">Dashboard View</label>
                  <select
                    value={form.uiHint}
                    onChange={(e) => patchForm({ uiHint: e.target.value as ModuleForm['uiHint'] })}
                    className="w-full px-3 py-2 text-xs"
                  >
                    <option value="signal-feed">Default signal feed</option>
                    <option value="custom">Custom React view</option>
                  </select>
                  {form.uiHint === 'custom' && (
                    <p className="text-[10px] text-warning flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Wire your view in modules/[moduleId]/page.tsx
                    </p>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-text-muted uppercase tracking-widest">Config Fields</p>
                  <button
                    onClick={addField}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-accent-b2b border border-accent-b2b/30 rounded hover:bg-accent-b2b/10 transition-colors"
                  >
                    <Plus className="w-3 h-3" />Add
                  </button>
                </div>

                {form.fields.length === 0 && (
                  <p className="text-[11px] text-text-muted italic">
                    No config fields yet. Click Add to define what users configure.
                  </p>
                )}

                {form.fields.map((field, i) => (
                  <div key={field.id} className="bg-bg-elevated border border-border rounded p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-text-muted font-mono">Field {i + 1}</span>
                      <button onClick={() => removeField(field.id)} className="text-text-muted hover:text-error transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={field.name}
                        onChange={(e) => patchField(field.id, { name: e.target.value })}
                        placeholder="field_name"
                        className="px-2 py-1.5 text-xs font-mono"
                      />
                      <select
                        value={field.type}
                        onChange={(e) => patchField(field.id, { type: e.target.value as ConfigField['type'] })}
                        className="px-2 py-1.5 text-xs"
                      >
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="array">string[ ]</option>
                      </select>
                    </div>
                    <input
                      value={field.title}
                      onChange={(e) => patchField(field.id, { title: e.target.value })}
                      placeholder="Display title"
                      className="w-full px-2 py-1.5 text-xs"
                    />
                    <input
                      value={field.description}
                      onChange={(e) => patchField(field.id, { description: e.target.value })}
                      placeholder="Hint shown to users"
                      className="w-full px-2 py-1.5 text-xs"
                    />
                    {field.type === 'string' && (
                      <input
                        value={field.enumValues}
                        onChange={(e) => patchField(field.id, { enumValues: e.target.value })}
                        placeholder="Enum values: option1, option2 (leave blank for free text)"
                        className="w-full px-2 py-1.5 text-xs"
                      />
                    )}
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-[11px] text-text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => patchField(field.id, { required: e.target.checked })}
                          className="w-3 h-3"
                        />
                        Required
                      </label>
                      {field.type !== 'boolean' && (
                        <input
                          value={field.defaultValue}
                          onChange={(e) => patchField(field.id, { defaultValue: e.target.value })}
                          placeholder="Default value"
                          className="px-2 py-1 text-xs w-28"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </section>

              <section className="space-y-2">
                <p className="text-[10px] text-text-muted uppercase tracking-widest">Options</p>
                <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.needsTable}
                    onChange={(e) => patchForm({ needsTable: e.target.checked })}
                    className="w-3 h-3"
                  />
                  Generate dedicated SQL table
                </label>
              </section>
            </div>

            {/* Right: Code Output */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="shrink-0 flex items-center border-b border-border px-4 bg-bg-surface">
                {(['python', 'typescript', 'sql', 'commands'] as CodeTab[]).map((t) => (
                  <button key={t} className={codeTabClass(t)} onClick={() => setCodeTab(t)}>
                    {t === 'python' && 'module.py'}
                    {t === 'typescript' && 'constants.ts'}
                    {t === 'sql' && 'migration.sql'}
                    {t === 'commands' && 'deploy'}
                  </button>
                ))}
                <div className="ml-auto py-2">
                  <CopyButton
                    code={generatedCode[codeTab]}
                    label={codeTab === 'python' ? 'Python' : codeTab === 'typescript' ? 'TypeScript' : codeTab === 'sql' ? 'SQL' : 'Commands'}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4 bg-bg-base">
                {!form.displayName && (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                    <div className="w-10 h-10 rounded-full bg-bg-elevated border border-border flex items-center justify-center">
                      <Code2 className="w-5 h-5 text-text-muted" />
                    </div>
                    <p className="text-sm text-text-muted max-w-xs">
                      Enter a module name on the left to generate all your boilerplate files.
                    </p>
                  </div>
                )}
                {form.displayName && (
                  <pre className="text-[11px] leading-relaxed font-mono text-text-secondary whitespace-pre">
                    {generatedCode[codeTab]}
                  </pre>
                )}
              </div>

              {/* Footer hint */}
              {form.displayName && (
                <div className="shrink-0 px-4 py-2.5 border-t border-border bg-bg-surface flex items-center gap-2">
                  <Info className="w-3 h-3 text-text-muted shrink-0" />
                  <p className="text-[10px] text-text-muted">
                    File path:&nbsp;
                    <code className="font-mono text-accent-b2b">
                      backend/app/modules/{toSnake(form.displayName)}.py
                    </code>
                    &nbsp;— restart API to auto-discover.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── GUIDE TAB ── */}
        {tab === 'guide' && (
          <div className="overflow-y-auto h-full">
            <div className="max-w-2xl mx-auto px-6 py-6 space-y-3">
              <div className="mb-5">
                <h2 className="text-sm font-medium text-text-primary">Adding a New Module</h2>
                <p className="text-xs text-text-muted mt-1">
                  6 steps from idea to production. For a pure scrape→extract→signal module, only steps 1–3 are required.
                </p>
              </div>

              <GuideStep n={1} title="Create the backend module file" badge="required" badgeColor="#E8F04A">
                <p className="text-xs text-text-secondary">
                  Drop one Python file in <code className="font-mono text-accent-b2b">backend/app/modules/</code>.
                  The module registry discovers it automatically on restart — no manual registration needed.
                </p>
                <div className="bg-bg-elevated border border-border rounded p-3 text-[11px] font-mono text-text-muted space-y-1">
                  <p><span className="text-accent-b2b">class</span> MyModuleModule(BaseModule):</p>
                  <p className="pl-4"><span className="text-text-muted"># required class attributes</span></p>
                  <p className="pl-4">module_id = <span className="text-accent-consumer">"my-module"</span></p>
                  <p className="pl-4">display_name = <span className="text-accent-consumer">"My Module"</span></p>
                  <p className="pl-4">cluster = <span className="text-accent-consumer">"b2b-intelligence"</span></p>
                  <p className="pl-4">required_plan = <span className="text-accent-consumer">"pro"</span></p>
                  <p className="pl-4">default_schedule = <span className="text-accent-consumer">"0 9 * * *"</span></p>
                  <p className="pl-4">config_schema = {"{"}<span className="text-accent-consumer">...</span>{"}"}</p>
                  <br />
                  <p className="pl-4"><span className="text-accent-b2b">async def</span> run(self, config, db) → List[Signal]: ...</p>
                  <p className="pl-4"><span className="text-accent-b2b">def</span> validate_config(self, config) → bool: ...</p>
                </div>
                <div className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                  <p className="text-[11px] text-text-secondary">
                    <strong className="text-warning">Always add a demo fallback.</strong> If <code className="font-mono">run()</code> raises, the job runner marks the job as failed and stops alerting. Catch exceptions and return demo signals instead.
                  </p>
                </div>
              </GuideStep>

              <GuideStep n={2} title="Register it in frontend constants" badge="required" badgeColor="#E8F04A">
                <p className="text-xs text-text-secondary">
                  Add one entry to <code className="font-mono text-accent-b2b">frontend/src/lib/constants.ts → MODULE_LIST</code>.
                  This makes the module appear in the SetupWizard catalog and sidebar filter.
                </p>
                <CodeBlock lang="typescript" code={`// frontend/src/lib/constants.ts
export const MODULE_LIST = [
  // ... existing entries ...
  {
    id: 'my-module',
    name: 'My Module',
    cluster: 'b2b-intelligence',
  },
] as const`} />
              </GuideStep>

              <GuideStep n={3} title="Restart — auto-discovery fires" badge="required" badgeColor="#E8F04A">
                <p className="text-xs text-text-secondary">
                  The module registry scans <code className="font-mono text-accent-b2b">app/modules/</code> via <code className="font-mono">pkgutil.iter_modules</code> during API startup. After restart, the module is live everywhere — catalog, scheduler, signal feed, sidebar.
                </p>
                <CodeBlock code={`# Local restart
docker compose restart api worker beat

# Verify
curl http://localhost:8000/api/modules/catalog | python3 -m json.tool | grep my-module`} />
                <div className="flex items-start gap-2 p-3 bg-accent-consumer/5 border border-accent-consumer/20 rounded">
                  <Check className="w-3.5 h-3.5 text-accent-consumer shrink-0 mt-0.5" />
                  <p className="text-[11px] text-text-secondary">
                    What happens automatically: module appears in <strong>catalog</strong>, SetupWizard's browse step,
                    sidebar active list, and APScheduler schedules the cron job the moment a user enables it.
                  </p>
                </div>
              </GuideStep>

              <GuideStep n={4} title="Add a custom dashboard view (optional)" badge="optional" badgeColor="#4AF0C8">
                <p className="text-xs text-text-secondary">
                  The default <code className="font-mono text-accent-b2b">"signal-feed"</code> view works for 90% of modules.
                  Only build a custom view for modules with interactive UI (charts, forms, sliders).
                </p>
                <CodeBlock lang="tsx" code={`// 1. Set the hint in your Python class
def get_ui_component_hint(self) -> str:
    return "my-module"   # instead of "signal-feed"

// 2. Create the React component
// frontend/src/components/modules/views/MyModuleView.tsx
export function MyModuleView({ moduleId }: { moduleId: string }) {
  // your custom charts, tables, controls
}

// 3. Wire it into the module detail page
// frontend/src/app/(dashboard)/modules/[moduleId]/page.tsx
case "my-module":
  return <MyModuleView moduleId={moduleId} />`} />
              </GuideStep>

              <GuideStep n={5} title="Add a SQL migration (optional)" badge="optional" badgeColor="#4AF0C8">
                <p className="text-xs text-text-secondary">
                  Most modules store everything in <code className="font-mono text-accent-b2b">signals.metadata JSONB</code> — no migration needed.
                  Only add a table if you need structured relational queries (like Fencing bouts or Voice recordings).
                </p>
                <CodeBlock lang="sql" code={`-- supabase/migrations/002_my_module.sql
CREATE TABLE my_module_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id  UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_data   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE my_module_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON my_module_entries USING (user_id = auth.uid());`} />
              </GuideStep>

              <GuideStep n={6} title="Push to main — CI/CD redeploys" badge="prod" badgeColor="#A04AF0">
                <p className="text-xs text-text-secondary">
                  One push triggers the GitHub Actions workflow — backend redeploys to Koyeb, frontend to Vercel. No config changes needed.
                </p>
                <CodeBlock code={`git add backend/app/modules/my_module.py
git add frontend/src/lib/constants.ts
git commit -m "feat: add my-module"
git push origin main
# → CI/CD handles the rest`} />
              </GuideStep>

              <div className="mt-6 p-4 bg-bg-elevated border border-border rounded flex items-start gap-3">
                <Terminal className="w-4 h-4 text-accent-b2b shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-text-primary mb-1">TL;DR — the 3-line version</p>
                  <p className="text-[11px] text-text-secondary">
                    1. Create <code className="font-mono text-accent-b2b">backend/app/modules/my_module.py</code> (extend BaseModule, implement run())
                    &nbsp;&nbsp;
                    2. Add to <code className="font-mono text-accent-b2b">MODULE_LIST</code> in constants.ts
                    &nbsp;&nbsp;
                    3. Push → auto-discovered, scheduled, UI wired, done.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── REFERENCE TAB ── */}
        {tab === 'reference' && (
          <div className="overflow-y-auto h-full">
            <div className="max-w-3xl mx-auto px-6 py-6 grid grid-cols-2 gap-5">

              {/* Signal fields */}
              <div className="col-span-2">
                <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3">Signal Object</p>
                <div className="border border-border rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-bg-elevated border-b border-border">
                        <th className="text-left px-4 py-2.5 text-text-muted font-normal">Field</th>
                        <th className="text-left px-4 py-2.5 text-text-muted font-normal">Type</th>
                        <th className="text-left px-4 py-2.5 text-text-muted font-normal">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[
                        ['title', 'str', 'Required. Shown as the signal headline.'],
                        ['body', 'str', 'Required. Markdown supported. Shown in the card body.'],
                        ['score', 'float', 'Required. 0.0–1.0. Signals ≥ 0.75 trigger alerts automatically.'],
                        ['source_url', 'str | None', 'Optional. Renders as a "View source" link.'],
                        ['metadata', 'dict', 'Optional. Any JSON. Stored in signals.metadata JSONB.'],
                      ].map(([field, type, notes]) => (
                        <tr key={field} className="hover:bg-bg-elevated/50">
                          <td className="px-4 py-2.5 font-mono text-accent-b2b">{field}</td>
                          <td className="px-4 py-2.5 font-mono text-text-muted">{type}</td>
                          <td className="px-4 py-2.5 text-text-secondary">{notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Clusters */}
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3">Clusters</p>
                <div className="border border-border rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-bg-elevated border-b border-border">
                        <th className="text-left px-3 py-2 text-text-muted font-normal">ID</th>
                        <th className="text-left px-3 py-2 text-text-muted font-normal">Color</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[
                        ['b2b-intelligence', '#E8F04A', 'B2B Intel'],
                        ['consumer-data', '#4AF0C8', 'Consumer'],
                        ['health', '#F04A8A', 'Health'],
                        ['sports', '#A04AF0', 'Sports'],
                      ].map(([id, color, label]) => (
                        <tr key={id} className="hover:bg-bg-elevated/50">
                          <td className="px-3 py-2 font-mono text-text-secondary">{id}</td>
                          <td className="px-3 py-2">
                            <Pill label={label as string} color={color as string} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Config schema types */}
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3">Config Schema Types</p>
                <div className="border border-border rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-bg-elevated border-b border-border">
                        <th className="text-left px-3 py-2 text-text-muted font-normal">JSON type</th>
                        <th className="text-left px-3 py-2 text-text-muted font-normal">UI widget</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[
                        ['string', 'Text input'],
                        ['string + enum', 'Select dropdown'],
                        ['number', 'Number input'],
                        ['boolean', 'Toggle switch'],
                        ['array', 'Tag input (string[ ])'],
                        ['string + format: cron', 'Cron picker'],
                        ['string + format: uri', 'URL input'],
                        ['string + format: textarea', 'Multi-line area'],
                      ].map(([type, widget]) => (
                        <tr key={type} className="hover:bg-bg-elevated/50">
                          <td className="px-3 py-2 font-mono text-accent-b2b">{type}</td>
                          <td className="px-3 py-2 text-text-secondary">{widget}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Score thresholds */}
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3">Score Thresholds</p>
                <div className="border border-border rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-bg-elevated border-b border-border">
                        <th className="text-left px-3 py-2 text-text-muted font-normal">Range</th>
                        <th className="text-left px-3 py-2 text-text-muted font-normal">Behavior</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[
                        ['0.0 – 0.49', '#888', 'Stored, low-relevance'],
                        ['0.5 – 0.74', '#aaa', 'Normal feed signal'],
                        ['0.75 – 0.89', '#E8F04A', 'Auto-alert triggered'],
                        ['0.90 – 1.0', '#4AF0C8', 'High-priority alert'],
                      ].map(([range, color, behavior]) => (
                        <tr key={range} className="hover:bg-bg-elevated/50">
                          <td className="px-3 py-2 font-mono" style={{ color: color as string }}>{range}</td>
                          <td className="px-3 py-2 text-text-secondary">{behavior}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Plan IDs */}
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3">Plan IDs & Limits</p>
                <div className="border border-border rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-bg-elevated border-b border-border">
                        <th className="text-left px-3 py-2 text-text-muted font-normal">Plan</th>
                        <th className="text-left px-3 py-2 text-text-muted font-normal">Max modules</th>
                        <th className="text-left px-3 py-2 text-text-muted font-normal">Schedule</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[
                        ['free', '2', 'daily'],
                        ['pro', '14', 'hourly'],
                        ['team', '14', 'custom'],
                      ].map(([plan, mods, sched]) => (
                        <tr key={plan} className="hover:bg-bg-elevated/50">
                          <td className="px-3 py-2 font-mono text-accent-b2b">{plan}</td>
                          <td className="px-3 py-2 text-text-secondary">{mods}</td>
                          <td className="px-3 py-2 text-text-secondary">{sched}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* File structure */}
              <div className="col-span-2">
                <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3">Files You Touch Per Module</p>
                <div className="bg-bg-elevated border border-border rounded p-4 font-mono text-[11px] space-y-1.5">
                  {[
                    { path: 'backend/app/modules/my_module.py', badge: 'required', color: '#E8F04A' },
                    { path: 'frontend/src/lib/constants.ts', badge: 'required', color: '#E8F04A' },
                    { path: 'frontend/src/components/modules/views/MyModuleView.tsx', badge: 'custom UI only', color: '#4AF0C8' },
                    { path: 'frontend/src/app/(dashboard)/modules/[moduleId]/page.tsx', badge: 'custom UI only', color: '#4AF0C8' },
                    { path: 'supabase/migrations/002_my_module.sql', badge: 'custom table only', color: '#4AF0C8' },
                    { path: 'backend/app/models/database.py', badge: 'custom table only', color: '#4AF0C8' },
                    { path: 'backend/app/models/schemas.py', badge: 'custom table only', color: '#4AF0C8' },
                  ].map(({ path, badge, color }) => (
                    <div key={path} className="flex items-center gap-3">
                      <span className="text-text-secondary">{path}</span>
                      <Pill label={badge} color={color} />
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  )
}
