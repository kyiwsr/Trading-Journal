import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useAccounts, useTrade } from '../api/queries'
import {
  Amount,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  ScoreBadge,
  Stat,
  TableScroll,
} from '../components'
import { formatDateTime, formatDuration, formatTime, money, price, priceDecimals, quantity } from '../lib/format'
import { RESULT_LABEL } from '../lib/labels'
import { readScope, scopeSearch } from '../lib/urlState'
import { useScoring } from '../lib/useScoring'

export default function TradeDetail() {
  const { id } = useParams()
  const tradeId = Number(id)
  const [params] = useSearchParams()
  const search = scopeSearch(readScope(params))
  const trade = useTrade(tradeId)
  const accounts = useAccounts()

  if (trade.isPending) return <LoadingState what={`trade #${id}`} />
  if (trade.isError) {
    const missing = trade.error instanceof ApiError && trade.error.status === 404
    return (
      <>
        <ErrorState what={`trade #${id}`} error={trade.error} onRetry={missing ? undefined : () => void trade.refetch()} />
        <p>
          <Link to={{ pathname: '/trades', search }}>Back to the ledger</Link>
        </p>
      </>
    )
  }

  const data = trade.data
  const account = accounts.data?.find((a) => a.id === data.account_id)
  const currency = account?.currency ?? null
  return <TradeView data={data} currency={currency} accountLabel={account ? `${account.name}${account.label ? ` ${account.label}` : ''}` : null} route={account?.route ?? null} search={search} />
}

