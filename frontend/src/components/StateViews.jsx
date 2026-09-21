
import { ApiError } from '../api/client'
import { Button } from './Button'

export function LoadingState({ what }) {
  return (
    <div className="state" role="status">
      <p className="state-title">Loading {what}</p>
    </div>
  )
}

export function ErrorState({ what, error, onRetry }) {
  const detail = error instanceof ApiError ? error.message : 'Something went wrong.'
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">Could not load {what}</p>
      <p className="state-body">{detail}</p>
      {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
    </div>
  )
}

export function EmptyState({ title, children }) {
  return (
    <div className="state">
      <p className="state-title">{title}</p>
      {children ? <div className="state-body">{children}</div> : null}
    </div>
  )
}
