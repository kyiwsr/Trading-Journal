import { useId, type ReactNode } from 'react'

import { Card } from './Card'

type Props = {
  title: string
  note?: ReactNode
  actions?: ReactNode
  tone?: 'default' | 'tint' | 'quest' | 'penalty'
  className?: string
  children: ReactNode
}

export function Panel({ title, note, actions, tone = 'default', className = '', children }: Props) {
  const headingId = useId()
  return (
    <Card tone={tone} className={`panel ${className}`.trim()} role="region" aria-labelledby={headingId}>
      <header className="panel-head">
        <div>
          <h2 id={headingId} className="panel-title">
            {title}
          </h2>
          {note ? <p className="panel-note">{note}</p> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </header>
      {children}
    </Card>
  )
}
