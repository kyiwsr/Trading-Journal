import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { buildUrl } from '../api/client'
import { useAccounts, useDashboard } from '../api/queries'
import type { Dashboard as DashboardData, DisciplineBucket, SetupRank, SetupRow, TradeListItem } from '../api/types'
import {
  Amount,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  SortHeader,
  Stat,
  TableScroll,
} from '../components'
import { DrawdownStrip } from '../components/charts/DrawdownStrip'
import { EquityChart } from '../components/charts/EquityChart'
import { formatDateTime, money, number, percent, ratio, rMultiple } from '../lib/format'
import { RANK_LABEL, SCORE_BANDS } from '../lib/labels'
import { readScope, scopeSearch, type Scope } from '../lib/urlState'

const RANGE_PHRASE = { '30D': 'the last 30 days', '90D': 'the last 90 days', YTD: 'this year', ALL: 'all time' } as const
const RANK_TONE: Record<SetupRank, 'win' | 'solid' | 'loss'> = { elite: 'win', solid: 'solid', negative_edge: 'loss' }

export default function Dashboard() {
  const [params] = useSearchParams()
  const scope = readScope(params)
  const dashboard = useDashboard(scope.account, scope.range)
  const accounts = useAccounts()
  const accountName =
    scope.account === 'all' ? 'all accounts' : (accounts.data?.find((a) => String(a.id) === scope.account)?.name ?? 'this account')

  if (dashboard.isPending) return <LoadingState what={`the dashboard for ${accountName}, ${RANGE_PHRASE[scope.range]}`} />
  if (dashboard.isError) {
    return <ErrorState what="the dashboard" error={dashboard.error} onRetry={() => void dashboard.refetch()} />
  }

  const data = dashboard.data
  if (data.summary.trade_count === 0) return <EmptyDashboard scope={scope} accountName={accountName} />

  return <DashboardView data={data} scope={scope} accountName={accountName} />
}

function EmptyDashboard({ scope, accountName }: { scope: Scope; accountName: string }) {
  const filtered = scope.range !== 'ALL' || scope.account !== 'all'
  return (
    <>
      <h1 className="page-title">Command HQ</h1>
      <Panel title="No trades yet">
        <EmptyState title={filtered ? `No trades for ${accountName} in ${RANGE_PHRASE[scope.range]}` : 'Nothing logged yet'}>
          <p>
            {filtered
              ? 'Pick a wider date range or another account in the header.'
              : 'Once you log a trade, the equity curve, discipline stats and setup table fill in here.'}
          </p>
          <p>
            <Link className="btn btn-primary" to={{ pathname: '/trades/new', search: scopeSearch(scope) }}>
              + Log Trade
            </Link>
          </p>
        </EmptyState>
      </Panel>
    </>
  )
}

