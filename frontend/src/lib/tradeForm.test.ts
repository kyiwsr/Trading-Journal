import { describe, expect, it } from 'vitest'

import { ApiError } from '../api/client'
import type { Setup, TradeDetail } from '../api/types'
import { trade71 } from '../test/fixtures'
import {
  buildPayload,
  emptyForm,
  formFromTrade,
  fromLocalInput,
  issuesToErrors,
  parseTags,
  toLocalInput,
  validateForm,
  type TradeFormState,
} from './tradeForm'

const setup: Setup = {
  id: 4,
  name: 'Sweep scalp',
  subtitle: null,
  description: null,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  criteria: [
    { id: 11, label: 'Sweep confirmed', weight: '25', display_order: 0 },
    { id: 12, label: 'Stop before entry', weight: '25', display_order: 1 },
  ],
}

function filled(): TradeFormState {
  const form = emptyForm({ accountId: '1' })
  return {
    ...form,
    instrumentId: '7',
    direction: 'long',
    setupId: '4',
    stop: '20372.75',
    entries: [
      { key: 'a', price: '20380.25', quantity: '1', time: '2026-09-08T09:35:12', note: 'Initial probe' },
      { key: 'b', price: '20377.75', quantity: '1', time: '2026-09-08T09:38:40', note: '' },
    ],
    exits: [
      { key: 'c', price: '20391.00', quantity: '1', time: '2026-09-08T09:52:10', note: 'TP1' },
      { key: 'd', price: '20397.25', quantity: '1', time: '2026-09-08T10:14:08', note: '' },
    ],
    checks: { 11: { checked: true, note: 'Sweep at 09:32' }, 12: { checked: false, note: '' } },
    tags: '5m MSS, Runner',
  }
}

describe('local date-time helpers', () => {
  it('round-trips through the datetime-local format', () => {
    const iso = '2026-09-08T09:35:12.000Z'
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso)
  })

  it('rejects empty and invalid input', () => {
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('not a date')).toBeNull()
  })
})

describe('parseTags', () => {
  it('splits on commas, trims and drops empties and repeats', () => {
    expect(parseTags(' 5m MSS, Runner,, runner ,Runner')).toEqual(['5m MSS', 'Runner', 'runner'])
  })
})

describe('validateForm', () => {
  it('accepts a complete trade', () => {
    expect(validateForm(filled())).toEqual({})
  })

  it('requires an account, an instrument and fill values', () => {
    const errors = validateForm(emptyForm({ accountId: '' }))
    expect(errors.account).toBeDefined()
    expect(errors.instrument).toBeDefined()
    expect(errors['entry.0.price']).toBeDefined()
    expect(errors['entry.0.quantity']).toBeDefined()
    expect(errors['entry.0.time']).toBeDefined()
    expect(errors['exit.0.price']).toBeDefined()
  })

  it('rejects zero, negative and over-precise numbers', () => {
    const form = filled()
    form.entries[0].price = '0'
    form.entries[1].quantity = '-1'
    form.exits[0].price = '1.123456789'
    const errors = validateForm(form)
    expect(errors['entry.0.price']).toMatch(/greater than 0/i)
    expect(errors['entry.1.quantity']).toMatch(/greater than 0/i)
    expect(errors['exit.0.price']).toMatch(/8 decimal/i)
  })

  it('requires entry and exit quantities to match', () => {
    const form = filled()
    form.exits[1].quantity = '2'
    expect(validateForm(form).fills).toMatch(/match/i)
  })

  it('rejects an exit before the first entry', () => {
    const form = filled()
    form.exits[0].time = '2026-09-08T09:00:00'
    form.exits[1].time = '2026-09-08T09:10:00'
    expect(validateForm(form).fills).toMatch(/before the first entry/i)
  })

  it('validates the optional stop, target and slippage', () => {
    const form = filled()
    form.stop = '-3'
    form.target = 'abc'
    form.slippageTicks = '-1'
    const errors = validateForm(form)
    expect(errors.stop).toBeDefined()
    expect(errors.target).toBeDefined()
    expect(errors.slippage).toBeDefined()
  })

  it('limits tag length', () => {
    const form = filled()
    form.tags = 'x'.repeat(41)
    expect(validateForm(form).tags).toMatch(/40/)
  })
})

