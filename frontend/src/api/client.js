import { trackRequest } from './waking'

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

export type ApiIssue = { loc: (string | number)[]; msg: string }

export class ApiError extends Error {
  status: number
  issues: ApiIssue[]

  constructor(status: number, message: string, issues: ApiIssue[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.issues = issues
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

// Pydantic prefixes validator failures with this; the user needs only the sentence after it.
const VALUE_ERROR_PREFIX = /^Value error, /

async function readDetail(res: Response): Promise<{ message: string; issues: ApiIssue[] }> {
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') return { message: body.detail, issues: [] }
    if (Array.isArray(body?.detail) && body.detail[0]?.msg) {
      const issues: ApiIssue[] = body.detail.map((item: { loc?: (string | number)[]; msg: unknown }) => ({
        loc: Array.isArray(item.loc) ? item.loc : [],
        msg: String(item.msg).replace(VALUE_ERROR_PREFIX, ''),
      }))
      return { message: issues[0].msg, issues }
    }
  } catch {
    // Body was not JSON; fall through to the status text.
  }
  return { message: res.statusText || `Request failed (${res.status})`, issues: [] }
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
    if (!res.ok) {
      const { message, issues } = await readDetail(res)
      throw new ApiError(res.status, message, issues)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  } finally {
    done()
  }
}
