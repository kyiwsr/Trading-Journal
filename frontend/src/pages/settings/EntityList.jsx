import type { ReactNode } from 'react'

import { Badge } from '../../components'

export function EntityList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul className="entity-list" aria-label={label}>
      {children}
    </ul>
  )
}

type RowProps = { title: string; archived: boolean; meta?: ReactNode; actions: ReactNode }

export function EntityRow({ title, archived, meta, actions }: RowProps) {
  return (
    <li className={archived ? 'entity entity-archived' : 'entity'}>
      <div className="entity-main">
        <p className="entity-title">
          {title}
          {archived ? (
            <>
              {' '}
              <Badge>Archived</Badge>
            </>
          ) : null}
        </p>
        {meta ? <div className="entity-meta">{meta}</div> : null}
      </div>
      <div className="entity-actions">{actions}</div>
    </li>
  )
}
