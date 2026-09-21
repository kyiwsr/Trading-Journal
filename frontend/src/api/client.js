import { trackRequest } from './waking'

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

export class ApiError extends Error {
  status
  issues

  constructor(status, message, issues = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.issues = issues
  }
}

export function buildUrl(path, query) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return `${BASE}${path}${qs ? `?${qs}` : ''}`
}

// Pydantic prefixes validator failures with this; the user needs only the sentence after it.
const VALUE_ERROR_PREFIX = /^Value error, /

async function readDetail(res) {
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') return { message: body.detail, issues: [] }
    if (Array.isArray(body?.detail) && body.detail[0]?.msg) {
      const issues = body.detail.map((item) => ({
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

export async function api(path, { method = 'GET', body, query, signal } = {}) {
  const done = trackRequest()
  try {
    let res
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
    if (res.status === 204) return undefined
    return await res.json()
  } finally {
    done()
  }
}
