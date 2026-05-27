import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

export function formatAbsoluteTime(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'MMM d, yyyy HH:mm')
  } catch {
    return dateStr
  }
}

export function formatDuration(startedAt: string, finishedAt?: string): string {
  try {
    const start = new Date(startedAt)
    const end = finishedAt ? new Date(finishedAt) : new Date()
    const ms = end.getTime() - start.getTime()
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${Math.round(ms / 1000)}s`
    return `${Math.round(ms / 60000)}m`
  } catch {
    return '—'
  }
}

export function scoreToColor(score: number): string {
  // score is 0-1
  if (score >= 0.7) return 'var(--score-high)'
  if (score >= 0.4) return 'var(--score-mid)'
  return 'var(--score-low)'
}

export function scoreToLabel(score: number): string {
  if (score >= 0.7) return 'High'
  if (score >= 0.4) return 'Medium'
  return 'Low'
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}