describe('buildPayload', () => {
  it('builds the API body with fills in entry-then-exit order and every criterion checked or not', () => {
    const payload = buildPayload(filled(), setup)
    expect(payload.account_id).toBe(1)
    expect(payload.instrument_id).toBe(7)
    expect(payload.setup_id).toBe(4)
    expect(payload.tags).toEqual(['5m MSS', 'Runner'])
    expect(payload.stop_price).toBe('20372.75')
    expect(payload.target_price).toBeNull()
    expect(payload.slippage_ticks).toBe('0')
    expect(payload.fills.map((f) => [f.fill_type, f.price])).toEqual([
      ['entry', '20380.25'],
      ['entry', '20377.75'],
      ['exit', '20391.00'],
      ['exit', '20397.25'],
    ])
    expect(payload.fills[0].note).toBe('Initial probe')
    expect(payload.fills[1].note).toBeNull()
    expect(payload.fills[0].filled_at).toBe(fromLocalInput('2026-09-08T09:35:12'))
    expect(payload.criteria_checks).toEqual([
      { criterion_id: 11, checked: true, note: 'Sweep at 09:32' },
      { criterion_id: 12, checked: false, note: null },
    ])
  })

  it('sends no checks without a setup', () => {
    const form = { ...filled(), setupId: '' }
    const payload = buildPayload(form, null)
    expect(payload.setup_id).toBeNull()
    expect(payload.criteria_checks).toEqual([])
  })
})

describe('formFromTrade', () => {
  it('loads a saved trade back into form state', () => {
    const savedSetup: Setup = {
      ...setup,
      criteria: trade71.criteria.map((c, order) => ({ id: c.criterion_id, label: c.label, weight: c.weight, display_order: order })),
    }
    const form = formFromTrade(trade71 as TradeDetail, savedSetup)
    expect(form.accountId).toBe('1')
    expect(form.instrumentId).toBe('1')
    expect(form.setupId).toBe('4')
    expect(form.entries).toHaveLength(2)
    expect(form.exits).toHaveLength(2)
    expect(form.entries[0].note).toBe('Initial probe')
    expect(form.stop).toBe('20372.75')
    expect(form.tags).toBe('5m MSS, Runner')
    expect(form.checks[1]).toEqual({ checked: true, note: 'Swept at 09:32' })
    expect(form.checks[4]).toEqual({ checked: false, note: 'Entered 3 ticks early' })
  })

  it('leaves criteria added after the trade was saved unchecked', () => {
    const grown: Setup = {
      ...setup,
      criteria: [...setup.criteria, { id: 99, label: 'New rule', weight: '10', display_order: 2 }],
    }
    expect(formFromTrade(trade71 as TradeDetail, grown).checks[99]).toEqual({ checked: false, note: '' })
  })
})

describe('issuesToErrors', () => {
  const entries = 2

  it('maps fill issues back to the visible row', () => {
    const error = new ApiError(422, 'x', [
      { loc: ['body', 'fills', 1, 'price'], msg: 'Input should be greater than 0' },
      { loc: ['body', 'fills', 3, 'filled_at'], msg: 'Input should be a valid datetime' },
    ])
    const { fields, form } = issuesToErrors(error, entries)
    expect(fields['entry.1.price']).toMatch(/greater than 0/)
    expect(fields['exit.1.time']).toMatch(/datetime/)
    expect(form).toEqual([])
  })

  it('maps top-level fields and keeps everything else for the summary', () => {
    const error = new ApiError(422, 'x', [
      { loc: ['body', 'stop_price'], msg: 'Input should be greater than 0' },
      { loc: ['body'], msg: 'Entry and exit quantities must match' },
    ])
    const { fields, form } = issuesToErrors(error, entries)
    expect(fields.stop).toBeDefined()
    expect(form).toEqual(['Entry and exit quantities must match'])
  })

  it('shows a plain message when the API sent a string detail', () => {
    const { fields, form } = issuesToErrors(new ApiError(422, 'Criterion 9 does not belong to this setup'), entries)
    expect(fields).toEqual({})
    expect(form).toEqual(['Criterion 9 does not belong to this setup'])
  })
})
