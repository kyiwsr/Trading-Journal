import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { Equity } from '../../api/types'
import { toDrawdownData, type DrawdownDatum } from '../../lib/chartData'
import { formatDateTime, percent } from '../../lib/format'
import { CHART } from './colors'

function DrawdownTooltip({ active, payload }: { active?: boolean; payload?: { payload: DrawdownDatum }[] }) {
  const datum = payload?.[0]?.payload
  if (!active || !datum) return null
  return (
    <div className="chart-tooltip">
      <div>{formatDateTime(new Date(datum.time).toISOString())}</div>
      <div className="mono">{percent(datum.drawdown, 2)} below peak</div>
    </div>
  )
}

export function DrawdownStrip({ equity }: { equity: Equity }) {
  const data = toDrawdownData(equity.points, Number(equity.baseline))
  const floor = Math.min(-1, ...data.map((d) => d.drawdown))

  return (
    <div className="chart chart-strip" role="img" aria-label={`Drawdown below peak. Now ${percent(equity.drawdown_pct, 2)}, worst ${percent(equity.max_drawdown_pct, 2)}.`}>
      <ResponsiveContainer width="100%" height={96} initialDimension={{ width: 800, height: 96 }}>
        <AreaChart data={data} margin={{ top: 4, right: 28, bottom: 0, left: 4 }} accessibilityLayer={false}>
          <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']} hide />
          <YAxis
            domain={[floor * 1.15, 0]}
            tick={{ fill: CHART.muted, fontSize: 11, fontFamily: 'Space Mono, monospace' }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            stroke={CHART.navy}
            width={56}
            tickCount={3}
          />
          <Tooltip content={<DrawdownTooltip />} cursor={{ stroke: CHART.navy, strokeWidth: 1 }} />
          <Area
            type="stepAfter"
            dataKey="drawdown"
            stroke={CHART.crimson}
            strokeWidth={2}
            fill={CHART.hazard}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
