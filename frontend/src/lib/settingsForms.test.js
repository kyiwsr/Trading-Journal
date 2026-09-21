import { describe, expect, it } from 'vitest'

import {
  accountFormFrom,
  accountPayload,
  emptyAccountForm,
  emptyFeeProfileForm,
  emptyInstrumentForm,
  feeProfileFormFrom,
  feeProfilePayload,
  instrumentFormFrom,
  instrumentPayload,
  validateAccount,
  validateCutoff,
  validateFeeProfile,
  validateInstrument,
} from './settingsForms'

describe('account form', () => {
  const valid = { ...emptyAccountForm(), name: 'Apex 150k', startingBalance: '150000' }

  it('accepts a named account with a starting balance', () => {
    expect(validateAccount(valid)).toEqual({})
  })

  it('requires a name and a non-negative balance with at most four decimals', () => {
    const errors = validateAccount({ ...valid, name: ' ', startingBalance: '-5' })
    expect(errors.name).toBeDefined()
    expect(errors.startingBalance).toBeDefined()
    expect(validateAccount({ ...valid, startingBalance: '10.12345' }).startingBalance).toMatch(/4 decimal/)
    expect(validateAccount({ ...valid, startingBalance: '0' })).toEqual({})
  })

  it('needs a three-letter currency', () => {
    expect(validateAccount({ ...valid, currency: 'US' }).currency).toBeDefined()
    expect(validateAccount({ ...valid, currency: 'myr' })).toEqual({})
  })

  it('builds the API body with empty optional fields as null and an upper-case currency', () => {
    expect(accountPayload({ ...valid, currency: 'myr', label: '  #APX-1 ', feeProfileId: '9' })).toEqual({
      name: 'Apex 150k',
      label: '#APX-1',
      broker_name: null,
      route: null,
      starting_balance: '150000',
      currency: 'MYR',
      fee_profile_id: 9,
    })
  })

  it('loads a saved account without padded zeros', () => {
    const saved = {
      id: 1,
      name: 'A',
      label: null,
      broker_name: 'Broker',
      route: null,
      starting_balance: '150000.0000',
      currency: 'USD',
      fee_profile_id: 3,
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
    }
    expect(accountFormFrom(saved)).toMatchObject({ startingBalance: '150000', brokerName: 'Broker', feeProfileId: '3' })
  })
})

describe('instrument form', () => {
  const valid = { ...emptyInstrumentForm(), symbol: 'nq', tickSize: '0.25', tickValue: '5' }

  it('accepts a symbol with positive tick size and value', () => {
    expect(validateInstrument(valid)).toEqual({})
  })

  it('requires positive numbers', () => {
    const errors = validateInstrument({ ...valid, symbol: '', tickSize: '0', tickValue: 'x' })
    expect(errors.symbol).toBeDefined()
    expect(errors.tickSize).toMatch(/greater than 0/i)
    expect(errors.tickValue).toBeDefined()
  })

  it('upper-cases the symbol in the payload and reads saved padding away', () => {
    expect(instrumentPayload(valid)).toEqual({ symbol: 'NQ', name: null, tick_size: '0.25', tick_value: '5' })
    const saved = { id: 1, symbol: 'NQ', name: 'E-mini', tick_size: '0.25000000', tick_value: '5.00000000', archived_at: null, created_at: '' }
    expect(instrumentFormFrom(saved)).toMatchObject({ tickSize: '0.25', tickValue: '5' })
  })
})

describe('fee profile form', () => {
  const valid = {
    ...emptyFeeProfileForm(),
    name: 'Prop tariff',
    components: [
      { key: 'a', name: 'Exchange fee', amount: '1.60', basis: 'per_fill' },
      { key: 'b', name: 'Commission', amount: '2.5', basis: 'per_contract' },
    ],
  }

  it('accepts named components with non-negative amounts', () => {
    expect(validateFeeProfile(valid)).toEqual({})
  })

  it('allows a profile with no components yet', () => {
    expect(validateFeeProfile({ ...valid, components: [] })).toEqual({})
  })

  it('flags each bad component and the missing name', () => {
    const errors = validateFeeProfile({
      ...valid,
      name: '',
      components: [
        { key: 'a', name: '', amount: '1', basis: 'per_fill' },
        { key: 'b', name: 'x', amount: '-1', basis: 'per_fill' },
        { key: 'c', name: 'x', amount: '1.23456', basis: 'per_fill' },
      ],
    })
    expect(errors.name).toBeDefined()
    expect(errors['components.0.name']).toBeDefined()
    expect(errors['components.1.amount']).toBeDefined()
    expect(errors['components.2.amount']).toMatch(/4 decimal/)
  })

  it('builds the API body and loads a saved profile', () => {
    expect(feeProfilePayload(valid)).toEqual({
      name: 'Prop tariff',
      notes: null,
      components: [
        { name: 'Exchange fee', amount: '1.60', basis: 'per_fill' },
        { name: 'Commission', amount: '2.5', basis: 'per_contract' },
      ],
    })
    const saved = {
      id: 1,
      name: 'P',
      notes: 'n',
      archived_at: null,
      created_at: '',
      components: [{ id: 1, name: 'Fee', amount: '1.6000', basis: 'per_fill' }],
    }
    expect(feeProfileFormFrom(saved).components[0]).toMatchObject({ name: 'Fee', amount: '1.6', basis: 'per_fill' })
  })
})

describe('validateCutoff', () => {
  it('takes a whole number from 0 to 100', () => {
    expect(validateCutoff('80')).toBeUndefined()
    expect(validateCutoff('0')).toBeUndefined()
    expect(validateCutoff('100')).toBeUndefined()
    expect(validateCutoff('101')).toBeDefined()
    expect(validateCutoff('-1')).toBeDefined()
    expect(validateCutoff('80.5')).toBeDefined()
    expect(validateCutoff('')).toBeDefined()
  })
})
