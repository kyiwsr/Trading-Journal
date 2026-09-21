import { QueryCache, QueryClient } from '@tanstack/react-query'

import { ApiError } from './api/client'
import { queryKeys } from './api/queries'

function shouldRetry(failureCount, error) {
  const clientError = error instanceof ApiError && error.status >= 400 && error.status < 500
  return !clientError && failureCount < 2
}

export function createQueryClient() {
  const client = new QueryClient({
    queryCache: new QueryCache({
      onError(error, query) {
        // A 401 from any other request means the session ended; re-checking /auth/me sends the user to login.
        if (error instanceof ApiError && error.status === 401 && query.queryKey[0] !== queryKeys.me[0]) {
          void client.invalidateQueries({ queryKey: queryKeys.me })
        }
      },
    }),
    defaultOptions: { queries: { retry: shouldRetry, refetchOnWindowFocus: false, staleTime: 30_000 } },
  })
  return client
}
