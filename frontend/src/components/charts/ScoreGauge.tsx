'use client'

import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from 'recharts'
import { scoreToColor, scoreToLabel } from '@/lib/utils'

interface ScoreGaugeProps {
  score: number // 0-1
  label?: string
  size?: number
}

export function ScoreGauge({ score, label = 'Score', size = 200 }: ScoreGaugeProps) {
  const pct = Math.round(score * 100)
  const color = scoreToColor(score)
  const scoreLabel = scoreToLabel(score)

  const data = [{ value: pct, fill: color }]

  return (
    <div className="relative flex flex-col items-center">
      <div style={{ width: size, height: size / 2 + 20 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="80%"
            innerRadius="60%"
            outerRadius="90%"
            barSize={10}
            data={data}
            startAngle={180}
            endAngle={0}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            {/* Track */}
            <RadialBar
              dataKey="value"
              cornerRadius={4}
              background={{ fill: 'var(--bg-elevated)' }}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>

      {/* Center overlay */}
      <div className="absolute inset-0 flex items-end justify-center pb-4">
        <div className="text-center">
          <p
            className="text-3xl font-mono font-semibold leading-none"
            style={{ color }}
          >
            {pct}
          </p>
          <p className="text-xs text-text-muted mt-1">{scoreLabel}</p>
          <p className="text-[10px] text-text-muted">{label}</p>
        </div>
      </div>
    </div>
  )
}
