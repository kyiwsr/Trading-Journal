import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'

import {
  applyFees,
  averagePrice,
  computeTrade,
  executionScore,
  parseApiDecimal,
  parseDecimal,
  roundHalfUp,
  scoreBand,
  totalFees,
  type FeeComponent,
  type FillInput,
} from './tradeMath'

const d = (value: string) => new Decimal(value)
const fill = (type: 'entry' | 'exit', price: string, quantity: string): FillInput => ({
  type,
  price: d(price),
  quantity: d(quantity),
})

const NQ = { tickSize: d('0.25'), tickValue: d('5') }

const trade71: FillInput[] = [
  fill('entry', '20380.25', '1'),
  fill('entry', '20377.75', '1'),
  fill('exit', '20391.00', '1'),
  fill('exit', '20397.25', '1'),
]

const tariff: FeeComponent[] = [
  { name: 'Exchange fee', amount: d('1.60'), basis: 'per_fill' },
  { name: 'Broker commission', amount: d('2.00'), basis: 'per_fill' },
  { name: 'Regulatory fee', amount: d('0.06'), basis: 'per_fill' },
]

describe('parseDecimal', () => {
  it('parses plain numbers and rejects empty or malformed text', () => {
    expect(parseDecimal('20380.25')?.toString()).toBe('20380.25')
    expect(parseDecimal(' 5 ')?.toString()).toBe('5')
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
    expect(parseDecimal('1e3')).toBeNull()
    expect(parseDecimal('1,5')).toBeNull()
  })
})

describe('roundHalfUp', () => {
  it('rounds ties away from zero, like the backend', () => {
    expect(roundHalfUp(d('-1.025'), 2).toFixed(2)).toBe('-1.03')
    expect(roundHalfUp(d('0.125'), 2).toFixed(2)).toBe('0.13')
  })

  it('never returns negative zero', () => {
    expect(roundHalfUp(d('-0.001'), 2).toFixed(2)).toBe('0.00')
    expect(Object.is(roundHalfUp(d('-0.001'), 2).toNumber(), -0)).toBe(false)
  })
})

describe('averagePrice', () => {
  it('weights fills by quantity', () => {
    const fills = [fill('entry', '20000', '1'), fill('entry', '20008', '3'), fill('exit', '20020', '4')]
    expect(averagePrice(fills, 'entry')?.toFixed(2)).toBe('20006.00')
  })

  it('is null when there are no fills of that type', () => {
    expect(averagePrice([fill('entry', '1', '1')], 'exit')).toBeNull()
  })
})

describe('computeTrade, Trade #71', () => {
  const fees = applyFees(tariff, trade71)
  const result = computeTrade({
    direction: 'long',
    fills: trade71,
    instrument: NQ,
    stopPrice: d('20372.75'),
    feesTotal: totalFees(fees),
  })

  it('averages both sides', () => {
    expect(result?.quantity.toString()).toBe('2')
    expect(result?.avgEntry.toFixed(2)).toBe('20379.00')
    expect(result?.avgExit.toString()).toBe('20394.125')
    expect(result?.points.toString()).toBe('15.125')
  })

  it('prices gross P&L, risk, net and R', () => {
    expect(result?.grossPnl.toFixed(2)).toBe('605.00')
    expect(result?.riskAmount?.toFixed(2)).toBe('250.00')
    expect(result?.netPnl.toFixed(2)).toBe('590.36')
    expect(result?.rMultiple?.toFixed(2)).toBe('2.36')
  })

  it('splits fees per line', () => {
    expect(fees.map((line) => [line.name, line.amount.toFixed(2)])).toEqual([
      ['Exchange fee', '6.40'],
      ['Broker commission', '8.00'],
      ['Regulatory fee', '0.24'],
    ])
    expect(totalFees(fees).toFixed(2)).toBe('14.64')
  })
})

describe('computeTrade, scale-in with one exit', () => {
  const oneExit = [fill('entry', '20000', '1'), fill('entry', '20010', '1'), fill('exit', '20020', '2')]
  const twoExits = [fill('entry', '20000', '1'), fill('entry', '20010', '1'), fill('exit', '20020', '1'), fill('exit', '20020', '1')]

  it('uses the average entry, not FIFO', () => {
    const result = computeTrade({ direction: 'long', fills: oneExit, instrument: NQ, stopPrice: d('19990') })
    expect(result?.avgEntry.toFixed(2)).toBe('20005.00')
    expect(result?.points.toFixed(2)).toBe('15.00')
    expect(result?.grossPnl.toFixed(2)).toBe('600.00')
    expect(result?.riskAmount?.toFixed(2)).toBe('600.00')
  })

  it('gives the same gross when the exit is entered as two fills', () => {
    const result = computeTrade({ direction: 'long', fills: twoExits, instrument: NQ })
    expect(result?.grossPnl.toFixed(2)).toBe('600.00')
  })

  it('counts fees per fill and per contract differently', () => {
    const perFill: FeeComponent[] = [{ name: 'Exchange fee', amount: d('1.60'), basis: 'per_fill' }]
    const perContract: FeeComponent[] = [{ name: 'Exchange fee', amount: d('1.60'), basis: 'per_contract' }]
    expect(totalFees(applyFees(perFill, oneExit)).toFixed(2)).toBe('4.80')
    expect(totalFees(applyFees(perFill, twoExits)).toFixed(2)).toBe('6.40')
    expect(totalFees(applyFees(perContract, oneExit)).toFixed(2)).toBe('6.40')
    expect(totalFees(applyFees(perContract, twoExits)).toFixed(2)).toBe('6.40')
  })
})

