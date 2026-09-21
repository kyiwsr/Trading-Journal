import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WAKING_AFTER_MS, trackRequest, useWaking } from './waking'

describe('waking state', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('stays off for a fast request', () => {
    const { result } = renderHook(() => useWaking())
    const done = trackRequest()
    act(() => vi.advanceTimersByTime(WAKING_AFTER_MS - 1))
    expect(result.current).toBe(false)
    done()
    act(() => vi.advanceTimersByTime(WAKING_AFTER_MS))
    expect(result.current).toBe(false)
  })

  it('turns on for a request slower than the threshold and off when it settles', () => {
    const { result } = renderHook(() => useWaking())
    const done = trackRequest()
    act(() => vi.advanceTimersByTime(WAKING_AFTER_MS + 1))
    expect(result.current).toBe(true)
    act(() => done())
    expect(result.current).toBe(false)
  })

  it('stays on until every slow request has settled', () => {
    const { result } = renderHook(() => useWaking())
    const first = trackRequest()
    const second = trackRequest()
    act(() => vi.advanceTimersByTime(WAKING_AFTER_MS + 1))
    act(() => first())
    expect(result.current).toBe(true)
    act(() => second())
    expect(result.current).toBe(false)
  })
})
