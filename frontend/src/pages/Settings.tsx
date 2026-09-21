import { Navigate, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'

import { readScope, scopeSearch } from '../lib/urlState'

const TABS = [
  { to: 'accounts', label: 'Accounts' },
  { to: 'instruments', label: 'Instruments' },
  { to: 'fee-profiles', label: 'Fee profiles' },
  { to: 'preferences', label: 'Preferences' },
]

export default function Settings() {
  const [params] = useSearchParams()
  const search = scopeSearch(readScope(params))

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Accounts, instruments and fee profiles decide how every trade is priced.</p>
        </div>
      </div>
      <nav className="subnav" aria-label="Settings sections">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={{ pathname: `/settings/${tab.to}`, search }}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}

export function DefaultSettingsTab() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/settings/accounts', search }} replace />
}
