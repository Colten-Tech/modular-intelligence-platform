'use client'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { JSONSchema, JSONSchemaProperty } from '@/types'
import { X, Plus, Loader2, Info } from 'lucide-react'

interface ConfigFormRendererProps {
  schema: JSONSchema
  defaultValues?: Record<string, unknown>
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>
  loading?: boolean
  submitLabel?: string
}

// Build a Zod schema from JSON schema
function buildZodSchema(schema: JSONSchema): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {}

  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const isRequired = schema.required?.includes(key) ?? false
    let field: z.ZodTypeAny

    if (prop.type === 'string') {
      let s: z.ZodTypeAny = z.string()
      if (prop.format === 'url') s = z.string().url('Must be a valid URL').or(z.literal(''))
      field = isRequired ? s : s.optional()
    } else if (prop.type === 'number') {
      let n = z.number()
      if (prop.minimum !== undefined) n = n.min(prop.minimum)
      if (prop.maximum !== undefined) n = n.max(prop.maximum)
      field = isRequired ? n : n.optional()
    } else if (prop.type === 'boolean') {
      field = z.boolean().optional()
    } else if (prop.type === 'array') {
      field = z.array(z.string()).optional()
    } else {
      field = z.unknown().optional()
    }

    shape[key] = field
  }

  return z.object(shape)
}

function humanReadableCron(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) return cron

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  if (minute === '0' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const h = parseInt(hour, 10)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `Every day at ${h12}:00 ${ampm}`
  }
  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const h = parseInt(hour, 10)
    const m = parseInt(minute, 10)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `Every day at ${h12}:${m.toString().padStart(2, '0')} ${ampm}`
  }
  if (minute === '0' && hour === '*/1' ) return 'Every hour'
  if (cron === '0 * * * *') return 'Every hour'
  if (cron === '0 0 * * *') return 'Every day at midnight'
  if (cron === '0 9 * * 1-5') return 'Weekdays at 9:00 AM'
  return cron
}

interface FieldProps {
  propKey: string
  prop: JSONSchemaProperty
  control: ReturnType<typeof useForm>['control']
  errors: Record<string, { message?: string }>
}

function FormField({ propKey, prop, control, errors }: FieldProps) {
  const label = prop.title ?? propKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const error = errors[propKey]?.message

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="text-xs text-text-secondary">{label}</label>
        {prop.description && (
          <span title={prop.description}>
            <Info className="w-3 h-3 text-text-muted cursor-help" />
          </span>
        )}
      </div>

      <Controller
        name={propKey}
        control={control}
        render={({ field }) => {
          // Boolean toggle
          if (prop.type === 'boolean') {
            return (
              <button
                type="button"
                onClick={() => field.onChange(!field.value)}
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  field.value ? 'bg-accent-b2b' : 'bg-bg-elevated border border-border'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-3.5 w-3.5 transform rounded-full bg-bg-base transition-transform',
                    field.value ? 'translate-x-4' : 'translate-x-0.5'
                  )}
                />
              </button>
            )
          }

          // Cron field
          if (prop.format === 'cron') {
            return (
              <div className="space-y-1">
                <input
                  {...field}
                  type="text"
                  className="w-full px-3 py-2 text-sm"
                  placeholder={prop.default as string ?? '0 9 * * *'}
                />
                {field.value && (
                  <p className="text-[10px] text-text-muted">
                    → {humanReadableCron(field.value as string)}
                  </p>
                )}
              </div>
            )
          }

          // Textarea
          if (prop.format === 'textarea') {
            return (
              <textarea
                {...field}
                rows={3}
                className="w-full px-3 py-2 text-sm resize-y"
                placeholder={prop.description}
              />
            )
          }

          // URL input
          if (prop.format === 'url') {
            return (
              <input
                {...field}
                type="url"
                className="w-full px-3 py-2 text-sm"
                placeholder="https://"
              />
            )
          }

          // Number
          if (prop.type === 'number') {
            return (
              <input
                {...field}
                type="number"
                min={prop.minimum}
                max={prop.maximum}
                onChange={(e) => field.onChange(e.target.valueAsNumber)}
                className="w-full px-3 py-2 text-sm"
              />
            )
          }

          // String enum select
          if (prop.type === 'string' && prop.enum) {
            return (
              <select {...field} className="w-full px-3 py-2 text-sm">
                <option value="">Select...</option>
                {prop.enum.map((opt) => (
                  <option key={String(opt)} value={String(opt)}>
                    {String(opt)}
                  </option>
                ))}
              </select>
            )
          }

          // Array of strings — tag input
          if (prop.type === 'array' && (!prop.items?.enum)) {
            return <TagInput field={field} placeholder={prop.description} />
          }

          // Array with enum items — multi-select checkboxes
          if (prop.type === 'array' && prop.items?.enum) {
            const options = prop.items.enum as string[]
            const current = (field.value as string[]) ?? []
            return (
              <div className="space-y-1.5">
                {options.map((opt) => (
                  <label
                    key={opt}
                    className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer hover:text-text-primary"
                  >
                    <input
                      type="checkbox"
                      checked={current.includes(opt)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          field.onChange([...current, opt])
                        } else {
                          field.onChange(current.filter((v) => v !== opt))
                        }
                      }}
                      className="w-3 h-3 accent-[var(--accent-b2b)]"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )
          }

          // Default text input
          return (
            <input
              {...field}
              type="text"
              className="w-full px-3 py-2 text-sm"
              placeholder={prop.description ?? prop.default as string}
            />
          )
        }}
      />

      {error && <p className="text-error text-[11px]">{error}</p>}
    </div>
  )
}

function TagInput({
  field,
  placeholder,
}: {
  field: { value: unknown; onChange: (v: string[]) => void }
  placeholder?: string
}) {
  const [input, setInput] = useState('')
  const tags = (field.value as string[]) ?? []

  function addTag() {
    const trimmed = input.trim()
    if (trimmed && !tags.includes(trimmed)) {
      field.onChange([...tags, trimmed])
    }
    setInput('')
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder={placeholder ?? 'Add item, press Enter'}
          className="flex-1 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={addTag}
          className="px-2 py-1.5 bg-bg-elevated border border-border rounded text-text-muted hover:text-text-primary transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-elevated border border-border rounded text-[11px] text-text-secondary"
            >
              {tag}
              <button
                type="button"
                onClick={() => field.onChange(tags.filter((t) => t !== tag))}
                className="text-text-muted hover:text-error transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function ConfigFormRenderer({
  schema,
  defaultValues = {},
  onSubmit,
  loading = false,
  submitLabel = 'Save Configuration',
}: ConfigFormRendererProps) {
  const zodSchema = buildZodSchema(schema)

  const form = useForm({
    resolver: zodResolver(zodSchema),
    defaultValues: defaultValues as Record<string, unknown>,
  })

  async function handleSubmit(values: Record<string, unknown>) {
    await onSubmit(values)
  }

  const properties = Object.entries(schema.properties ?? {})

  if (!properties.length) {
    return (
      <p className="text-text-muted text-sm text-center py-6">
        No configuration required for this module.
      </p>
    )
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
      {properties.map(([key, prop]) => (
        <FormField
          key={key}
          propKey={key}
          prop={prop}
          control={form.control}
          errors={form.formState.errors as Record<string, { message?: string }>}
        />
      ))}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2 bg-accent-b2b text-bg-base text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          submitLabel
        )}
      </button>
    </form>
  )
}
