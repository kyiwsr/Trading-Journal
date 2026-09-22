import { useEffect, useState, Suspense } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { useAccounts, useDashboard, useLogout } from '../api/queries'
import { useWaking } from '../api/waking'
import { Badge, Button, LoadingState, Segmented, Spotlight, XpBar } from '../components'
import { number } from '../lib/format'
import { TourProvider } from '../lib/TourProvider'
import { RANGES, patchParams, readScope, scopeSearch } from '../lib/urlState'

const RANGE_OPTIONS = RANGES.map((value) => ({ value, label: value }))

export function AppShell() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const scope = readScope(params)
  const accounts = useAccounts()
  const dashboard = useDashboard(scope.account, scope.range)
  const logout = useLogout()
  const waking = useWaking()
  const search = scopeSearch(scope)
  const xp = dashboard.data?.xp
  const [menuOpen, setMenuOpen] = useState(false)

  const setScope = (patch) => setParams(patchParams(params, patch))

  // A menu left open across navigation would sit over the next page's content.
  useEffect(() => setMenuOpen(false), [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event) => event.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <TourProvider>
      <div className="shell">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="topbar">
          <div className="topbar-primary">
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
            <div className="topbar-primary-actions">
              <Link
                className="btn btn-primary"
                data-tour="header-log-trade"
                to={{ pathname: '/trades/new', search }}
              >
                + Log Trade
              </Link>
              <Button
                className="menu-toggle"
                aria-expanded={menuOpen}
                aria-controls="topbar-secondary"
                onClick={() => setMenuOpen((open) => !open)}
              >
                {menuOpen ? 'Close menu' : 'Menu'}
              </Button>
            </div>
          </div>
          <div id="topbar-secondary" className={`topbar-secondary${menuOpen ? ' is-open' : ''}`}>
            <nav className="nav" aria-label="Main">
              <NavLink to={{ pathname: '/', search }} end>
                Command HQ
              </NavLink>
              <NavLink to={{ pathname: '/trades', search }}>Combat Logs</NavLink>
              <NavLink to={{ pathname: '/setups', search }}>Skill Playbook</NavLink>
              <NavLink to={{ pathname: '/settings', search }}>Settings</NavLink>
            </nav>
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
              <Button
                disabled={logout.isPending}
                onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })}
              >
                Sign out
              </Button>
            </div>
          </div>
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
        <Spotlight />
      </div>
    </TourProvider>
  )
}