function DashboardView({ data, scope, accountName }: { data: DashboardData; scope: Scope; accountName: string }) {
  const { summary, equity, discipline } = data
  const currency = data.currency
  const search = scopeSearch(scope)
  const csvHref = buildUrl('/trades/export.csv', { account: scope.account, range: scope.range })
  const drawdown = -Math.abs(Number(equity.drawdown_pct))

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Command HQ</h1>
          <p className="page-sub">
            {number(summary.trade_count)} trades in {RANGE_PHRASE[scope.range]} for {accountName}
          </p>
        </div>
        <a className="btn" href={csvHref} download>
          Export CSV
        </a>
      </div>

      <div className="dash-hero">
        <DisciplinePanel buckets={discipline.buckets} saved={discipline.saved_capital} currency={currency} total={summary.trade_count} />
        <Panel title="Net P&L" tone="tint" className="dash-pnl">
          <Stat
            featured
            label="After fees"
            value={<Amount value={summary.net_pnl} currency={currency} />}
            detail={
              summary.return_pct !== null ? (
                <>
                  {percent(summary.return_pct, 2, true)} on {money(data.starting_balance, { currency })}
                </>
              ) : null
            }
          />
          <dl className="facts">
            <div>
              <dt>Gross</dt>
              <dd className="mono">
                <Amount value={summary.gross_pnl} currency={currency} />
              </dd>
            </div>
            <div>
              <dt>Fees</dt>
              <dd className="mono">
                <Amount value={-Math.abs(Number(summary.fees_total))} currency={currency} />
              </dd>
            </div>
            <div className="fact-wide">
              <dt>Profit factor</dt>
              <dd className="mono">
                {ratio(summary.profit_factor)}
                <span className="cell-sub">Profits divided by losses, after fees</span>
              </dd>
            </div>
          </dl>
        </Panel>
      </div>

      <div className="dash-kpis">
        <Kpi
          label="Win rate"
          value={percent(summary.win_rate)}
          detail={`${summary.wins}W / ${summary.losses}L${summary.breakevens ? ` / ${summary.breakevens}BE` : ''}`}
        />
        <Kpi
          label="Expectancy"
          value={<Amount value={summary.expectancy} kind="r" />}
          detail={`${rMultiple(summary.total_r)} total`}
          hint="Average R per trade."
        />
        <Kpi label="Checklist" value={percent(summary.avg_execution_score)} detail="average execution score" />
        <Kpi
          label="Drawdown"
          value={<span className={`amount amount-${drawdown === 0 ? 'zero' : 'neg'}`}>{percent(drawdown, 2)}</span>}
          detail={`${money(-Math.abs(Number(equity.drawdown_amount)), { currency })} off peak`}
          hint={`Worst ${percent(-Math.abs(Number(equity.max_drawdown_pct)), 2)}`}
        />
      </div>

      <div className="dash-mid">
        <Panel
          title="Equity curve"
          note={
            <>
              Current <span className="mono">{money(equity.current, { currency })}</span>
            </>
          }
          actions={<ChartLegend />}
          className="dash-equity"
        >
          <EquityChart equity={equity} currency={currency} />
          <h3 className="strip-title">Drawdown below peak</h3>
          <DrawdownStrip equity={equity} />
          <EquityTable equity={equity} currency={currency} />
        </Panel>

        <Panel
          title="Recent trades"
          className="dash-recent"
          actions={
            <Link to={{ pathname: '/trades', search }}>View all {number(summary.trade_count)}</Link>
          }
        >
          <ul className="recent">
            {data.recent_trades.map((trade) => (
              <RecentTrade key={trade.id} trade={trade} currency={currency} search={search} />
            ))}
          </ul>
        </Panel>
      </div>

      <SetupsTable rows={data.setups} currency={currency} />
    </>
  )
}

function Kpi({ label, value, detail, hint }: { label: string; value: ReactNode; detail?: string; hint?: string }) {
  return (
    <Card className="kpi">
      <Stat label={label} value={value} detail={detail} hint={hint} />
    </Card>
  )
}

