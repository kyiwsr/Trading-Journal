import type { InputHTMLAttributes, ReactNode } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode }

export function Checkbox({ label, ...rest }: Props) {
  return (
    <label className="checkbox">
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  )
}
