import type { ReactNode } from 'react'

type Props = {
  label: string
  value: ReactNode
  detail?: ReactNode
  hint?: ReactNode
  featured?: boolean
}

export function Stat({ label, value, detail, hint, featured = false }: Props) {
  return (
    <div className={`stat ${featured ? 'stat-featured' : ''}`.trim()}>
      <div className="stat-label">{label}</div>
      <div className="stat-value mono">{value}</div>
      {detail ? <div className="stat-detail mono">{detail}</div> : null}
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  )
}
