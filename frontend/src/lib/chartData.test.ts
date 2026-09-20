import { describe, expect, it } from 'vitest'

import type { EquityPoint } from '../api/types'
import { niceScale, toDrawdownData, toEquityData } from './chartData'

const point = (id: number, day: number, equity: string, result: EquityPoint['result']): EquityPoint => ({
  trade_id: id,
  closed_at: `2026-09-${String(day).padStart(2, '0')}T10:00:00Z`,
  equity,
  net_pnl: '0',
  result,
})

describe('toEquityData', () => {
  it('converts API strings to numbers and timestamps', () => {
    const [first] = toEquityData([point(1, 1, '150525.50', 'win')])
    expect(first).toMatchObject({ tradeId: 1, equity: 150525.5, result: 'win' })
    expect(first.time).toBe(Date.UTC(2026, 8, 1, 10))
  })
})

describe('toDrawdownData', () => {
  it('measures percent below the running peak, starting from the baseline', () => {
    const data = toDrawdownData(
      [point(1, 1, '101000', 'win'), point(2, 2, '99990', 'loss'), point(3, 3, '102000', 'win')],
      100000,
    )
    expect(data.map((d) => Number(d.drawdown.toFixed(2)))).toEqual([0, -1, 0])
  })
  it('shows a drawdown when the first trade already loses', () => {
    const [d] = toDrawdownData([point(1, 1, '99000', 'loss')], 100000)
    expect(d.drawdown).toBeCloseTo(-1)
  })
  it('returns nothing for no trades', () => {
    expect(toDrawdownData([], 100000)).toEqual([])
  })
})

describe('niceScale', () => {
  it('rounds the axis out to round numbers with evenly spaced ticks', () => {
    const scale = niceScale(144300, 185900)
    expect(scale.min).toBe(140000)
    expect(scale.max).toBe(190000)
    expect(scale.ticks).toEqual([140000, 150000, 160000, 170000, 180000, 190000])
  })
  it('handles small ranges', () => {
    const scale = niceScale(0, 1)
    expect(scale.min).toBe(0)
    expect(scale.max).toBe(1)
    expect(scale.ticks.length).toBeGreaterThan(2)
  })
  it('still returns a usable axis when every value is equal', () => {
    const scale = niceScale(100, 100)
    expect(scale.min).toBeLessThanOrEqual(100)
    expect(scale.max).toBeGreaterThanOrEqual(100)
    expect(scale.ticks.length).toBeGreaterThan(1)
  })
})
