import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { buildUrl } from '../api/client'
import { useAccounts, useSetups, useTrades } from '../api/queries'
import {
  Amount,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Panel,
  ScoreBadge,
  Segmented,
  SortHeader,
  Stat,
  TableScroll,
} from '../components'
import { scopeCurrency } from '../lib/currency'
import { formatDateTime, formatSeconds, money, number, percent, quantity, ratio } from '../lib/format'
import { RESULT_LABEL } from '../lib/labels'
import { pageWindow, rangeLabel } from '../lib/pagination'
import {
  PAGE_SIZES,
  activeFilters,
  patchParams,
  readLedger,
  readScope,
  scopeSearch,
  tradesQuery,
} from '../lib/urlState'
import { useScoring } from '../lib/useScoring'

const SIDE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
]
const RESULT_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'win', label: 'Wins' },
  { value: 'loss', label: 'Losses' },
  { value: 'breakeven', label: 'Breakeven' },
]
const RANGE_PHRASE = { '30D': 'last 30 days', '90D': 'last 90 days', YTD: 'this year', ALL: 'all time' }

export default function TradeLog() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const scope = readScope(params)
  const ledger = readLedger(params)
  const query = tradesQuery(scope, ledger)
  const trades = useTrades(query)
  const setups = useSetups()
  const accounts = useAccounts()
  const search = scopeSearch(scope)
  const chips = activeFilters(scope, ledger)
  const { bands } = useScoring()

  // The box owns what is typed; the URL only overwrites it when the change did not come from the box.
  const [searchText, setSearchText] = useState(ledger.q)
  const [committed, setCommitted] = useState(ledger.q)
  const [seenQuery, setSeenQuery] = useState(ledger.q)
  if (seenQuery !== ledger.q) {
    setSeenQuery(ledger.q)
    if (ledger.q !== committed) {
      setSearchText(ledger.q)
      setCommitted(ledger.q)
    }
  }
  useEffect(() => {
    const typed = searchText.trim()
    if (typed === committed) return
    const timer = setTimeout(() => {
      setCommitted(typed)
      setParams(patchParams(params, { q: typed }))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText, committed, params, setParams])

  const patch = (change) => setParams(patchParams(params, change))
  const sortBy = (field) =>
    patch({ sort_by: field, order: ledger.sort_by === field && ledger.order === 'desc' ? 'asc' : 'desc' })

  const chipLabel = (key, value) => {
    if (key === 'account') return `Account: ${accounts.data?.find((a) => String(a.id) === value)?.name ?? value}`
    if (key === 'range') return `Range: ${RANGE_PHRASE[scope.range]}`
    if (key === 'setup') return `Setup: ${setups.data?.find((s) => String(s.id) === value)?.name ?? value}`
    if (key === 'side') return `Side: ${value}`
    if (key === 'result') return `Result: ${RESULT_LABEL[value]}`
    return `Search: ${value}`
  }

  const csvQuery = { ...query, page: undefined, page_size: undefined }
  const total = trades.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / ledger.page_size))
  const currency = scopeCurrency(accounts.data, scope.account)
  const totals = trades.data?.summary

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Combat Logs</h1>
          <p className="page-sub">
            {trades.data ? `${number(total)} ${total === 1 ? 'trade' : 'trades'} match the filters` : 'Trade ledger'}
          </p>
        </div>
        <div className="page-actions">
          <a className="btn" href={buildUrl('/trades/export.csv', csvQuery)} download>
            Export CSV
          </a>
        </div>
      </div>

      {totals && totals.trades > 0 ? (
        <Card tone="tint" className="strip" aria-label="Summary of the trades matching the filters">
          <Stat
            label="Net P&L"
            value={<Amount value={totals.net_pnl} currency={currency} />}
            detail={`Fees ${money(-Math.abs(Number(totals.fees_total)), { currency })}`}
          />
          <Stat label="Win rate" value={percent(totals.win_rate)} detail={`${totals.wins} wins, ${totals.losses} losses`} />
          <Stat
            label="Profit factor"
            value={ratio(totals.profit_factor)}
            hint="Profits divided by losses, after fees"
          />
          <Stat
            label="Checklist adherence"
            value={percent(totals.avg_score)}
            detail={`${totals.elite_count} of ${totals.scored_count} scored at ${bands.elite_min}% or higher`}
          />
          <Stat
            label="Average hold"
            value={totals.avg_hold_seconds === null ? 'n/a' : formatSeconds(totals.avg_hold_seconds)}
          />
        </Card>
      ) : null}

      <Panel title="Filters" className="filters">
        <div className="filter-row">
          <label className="field">
            <span className="field-label">Setup</span>
            <select
              className="input select"
              value={ledger.setup === null ? '' : String(ledger.setup)}
              onChange={(event) => patch({ setup: event.target.value || null })}
            >
              <option value="">All setups</option>
              {setups.data?.map((setup) => (
                <option key={setup.id} value={String(setup.id)}>
                  {setup.name}
                  {setup.archived_at ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span className="field-label">Side</span>
            <Segmented
              label="Side"
              options={SIDE_OPTIONS}
              value={ledger.side ?? 'all'}
              onChange={(value) => patch({ side: value === 'all' ? null : value })}
            />
          </div>
          <div className="field">
            <span className="field-label">Result</span>
            <Segmented
              label="Result"
              options={RESULT_OPTIONS}
              value={ledger.result ?? 'all'}
              onChange={(value) => patch({ result: value === 'all' ? null : value })}
            />
          </div>
          <label className="field field-grow">
            <span className="field-label">Search</span>
            <Input
              type="search"
              placeholder="Symbol, setup, tag or note"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>
        </div>
        {chips.length > 0 ? (
          <div className="chips" aria-label="Active filters">
            <ul className="chip-list">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <button
                    type="button"
                    className="chip"
                    aria-label={`Remove filter ${chipLabel(chip.key, chip.value)}`}
                    onClick={() => patch({ [chip.key]: null })}
                  >
                    {chipLabel(chip.key, chip.value)} <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button onClick={() => navigate({ search: '' })}>Clear filters</Button>
          </div>
        ) : null}
      </Panel>

      {trades.isPending ? (
        <LoadingState what="the trade ledger" />
      ) : trades.isError ? (
        <ErrorState what="the trade ledger" error={trades.error} onRetry={() => void trades.refetch()} />
      ) : trades.data.items.length === 0 ? (
        <Panel title="Ledger" data-tour="trade-log">
          <EmptyState title={chips.length > 0 ? 'No trades match these filters' : 'No trades logged yet'}>
            {chips.length > 0 ? (
              <p>Remove a filter above, or clear them all.</p>
            ) : (
              <p>
                Trades you log appear here, newest first.{' '}
                <Link to={{ pathname: '/trades/new', search: scopeSearch(scope) }}>Log your first trade</Link>.
              </p>
            )}
          </EmptyState>
        </Panel>
      ) : (
        <Panel title="Ledger" className="ledger" aria-busy={trades.isPlaceholderData} data-tour="trade-log">
          <TableScroll label="Trade ledger table">
            <table className="data-table ledger-table">
              <thead>
                <tr>
                  <SortHeader label="Closed" active={ledger.sort_by === 'closed_at'} direction={ledger.order} onSort={() => sortBy('closed_at')} />
                  <th scope="col">Instrument</th>
                  <th scope="col">Side</th>
                  <th scope="col">Setup</th>
                  <th scope="col">Fills</th>
                  <th scope="col" className="num">
                    Gross / fees
                  </th>
                  <SortHeader numeric label="Net P&L" active={ledger.sort_by === 'net_pnl'} direction={ledger.order} onSort={() => sortBy('net_pnl')} />
                  <th scope="col">Result</th>
                  <SortHeader numeric label="R" active={ledger.sort_by === 'r_multiple'} direction={ledger.order} onSort={() => sortBy('r_multiple')} />
                  <SortHeader label="Checklist" active={ledger.sort_by === 'execution_score'} direction={ledger.order} onSort={() => sortBy('execution_score')} />
                </tr>
              </thead>
              <tbody>
                {trades.data.items.map((trade) => (
                  <LedgerRow key={trade.id} trade={trade} currency={currency} search={search} />
                ))}
              </tbody>
            </table>
          </TableScroll>

          <div className="pager">
            <p className="pager-count">Trades {rangeLabel(ledger.page, ledger.page_size, total)}</p>
            <label className="pager-size">
              <span>Per page</span>
              <select
                className="input select"
                value={ledger.page_size}
                onChange={(event) => patch({ page_size: Number(event.target.value) })}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <nav className="pager-pages" aria-label="Ledger pages">
              <Button disabled={ledger.page <= 1} onClick={() => patch({ page: ledger.page - 1 })}>
                Previous
              </Button>
              {pageWindow(ledger.page, totalPages).map((item, index) =>
                item === 'gap' ? (
                  <span key={`gap-${index}`} className="pager-gap" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className="btn pager-page"
                    aria-label={`Page ${item}`}
                    aria-current={item === ledger.page ? 'page' : undefined}
                    onClick={() => patch({ page: item })}
                  >
                    {item}
                  </button>
                ),
              )}
              <Button disabled={ledger.page >= totalPages} onClick={() => patch({ page: ledger.page + 1 })}>
                Next
              </Button>
            </nav>
          </div>
        </Panel>
      )}
    </>
  )
}

function LedgerRow({ trade, currency, search }) {
  return (
    <tr>
      <th scope="row" className="row-head">
        <Link to={{ pathname: `/trades/${trade.id}`, search }} className="row-link">
          <span className="mono">{formatDateTime(trade.closed_at)}</span>
        </Link>
        {trade.session ? <span className="cell-sub">{trade.session}</span> : null}
      </th>
      <td>
        <span className="mono">{trade.symbol}</span>
        {trade.instrument_name ? <span className="cell-sub">{trade.instrument_name}</span> : null}
      </td>
      <td>
        <Badge tone={trade.direction === 'long' ? 'solid' : 'neutral'}>{trade.direction}</Badge>
      </td>
      <td>
        {trade.setup?.name ?? <span className="muted">No setup</span>}
        {trade.setup?.subtitle ? <span className="cell-sub">{trade.setup.subtitle}</span> : null}
      </td>
      <td>
        <span className="mono">
          {trade.entry_fills} {trade.entry_fills === 1 ? 'entry' : 'entries'} / {trade.exit_fills} {trade.exit_fills === 1 ? 'exit' : 'exits'}, size {quantity(trade.quantity)}
        </span>
      </td>
      <td className="num">
        <Amount value={trade.gross_pnl} currency={currency} />
        <span className="cell-sub mono">{money(-Math.abs(Number(trade.fees_total)), { currency })}</span>
      </td>
      <td className="num">
        <Amount value={trade.net_pnl} currency={currency} />
      </td>
      <td>
        <Badge tone={trade.result === 'win' ? 'win' : trade.result === 'loss' ? 'loss' : 'neutral'}>{RESULT_LABEL[trade.result]}</Badge>
      </td>
      <td className="num">
        <Amount value={trade.r_multiple} kind="r" />
      </td>
      <td>
        <ScoreBadge score={trade.execution_score} band={trade.score_band} />
      </td>
    </tr>
  )
}
