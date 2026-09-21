import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'

import { AppShell } from './layout/AppShell'
import { RequireAuth } from './layout/RequireAuth'
import KitchenSink from './pages/KitchenSink'
import Login from './pages/Login'
import SetupEditor from './pages/SetupEditor'
import Setups from './pages/Setups'
import Settings, { DefaultSettingsTab } from './pages/Settings'
import TradeDetail from './pages/TradeDetail'
import TradeForm from './pages/TradeForm'
import TradeLog from './pages/TradeLog'
import AccountsTab from './pages/settings/AccountsTab'
import FeeProfilesTab from './pages/settings/FeeProfilesTab'
import InstrumentsTab from './pages/settings/InstrumentsTab'
import PreferencesTab from './pages/settings/PreferencesTab'

// The dashboard carries the charting library, so it loads on demand.
const Dashboard = lazy(() => import('./pages/Dashboard'))

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/kitchen-sink" element={<KitchenSink />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="trades" element={<TradeLog />} />
          <Route path="trades/new" element={<TradeForm />} />
          <Route path="trades/:id" element={<TradeDetail />} />
          <Route path="trades/:id/edit" element={<TradeForm />} />
          <Route path="setups" element={<Setups />} />
          <Route path="setups/new" element={<SetupEditor />} />
          <Route path="setups/:id" element={<SetupEditor />} />
          <Route path="settings" element={<Settings />}>
            <Route index element={<DefaultSettingsTab />} />
            <Route path="accounts" element={<AccountsTab />} />
            <Route path="instruments" element={<InstrumentsTab />} />
            <Route path="fee-profiles" element={<FeeProfilesTab />} />
            <Route path="preferences" element={<PreferencesTab />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}

export default AppRoutes
