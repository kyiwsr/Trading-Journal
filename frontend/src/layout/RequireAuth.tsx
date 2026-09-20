import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useMe } from '../api/queries'
import { ErrorState, LoadingState } from '../components'

export function RequireAuth() {
  const me = useMe()
  const location = useLocation()

  if (me.isPending) {
    return (
      <div className="page">
        <LoadingState what="your session" />
      </div>
    )
  }
  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    }
    return (
      <div className="page">
        <ErrorState what="your session" error={me.error} onRetry={() => void me.refetch()} />
      </div>
    )
  }
  return <Outlet />
}
