import { newRowKey } from './rowKey'
import { trimZeros } from './tradeForm'
import { parseDecimal } from './tradeMath'

const blank = (text) => text.trim() === ''
const orNull = (text) => text.trim() || null

// Limits mirror backend/app/schemas: Money is 0 or more with four decimals, prices are greater than 0 with eight.
function moneyError(text, what) {
  if (blank(text)) return `Enter ${what}.`
  const value = parseDecimal(text)
  if (value === null) return 'Enter a plain number.'
  if (value.isNegative()) return 'Must be 0 or more.'
  if (value.decimalPlaces() > 4) return 'Use at most 4 decimal places.'
  if (value.greaterThanOrEqualTo('1e14')) return 'That is too large.'
  return undefined
}

function positiveError(text, what) {
  if (blank(text)) return `Enter ${what}.`
  const value = parseDecimal(text)
  if (value === null) return 'Enter a plain number.'
  if (!value.greaterThan(0)) return 'Must be greater than 0.'
  if (value.decimalPlaces() > 8) return 'Use at most 8 decimal places.'
  return undefined
}

export const emptyAccountForm = () => ({
  name: '',
  label: '',
  brokerName: '',
  route: '',
  startingBalance: '',
  currency: 'USD',
  feeProfileId: '',
  minimumThreshold: '',
})

export const accountFormFrom = (account) => ({
  name: account.name,
  label: account.label ?? '',
  brokerName: account.broker_name ?? '',
  route: account.route ?? '',
  startingBalance: trimZeros(account.starting_balance),
  currency: account.currency,
  feeProfileId: account.fee_profile_id === null ? '' : String(account.fee_profile_id),
  minimumThreshold: account.minimum_threshold === null ? '' : trimZeros(account.minimum_threshold),
})

export function validateAccount(form) {
  const errors = {}
  if (blank(form.name)) errors.name = 'Give the account a name.'
  else if (form.name.trim().length > 120) errors.name = 'Use at most 120 characters.'
  const balance = moneyError(form.startingBalance, 'the starting balance')
  if (balance) errors.startingBalance = balance
  if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) errors.currency = 'Use a three-letter code, like USD.'
  if (!blank(form.minimumThreshold)) {
    const threshold = moneyError(form.minimumThreshold, 'the minimum threshold')
    if (threshold) errors.minimumThreshold = threshold
    else if (!balance && parseDecimal(form.minimumThreshold).greaterThanOrEqualTo(parseDecimal(form.startingBalance))) {
      errors.minimumThreshold = 'Must be less than the starting balance.'
    }
  }
  return errors
}

export const accountPayload = (form) => ({
  name: form.name.trim(),
  label: orNull(form.label),
  broker_name: orNull(form.brokerName),
  route: orNull(form.route),
  starting_balance: form.startingBalance.trim(),
  currency: form.currency.trim().toUpperCase(),
  fee_profile_id: form.feeProfileId ? Number(form.feeProfileId) : null,
  minimum_threshold: form.minimumThreshold.trim() ? form.minimumThreshold.trim() : null,
})

export const emptyInstrumentForm = () => ({ symbol: '', name: '', tickSize: '', tickValue: '' })

export const instrumentFormFrom = (instrument) => ({
  symbol: instrument.symbol,
  name: instrument.name ?? '',
  tickSize: trimZeros(instrument.tick_size),
  tickValue: trimZeros(instrument.tick_value),
})

export function validateInstrument(form) {
  const errors = {}
  if (blank(form.symbol)) errors.symbol = 'Enter the symbol.'
  else if (form.symbol.trim().length > 32) errors.symbol = 'Use at most 32 characters.'
  const size = positiveError(form.tickSize, 'the tick size')
  if (size) errors.tickSize = size
  const value = positiveError(form.tickValue, 'the tick value')
  if (value) errors.tickValue = value
  return errors
}

export const instrumentPayload = (form) => ({
  symbol: form.symbol.trim().toUpperCase(),
  name: orNull(form.name),
  tick_size: form.tickSize.trim(),
  tick_value: form.tickValue.trim(),
})

export const blankFeeRow = () => ({ key: newRowKey(), name: '', amount: '', basis: 'per_fill' })

export const emptyFeeProfileForm = () => ({ name: '', notes: '', components: [] })

export const feeProfileFormFrom = (profile) => ({
  name: profile.name,
  notes: profile.notes ?? '',
  components: profile.components.map((component) => ({
    key: newRowKey(),
    name: component.name,
    amount: trimZeros(component.amount),
    basis: component.basis,
  })),
})

export function validateFeeProfile(form) {
  const errors = {}
  if (blank(form.name)) errors.name = 'Give the fee profile a name.'
  else if (form.name.trim().length > 120) errors.name = 'Use at most 120 characters.'
  form.components.forEach((row, index) => {
    if (blank(row.name)) errors[`components.${index}.name`] = 'Name the fee.'
    const amount = moneyError(row.amount, 'the amount')
    if (amount) errors[`components.${index}.amount`] = amount
  })
  return errors
}

export const feeProfilePayload = (form) => ({
  name: form.name.trim(),
  notes: orNull(form.notes),
  components: form.components.map((row) => ({ name: row.name.trim(), amount: row.amount.trim(), basis: row.basis })),
})

export function validateCutoff(text) {
  if (blank(text)) return 'Enter a whole number from 0 to 100.'
  if (!/^\d+$/.test(text.trim())) return 'Use a whole number from 0 to 100.'
  return Number(text) > 100 ? 'Use a whole number from 0 to 100.' : undefined
}
