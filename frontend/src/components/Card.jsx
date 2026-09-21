import type { HTMLAttributes } from 'react'

type Props = HTMLAttributes<HTMLDivElement> & {
  tone?: 'default' | 'tint' | 'quest' | 'penalty'
}

const toneClass = { default: '', tint: 'card-tint', quest: 'card-quest', penalty: 'card-penalty' }

export function Card({ tone = 'default', className = '', ...rest }: Props) {
  return <div className={`card ${toneClass[tone]} ${className}`.trim()} {...rest} />
}
