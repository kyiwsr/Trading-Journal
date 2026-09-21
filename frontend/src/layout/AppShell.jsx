import { Suspense } from 'react'
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom'

import { useAccounts, useDashboard, useLogout } from '../api/queries'
import type { RangeName } from '../api/types'
import { useWaking } from '../api/waking'
import { Badge, Button, LoadingState, Segmented, XpBar } from '../components'
import { number } from '../lib/format'
import { RANGES, patchParams, readScope, scopeSearch } from '../lib/urlState'

const RANGE_OPTIONS = RANGES.map((value) => ({ value, label: value }))

export function AppShell() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const scope = readScope(params)
  const accounts = useAccounts()
  const dashboard = useDashboard(scope.account, scope.range)
  const logout = useLogout()
  const waking = useWaking()
  const search = scopeSearch(scope)
  const xp = dashboard.data?.xp

  const setScope = (patch: { account?: string; range?: RangeName }) => setParams(patchParams(params, patch))

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-row">
          <Link to={{ pathname: '/', search }} className="brand">
            ApexLog
          </Link>
          {xp ? (
            <div className="hud">
              <span className="mono hud-level">LVL {xp.level}</span>
              <XpBar value={xp.xp_in_level} max={xp.xp_per_level} />
              <span className="mono hud-xp">
                {number(xp.xp_in_level)} / {number(xp.xp_per_level)} XP
              </span>
              {xp.win_streak >= 2 ? <Badge tone="streak">{xp.win_streak}-win streak</Badge> : null}
            </div>
          ) : null}
          <div className="controls">
            <Segmented
              label="Date range"
              options={RANGE_OPTIONS}
              value={scope.range}
              onChange={(range) => setScope({ range })}
            />
            <label className="select-label">
              <span className="visually-hidden">Account</span>
              <select
                className="input select"
                value={scope.account}
                onChange={(event) => setScope({ account: event.target.value })}
              >
                <option value="all">All accounts</option>
                {accounts.data
                  ?.filter((account) => !account.archived_at)
                  .map((account) => (
                    <option key={account.id} value={String(account.id)}>
                      {account.name}
                      {account.label ? ` ${account.label}` : ''}
                    </option>
                  ))}
              </select>
            </label>
            <Link className="btn btn-primary" to={{ pathname: '/trades/new', search }}>
              + Log Trade
            </Link>
            <Button
              disabled={logout.isPending}
              onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })}
            >
              Sign out
            </Button>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          <NavLink to={{ pathname: '/', search }} end>
            Command HQ
          </NavLink>
          <NavLink to={{ pathname: '/trades', search }}>Combat Logs</NavLink>
          <NavLink to={{ pathname: '/setups', search }}>Skill Playbook</NavLink>
          <NavLink to={{ pathname: '/settings', search }}>Settings</NavLink>
        </nav>
      </header>
      {waking ? (
        <div className="waking" role="status">
          Waking up the server. The first request after a quiet spell can take up to a minute.
        </div>
      ) : null}
      <main id="main" className="page">
        <Suspense fallback={<LoadingState what="the page" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
