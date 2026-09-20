import { Route, Routes } from 'react-router-dom'

import Home from './pages/Home'
import KitchenSink from './pages/KitchenSink'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/kitchen-sink" element={<KitchenSink />} />
    </Routes>
  )
}

export default AppRoutes
