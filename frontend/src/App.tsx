import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'

import { AppShell } from './layout/AppShell'
import { RequireAuth } from './layout/RequireAuth'
import ComingSoon from './pages/ComingSoon'
import KitchenSink from './pages/KitchenSink'
import Login from './pages/Login'
import TradeDetail from './pages/TradeDetail'
import TradeLog from './pages/TradeLog'

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
          <Route
            path="trades/new"
            element={<ComingSoon title="Log a trade">The trade entry form is not built yet.</ComingSoon>}
          />
          <Route path="trades/:id" element={<TradeDetail />} />
          <Route
            path="playbook"
            element={<ComingSoon title="Skill Playbook">The setup and checklist editor is not built yet.</ComingSoon>}
          />
        </Route>
      </Route>
    </Routes>
  )
}

export default AppRoutes
