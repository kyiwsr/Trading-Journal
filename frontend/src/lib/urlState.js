import type { Query } from '../api/client'
import type { Direction, Order, RangeName, Result, SortField } from '../api/types'

export const RANGES: RangeName[] = ['30D', '90D', 'YTD', 'ALL']
export const PAGE_SIZES = [25, 50, 100]
const SORT_FIELDS: SortField[] = ['closed_at', 'opened_at', 'net_pnl', 'r_multiple', 'execution_score']

export type Scope = { account: string; range: RangeName }
export const DEFAULT_SCOPE: Scope = { account: 'all', range: 'ALL' }

export type LedgerFilters = {
  setup: number | null
  side: Direction | null
  result: Result | null
  q: string
  sort_by: SortField
  order: Order
  page: number
  page_size: number
}

export const DEFAULT_LEDGER: LedgerFilters = {
  setup: null,
  side: null,
  result: null,
  q: '',
  sort_by: 'closed_at',
  order: 'desc',
  page: 1,
  page_size: 50,
}

const DEFAULTS: Record<string, string> = {
  account: DEFAULT_SCOPE.account,
  range: DEFAULT_SCOPE.range,
  sort_by: DEFAULT_LEDGER.sort_by,
  order: DEFAULT_LEDGER.order,
  page: String(DEFAULT_LEDGER.page),
  page_size: String(DEFAULT_LEDGER.page_size),
}

function positiveInt(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const n = Number(value)
  return n > 0 ? n : null
}

export function readScope(params: URLSearchParams): Scope {
  const account = params.get('account')?.toLowerCase() ?? ''
  const range = params.get('range') as RangeName | null
  return {
    account: account === 'all' || /^\d+$/.test(account) ? account : DEFAULT_SCOPE.account,
    range: range && RANGES.includes(range) ? range : DEFAULT_SCOPE.range,
  }
}

export function scopeSearch(scope: Scope): string {
  const params = new URLSearchParams()
  if (scope.account !== DEFAULT_SCOPE.account) params.set('account', scope.account)
  if (scope.range !== DEFAULT_SCOPE.range) params.set('range', scope.range)
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function readLedger(params: URLSearchParams): LedgerFilters {
  const side = params.get('side')
  const result = params.get('result')
  const sortBy = params.get('sort_by') as SortField | null
  const order = params.get('order')
  const pageSize = positiveInt(params.get('page_size'))
  return {
    setup: positiveInt(params.get('setup')),
    side: side === 'long' || side === 'short' ? side : null,
    result: result === 'win' || result === 'loss' || result === 'breakeven' ? result : null,
    q: params.get('q')?.trim() ?? '',
    sort_by: sortBy && SORT_FIELDS.includes(sortBy) ? sortBy : DEFAULT_LEDGER.sort_by,
    order: order === 'asc' || order === 'desc' ? order : DEFAULT_LEDGER.order,
    page: positiveInt(params.get('page')) ?? DEFAULT_LEDGER.page,
    page_size: pageSize && PAGE_SIZES.includes(pageSize) ? pageSize : DEFAULT_LEDGER.page_size,
  }
}

// Changing anything but the page sends the user back to page 1.
export function patchParams(
  current: URLSearchParams,
  patch: Record<string, string | number | null | undefined>,
): URLSearchParams {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(patch)) {
    const text = value === null || value === undefined ? '' : String(value)
    if (text === '' || text === DEFAULTS[key]) next.delete(key)
    else next.set(key, text)
  }
  if (!('page' in patch)) next.delete('page')
  return next
}

export function tradesQuery(scope: Scope, filters: LedgerFilters): Query {
  const query: Query = {
    account: scope.account,
    range: scope.range,
    sort_by: filters.sort_by,
    order: filters.order,
    page: filters.page,
    page_size: filters.page_size,
  }
  if (filters.setup !== null) query.setup = filters.setup
  if (filters.side) query.side = filters.side
  if (filters.result) query.result = filters.result
  if (filters.q) query.q = filters.q
  return query
}

export type ActiveFilter = { key: 'account' | 'range' | 'setup' | 'side' | 'result' | 'q'; value: string }

export function activeFilters(scope: Scope, filters: LedgerFilters): ActiveFilter[] {
  const chips: ActiveFilter[] = []
  if (scope.account !== DEFAULT_SCOPE.account) chips.push({ key: 'account', value: scope.account })
  if (scope.range !== DEFAULT_SCOPE.range) chips.push({ key: 'range', value: scope.range })
  if (filters.setup !== null) chips.push({ key: 'setup', value: String(filters.setup) })
  if (filters.side) chips.push({ key: 'side', value: filters.side })
  if (filters.result) chips.push({ key: 'result', value: filters.result })
  if (filters.q) chips.push({ key: 'q', value: filters.q })
  return chips
}
