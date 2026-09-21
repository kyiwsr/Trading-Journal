import { useSyncExternalStore } from 'react'

export const WAKING_AFTER_MS = 4000

let slowRequests = 0
const listeners = new Set()

function emit() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Call at request start; call the returned function when the request settles.
export function trackRequest() {
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

export function useWaking() {
  return useSyncExternalStore(subscribe, () => slowRequests > 0)
}
