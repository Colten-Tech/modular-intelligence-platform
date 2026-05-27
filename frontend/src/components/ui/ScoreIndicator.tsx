'use client'

import { useEffect, useRef, useState } from 'react'
import { scoreToColor } from '@/lib/utils'

interface ScoreIndicatorProps {
  score: number // 0-1
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CONFIG = {
  sm: { px: 32, stroke: 3, fontSize: 9, radius: 12 },
  md: { px: 48, stroke: 4, fontSize: 13, radius: 18 },
  lg: { px: 64, stroke: 5, fontSize: 16, radius: 24 },
}

export function ScoreIndicator({ score, size = 'md' }: ScoreIndicatorProps) {
  const [animatedScore, setAnimatedScore] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const config = SIZE_CONFIG[size]
  const DURATION = 800 // ms

  useEffect(() => {
    startRef.current = null
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const target = Math.max(0, Math.min(1, score))

    function tick(timestamp: number) {
      if (!startRef.current) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / DURATION, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedScore(eased * target)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [score])

  const { px, stroke, fontSize, radius } = config
  const center = px / 2
  const circumference = 2 * Math.PI * radius
  const dash = circumference * animatedScore
  const gap = circumference - dash
  const color = scoreToColor(score)
  const pct = Math.round(animatedScore * 100)

  return (
    <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} style={{ transform: 'rotate(-90deg)' }}>
      {/* Track */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--bg-elevated)"
        strokeWidth={stroke}
      />
      {/* Progress */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${gap}`}
        style={{ transition: 'stroke 0.3s' }}
      />
      {/* Center label */}
      <text
        x={center}
        y={center}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          transform: 'rotate(90deg)',
          transformOrigin: `${center}px ${center}px`,
          fill: color,
          fontSize: `${fontSize}px`,
          fontFamily: 'IBM Plex Mono, monospace',
          fontWeight: '500',
        }}
      >
        {pct}
      </text>
    </svg>
  )
}
