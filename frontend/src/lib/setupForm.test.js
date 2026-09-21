import { describe, expect, it } from 'vitest'

import {
  blankCriterion,
  criteriaPayload,
  emptySetupForm,
  moveCriterion,
  setupFormFromApi,
  validateSetupForm,
  weightTotal,
} from './setupForm'

const saved = {
  id: 4,
  name: 'celup kaki',
  subtitle: 'Liquidity Sweep Scalp',
  description: null,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  criteria: [
    { id: 12, label: 'Stop before entry', weight: '20.00', display_order: 1 },
    { id: 11, label: 'Sweep confirmed', weight: '25.00', display_order: 0 },
  ],
}

function form(rows) {
  return {
    ...emptySetupForm(),
    name: 'FVG retest',
    criteria: rows.map((row) => ({ ...blankCriterion(), ...row })),
  }
}

describe('setupFormFromApi', () => {
  it('orders rules by display_order and keeps their ids', () => {
    const state = setupFormFromApi(saved)
    expect(state.name).toBe('celup kaki')
    expect(state.subtitle).toBe('Liquidity Sweep Scalp')
    expect(state.criteria.map((row) => [row.id, row.label, row.weight])).toEqual([
      [11, 'Sweep confirmed', '25'],
      [12, 'Stop before entry', '20'],
    ])
  })
})

describe('weightTotal', () => {
  it('adds valid weights exactly and ignores unreadable ones', () => {
    const total = weightTotal(form([{ label: 'a', weight: '0.1' }, { label: 'b', weight: '0.2' }, { label: 'c', weight: 'x' }]).criteria)
    expect(total.toString()).toBe('0.3')
  })
})

describe('validateSetupForm', () => {
  it('accepts a named setup with valid rules', () => {
    expect(validateSetupForm(form([{ label: 'Sweep confirmed', weight: '25' }]))).toEqual({})
  })

  it('accepts a setup with no rules yet', () => {
    expect(validateSetupForm(form([]))).toEqual({})
  })

  it('requires a name', () => {
    expect(validateSetupForm({ ...form([]), name: '  ' }).name).toBeDefined()
  })

  it('requires every rule to have a label and a positive weight with at most two decimals', () => {
    const errors = validateSetupForm(
      form([
        { label: '', weight: '10' },
        { label: 'ok', weight: '0' },
        { label: 'ok', weight: '1.234' },
        { label: 'ok', weight: 'abc' },
        { label: 'ok', weight: '' },
      ]),
    )
    expect(errors['criteria.0.label']).toBeDefined()
    expect(errors['criteria.1.weight']).toMatch(/greater than 0/i)
    expect(errors['criteria.2.weight']).toMatch(/2 decimal/i)
    expect(errors['criteria.3.weight']).toBeDefined()
    expect(errors['criteria.4.weight']).toBeDefined()
  })
})

describe('moveCriterion', () => {
  const rows = form([{ label: 'a', weight: '1' }, { label: 'b', weight: '2' }, { label: 'c', weight: '3' }]).criteria

  it('moves a rule up or down', () => {
    expect(moveCriterion(rows, 1, -1).map((row) => row.label)).toEqual(['b', 'a', 'c'])
    expect(moveCriterion(rows, 1, 1).map((row) => row.label)).toEqual(['a', 'c', 'b'])
  })

  it('does nothing at either end', () => {
    expect(moveCriterion(rows, 0, -1)).toBe(rows)
    expect(moveCriterion(rows, 2, 1)).toBe(rows)
  })
})

describe('criteriaPayload', () => {
  it('keeps ids for saved rules, trims text and sends the list in order', () => {
    const state = setupFormFromApi(saved)
    state.criteria.push({ ...blankCriterion(), label: '  New rule ', weight: '15' })
    expect(criteriaPayload(state)).toEqual([
      { id: 11, label: 'Sweep confirmed', weight: '25' },
      { id: 12, label: 'Stop before entry', weight: '20' },
      { label: 'New rule', weight: '15' },
    ])
  })
})
