import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

import { AppRoutes } from '../App'
import { createQueryClient } from '../queryClient'

type Reply = { status?: number; body?: unknown }
type Handler = Reply | ((url: URL, init?: RequestInit) => Reply)
export type Routes = Record<string, Handler>

const SIGNED_IN = { '/auth/me': { body: { id: 1, email: 'trader@example.com' } } }

// Every request is answered from `routes`, keyed by path without the /api prefix.
export function stubApi(routes: Routes) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      calls.push(`${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api/, '')}${url.search}`)
      const handler = routes[url.pathname.replace(/^\/api/, '')]
      if (!handler) return new Response(JSON.stringify({ detail: 'No test route' }), { status: 404 })
      const reply = typeof handler === 'function' ? handler(url, init) : handler
      const status = reply.status ?? 200
      return new Response(status === 204 ? null : JSON.stringify(reply.body ?? {}), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
  return calls
}

export function renderApp(path: string, routes: Routes, { signedIn = false } = {}) {
  const calls = stubApi(signedIn ? { ...SIGNED_IN, ...routes } : routes)
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { retry: false, staleTime: 0 } })
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...view, calls }
}
