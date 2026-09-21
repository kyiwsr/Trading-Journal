
import { Badge } from '../../components'

export function EntityList({ label, children }) {
  return (
    <ul className="entity-list" aria-label={label}>
      {children}
    </ul>
  )
}

export function EntityRow({ title, archived, meta, actions }) {
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
