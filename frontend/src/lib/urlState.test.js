import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LEDGER,
  activeFilters,
  patchParams,
  readLedger,
  readScope,
  scopeSearch,
  tradesQuery,
} from './urlState'

const params = (search: string) => new URLSearchParams(search)

describe('readScope', () => {
  it('defaults to all accounts and the full history', () => {
    expect(readScope(params(''))).toEqual({ account: 'all', range: 'ALL' })
  })
  it('accepts a numeric account and a known range', () => {
    expect(readScope(params('account=3&range=YTD'))).toEqual({ account: '3', range: 'YTD' })
  })
  it('falls back on junk values', () => {
    expect(readScope(params('account=abc&range=1Y'))).toEqual({ account: 'all', range: 'ALL' })
  })
  it('treats the account keyword case-insensitively', () => {
    expect(readScope(params('account=ALL')).account).toBe('all')
  })
})

describe('scopeSearch', () => {
  it('omits default values', () => {
    expect(scopeSearch({ account: 'all', range: 'ALL' })).toBe('')
    expect(scopeSearch({ account: '2', range: '30D' })).toBe('?account=2&range=30D')
    expect(scopeSearch({ account: 'all', range: 'YTD' })).toBe('?range=YTD')
  })
})

describe('readLedger', () => {
  it('returns defaults for an empty query string', () => {
    expect(readLedger(params(''))).toEqual(DEFAULT_LEDGER)
  })
  it('parses every filter', () => {
    const ledger = readLedger(
      params('setup=4&side=short&result=loss&q=fomc&sort_by=net_pnl&order=asc&page=3&page_size=100'),
    )
    expect(ledger).toEqual({
      setup: 4,
      side: 'short',
      result: 'loss',
      q: 'fomc',
      sort_by: 'net_pnl',
      order: 'asc',
      page: 3,
      page_size: 100,
    })
  })
  it('ignores invalid values', () => {
    const ledger = readLedger(params('setup=x&side=up&result=maybe&sort_by=bogus&order=up&page=0&page_size=7'))
    expect(ledger).toEqual(DEFAULT_LEDGER)
  })
})

describe('patchParams', () => {
  it('sets a value and resets the page when a filter changes', () => {
    const next = patchParams(params('page=4&side=long'), { result: 'win' })
    expect(next.get('result')).toBe('win')
    expect(next.get('side')).toBe('long')
    expect(next.has('page')).toBe(false)
  })
  it('keeps the page when the page itself changes', () => {
    expect(patchParams(params('side=long'), { page: 2 }).get('page')).toBe('2')
  })
  it('removes a key when set to null, empty, or its default', () => {
    expect(patchParams(params('side=long'), { side: null }).has('side')).toBe(false)
    expect(patchParams(params('q=abc'), { q: '' }).has('q')).toBe(false)
    expect(patchParams(params('page_size=100'), { page_size: 50 }).has('page_size')).toBe(false)
    expect(patchParams(params('range=YTD'), { range: 'ALL' }).has('range')).toBe(false)
  })
})

describe('tradesQuery', () => {
  it('maps scope and filters to API parameters', () => {
    const query = tradesQuery(
      { account: '2', range: 'YTD' },
      { ...DEFAULT_LEDGER, side: 'long', q: 'nq', page: 2 },
    )
    expect(query).toEqual({
      account: '2',
      range: 'YTD',
      side: 'long',
      q: 'nq',
      sort_by: 'closed_at',
      order: 'desc',
      page: 2,
      page_size: 50,
    })
  })
})

describe('activeFilters', () => {
  it('lists only filters that differ from the defaults', () => {
    expect(activeFilters({ account: 'all', range: 'ALL' }, DEFAULT_LEDGER)).toEqual([])
    const chips = activeFilters(
      { account: '2', range: 'YTD' },
      { ...DEFAULT_LEDGER, side: 'short', result: 'loss', setup: 4, q: 'fomc' },
    )
    expect(chips.map((chip) => chip.key)).toEqual(['account', 'range', 'setup', 'side', 'result', 'q'])
  })
})
