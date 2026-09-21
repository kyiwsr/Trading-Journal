

export function toEquityData(points) {
  return points.map((p) => ({
    tradeId: p.trade_id,
    time: new Date(p.closed_at).getTime(),
    equity: Number(p.equity),
    netPnl: Number(p.net_pnl),
    result: p.result,
  }))
}

// Percent below the running peak; the starting balance counts as the first peak.
export function toDrawdownData(points, baseline) {
  let peak = baseline
  return points.map((p) => {
    const equity = Number(p.equity)
    peak = Math.max(peak, equity)
    return { time: new Date(p.closed_at).getTime(), drawdown: peak > 0 ? ((equity - peak) / peak) * 100 : 0 }
  })
}

// Round bounds and ticks so the axis reads $150K, $160K rather than $159.3K.
export function niceScale(low, high, target = 5) {
  const range = Math.max(high - low, 1)
  const rough = range / target
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude)
  const min = Math.floor(low / step) * step
  const max = Math.max(Math.ceil(high / step) * step, min + step)
  const ticks = []
  for (let value = min; value <= max + step / 2; value += step) ticks.push(Number(value.toFixed(6)))
  return { min: Number(min.toFixed(6)), max: Number(max.toFixed(6)), ticks }
}
