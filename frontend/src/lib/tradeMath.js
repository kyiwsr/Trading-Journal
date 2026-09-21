import Decimal from 'decimal.js'

import type { Band, Direction } from '../api/types'

// Mirrors backend/app/services (trade_math, fees, scoring, rounding) so the form preview matches what the API saves.
const D = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_UP })
type Dec = Decimal

export type FillInput = { type: 'entry' | 'exit'; price: Dec; quantity: Dec }
export type InstrumentSpec = { tickSize: Dec; tickValue: Dec }
export type FeeComponent = { name: string; amount: Dec; basis: 'per_fill' | 'per_contract' }
export type FeeLine = { name: string; amount: Dec }

export type TradeResult = {
  quantity: Dec
  avgEntry: Dec
  avgExit: Dec
  points: Dec
  grossPnl: Dec
  slippageCost: Dec
  riskAmount: Dec | null
  netPnl: Dec
  rMultiple: Dec | null
}

const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/

export function parseDecimal(text: string): Dec | null {
  const trimmed = text.trim()
  return PLAIN_NUMBER.test(trimmed) ? new D(trimmed) : null
}

// Values from the API can arrive in exponent form ("0E-8" for a zero); typed input never may.
export function parseApiDecimal(text: string): Dec | null {
  try {
    return new D(text)
  } catch {
    return null
  }
}

export function roundHalfUp(value: Dec, places: number): Dec {
  const rounded = value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP)
  return rounded.isZero() ? new D(0) : rounded
}

const toCents = (value: Dec) => roundHalfUp(value, 2)

const sum = (values: Dec[]) => values.reduce((total, value) => total.plus(value), new D(0))

export function averagePrice(fills: FillInput[], type: FillInput['type']): Dec | null {
  const matching = fills.filter((fill) => fill.type === type)
  if (matching.length === 0) return null
  const quantity = sum(matching.map((fill) => fill.quantity))
  return sum(matching.map((fill) => fill.price.times(fill.quantity))).div(quantity)
}

const quantityOf = (fills: FillInput[], type: FillInput['type']) =>
  sum(fills.filter((fill) => fill.type === type).map((fill) => fill.quantity))

const money = (points: Dec, instrument: InstrumentSpec, quantity: Dec) =>
  points.div(instrument.tickSize).times(instrument.tickValue).times(quantity)

type ComputeInput = {
  direction: Direction
  fills: FillInput[]
  instrument: InstrumentSpec
  stopPrice?: Dec | null
  feesTotal?: Dec
  slippageTicks?: Dec
}

// Null until the trade has both sides with matching quantity, the same rule the API enforces.
export function computeTrade({
  direction,
  fills,
  instrument,
  stopPrice = null,
  feesTotal = new D(0),
  slippageTicks = new D(0),
}: ComputeInput): TradeResult | null {
  const avgEntry = averagePrice(fills, 'entry')
  const avgExit = averagePrice(fills, 'exit')
  if (avgEntry === null || avgExit === null) return null
  const quantity = quantityOf(fills, 'entry')
  if (!quantity.equals(quantityOf(fills, 'exit'))) return null

  const points = avgExit.minus(avgEntry).times(direction === 'long' ? 1 : -1)
  const grossPnl = toCents(money(points, instrument, quantity))
  const slippageCost = toCents(slippageTicks.times(instrument.tickValue).times(quantity))
  const netPnl = toCents(grossPnl.minus(feesTotal).minus(slippageCost))

  let riskAmount: Dec | null = null
  let rMultiple: Dec | null = null
  if (stopPrice !== null) {
    riskAmount = toCents(money(avgEntry.minus(stopPrice).abs(), instrument, quantity))
    if (riskAmount.greaterThan(0)) rMultiple = roundHalfUp(netPnl.div(riskAmount), 2)
  }

  return { quantity, avgEntry, avgExit, points, grossPnl, slippageCost, riskAmount, netPnl, rMultiple }
}

export function applyFees(components: FeeComponent[], fills: FillInput[]): FeeLine[] {
  const perFill = new D(fills.length)
  const perContract = sum(fills.map((fill) => fill.quantity))
  return components.map((component) => ({
    name: component.name,
    amount: toCents(component.amount.times(component.basis === 'per_fill' ? perFill : perContract)),
  }))
}

export function totalFees(lines: FeeLine[]): Dec {
  return sum(lines.map((line) => line.amount))
}

export function executionScore(items: { weight: Dec; checked: boolean }[]): number | null {
  const total = sum(items.map((item) => item.weight))
  if (!total.greaterThan(0)) return null
  const checked = sum(items.filter((item) => item.checked).map((item) => item.weight))
  return roundHalfUp(checked.times(100).div(total), 0).toNumber()
}

export type BandThresholds = { elite: number; solid: number; sub_optimal: number }
export const DEFAULT_BAND_THRESHOLDS: BandThresholds = { elite: 85, solid: 70, sub_optimal: 60 }

export function scoreBand(score: number | null, thresholds: BandThresholds = DEFAULT_BAND_THRESHOLDS): Band | null {
  if (score === null) return null
  if (score >= thresholds.elite) return 'elite'
  if (score >= thresholds.solid) return 'solid'
  if (score >= thresholds.sub_optimal) return 'sub_optimal'
  return 'rule_breach'
}
