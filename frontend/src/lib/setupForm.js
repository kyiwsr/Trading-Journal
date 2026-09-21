import Decimal from 'decimal.js'

import type { Setup } from '../api/types'
import { newRowKey } from './rowKey'
import { trimZeros, type FormErrors } from './tradeForm'
import { parseDecimal } from './tradeMath'

export type CriterionRow = { key: string; id?: number; label: string; weight: string }

export type SetupFormState = {
  name: string
  subtitle: string
  description: string
  criteria: CriterionRow[]
}

// Limits mirror backend/app/schemas/setup.py: weight is greater than 0 with at most two decimals and ten digits.
const MAX_WEIGHT_DECIMALS = 2
const MAX_WEIGHT = new Decimal('99999999.99')
const MAX_NAME = 120
const MAX_LABEL = 300

export const blankCriterion = (): CriterionRow => ({ key: newRowKey(), label: '', weight: '' })

export function emptySetupForm(): SetupFormState {
  return { name: '', subtitle: '', description: '', criteria: [] }
}

export function setupFormFromApi(setup: Setup): SetupFormState {
  return {
    name: setup.name,
    subtitle: setup.subtitle ?? '',
    description: setup.description ?? '',
    criteria: [...setup.criteria]
      .sort((a, b) => a.display_order - b.display_order)
      .map((criterion) => ({
        key: newRowKey(),
        id: criterion.id,
        label: criterion.label,
        weight: trimZeros(criterion.weight),
      })),
  }
}

export function weightTotal(rows: { weight: string }[]): Decimal {
  return rows.reduce((sum, row) => {
    const weight = parseDecimal(row.weight)
    return weight?.greaterThan(0) ? sum.plus(weight) : sum
  }, new Decimal(0))
}

function weightError(text: string): string | undefined {
  if (text.trim() === '') return 'Enter the points this rule is worth.'
  const value = parseDecimal(text)
  if (value === null) return 'Enter a plain number, like 25.'
  if (!value.greaterThan(0)) return 'Must be greater than 0.'
  if (value.decimalPlaces() > MAX_WEIGHT_DECIMALS) return `Use at most ${MAX_WEIGHT_DECIMALS} decimal places.`
  if (value.greaterThan(MAX_WEIGHT)) return 'That is too large.'
  return undefined
}

export function validateSetupForm(form: SetupFormState): FormErrors {
  const errors: FormErrors = {}
  const name = form.name.trim()
  if (!name) errors.name = 'Give the setup a name.'
  else if (name.length > MAX_NAME) errors.name = `Use at most ${MAX_NAME} characters.`

  form.criteria.forEach((row, index) => {
    const label = row.label.trim()
    if (!label) errors[`criteria.${index}.label`] = 'Describe the rule.'
    else if (label.length > MAX_LABEL) errors[`criteria.${index}.label`] = `Use at most ${MAX_LABEL} characters.`
    const weight = weightError(row.weight)
    if (weight) errors[`criteria.${index}.weight`] = weight
  })
  return errors
}

export function moveCriterion(rows: CriterionRow[], index: number, delta: -1 | 1): CriterionRow[] {
  const target = index + delta
  if (target < 0 || target >= rows.length) return rows
  const next = [...rows]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function criteriaPayload(form: SetupFormState): { id?: number; label: string; weight: string }[] {
  return form.criteria.map((row) => ({
    ...(row.id === undefined ? {} : { id: row.id }),
    label: row.label.trim(),
    weight: row.weight.trim(),
  }))
}

export const textOrNull = (text: string) => text.trim() || null
