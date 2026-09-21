import { describe, expect, it } from 'vitest'

import { pageWindow, rangeLabel } from './pagination'

describe('pageWindow', () => {
  it('lists every page when there are few', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3])
  })
  it('collapses distant pages into gaps around the current page', () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, 'gap', 10])
    expect(pageWindow(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10])
    expect(pageWindow(10, 10)).toEqual([1, 'gap', 9, 10])
  })
  it('does not put a gap where only one page is hidden', () => {
    expect(pageWindow(3, 6)).toEqual([1, 2, 3, 4, 5, 6])
  })
  it('returns a single page for an empty ledger', () => {
    expect(pageWindow(1, 0)).toEqual([1])
  })
})

describe('rangeLabel', () => {
  it('describes the rows on the current page', () => {
    expect(rangeLabel(1, 50, 88)).toBe('1 to 50 of 88')
    expect(rangeLabel(2, 50, 88)).toBe('51 to 88 of 88')
  })
  it('handles an empty result', () => {
    expect(rangeLabel(1, 50, 0)).toBe('0 of 0')
  })
})
