import { useSyncExternalStore } from 'react'

export const WAKING_AFTER_MS = 4000

let slowRequests = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Call at request start; call the returned function when the request settles.
export function trackRequest(): () => void {
  let counted = false
  const timer = setTimeout(() => {
    counted = true
    slowRequests += 1
    emit()
  }, WAKING_AFTER_MS)
  return () => {
    clearTimeout(timer)
    if (counted) {
      slowRequests -= 1
      emit()
    }
  }
}

export function useWaking(): boolean {
  return useSyncExternalStore(subscribe, () => slowRequests > 0)
}
