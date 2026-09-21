import { money, points, rMultiple, signOf } from '../lib/format'

export function Amount({ value, kind = 'money', currency, signed = true }) {
  const text = kind === 'r' ? rMultiple(value) : kind === 'points' ? points(value) : money(value, { currency, signed })
  const tone = value === null || value === undefined ? 'zero' : signOf(value)
  return <span className={`mono amount amount-${tone}`}>{text}</span>
}
