import { describe, expect, it } from 'vitest'

import { shareCardModel } from './shareCard'

const trade = {
  id: 71,
  instrument: { symbol: 'NQ' },
  direction: 'long',
  closed_at: '2026-09-24T10:14:08Z',
  net_pnl: '590.36',
  r_multiple: '2.36',
  execution_score: 85,
  score_band: 'elite',
  setup: { name: 'Sweep scalp' },
  session: 'NY open',
}

describe('shareCardModel', () => {
  it('reads a win as green mood with a signed amount and the full stats line', () => {
    const model = shareCardModel(trade, 'USD')
    expect(model.mood).toBe('win')
    expect(model.symbol).toBe('NQ')
    expect(model.direction).toBe('LONG')
    expect(model.dateText).toBe('Sep 24, 2026')
    expect(model.netPnlText).toBe('+$590.36')
    expect(model.statsText).toBe('+2.36R · Elite (85%)')
    expect(model.footerText).toBe('Sweep scalp · NY open')
  })

  it('reads a loss as loss mood with a minus sign', () => {
    const model = shareCardModel(
      { ...trade, net_pnl: '-205.00', r_multiple: '-1.02', execution_score: 72, score_band: 'solid' },
      'USD',
    )
    expect(model.mood).toBe('loss')
    expect(model.netPnlText).toBe('-$205.00')
    expect(model.statsText).toBe('-1.02R · Solid (72%)')
  })

  it('reads a breakeven as neutral mood with no sign', () => {
    const model = shareCardModel({ ...trade, net_pnl: '0' }, 'USD')
    expect(model.mood).toBe('neutral')
    expect(model.netPnlText).toBe('$0.00')
  })

  it('falls back when there is no stop or the trade was never scored', () => {
    const model = shareCardModel(
      { ...trade, r_multiple: null, execution_score: null, score_band: null, setup: null, session: null },
      'USD',
    )
    expect(model.statsText).toBe('No stop set · No setup scored')
    expect(model.footerText).toBe('No setup')
  })
})
