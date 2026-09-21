import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { niceScale, toEquityData } from '../../lib/chartData'
import { compactMoney, formatDateTime, money } from '../../lib/format'
import { CHART } from './colors'

const MAX_MARKERS = 150

// Win is a circle, loss a diamond, breakeven a square: the result reads without color.
function ResultMarker({ cx, cy, payload }) {
  if (cx === undefined || cy === undefined || !payload) return <g />
  const ring = { stroke: CHART.canvas, strokeWidth: 2 }
  if (payload.result === 'win') return <circle cx={cx} cy={cy} r={5} fill={CHART.green} {...ring} />
  if (payload.result === 'loss') {
    return <rect x={cx - 4.5} y={cy - 4.5} width={9} height={9} fill={CHART.crimson} transform={`rotate(45 ${cx} ${cy})`} {...ring} />
  }
  return <rect x={cx - 4} y={cy - 4} width={8} height={8} fill={CHART.navy} {...ring} />
}

function EquityTooltip({ active, payload, currency }) {
  const datum = payload?.[0]?.payload
  if (!active || !datum) return null
  return (
    <div className="chart-tooltip">
      <div className="mono">Trade #{datum.tradeId}</div>
      <div>{formatDateTime(new Date(datum.time).toISOString())}</div>
      <div className="mono">Net {money(datum.netPnl, { currency, signed: true })}</div>
      <div className="mono">Equity {money(datum.equity, { currency })}</div>
    </div>
  )
}

const AXIS_TICK = { fill: CHART.muted, fontSize: 11, fontFamily: 'Space Mono, monospace' }

export function EquityChart({ equity, currency }) {
  const data = toEquityData(equity.points)
  const baseline = Number(equity.baseline)
  const peak = Number(equity.peak)
  const low = Math.min(baseline, ...data.map((d) => d.equity))
  const pad = Math.max((peak - low) * 0.05, 1)
  const scale = niceScale(low - pad, peak + pad)
  const showMarkers = data.length <= MAX_MARKERS

  return (
    <div className="chart" role="img" aria-label={`Equity curve over ${data.length} trades. Baseline ${money(baseline, { currency })}, peak ${money(peak, { currency })}, current ${money(equity.current, { currency })}.`}>
      <ResponsiveContainer width="100%" height={280} initialDimension={{ width: 800, height: 280 }}>
        <LineChart data={data} margin={{ top: 12, right: 28, bottom: 4, left: 4 }} accessibilityLayer={false}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tick={AXIS_TICK}
            tickFormatter={(t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            stroke={CHART.navy}
            minTickGap={48}
          />
          <YAxis
            domain={[scale.min, scale.max]}
            ticks={scale.ticks}
            interval={0}
            tick={AXIS_TICK}
            tickFormatter={(v) => compactMoney(v, currency)}
            stroke={CHART.navy}
            width={56}
          />
          <ReferenceLine
            y={baseline}
            stroke={CHART.navy}
            strokeDasharray="4 4"
            label={{ value: `Baseline ${compactMoney(baseline, currency)}`, position: 'insideBottomRight', fill: CHART.muted, fontSize: 11 }}
          />
          <ReferenceLine
            y={peak}
            stroke={CHART.muted}
            strokeDasharray="2 4"
            label={{ value: `All-time high ${compactMoney(peak, currency)}`, position: 'insideTopLeft', fill: CHART.muted, fontSize: 11 }}
          />
          <Tooltip content={<EquityTooltip currency={currency} />} cursor={{ stroke: CHART.navy, strokeWidth: 1 }} />
          <Line
            type="linear"
            dataKey="equity"
            stroke={CHART.navy}
            strokeWidth={2}
            dot={showMarkers ? <ResultMarker /> : false}
            activeDot={<ResultMarker />}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