describe('computeTrade, other shapes', () => {
  it('handles unequal sizes', () => {
    const fills = [fill('entry', '20000', '1'), fill('entry', '20008', '3'), fill('exit', '20020', '4')]
    const result = computeTrade({ direction: 'long', fills, instrument: NQ })
    expect(result?.avgEntry.toFixed(2)).toBe('20006.00')
    expect(result?.grossPnl.toFixed(2)).toBe('1120.00')
  })

  it('profits on a short when price falls', () => {
    const fills = [fill('entry', '100', '1'), fill('exit', '99', '1')]
    const result = computeTrade({ direction: 'short', fills, instrument: { tickSize: d('0.25'), tickValue: d('12.5') } })
    expect(result?.points.toFixed(2)).toBe('1.00')
    expect(result?.grossPnl.toFixed(2)).toBe('50.00')
  })

  it('books a loss net of fees and slippage', () => {
    const fills = [fill('entry', '20000', '1'), fill('exit', '19990', '1')]
    const result = computeTrade({
      direction: 'long',
      fills,
      instrument: NQ,
      stopPrice: d('19990'),
      feesTotal: d('4.50'),
      slippageTicks: d('2'),
    })
    expect(result?.grossPnl.toFixed(2)).toBe('-200.00')
    expect(result?.netPnl.toFixed(2)).toBe('-214.50')
    expect(result?.rMultiple?.toFixed(2)).toBe('-1.07')
  })

  it('has no risk or R without a stop, or with a stop at the entry', () => {
    const fills = [fill('entry', '20000', '1'), fill('exit', '20010', '1')]
    const noStop = computeTrade({ direction: 'long', fills, instrument: NQ })
    expect(noStop?.riskAmount).toBeNull()
    expect(noStop?.rMultiple).toBeNull()
    const zeroRisk = computeTrade({ direction: 'long', fills, instrument: NQ, stopPrice: d('20000') })
    expect(zeroRisk?.riskAmount?.toFixed(2)).toBe('0.00')
    expect(zeroRisk?.rMultiple).toBeNull()
  })

  it('rounds R half up', () => {
    const fills = [fill('entry', '100', '1'), fill('exit', '101', '1')]
    const result = computeTrade({
      direction: 'long',
      fills,
      instrument: { tickSize: d('1'), tickValue: d('1') },
      stopPrice: d('92'),
    })
    expect(result?.rMultiple?.toFixed(3)).toBe('0.130')
  })

  it('returns null until both sides exist and quantities match', () => {
    expect(computeTrade({ direction: 'long', fills: [fill('entry', '1', '1')], instrument: NQ })).toBeNull()
    const mismatch = [fill('entry', '20000', '2'), fill('exit', '20010', '1')]
    expect(computeTrade({ direction: 'long', fills: mismatch, instrument: NQ })).toBeNull()
  })
})

describe('executionScore', () => {
  const item = (weight: string, checked: boolean) => ({ weight: d(weight), checked })

  it('scores the mockup checklist at 85', () => {
    const items = [item('25', true), item('25', true), item('20', true), item('15', false), item('15', true)]
    expect(executionScore(items)).toBe(85)
  })

  it('is 0 when nothing is checked', () => {
    expect(executionScore([item('10', false), item('10', false)])).toBe(0)
  })

  it('normalises weights that do not sum to 100', () => {
    expect(executionScore([item('25', true), item('25', false)])).toBe(50)
  })

  it('rounds half up', () => {
    const items = [item('1', true), ...Array.from({ length: 7 }, () => item('1', false))]
    expect(executionScore(items)).toBe(13)
  })

  it('is null without criteria', () => {
    expect(executionScore([])).toBeNull()
  })
})

describe('scoreBand', () => {
  it('uses 85, 70 and 60 as the default edges', () => {
    expect(scoreBand(85)).toBe('elite')
    expect(scoreBand(84)).toBe('solid')
    expect(scoreBand(70)).toBe('solid')
    expect(scoreBand(69)).toBe('sub_optimal')
    expect(scoreBand(60)).toBe('sub_optimal')
    expect(scoreBand(59)).toBe('rule_breach')
    expect(scoreBand(null)).toBeNull()
  })

  it('accepts thresholds from the API', () => {
    expect(scoreBand(88, { elite: 90, solid: 75, sub_optimal: 50 })).toBe('solid')
  })
})

describe('parseApiDecimal', () => {
  it('accepts the exponent form the API uses for zero, and rejects text', () => {
    expect(parseApiDecimal('0E-8')?.isZero()).toBe(true)
    expect(parseApiDecimal('0.25000000')?.toString()).toBe('0.25')
    expect(parseApiDecimal('abc')).toBeNull()
  })
})
