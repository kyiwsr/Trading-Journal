import { describe, expect, it } from 'vitest'

import {
  currencySymbol,
  formatDateTime,
  formatDuration,
  formatTime,
  money,
  percent,
  price,
  priceDecimals,
  quantity,
  rMultiple,
  ratio,
  signOf,
} from './format'

describe('money', () => {
  it('prefixes losses with a minus, never brackets', () => {
    expect(money('-250')).toBe('-$250.00')
  })
  it('groups thousands and keeps cents', () => {
    expect(money('1412')).toBe('$1,412.00')
    expect(money('164280.5')).toBe('$164,280.50')
  })
  it('adds a plus only when signed is requested and the value is positive', () => {
    expect(money('525', { signed: true })).toBe('+$525.00')
    expect(money('-525', { signed: true })).toBe('-$525.00')
    expect(money('0', { signed: true })).toBe('$0.00')
  })
  it('never renders negative zero', () => {
    expect(money('-0.001')).toBe('$0.00')
  })
  it('uses the account currency symbol', () => {
    expect(money('10', { currency: 'EUR' })).toBe('€10.00')
    expect(money('10', { currency: 'CHF' })).toBe('CHF 10.00')
  })
  it('returns n/a for missing values', () => {
    expect(money(null)).toBe('n/a')
  })
})

describe('currencySymbol', () => {
  it('falls back to the code for unknown currencies', () => {
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol('XYZ')).toBe('XYZ ')
    expect(currencySymbol(null)).toBe('$')
  })
})

describe('rMultiple', () => {
  it('shows sign and two decimals', () => {
    expect(rMultiple('2.36')).toBe('+2.36R')
    expect(rMultiple('-1')).toBe('-1.00R')
    expect(rMultiple('0')).toBe('0.00R')
  })
  it('shows n/a when no stop was set', () => {
    expect(rMultiple(null)).toBe('n/a')
  })
})

describe('percent', () => {
  it('formats rates already in percent units', () => {
    expect(percent('63.6')).toBe('63.6%')
    expect(percent(85, 0)).toBe('85%')
  })
  it('can force a sign', () => {
    expect(percent('9.5', 2, true)).toBe('+9.50%')
    expect(percent('-2.1', 2, true)).toBe('-2.10%')
  })
  it('handles missing values', () => {
    expect(percent(null)).toBe('n/a')
  })
})

describe('ratio', () => {
  it('shows profit factor to two decimals or n/a', () => {
    expect(ratio('2.78')).toBe('2.78')
    expect(ratio(null)).toBe('n/a')
  })
})

describe('price', () => {
  it('rounds half up at the requested precision', () => {
    expect(price('20394.125', 2)).toBe('20,394.13')
    expect(price('20379', 2)).toBe('20,379.00')
    expect(price('1.08512', 5)).toBe('1.08512')
  })
  it('derives precision from the tick size, minimum two', () => {
    expect(priceDecimals('0.25')).toBe(2)
    expect(priceDecimals('0.00001')).toBe(5)
    expect(priceDecimals('1')).toBe(2)
  })
})

describe('quantity', () => {
  it('drops trailing zeros', () => {
    expect(quantity('4.00000000')).toBe('4')
    expect(quantity('0.50')).toBe('0.5')
  })
})

describe('signOf', () => {
  it('classifies values for color and sign', () => {
    expect(signOf('12')).toBe('pos')
    expect(signOf('-0.01')).toBe('neg')
    expect(signOf('0')).toBe('zero')
    expect(signOf(null)).toBe('zero')
  })
})

describe('dates', () => {
  it('formats date and time in a chosen zone', () => {
    expect(formatDateTime('2026-09-17T09:42:15Z', 'UTC')).toBe('Thu Sep 17 09:42')
    expect(formatTime('2026-09-17T09:42:15Z', 'UTC')).toBe('09:42:15')
  })
  it('formats durations', () => {
    expect(formatDuration('2026-09-08T09:35:12Z', '2026-09-08T10:14:08Z')).toBe('38m 56s')
    expect(formatDuration('2026-09-08T09:00:00Z', '2026-09-08T10:04:00Z')).toBe('1h 04m')
    expect(formatDuration('2026-09-08T09:00:00Z', '2026-09-08T09:00:12Z')).toBe('12s')
  })
})
