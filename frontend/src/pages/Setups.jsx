import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useDashboard, useSetups } from '../api/queries'
import {
  Amount,
  Badge,
  Checkbox,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  TableScroll,
} from '../components'
import { number, percent } from '../lib/format'
import { RANK_LABEL } from '../lib/labels'
import { weightTotal } from '../lib/setupForm'
import { readScope, scopeSearch } from '../lib/urlState'

const RANK_TONE = { elite: 'win', solid: 'solid', negative_edge: 'loss' }

export default function Setups() {
  const [params] = useSearchParams()
  const search = scopeSearch(readScope(params))
  const [showArchived, setShowArchived] = useState(false)
  const setups = useSetups(true)
  // Playbook stats are all-time across every account, whatever range the header is set to.
  const stats = useDashboard('all', 'ALL')

  const newSetup = (
    <Link className="btn btn-primary" to={{ pathname: '/setups/new', search }}>
      New setup
    </Link>
  )

  const head = (
    <div className="page-head">
      <div>
        <h1 className="page-title">Skill Playbook</h1>
        <p className="page-sub">The setups you trade, and how closely you follow each one's checklist.</p>
      </div>
      {newSetup}
    </div>
  )

  if (setups.isPending) {
    return (
      <>
        {head}
        <LoadingState what="your setups" />
      </>
    )
  }
  if (setups.isError) {
    return (
      <>
        {head}
        <ErrorState what="your setups" error={setups.error} onRetry={() => void setups.refetch()} />
      </>
    )
  }

  const archivedCount = setups.data.filter((setup) => setup.archived_at).length
  const visible = setups.data.filter((setup) => showArchived || !setup.archived_at)
  const currency = stats.data?.currency ?? null

  return (
    <>
      {head}
      {setups.data.length === 0 ? (
        <Panel title="Setups" data-tour="setups">
          <EmptyState title="No setups yet">
            <p>
              A setup is a way you trade, named in your own words, with the checklist you hold yourself to. Once a
              trade is logged against it, the playbook shows how well it pays and how well you follow it.
            </p>
            <p>
              <Link to={{ pathname: '/setups/new', search }}>Create your first setup</Link>
            </p>
          </EmptyState>
        </Panel>
      ) : (
        <Panel
          title="Setups"
          data-tour="setups"
          note={
            stats.isError
              ? 'Trade statistics could not be loaded, so only the checklists are shown.'
              : 'Statistics cover every trade on every account, all time.'
          }
          actions={
            archivedCount > 0 ? (
              <Checkbox
                label={`Show archived (${archivedCount})`}
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
            ) : null
          }
        >
          {visible.length === 0 ? (
            <EmptyState title="Every setup is archived">
              <p>Tick Show archived to see them, or create a new setup.</p>
            </EmptyState>
          ) : (
            <TableScroll label="Setups and their statistics">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Setup</th>
                    <th scope="col" className="num">
                      Rules
                    </th>
                    <th scope="col" className="num">
                      Trades
                    </th>
                    <th scope="col" className="num">
                      Win rate
                    </th>
                    <th scope="col" className="num">
                      Net P&L
                    </th>
                    <th scope="col" className="num">
                      Expectancy
                    </th>
                    <th scope="col" className="num">
                      Checklist
                    </th>
                    <th scope="col">Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((setup) => {
                    const row = stats.data?.setups.find((item) => item.setup_id === setup.id)
                    return (
                      <tr key={setup.id}>
                        <th scope="row" className="row-head">
                          <Link to={{ pathname: `/setups/${setup.id}`, search }}>{setup.name}</Link>
                          {setup.archived_at ? (
                            <>
                              {' '}
                              <Badge>Archived</Badge>
                            </>
                          ) : null}
                          {setup.subtitle ? <span className="cell-sub">{setup.subtitle}</span> : null}
                        </th>
                        <td className="num mono">
                          {setup.criteria.length} ({weightTotal(setup.criteria).toString()} pts)
                        </td>
                        <td className="num mono">{row ? number(row.trade_count) : '0'}</td>
                        <td className="num mono">{row ? percent(row.win_rate) : 'n/a'}</td>
                        <td className="num">{row ? <Amount value={row.net_pnl} currency={currency} /> : <span className="mono">n/a</span>}</td>
                        <td className="num">{row ? <Amount value={row.expectancy} kind="r" /> : <span className="mono">n/a</span>}</td>
                        <td className="num mono">{row ? percent(row.avg_execution_score) : 'n/a'}</td>
                        <td>
                          {row ? (
                            <>
                              <Badge tone={RANK_TONE[row.rank]}>{RANK_LABEL[row.rank]}</Badge>
                              {row.low_sample ? (
                                <>
                                  {' '}
                                  <Badge tone="sub">Low sample</Badge>
                                </>
                              ) : null}
                            </>
                          ) : (
                            <span className="muted">No trades yet</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Panel>
      )}
    </>
  )
}
