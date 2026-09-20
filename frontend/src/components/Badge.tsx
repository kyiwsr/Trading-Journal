import type { HTMLAttributes } from 'react'

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'win' | 'loss' | 'streak'
}

export function Badge({ tone = 'neutral', className = '', ...rest }: Props) {
  const toneClass = tone === 'neutral' ? '' : `badge-${tone}`
  return <span className={`badge ${toneClass} ${className}`.trim()} {...rest} />
}