function DisciplinePanel({ buckets, saved, currency, total }: { buckets: DisciplineBucket[]; saved: string; currency: string | null; total: number }) {
  const byBand = new Map(buckets.map((bucket) => [bucket.band, bucket]))
  const savedAmount = Number(saved)
  return (
    <Panel title="Discipline vs win rate" note={`${number(total)} trades, grouped by checklist score`} className="dash-discipline">
      <ul className="discipline">
        {SCORE_BANDS.map(({ band, label, range }) => {
          const bucket = byBand.get(band)
          const rate = bucket?.win_rate ?? null
          return (
            <li key={band} className="discipline-row">
              <div className="discipline-head">
                <span className="discipline-band">
                  {label} <span className="muted">{range}</span>
                </span>
                {bucket && bucket.trade_count > 0 ? (
                  <span className="mono discipline-meta">
                    {number(bucket.trade_count)} trades · {percent(rate)} win rate · <Amount value={bucket.net_pnl} /> · avg{' '}
                    <Amount value={bucket.avg_r} kind="r" />
                  </span>
                ) : (
                  <span className="muted">No trades in this band</span>
                )}
              </div>
              <div className="meter" role="img" aria-label={`${label} band win rate ${percent(rate)}`}>
                <div className={`meter-fill meter-${band}`} style={{ width: `${rate ?? 0}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="saved">
        {savedAmount > 0 ? (
          <>
            <strong>Saved capital</strong> <span className="mono amount amount-pos">{money(saved, { currency, signed: true })}</span>. Losses you
            would have avoided by skipping rule-breach trades.
          </>
        ) : (
          <>No net loss in rule-breach trades, so nothing to save.</>
        )}
      </p>
    </Panel>
  )
}

function ChartLegend() {
  return (
    <ul className="legend" aria-label="Chart key">
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="5" fill="#008a4b" />
        </svg>
        Win
      </li>
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <rect x="3" y="3" width="8" height="8" fill="#a30000" transform="rotate(45 7 7)" />
        </svg>
        Loss
      </li>
      <li>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <rect x="3" y="3" width="8" height="8" fill="#004777" />
        </svg>
        Breakeven
      </li>
    </ul>
  )
}

function EquityTable({ equity, currency }: { equity: DashboardData['equity']; currency: string | null }) {
  return (
    <details className="chart-data">
      <summary>Show equity data as a table</summary>
      <div className="table-scroll table-short" role="region" aria-label="Equity data" tabIndex={0}>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Trade</th>
              <th scope="col">Closed</th>
              <th scope="col">Result</th>
              <th scope="col" className="num">
                Net P&amp;L
              </th>
              <th scope="col" className="num">
                Equity
              </th>
            </tr>
          </thead>
          <tbody>
            {equity.points.map((point) => (
              <tr key={point.trade_id}>
                <td className="mono">#{point.trade_id}</td>
                <td>{formatDateTime(point.closed_at)}</td>
                <td>{point.result}</td>
                <td className="num">
                  <Amount value={point.net_pnl} currency={currency} />
                </td>
                <td className="num mono">{money(point.equity, { currency })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function RecentTrade({ trade, currency, search }: { trade: TradeListItem; currency: string | null; search: string }) {
  return (
    <li className="recent-item">
      <Link to={{ pathname: `/trades/${trade.id}`, search }} className="recent-link">
        <span className="recent-top">
          <Badge tone={trade.direction === 'long' ? 'solid' : 'neutral'}>{trade.direction}</Badge>
          <span className="mono recent-symbol">{trade.symbol}</span>
          <span className="muted recent-time">{formatDateTime(trade.closed_at)}</span>
        </span>
        <span className="recent-bottom">
          <span className="recent-setup">
            {trade.setup?.name ?? 'No setup'}
            {trade.execution_score !== null ? <span className="mono muted"> · {trade.execution_score}% checklist</span> : null}
          </span>
          <span className="recent-figures">
            <Amount value={trade.net_pnl} currency={currency} /> <Amount value={trade.r_multiple} kind="r" />
          </span>
        </span>
      </Link>
    </li>
  )
}

type SortKey = 'name' | 'trade_count' | 'win_rate' | 'net_pnl' | 'expectancy' | 'avg_execution_score' | 'rank'
const RANK_ORDER: Record<SetupRank, number> = { elite: 0, solid: 1, negative_edge: 2 }

function sortValue(row: SetupRow, key: SortKey): number | string {
  if (key === 'name') return (row.name ?? '').toLowerCase()
  if (key === 'rank') return RANK_ORDER[row.rank]
  const raw = row[key]
  return raw === null ? Number.NEGATIVE_INFINITY : Number(raw)
}

function SetupsTable({ rows, currency }: { rows: SetupRow[]; currency: string | null }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'trade_count', direction: 'desc' })
  const sorted = useMemo(() => {
    const factor = sort.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = sortValue(a, sort.key)
      const y = sortValue(b, sort.key)
      return (x < y ? -1 : x > y ? 1 : 0) * factor
    })
  }, [rows, sort])
  const toggle = (key: SortKey) =>
    setSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }))
  const header = (key: SortKey, label: string, numeric = true) => (
    <SortHeader label={label} numeric={numeric} active={sort.key === key} direction={sort.direction} onSort={() => toggle(key)} />
  )

  return (
    <Panel
      title="Setups playbook"
      note={`${rows.length} ${rows.length === 1 ? 'setup' : 'setups'} with trades in this view. Select a column header to sort.`}
      className="dash-setups"
    >
      {rows.length === 0 ? (
        <EmptyState title="No trades are tagged with a setup in this view">
          <p>Trades logged without a setup are counted above but do not appear in this table.</p>
        </EmptyState>
      ) : (
        <TableScroll label="Setups playbook table">
          <table className="data-table">
            <thead>
              <tr>
                {header('name', 'Setup', false)}
                {header('trade_count', 'Trades')}
                {header('win_rate', 'Win rate')}
                {header('net_pnl', 'Net P&L')}
                {header('expectancy', 'Expectancy')}
                {header('avg_execution_score', 'Checklist')}
                {header('rank', 'Rank', false)}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.setup_id}>
                  <th scope="row" className="row-head">
                    {row.name ?? 'Unnamed setup'}
                    {row.low_sample ? (
                      <>
                        {' '}
                        <Badge tone="sub">Low sample</Badge>
                      </>
                    ) : null}
                  </th>
                  <td className="num mono">{number(row.trade_count)}</td>
                  <td className="num mono">{percent(row.win_rate)}</td>
                  <td className="num">
                    <Amount value={row.net_pnl} currency={currency} />
                  </td>
                  <td className="num">
                    <Amount value={row.expectancy} kind="r" />
                  </td>
                  <td className="num mono">{percent(row.avg_execution_score)}</td>
                  <td>
                    <Badge tone={RANK_TONE[row.rank]}>{RANK_LABEL[row.rank]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Panel>
  )
}
