import { useId } from 'react'

import { Card } from './Card'

export function Panel({ title, note, actions, tone = 'default', className = '', children, ...rest }) {
  const headingId = useId()
  return (
    <Card tone={tone} className={`panel ${className}`.trim()} role="region" aria-labelledby={headingId} {...rest}>
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
