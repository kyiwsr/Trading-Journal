import { money, points, rMultiple, signOf } from '../lib/format'

type Props = {
  value: string | number | null | undefined
  kind?: 'money' | 'r' | 'points'
  currency?: string | null
  signed?: boolean
}

export function Amount({ value, kind = 'money', currency, signed = true }: Props) {
  const text = kind === 'r' ? rMultiple(value) : kind === 'points' ? points(value) : money(value, { currency, signed })
  const tone = value === null || value === undefined ? 'zero' : signOf(value)
  return <span className={`mono amount amount-${tone}`}>{text}</span>
}
