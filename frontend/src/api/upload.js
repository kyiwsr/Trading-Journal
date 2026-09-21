import { api, ApiError } from './client'
import type { UploadTicket } from './types'

export const SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp']
// Mirrors upload_max_bytes in backend/app/config.py.
export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024

export function screenshotProblem(file: File): string | null {
  if (!SCREENSHOT_TYPES.includes(file.type)) return 'Use a PNG, JPEG or WebP image.'
  if (file.size > SCREENSHOT_MAX_BYTES) return 'The image is over 5 MB. Export a smaller one.'
  return null
}

// Two steps: ask the API for a signed link, then send the file straight to storage.
export async function uploadScreenshot(file: File): Promise<string> {
  const ticket = await api<UploadTicket>('/uploads/screenshot', {
    method: 'POST',
    body: { content_type: file.type, size_bytes: file.size },
  })

  // Supabase signed uploads take the file as a multipart field with an empty name.
  const body = new FormData()
  body.append('cacheControl', '3600')
  body.append('', file)

  let response: Response
  try {
    response = await fetch(ticket.upload_url, { method: 'PUT', body })
  } catch {
    throw new ApiError(0, 'Could not reach screenshot storage. Check your connection and try again.')
  }
  if (!response.ok) throw new ApiError(response.status, `Screenshot storage refused the upload (status ${response.status}).`)
  return ticket.path
}
