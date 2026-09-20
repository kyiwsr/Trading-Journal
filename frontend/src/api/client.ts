import { trackRequest } from './waking'

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export type Query = Record<string, string | number | null | undefined>

export function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return `${BASE}${path}${qs ? `?${qs}` : ''}`
}

async function readDetail(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') return body.detail
    if (Array.isArray(body?.detail) && body.detail[0]?.msg) return String(body.detail[0].msg)
  } catch {
    // Body was not JSON; fall through to the status text.
  }
  return res.statusText || `Request failed (${res.status})`
}

type Options = { method?: string; body?: unknown; query?: Query; signal?: AbortSignal }

export async function api<T>(path: string, { method = 'GET', body, query, signal }: Options = {}): Promise<T> {
  const done = trackRequest()
  try {
    let res: Response
    try {
      res = await fetch(buildUrl(path, query), {
        method,
        credentials: 'include',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.')
    }
    if (!res.ok) throw new ApiError(res.status, await readDetail(res))
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  } finally {
    done()
  }
}