function TradeView({ data, currency, accountLabel, route, search }) {
  const decimals = priceDecimals(data.instrument.tick_size)
  const result = Number(data.net_pnl) > 0 ? 'win' : Number(data.net_pnl) < 0 ? 'loss' : 'breakeven'
  const side = data.direction === 'long' ? 'Long' : 'Short'

  return (
    <>
      <div className="page-head">
        <div>
          <p className="crumbs">
            <Link to={{ pathname: '/trades', search }}>Combat Logs</Link> / Trade #{data.id}
          </p>
          <h1 className="page-title">
            {data.instrument.symbol} {side}
          </h1>
        </div>
        <div className="pager-pages">
          <TradeLink id={data.prev_trade_id} search={search} label="Older trade" />
          <TradeLink id={data.next_trade_id} search={search} label="Newer trade" />
          <Link className="btn btn-primary" to={{ pathname: `/trades/${data.id}/edit`, search }}>
            Edit trade
          </Link>
        </div>
      </div>

      <Card tone="tint" className="trade-head">
        <p className="trade-meta">
          {data.setup ? (
            <>
              Setup <strong>{data.setup.name}</strong>
              {data.setup.subtitle ? ` (${data.setup.subtitle})` : ''}
            </>
          ) : (
            'No setup'
          )}
          {data.session ? ` · ${data.session}` : ''}
          {accountLabel ? ` · ${accountLabel}` : ''}
          {route ? ` · ${route}` : ''}
          {` · ${formatDateTime(data.closed_at)}`}
        </p>
        {data.tags.length > 0 ? (
          <ul className="chip-list" aria-label="Tags">
            {data.tags.map((tag) => (
              <li key={tag}>
                <Badge>{tag}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="strip">
          <Stat
            featured
            label="Net P&L"
            value={<Amount value={data.net_pnl} currency={currency} />}
            detail={<Badge tone={result === 'win' ? 'win' : result === 'loss' ? 'loss' : 'neutral'}>{RESULT_LABEL[result]}</Badge>}
          />
          <Stat label="R multiple" value={<Amount value={data.r_multiple} kind="r" />} hint={data.r_multiple === null ? 'No stop was recorded.' : undefined} />
          <Stat label="Checklist score" value={<ScoreBadge score={data.execution_score} band={data.score_band} />} />
          <Stat label="Held" value={formatDuration(data.opened_at, data.closed_at)} />
        </div>
      </Card>

      <div className="detail-grid">
        <div className="detail-main">
          <OverviewPanel data={data} currency={currency} decimals={decimals} />
          <LedgerPanel data={data} currency={currency} decimals={decimals} />
          <FeesPanel data={data} currency={currency} />
          <NotesPanel data={data} />
        </div>
        <div className="detail-side">
          <ScreenshotPanel data={data} />
          <ChecklistPanel data={data} />
        </div>
      </div>
    </>
  )
}

function TradeLink({ id, search, label }) {
  if (id === null) return <Button disabled>{label}</Button>
  return (
    <Link className="btn" to={{ pathname: `/trades/${id}`, search }}>
      {label}
    </Link>
  )
}

function Fact({ label, children }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function OverviewPanel({ data, currency, decimals }) {
  const entry = Number(data.avg_entry)
  const stopDistance = data.stop_price === null ? null : Math.abs(entry - Number(data.stop_price))
  const targetDistance = data.target_price === null ? null : Math.abs(Number(data.target_price) - entry)
  const plannedR = stopDistance && targetDistance ? targetDistance / stopDistance : null

  return (
    <Panel title="Overview and risk">
      <dl className="facts facts-grid">
        <Fact label="Opened">
          <span className="mono">{formatTime(data.opened_at)}</span>
        </Fact>
        <Fact label="Closed">
          <span className="mono">{formatTime(data.closed_at)}</span>
        </Fact>
        <Fact label="Risk (1R)">
          {data.risk_amount === null ? (
            'No stop recorded'
          ) : (
            <>
              <span className="mono">{money(data.risk_amount, { currency })}</span>
              <span className="cell-sub mono">
                {price(stopDistance, decimals)} pts to stop, stop {price(data.stop_price, decimals)}
              </span>
            </>
          )}
        </Fact>
        <Fact label="Target">
          {data.target_price === null ? (
            'No target recorded'
          ) : (
            <>
              <span className="mono">{price(data.target_price, decimals)}</span>
              <span className="cell-sub mono">
                {price(targetDistance, decimals)} pts away{plannedR ? `, planned ${plannedR.toFixed(2)}R` : ''}
              </span>
            </>
          )}
        </Fact>
        <Fact label="Result">
          <Amount value={data.net_pnl} currency={currency} /> <Amount value={data.r_multiple} kind="r" />
        </Fact>
      </dl>
    </Panel>
  )
}

function stageLabel(fill, fills) {
  const sameType = fills.filter((f) => f.fill_type === fill.fill_type)
  const position = sameType.indexOf(fill) + 1
  if (fill.fill_type === 'entry') return position === 1 ? 'Entry' : 'Scale-in'
  return sameType.length === 1 ? 'Exit' : `Exit ${position}`
}

function LedgerPanel({ data, currency, decimals }) {
  const buyEntry = data.direction === 'long'
  return (
    <Panel
      title="Execution ledger"
      note={
        <span className="mono">
          Average entry {price(data.avg_entry, decimals)}, size {quantity(data.quantity)}, tick value {money(data.instrument.tick_value, { currency })} per tick
        </span>
      }
    >
      <TableScroll label="Execution ledger table">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Stage</th>
              <th scope="col">Time</th>
              <th scope="col">Action</th>
              <th scope="col" className="num">
                Price
              </th>
              <th scope="col" className="num">
                Pts
              </th>
              <th scope="col" className="num">
                P&amp;L
              </th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {data.fills.map((fill) => {
              const buying = (fill.fill_type === 'entry') === buyEntry
              return (
                <tr key={fill.id}>
                  <th scope="row" className="row-head">
                    {stageLabel(fill, data.fills)}
                  </th>
                  <td className="mono">{formatTime(fill.filled_at)}</td>
                  <td className="mono">
                    {buying ? 'BUY' : 'SELL'} {quantity(fill.quantity)}
                  </td>
                  <td className="num mono">{price(fill.price, decimals)}</td>
                  <td className="num">{fill.realized_points === null ? '' : <Amount value={fill.realized_points} kind="points" />}</td>
                  <td className="num">{fill.realized_pnl === null ? '' : <Amount value={fill.realized_pnl} currency={currency} />}</td>
                  <td>{fill.note ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableScroll>
      <dl className="facts facts-grid">
        <Fact label="Gross P&L">
          <Amount value={data.gross_pnl} currency={currency} />
        </Fact>
        <Fact label="Average exit">
          <span className="mono">{price(data.avg_exit, decimals)}</span>
        </Fact>
        <Fact label="Average gain">
          <Amount value={data.points} kind="points" /> <span className="mono">pts</span>
        </Fact>
      </dl>
    </Panel>
  )
}

function FeesPanel({ data, currency }) {
  const neg = (value) => -Math.abs(Number(value))
  return (
    <Panel title="Fees and slippage" note={data.fee_profile_name ? `Tariff: ${data.fee_profile_name}` : undefined}>
      <dl className="facts facts-rows">
        {data.fees.map((fee) => (
          <Fact key={fee.name} label={fee.name}>
            <Amount value={neg(fee.amount)} currency={currency} />
          </Fact>
        ))}
        <Fact label="Slippage estimate">
          <Amount value={neg(data.slippage_cost)} currency={currency} />{' '}
          <span className="muted mono">
            {quantity(data.slippage_ticks)} {Number(data.slippage_ticks) === 1 ? 'tick' : 'ticks'}
          </span>
        </Fact>
        <Fact label="Total fees">
          <Amount value={neg(data.fees_total)} currency={currency} />
        </Fact>
        <Fact label="Gross P&L">
          <Amount value={data.gross_pnl} currency={currency} />
        </Fact>
        <Fact label="Net P&L">
          <strong>
            <Amount value={data.net_pnl} currency={currency} />
          </strong>
        </Fact>
      </dl>
    </Panel>
  )
}

function NotesPanel({ data }) {
  const blocks = [
    { label: 'Pre-trade focus', text: data.pre_trade_focus },
    { label: 'Environment', text: data.environment },
    { label: 'Post-trade debrief', text: data.debrief_notes },
  ]
  return (
    <Panel title="Mindset and notes">
      <div className="notes">
        {blocks.map((block) => (
          <section key={block.label}>
            <h3 className="note-label">{block.label}</h3>
            {block.text ? <p className="note-text">{block.text}</p> : <p className="muted">Not recorded.</p>}
          </section>
        ))}
      </div>
    </Panel>
  )
}

function ScreenshotPanel({ data }) {
  const [failed, setFailed] = useState(false)
  return (
    <Panel title="Chart screenshot">
      {data.screenshot_url && !failed ? (
        <img
          className="screenshot"
          src={data.screenshot_url}
          alt={`Chart screenshot for trade #${data.id}, ${data.instrument.symbol} ${data.direction}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <EmptyState title={failed ? 'The screenshot could not be loaded' : 'No screenshot attached'}>
          <p>{failed ? 'The link may have expired. Reload the page to get a new one.' : 'Attach one when you log or edit a trade.'}</p>
        </EmptyState>
      )}
    </Panel>
  )
}

function ChecklistRow({ item }) {
  const pts = quantity(item.weight)
  return (
    <li className={`check ${item.checked ? 'check-ok' : 'check-miss'}`}>
      <div className="check-body">
        <span className="check-label">{item.label}</span>
        {item.note ? <span className="check-note">{item.note}</span> : null}
      </div>
      <span className="mono check-pts">{item.checked ? `+${pts} pts` : `Missed -${pts} pts`}</span>
    </li>
  )
}

function ChecklistPanel({ data }) {
  const { cutoff } = useScoring()
  const total = data.criteria.reduce((sum, item) => sum + Number(item.weight), 0)
  const earned = data.criteria.filter((item) => item.checked).reduce((sum, item) => sum + Number(item.weight), 0)
  const formula = data.criteria.filter((item) => item.checked).map((item) => quantity(item.weight)).join(' + ')

  return (
    <Panel
      title="Checklist"
      tone={data.score_band === 'rule_breach' ? 'penalty' : 'default'}
      note={data.setup ? `Protocol: ${data.setup.name}${data.setup.subtitle ? ` (${data.setup.subtitle})` : ''}` : undefined}
    >
      {data.criteria.length === 0 ? (
        <EmptyState title="No checklist for this trade">
          <p>{data.setup ? 'This setup has no criteria yet.' : 'The trade was logged without a setup.'}</p>
        </EmptyState>
      ) : (
        <>
          <div className="score-line">
            <ScoreBadge score={data.execution_score} band={data.score_band} />
            <span className="mono">
              {formula || '0'} = {quantity(earned)} of {quantity(total)} points
            </span>
          </div>
          <ol className="checklist">
            {data.criteria.map((item) => (
              <ChecklistRow key={item.criterion_id} item={item} />
            ))}
          </ol>
          <p className="stat-hint">
            {data.compliant ? 'Compliant' : 'Below the compliance cutoff'}: {cutoff}% or higher is compliant.
            {data.xp_points ? ` +${data.xp_points} XP earned for this checklist.` : ''}
          </p>
        </>
      )}
    </Panel>
  )
}
